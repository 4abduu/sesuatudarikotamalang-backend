import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
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

    // Pengecekan dan pembuatan order dilakukan dalam SATU transaksi database (Atomic)
    // F-07 (batas order aktif) dan A8 (kapasitas slot) dipindahkan ke dalam transaksi
    // agar race condition antar request konkuren tidak bisa mem-bypass batas.
    try {
      await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    } catch (error: any) {
      // Another request may create the singleton concurrently.
      if (error?.code !== "P2002") throw error;
    }

    let newOrder: any;
    for (let transactionAttempt = 0; transactionAttempt < 3; transactionAttempt++) {
      try {
        newOrder = await prisma.$transaction(
          async (tx) => {
      // Lock baris AppSettings untuk serialisasi pemeriksaan batas
      // Pastikan baris pengaturan ada. Tanpa baris ini, FOR UPDATE tidak mengunci apa pun
      // (ReadCommitted tidak memakai gap lock), sehingga batas slot/order bisa kebobolan.
      const settingsRows: any[] = await tx.$queryRaw`SELECT * FROM app_settings WHERE id = 1 FOR UPDATE`;
      const settings = settingsRows[0] ?? null;
      const autoCancel = settings?.autoCancelEnabled ?? true;
      const txNow = new Date();

      // F-07: Batasi jumlah order menunggu_bayar aktif per user (max 3)
      const activeConditionsUser: any[] = [
        {
          status: "menunggu_bayar" as const,
          paymentMethod: "midtrans" as const,
          holdExpiresAt: { gt: txNow },
        },
      ];
      if (autoCancel) {
        activeConditionsUser.push({
          status: "menunggu_bayar" as const,
          paymentMethod: "cod" as const,
          holdExpiresAt: { gt: txNow },
        });
      } else {
        // autoCancelEnabled=false: COD menunggu_bayar tetap dianggap aktif walau hold sudah habis
        activeConditionsUser.push({
          status: "menunggu_bayar" as const,
          paymentMethod: "cod" as const,
        });
      }

      const activeOrderCount = await tx.order.count({
        where: {
          userId,
          OR: activeConditionsUser,
        },
      });
      if (activeOrderCount >= 3) {
        throw { status: 429, message: "Kamu sudah memiliki 3 pesanan aktif yang belum dibayar. Selesaikan atau batalkan pesanan lama terlebih dahulu." };
      }

      // A8: Validasi kapasitas slot DI DALAM transaksi (mencegah race condition)
      const slotCapacity = getSlotCapacity();
      const pickupDayStart = new Date(pickupDateStr + "T00:00:00+07:00");
      const pickupDayEnd = new Date(pickupDayStart.getTime() + 86400000 - 1);

      const slotConditions: any[] = [
        { status: "lunas" as const },
        { status: "selesai" as const },
        {
          status: "menunggu_bayar" as const,
          paymentMethod: "midtrans" as const,
          holdExpiresAt: { gt: txNow },
        },
      ];
      if (autoCancel) {
        slotConditions.push({
          status: "menunggu_bayar" as const,
          paymentMethod: "cod" as const,
          holdExpiresAt: { gt: txNow },
        });
      } else {
        slotConditions.push({
          status: "menunggu_bayar" as const,
          paymentMethod: "cod" as const,
        });
      }

      const bookedCount = await tx.order.count({
        where: {
          pickupDate: { gte: pickupDayStart, lte: pickupDayEnd },
          pickupSlot: pickupSlot,
          OR: slotConditions,
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

      // 4. Generate Order Number Unik (SDK-XXXX) dengan retry loop untuk mencegah collision
      let orderNumber = "";
      let attempts = 0;
      while (attempts < 10) {
        const candidate = `SDK-${crypto.randomInt(1000, 10000)}`;
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
      const holdMinutes = isMidtrans ? 60 : (settings?.holdDurationMinutes || 120);
      const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60000);

      // Batas Pengambilan untuk Midtrans Lunas (Default 14 hari)
      const pickupDeadline = isMidtrans
        ? new Date(new Date(pickupDate).getTime() + (settings?.pickupDeadlineDays || 14) * 86400000)
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
        break;
      } catch (error: any) {
        const isDeadlock = error?.code === "P2010";
        if (!isDeadlock || transactionAttempt === 2) throw error;
      }
    }

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

    // Idempotency guard: a payment record means Snap was already created for this order.
    const existingPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    if (existingPayment) {
      return res.status(409).json({
        error: "Pembayaran untuk pesanan ini sudah dibuat. Selesaikan lewat instruksi pembayaran sebelumnya atau tunggu hingga kedaluwarsa.",
        code: "PAYMENT_ALREADY_CREATED",
      });
    }

    // Hitung sisa menit hold untuk expiry Midtrans
    const remainingMs = order.holdExpiresAt
      ? new Date(order.holdExpiresAt).getTime() - Date.now()
      : 60 * 60000; // fallback 60 menit jika tidak ada holdExpiresAt
    const expiryMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const transactionDetails = {
      transaction_details: {
        order_id: order.orderNumber,
        gross_amount: order.totalAmount,
      },
      expiry: {
        unit: "minute" as const,
        duration: expiryMinutes,
      },
      customer_details: {
        first_name: user ? user.name : "Customer",
        email: user ? user.email : "customer@example.com",
      },
    };

    let transaction: any;
    try {
      transaction = await snap.createTransaction(transactionDetails);
    } catch (midtransErr: any) {
      // Tangkap error Midtrans "order_id sudah dipakai" / 4xx duplicate
      const errMsg = midtransErr?.message || midtransErr?.ApiResponse?.status_message || "";
      const errStatus = midtransErr?.httpStatusCode || midtransErr?.statusCode || 0;
      if (
        errStatus === 400 || errStatus === 409 ||
        /order_id (has been|already|sudah)/i.test(errMsg) ||
        /duplicate|already (paid|used|exist)/i.test(errMsg)
      ) {
        return res.status(409).json({
          error: "Pembayaran untuk pesanan ini sudah dibuat. Selesaikan lewat instruksi pembayaran sebelumnya atau tunggu hingga kedaluwarsa.",
          code: "PAYMENT_ALREADY_CREATED",
        });
      }
      // Error Midtrans lain: rethrow
      throw midtransErr;
    }

    // Simpan atau update record payment
    try {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          midtransTransactionId: transaction.token,
          status: "pending",
        },
      });
    } catch (paymentError: any) {
      // Two requests can pass the pre-check before either one persists payment.
      if (paymentError?.code === "P2002") {
        return res.status(409).json({
          error: "Pembayaran untuk pesanan ini sudah dibuat. Selesaikan lewat instruksi pembayaran sebelumnya atau tunggu hingga kedaluwarsa.",
          code: "PAYMENT_ALREADY_CREATED",
        });
      }
      throw paymentError;
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
