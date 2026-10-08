const prisma = require("../lib/prisma");
const { effectiveStock } = require("../lib/stock");

// GET /api/orders — Riwayat pesanan milik user yang sedang login
const listOrders = async (req, res, next) => {
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
};

// GET /api/orders/:id — Detail 1 pesanan (hanya pemilik order atau admin)
const getOrderById = async (req, res, next) => {
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
};

// POST /api/orders — Buat order/reservasi baru (Atomic Transaction & Atomic Stock Check)
const createOrder = async (req, res, next) => {
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
    const newOrder = await prisma.$transaction(
      async (tx) => {
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
    }, { isolationLevel: "ReadCommitted" });

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
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

// PATCH /api/orders/:id/cancel — Pembatalan manual (Buyer hanya bisa batalkan order milik sendiri yang belum lunas)
const cancelOrder = async (req, res, next) => {
  try {
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

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
};
