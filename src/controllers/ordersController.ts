import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { effectiveStock } from "../lib/stock";
import { snap } from "../lib/midtrans";
import { getPickupSlots, getSlotCapacity } from "../lib/slots";

// GET /api/orders — Riwayat pesanan milik user yang sedang login
export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

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
};

// GET /api/orders/:id — Detail 1 pesanan (hanya pemilik order atau admin)
export const getOrderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

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
};

// POST /api/orders — Buat order/reservasi baru (Atomic Transaction & Atomic Stock Check)
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { productId, variantId, pickupDate, pickupSlot, paymentMethod } = req.body;

    if (!productId || !pickupDate || !pickupSlot || !paymentMethod) {
      return res.status(400).json({
        error: "productId, pickupDate, pickupSlot, dan paymentMethod wajib diisi",
      });
    }

    if (!["midtrans", "cod"].includes(paymentMethod)) {
      return res.status(400).json({ error: "paymentMethod harus 'midtrans' atau 'cod'" });
    }

    // A8: Validasi pickupSlot terhadap daftar slot yang dikonfigurasi
    const configuredSlots = getPickupSlots();
    if (!configuredSlots.includes(pickupSlot)) {
      return res.status(400).json({ error: `pickupSlot tidak valid. Slot tersedia: ${configuredSlots.join(", ")}` });
    }

    // A8: Validasi pickupDate — tidak di masa lalu dan dalam jendela 14 hari
    // Mendukung format YYYY-MM-DD maupun ISO string ("2026-10-11T...")
    const pickupDateStr = typeof pickupDate === "string" && pickupDate.includes("T")
      ? pickupDate.split("T")[0]
      : String(pickupDate).slice(0, 10);

    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const todayWIBStr = `${nowWIB.getUTCFullYear()}-${String(nowWIB.getUTCMonth() + 1).padStart(2, "0")}-${String(nowWIB.getUTCDate()).padStart(2, "0")}`;
    if (pickupDateStr < todayWIBStr) {
      return res.status(400).json({ error: "pickupDate tidak boleh di masa lalu" });
    }
    const maxDate = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate() + 14));
    const maxDateStr = `${maxDate.getUTCFullYear()}-${String(maxDate.getUTCMonth() + 1).padStart(2, "0")}-${String(maxDate.getUTCDate()).padStart(2, "0")}`;
    if (pickupDateStr > maxDateStr) {
      return res.status(400).json({ error: "pickupDate maksimal 14 hari dari hari ini" });
    }

    const userId = req.user.id;

    // F-07: Batasi jumlah order menunggu_bayar aktif per user (max 3)
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const autoCancel = settings?.autoCancelEnabled ?? true;
    const nowCheck = new Date();

    const activeOrderCount = await prisma.order.count({
      where: {
        userId,
        status: "menunggu_bayar",
        OR: [
          { holdExpiresAt: { gt: nowCheck } },
          ...(autoCancel ? [] : [{ paymentMethod: "cod" as any }]),
        ],
      },
    });
    if (activeOrderCount >= 3) {
      return res.status(429).json({
        error: "Kamu sudah memiliki 3 pesanan aktif yang belum dibayar. Selesaikan atau batalkan pesanan lama terlebih dahulu.",
      });
    }

    // Pengecekan dan pembuatan order dilakukan dalam SATU transaksi database (Atomic)
    const newOrder = await prisma.$transaction(
      async (tx) => {
      // A8: Validasi kapasitas slot DI DALAM transaksi (mencegah race condition)
      const slotCapacity = getSlotCapacity();
      const pickupDayStart = new Date(pickupDateStr + "T00:00:00+07:00");
      const pickupDayEnd = new Date(pickupDayStart.getTime() + 86400000 - 1);
      const txNow = new Date();

      const bookedCount = await tx.order.count({
        where: {
          pickupDate: { gte: pickupDayStart, lte: pickupDayEnd },
          pickupSlot: pickupSlot,
          OR: [
            { status: "lunas" },
            { status: "selesai" },
            {
              status: "menunggu_bayar",
              holdExpiresAt: { gt: txNow },
            },
          ],
        },
      });

      if (bookedCount >= slotCapacity) {
        throw { status: 409, message: "Slot pickup ini sudah penuh. Silakan pilih slot atau tanggal lain.", code: "SLOT_FULL" };
      }

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

      // F-13: Blokir pemesanan produk milik kreator nonaktif
      if (product.artisan && product.artisan.status !== "aktif") {
        throw { status: 403, message: "Produk ini tidak tersedia karena kreator sedang nonaktif" };
      }

      // 2. Validasi larangan membeli produk sendiri
      if (product.artisan?.userId === userId) {
        throw { status: 403, message: "Kamu tidak bisa membeli produkmu sendiri" };
      }

      // 3. Validasi Varian & Stok Efektif (Atomic Check)
      let variant: any = null;
      if (product.variantOptions && product.variantOptions.length > 0) {
        if (!variantId) {
          throw { status: 400, message: "Produk ini memiliki varian. Pilih varian terlebih dahulu" };
        }
        variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant || variant.productId !== product.id) {
          throw { status: 400, message: "Varian tidak valid untuk produk ini" };
        }
      } else {
        // Produk tanpa varian: gunakan varian default (combination: [])
        variant = await tx.productVariant.findFirst({
          where: { productId: product.id },
          orderBy: { id: "asc" },
        });
      }

      if (!variant) {
        throw { status: 400, message: "Varian produk tidak ditemukan" };
      }

      // Lock baris variant secara eksklusif (Pessimistic Locking) untuk mencegah race condition
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variant.id} FOR UPDATE`;

      const effStock = await effectiveStock(variant.id, tx);
      if (effStock <= 0) {
        throw { status: 409, message: "Maaf, stok produk ini baru saja habis" };
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

      // Durasi Hold (COD default 120 menit; Midtrans hold 60 menit agar tidak menahan stok tanpa batas)
      const holdMinutes = isMidtrans ? 60 : (settings.holdDurationMinutes || 120);
      const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60000);

      // Batas Pengambilan untuk Midtrans Lunas (Default 14 hari)
      const pickupDeadline = isMidtrans
        ? new Date(new Date(pickupDate).getTime() + (settings.pickupDeadlineDays || 14) * 86400000)
        : null;

      // 6. Buat Record Order + OrderItem
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
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
    }, { isolationLevel: "ReadCommitted" });

    // Jika paymentMethod === "midtrans", buat Snap Transaction Token
    let snapResponse: any = null;
    if (paymentMethod === "midtrans") {
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        const transactionDetails = {
          transaction_details: {
            order_id: newOrder.orderNumber,
            gross_amount: newOrder.totalAmount,
          },
          expiry: {
            unit: "minute",
            duration: 60,
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
  } catch (err: any) {
    if (err.status) {
      const errorResp: any = { error: err.message };
      if (err.code) errorResp.code = err.code;
      return res.status(err.status).json(errorResp);
    }
    next(err);
  }
};

// PATCH /api/orders/:id/cancel — Pembatalan manual (Buyer hanya bisa batalkan order milik sendiri yang belum lunas)
export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { id } = req.params;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Tidak memiliki akses ke pesanan ini" });
    }

    if (req.user.role !== "admin" && (order.status === "lunas" || order.status === "lewat_batas_pengambilan")) {
      return res.status(403).json({
        error: "Pesanan yang sudah lunas atau lewat batas pengambilan hanya bisa dibatalkan oleh Admin.",
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
};

// POST /api/orders/:id/pay — F-16: Dapatkan/minta ulang token pembayaran Snap Midtrans untuk order yang belum dibayar
export const repayOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { id } = req.params;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Tidak memiliki akses ke pesanan ini" });
    }

    if (order.paymentMethod !== "midtrans") {
      return res.status(400).json({ error: "Pesanan ini tidak menggunakan metode pembayaran Midtrans" });
    }

    if (order.status !== "menunggu_bayar") {
      return res.status(400).json({ error: `Pesanan berstatus ${order.status}, tidak dapat diproses pembayarannya` });
    }

    if (order.holdExpiresAt && new Date() > new Date(order.holdExpiresAt)) {
      return res.status(400).json({ error: "Waktu pembayaran pesanan ini telah kedaluwarsa" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const transactionDetails = {
      transaction_details: {
        order_id: order.orderNumber,
        gross_amount: order.totalAmount,
      },
      expiry: {
        unit: "minute",
        duration: 60,
      },
      customer_details: {
        first_name: user ? user.name : "Customer",
        email: user ? user.email : "customer@example.com",
      },
    };

    const transaction = await snap.createTransaction(transactionDetails);

    // Simpan atau update record payment
    const existingPayment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    if (existingPayment) {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: { midtransTransactionId: transaction.token },
      });
    } else {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          midtransTransactionId: transaction.token,
          status: "pending",
        },
      });
    }

    res.json({
      snap: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  repayOrder,
};

