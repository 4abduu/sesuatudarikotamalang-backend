const crypto = require("crypto");
const prisma = require("../lib/prisma");

// POST /api/payments/webhook — Terima Notifikasi Webhook dari Server Midtrans (TANPA requireAuth)
const handleWebhook = async (req, res, next) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, transaction_id } = req.body;

    if (!order_id || !transaction_status) {
      return res.status(400).json({ error: "Payload webhook tidak valid" });
    }

    // Verifikasi Midtrans Server Key & Signature Key (SHA512: order_id + status_code + gross_amount + ServerKey)
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "";
    if (!serverKey) {
      return res.status(503).json({ error: "Server key Midtrans belum dikonfigurasi" });
    }

    if (!signature_key || !status_code || gross_amount === undefined || gross_amount === null) {
      return res.status(403).json({ error: "Signature key dan parameter pendukung wajib disertakan" });
    }

    const expectedSignature = crypto
      .createHash("sha512")
      .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
      .digest("hex");

    const sigBuf = Buffer.from(String(signature_key));
    const expBuf = Buffer.from(String(expectedSignature));

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(403).json({ error: "Signature webhook Midtrans tidak valid" });
    }

    // Cari pesanan berdasarkan orderNumber (contoh: SDK-XXXX)
    const order = await prisma.order.findUnique({
      where: { orderNumber: order_id },
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    // Verifikasi gross_amount cocok dengan totalAmount pesanan (mencegah tampering)
    if (gross_amount && Math.round(parseFloat(gross_amount)) !== order.totalAmount) {
      return res.status(400).json({ error: "gross_amount tidak cocok dengan total pesanan" });
    }

    // Mencegah rollback jika status order sudah terminal (selesai, lunas, lewat_batas_pengambilan)
    if (["selesai", "lunas", "lewat_batas_pengambilan"].includes(order.status) && ["deny", "cancel", "expire", "pending"].includes(transaction_status)) {
      return res.status(200).json({ received: true, message: "Status order sudah terminal, perubahan diabaikan" });
    }

    // Notifikasi gagal/pending/cancel/expire/deny HANYA boleh mengubah order yang statusnya 'menunggu_bayar'
    if (["deny", "cancel", "expire", "pending"].includes(transaction_status) && order.status !== "menunggu_bayar") {
      return res.status(200).json({ received: true, message: `Notifikasi ${transaction_status} diabaikan karena status order bukan menunggu_bayar (${order.status})` });
    }

    let isPaid = false;
    let isSettlement = transaction_status === "settlement" || (transaction_status === "capture" && fraud_status === "accept");

    if (isSettlement) {
      isPaid = true;
    }

    let resultStatus = order.status;

    const { effectiveStock } = require("../lib/stock");

    // Update status order dalam database transaction
    await prisma.$transaction(async (tx) => {
      // Lock baris order secara eksklusif (Pessimistic Locking) untuk menangani request paralel secara aman
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;

      // Ambil data order terbaru & payment record saat ini di dalam transaksi
      const freshOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true, payment: true },
      });

      if (!freshOrder) return;

      const existingPayment = freshOrder.payment;

      // Jika sudah lunas / selesai / lewat_batas_pengambilan, idempotensi: return aman
      if (["lunas", "selesai", "lewat_batas_pengambilan"].includes(freshOrder.status) && isSettlement) {
        // Catat/Update payment jika belum tercatat settlement, tanpa menimpa paidAt yang sudah ada
        if (!existingPayment) {
          await tx.payment.create({
            data: {
              orderId: freshOrder.id,
              midtransTransactionId: transaction_id || null,
              status: transaction_status,
              paidAt: new Date(),
            },
          });
        } else if (existingPayment.status !== "settlement") {
          await tx.payment.update({
            where: { orderId: freshOrder.id },
            data: {
              midtransTransactionId: transaction_id || undefined,
              status: transaction_status,
              paidAt: existingPayment.paidAt || new Date(),
            },
          });
        }
        resultStatus = freshOrder.status;
        return;
      }

      if (isSettlement) {
        if (freshOrder.status === "menunggu_bayar") {
          // Lunas normal
          resultStatus = "lunas";
          let pickupDeadline = freshOrder.pickupDeadline;
          if (!pickupDeadline) {
            let settings = await tx.appSettings.findUnique({ where: { id: 1 } });
            const days = settings?.pickupDeadlineDays || 14;
            pickupDeadline = new Date(new Date(freshOrder.pickupDate).getTime() + days * 86400000);
          }

          await tx.order.update({
            where: { id: freshOrder.id },
            data: {
              status: "lunas",
              holdExpiresAt: null,
              pickupDeadline: pickupDeadline,
            },
          });

          // Akumulasi soldCount idempoten (hanya jika sebelumnya bukan lunas)
          for (const item of freshOrder.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { soldCount: { increment: item.quantity } },
            });
          }

          await tx.payment.upsert({
            where: { orderId: freshOrder.id },
            create: {
              orderId: freshOrder.id,
              midtransTransactionId: transaction_id || null,
              status: transaction_status,
              paidAt: new Date(),
            },
            update: {
              midtransTransactionId: transaction_id || undefined,
              status: transaction_status,
              paidAt: existingPayment?.paidAt || new Date(),
            },
          });
        } else if (freshOrder.status === "kedaluwarsa") {
          // Late Settlement untuk Order Kedaluwarsa: Hitung stok menggunakan effectiveStock(item.variantId, tx) setelah FOR UPDATE lock
          let canFulfill = true;

          for (const item of freshOrder.items) {
            if (!item.variantId) {
              canFulfill = false;
              break;
            }

            // Lock variant eksklusif
            await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${item.variantId} FOR UPDATE`;

            // Hitung stok efektif menggunakan helper terpusat
            const effStock = await effectiveStock(item.variantId, tx);
            if (effStock < item.quantity) {
              canFulfill = false;
              break;
            }
          }

          if (canFulfill) {
            // Stok mencukupi -> Ubah status jadi lunas
            resultStatus = "lunas";
            let pickupDeadline = freshOrder.pickupDeadline;
            if (!pickupDeadline) {
              let settings = await tx.appSettings.findUnique({ where: { id: 1 } });
              const days = settings?.pickupDeadlineDays || 14;
              pickupDeadline = new Date(new Date(freshOrder.pickupDate).getTime() + days * 86400000);
            }

            await tx.order.update({
              where: { id: freshOrder.id },
              data: {
                status: "lunas",
                holdExpiresAt: null,
                pickupDeadline: pickupDeadline,
              },
            });

            for (const item of freshOrder.items) {
              await tx.product.update({
                where: { id: item.productId },
                data: { soldCount: { increment: item.quantity } },
              });
            }

            // Buat notifikasi HANYA jika pembayaran settlement belum pernah tercatat sebelumnya
            if (!existingPayment || existingPayment.status !== "settlement") {
              await tx.notification.create({
                data: {
                  userId: freshOrder.userId,
                  type: "pesanan_update",
                  title: "Pembayaran Diterima (Late Settlement)",
                  body: `Pembayaran pesanan ${freshOrder.orderNumber} telah diterima. Pesanan berhasil diproses menjadi Lunas.`,
                },
              });
            }
          } else {
            // Stok tidak mencukupi -> Status tetap kedaluwarsa
            resultStatus = freshOrder.status;

            if (!existingPayment || existingPayment.status !== "settlement") {
              await tx.notification.create({
                data: {
                  userId: freshOrder.userId,
                  type: "pesanan_update",
                  title: "Pembayaran Late Settlement - Stok Habis",
                  body: `Pembayaran pesanan ${freshOrder.orderNumber} diterima tetapi stok produk sudah tidak mencukupi. Silakan hubungi admin untuk proses refund.`,
                },
              });
            }
          }

          await tx.payment.upsert({
            where: { orderId: freshOrder.id },
            create: {
              orderId: freshOrder.id,
              midtransTransactionId: transaction_id || null,
              status: transaction_status,
              paidAt: new Date(),
            },
            update: {
              midtransTransactionId: transaction_id || undefined,
              status: transaction_status,
              paidAt: existingPayment?.paidAt || new Date(),
            },
          });
        } else if (freshOrder.status === "dibatalkan") {
          // Late Settlement untuk Order Dibatalkan -> Status tetap dibatalkan
          resultStatus = freshOrder.status;

          if (!existingPayment || existingPayment.status !== "settlement") {
            await tx.notification.create({
              data: {
                userId: freshOrder.userId,
                type: "pesanan_update",
                title: "Pembayaran Diterima untuk Pesanan Batal",
                body: `Pembayaran untuk pesanan ${freshOrder.orderNumber} yang telah dibatalkan berhasil diterima. Silakan hubungi admin untuk proses refund.`,
              },
            });
          }

          await tx.payment.upsert({
            where: { orderId: freshOrder.id },
            create: {
              orderId: freshOrder.id,
              midtransTransactionId: transaction_id || null,
              status: transaction_status,
              paidAt: new Date(),
            },
            update: {
              midtransTransactionId: transaction_id || undefined,
              status: transaction_status,
              paidAt: existingPayment?.paidAt || new Date(),
            },
          });
        }
      } else if (["deny", "cancel", "expire"].includes(transaction_status)) {
        if (freshOrder.status === "menunggu_bayar") {
          resultStatus = transaction_status === "expire" ? "kedaluwarsa" : "dibatalkan";
          await tx.order.update({
            where: { id: freshOrder.id },
            data: { status: resultStatus },
          });

          await tx.payment.upsert({
            where: { orderId: freshOrder.id },
            create: {
              orderId: freshOrder.id,
              midtransTransactionId: transaction_id || null,
              status: transaction_status,
              paidAt: null,
            },
            update: {
              midtransTransactionId: transaction_id || undefined,
              status: transaction_status,
            },
          });
        }
      }
    }, { isolationLevel: "ReadCommitted" });

    res.status(200).json({ received: true, status: resultStatus });
  } catch (err) {
    console.error("[MIDTRANS WEBHOOK ERROR]", err);
    next(err);
  }
};

module.exports = {
  handleWebhook,
};
