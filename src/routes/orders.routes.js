const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/orders — Riwayat pesanan milik user yang sedang login
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        items: {
          include: {
            product: {
              include: { artisan: { select: { id: true, brandName: true } } },
            },
            variant: true,
          },
        },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — Detail 1 pesanan (hanya pemilik order atau admin)
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              include: { artisan: { select: { id: true, brandName: true } } },
            },
            variant: true,
          },
        },
        payment: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    // Hanya pemilik pesanan atau admin yang boleh melihat detail
    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Tidak memiliki akses ke pesanan ini" });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — Buat order/reservasi baru (Atomic Transaction & Atomic Stock Check)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { productId, variantId, pickupDate, pickupSlot, paymentMethod } = req.body;

    if (!productId || !pickupDate || !pickupSlot || !paymentMethod) {
      return res.status(400).json({
        error: "productId, pickupDate, pickupSlot, dan paymentMethod wajib diisi",
      });
    }

    if (!["midtrans", "cod"].includes(paymentMethod)) {
      return res.status(400).json({ error: "paymentMethod harus 'midtrans' atau 'cod'" });
    }

    // Pengecekan dan pembuatan order dilakukan dalam SATU transaksi database (Atomic)
    const newOrder = await prisma.$transaction(async (tx) => {
      // 1. Ambil data produk
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: {
          artisan: true,
          variantOptions: true,
        },
      });

      if (!product || !product.isActive) {
        throw { status: 404, message: "Produk tidak ditemukan atau sedang tidak aktif" };
      }

      // 2. Validasi larangan membeli produk sendiri
      if (product.artisan?.userId === req.user.id) {
        throw { status: 403, message: "Kamu tidak bisa membeli produkmu sendiri" };
      }

      // 3. Validasi Varian & Stok Efektif (Atomic Check)
      let variant = null;
      if (product.variantOptions && product.variantOptions.length > 0) {
        if (!variantId) {
          throw { status: 400, message: "Produk ini memiliki varian. Pilih varian terlebih dahulu" };
        }
        variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant || variant.productId !== product.id) {
          throw { status: 400, message: "Varian tidak valid untuk produk ini" };
        }
      } else if (variantId) {
        variant = await tx.productVariant.findUnique({ where: { id: variantId } });
      }

      if (variant) {
        // Lock baris variant secara eksklusif (Pessimistic Locking) untuk mencegah race condition
        await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variant.id} FOR UPDATE`;

        // Hitung order aktif yang sedang mengikat varian ini
        const now = new Date();
        const activeOrdersCount = await tx.orderItem.count({
          where: {
            variantId: variant.id,
            order: {
              OR: [
                { status: "lunas" },
                { status: "selesai" },
                {
                  status: "menunggu_bayar",
                  holdExpiresAt: { gt: now },
                },
              ],
            },
          },
        });

        const effectiveStock = Math.max(0, variant.stock - activeOrdersCount);
        if (effectiveStock <= 0) {
          throw { status: 409, message: "Maaf, stok kombinasi ini baru saja habis. Coba varian lain" };
        }
      }

      // 4. Ambil Pengaturan Sistem (AppSettings)
      let settings = await tx.appSettings.findUnique({ where: { id: 1 } });
      if (!settings) {
        settings = await tx.appSettings.create({ data: { id: 1 } });
      }

      // 5. Generate Order Number Unik (SDK-XXXX) dengan retry loop untuk mencegah collision
      let orderNumber = "";
      let attempts = 0;
      while (attempts < 10) {
        const candidate = `SDK-${Math.floor(1000 + Math.random() * 9000)}`;
        const existingOrder = await tx.order.findUnique({ where: { orderNumber: candidate } });
        if (!existingOrder) {
          orderNumber = candidate;
          break;
        }
        attempts++;
      }
      if (!orderNumber) {
        orderNumber = `SDK-${Date.now().toString().slice(-6)}`;
      }

      const isMidtrans = paymentMethod === "midtrans";
      const now = new Date();

      // Durasi Hold untuk COD/Cash (Default 120 menit / 2 jam)
      const holdExpiresAt = !isMidtrans
        ? new Date(now.getTime() + (settings.holdDurationMinutes || 120) * 60000)
        : null;

      // Batas Pengambilan untuk Midtrans Lunas (Default 14 hari)
      const pickupDeadline = isMidtrans
        ? new Date(new Date(pickupDate).getTime() + (settings.pickupDeadlineDays || 14) * 86400000)
        : null;

      // 6. Buat Record Order + OrderItem
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: req.user.id,
          paymentMethod,
          status: "menunggu_bayar", // Berstatus awal menunggu_bayar baik COD maupun Midtrans
          totalAmount: product.price,
          pickupDate: new Date(pickupDate),
          pickupSlot,
          holdExpiresAt,
          pickupDeadline,
          items: {
            create: [
              {
                productId: product.id,
                variantId: variant ? variant.id : null,
                quantity: 1,
                priceSnapshot: product.price,
              },
            ],
          },
        },
        include: {
          items: { include: { product: true, variant: true } },
        },
      });

      return createdOrder;
    });

    // Jika paymentMethod === "midtrans", buat Snap Transaction Token
    let snapResponse = null;
    if (paymentMethod === "midtrans") {
      try {
        const { snap } = require("../lib/midtrans");
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        const transactionDetails = {
          transaction_details: {
            order_id: newOrder.orderNumber,
            gross_amount: newOrder.totalAmount,
          },
          customer_details: {
            first_name: user ? user.name : "Customer",
            email: user ? user.email : "customer@example.com",
          },
        };

        const transaction = await snap.createTransaction(transactionDetails);
        snapResponse = {
          token: transaction.token,
          redirect_url: transaction.redirect_url,
        };

        // Simpan record payment awal
        await prisma.payment.create({
          data: {
            orderId: newOrder.id,
            midtransTransactionId: transaction.token,
            status: "pending",
          },
        });
      } catch (midtransErr) {
        console.error("[MIDTRANS ERROR] Gagal membuat Snap Transaction:", midtransErr);
        // Tetap kembalikan order, tapi tandai snapResponse error
        snapResponse = { error: "Gagal membuat transaksi Midtrans. Silakan coba lagi." };
      }
    }

    res.status(201).json({ order: newOrder, snap: snapResponse });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// PATCH /api/orders/:id/cancel — Pembatalan manual (Buyer hanya bisa batalkan order milik sendiri yang belum lunas)
router.patch("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Tidak memiliki akses ke pesanan ini" });
    }

    if (req.user.role !== "admin" && order.status === "lunas") {
      return res.status(403).json({
        error: "Pesanan yang sudah lunas hanya bisa dibatalkan oleh Admin. Silakan hubungi admin via WhatsApp.",
      });
    }

    if (order.status === "selesai" || order.status === "dibatalkan" || order.status === "kedaluwarsa") {
      return res.status(400).json({ error: `Pesanan yang sudah berstatus ${order.status} tidak dapat dibatalkan` });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: "dibatalkan" },
    });

    res.json({ message: "Pesanan berhasil dibatalkan", order: updatedOrder });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
