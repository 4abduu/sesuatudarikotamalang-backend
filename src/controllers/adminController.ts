import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getPickupSlots, getSlotCapacity } from "../lib/slots";
import { HttpError } from "../lib/httpError";
import { computeRefund } from "../lib/refund";
import { cancelOrderInTx } from "../dal/orders";

// GET /api/admin/dashboard — ringkasan statcard + data grafik dashboard admin
export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // F-20: Hitung "hari ini" berdasarkan WIB (UTC+7) agar tidak bergeser di server UTC
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const startOfDayWIB = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate()));
    const startOfDay = new Date(startOfDayWIB.getTime() - WIB_OFFSET_MS);
    const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);

    // A7: 7 hari ke belakang dalam zona WIB
    const sevenDaysAgoWIB = new Date(Date.UTC(
      nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate() - 6
    ));
    const sevenDaysAgoUTC = new Date(sevenDaysAgoWIB.getTime() - WIB_OFFSET_MS);

    const [
      ordersToday,
      readyForPickup,
      pendingApplications,
      lowStockCount,
      lowStockVariants,
      statusDistribution,
      topSellingRaw,
      recentPaidOrders,
      upcomingPickups,
      todaySlotOrders,
      pendingRefundCount,
      pendingRefundRows,
    ] = await Promise.all([
      // 1. Pesanan dengan jadwal pickup HARI INI saja
      prisma.order.count({
        where: {
          pickupDate: { gte: startOfDay, lte: endOfDay },
        },
      }),
      // 2. Siap pickup (status lunas)
      prisma.order.count({ where: { status: "lunas" } }),
      // 3. Pengajuan konsinyasi pending
      prisma.artisanApplication.count({ where: { status: "pending" } }),
      // 4. Stok menipis (<6 pcs) HANYA untuk produk aktif
      prisma.productVariant.count({
        where: {
          stock: { lt: 6 },
          product: { isActive: true },
        },
      }),
      // 4b. Daftar varian stok menipis (maks 10, terendah dulu) untuk kartu "Perlu Restock"
      prisma.productVariant.findMany({
        where: {
          stock: { lt: 6 },
          product: { isActive: true },
        },
        orderBy: { stock: "asc" },
        take: 10,
        select: {
          stock: true,
          combination: true,
          product: { select: { id: true, name: true } },
        },
      }),
      // 5. Distribusi status pesanan
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      // 6. A7: Produk terlaris dengan totalRevenue (via OrderItem)
      prisma.product.findMany({
        where: { isActive: true, soldCount: { gt: 0 } },
        orderBy: { soldCount: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          soldCount: true,
          orderItems: {
            where: {
              order: { OR: [{ status: "lunas" }, { status: "selesai" }] },
            },
            select: { quantity: true, priceSnapshot: true },
          },
        },
      }),
      // 7. Pesanan 7 hari terakhir (untuk hitung pendapatan 7 hari dan revenueByDay)
      prisma.order.findMany({
        where: {
          createdAt: { gte: sevenDaysAgoUTC },
          OR: [{ status: "lunas" }, { status: "selesai" }],
        },
        select: { totalAmount: true, createdAt: true },
      }),
      // 8. A7: upcomingPickups — maks 5 order lunas terdekat (pickupDate >= hari ini)
      prisma.order.findMany({
        where: {
          status: "lunas",
          pickupDate: { gte: startOfDay },
        },
        orderBy: [{ pickupDate: "asc" }, { pickupSlot: "asc" }],
        take: 5,
        include: {
          user: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true } } } },
        },
      }),
      // 9. A7: slotDistribution — order hari ini per slot (status relevan)
      prisma.order.groupBy({
        by: ["pickupSlot"],
        where: {
          pickupDate: { gte: startOfDay, lte: endOfDay },
          status: { in: ["menunggu_bayar", "lunas", "selesai"] },
        },
        _count: { _all: true },
      }),
      prisma.order.count({ where: { refundStatus: "menunggu" } }),
      prisma.order.findMany({
        where: { refundStatus: "menunggu" },
        orderBy: { updatedAt: "asc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          cancelReason: true,
          updatedAt: true,
          user: { select: { name: true } },
          payment: { select: { paidAt: true } },
        },
      }),
    ]);

    const revenue7Days = recentPaidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // A7: revenueByDay — 7 hari terakhir dikelompokkan per hari WIB, hari kosong = 0
    const revenueByDay: { date: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayWIB = new Date(Date.UTC(
        nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate() - i
      ));
      const dayStr = `${dayWIB.getUTCFullYear()}-${String(dayWIB.getUTCMonth() + 1).padStart(2, "0")}-${String(dayWIB.getUTCDate()).padStart(2, "0")}`;
      const dayStartUTC = new Date(dayWIB.getTime() - WIB_OFFSET_MS);
      const dayEndUTC = new Date(dayStartUTC.getTime() + 86400000);
      const dayRevenue = recentPaidOrders
        .filter((o) => o.createdAt >= dayStartUTC && o.createdAt < dayEndUTC)
        .reduce((sum, o) => sum + o.totalAmount, 0);
      revenueByDay.push({ date: dayStr, revenue: dayRevenue });
    }

    // A7: topSellingProducts — reshape ke { id, name, soldCount, totalRevenue }
    const topSellingProducts = topSellingRaw.map((p) => ({
      id: p.id,
      name: p.name,
      soldCount: p.soldCount,
      totalRevenue: p.orderItems.reduce((sum, item) => sum + item.quantity * item.priceSnapshot, 0),
    }));

    // A7: slotDistribution — semua slot dengan capacity, termasuk slot tanpa booking
    const slots = getPickupSlots();
    const capacity = getSlotCapacity();
    const slotCountMap: Record<string, number> = {};
    for (const row of todaySlotOrders) {
      slotCountMap[row.pickupSlot] = row._count._all;
    }
    const slotDistribution = slots.map((time) => ({
      time,
      capacity,
      booked: slotCountMap[time] || 0,
    }));

    const pendingRefunds = pendingRefundRows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      buyerName: order.user.name,
      paidAt: order.payment?.paidAt || null,
      cancelReason: order.cancelReason,
      updatedAt: order.updatedAt,
    }));

    // Reshape lowStockVariants ke { id, name, variantLabel, stock }
    const lowStockProducts = lowStockVariants.map((v) => ({
      id: v.product.id,
      name: v.product.name,
      variantLabel: Array.isArray(v.combination) && v.combination.length > 0
        ? (v.combination as string[]).join(" / ")
        : "",
      stock: v.stock,
    }));

    res.json({
      ordersToday,
      readyForPickup,
      pendingApplications,
      lowStockCount,
      lowStockProducts,
      revenue7Days,
      revenueByDay,
      statusDistribution: statusDistribution.map((s) => ({ status: s.status, count: s._count._all })),
      topSellingProducts,
      slotDistribution,
      upcomingPickups,
      pendingRefundCount,
      pendingRefunds,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/applications — Daftar pengajuan konsinyasi (filter status: pending/diterima/ditolak)
export const listApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status !== undefined && typeof status !== "string") {
      return res.status(400).json({ error: "status harus berupa string" });
    }
    if (typeof status === "string" && !["pending", "diterima", "ditolak"].includes(status)) {
      return res.status(400).json({ error: "status pengajuan tidak valid" });
    }
    if (typeof status === "string") {
      where.status = status;
    }

    const applications = await prisma.artisanApplication.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        category: true,
      },
    });

    res.json({ applications });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/applications/:id/approve — Setujui pengajuan konsinyasi (Transaction)
export const approveApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const application = await prisma.artisanApplication.findUnique({ where: { id } });
    if (!application) {
      return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ error: `Pengajuan sudah berstatus ${application.status}` });
    }

    // Jalankan transaksi atomic
    const result = await prisma.$transaction(async (tx) => {
      // 1. Buat profil Artisan jika belum ada
      let artisan = await tx.artisan.findUnique({ where: { userId: application.userId } });
      if (!artisan) {
        artisan = await tx.artisan.create({
          data: {
            userId: application.userId,
            brandName: application.brandName,
            status: "aktif",
          },
        });
      }

      // 2. Ubah role user jadi "creator" — tapi jangan turunkan admin
      // F-19: Lindungi role admin agar tidak tertimpa
      const targetUser = await tx.user.findUnique({ where: { id: application.userId } });
      if (targetUser && targetUser.role !== "admin") {
        await tx.user.update({
          where: { id: application.userId },
          data: { role: "creator" },
        });
      }

      // 3. Update status ArtisanApplication -> "diterima"
      const updatedApp = await tx.artisanApplication.update({
        where: { id },
        data: {
          status: "diterima",
          decidedAt: new Date(),
        },
      });

      // 4. Kirim notifikasi in-app ke pengguna
      await tx.notification.create({
        data: {
          userId: application.userId,
          type: "pengajuan_diterima",
          title: "Pengajuan Konsinyasi Diterima",
          body: `Selamat! Pengajuan brand "${application.brandName}" kamu telah disetujui. Sekarang kamu dapat mengakses Dashboard Kreator dan mulai mengelola produkmu.`,
        },
      });

      return { application: updatedApp, artisan };
    });

    res.json({
      message: "Pengajuan konsinyasi berhasil disetujui",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/applications/:id/reject — Tolak pengajuan konsinyasi
export const rejectApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) {
      return res.status(400).json({ error: "reason harus berupa string maksimal 500 karakter" });
    }

    const application = await prisma.artisanApplication.findUnique({ where: { id } });
    if (!application) {
      return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ error: `Pengajuan sudah berstatus ${application.status}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update status ArtisanApplication -> "ditolak"
      const updatedApp = await tx.artisanApplication.update({
        where: { id },
        data: {
          status: "ditolak",
          rejectReason: reason || "Maaf, pengajuan kamu belum memenuhi kriteria saat ini.",
          decidedAt: new Date(),
        },
      });

      // 2. Kirim notifikasi in-app ke pengguna
      await tx.notification.create({
        data: {
          userId: application.userId,
          type: "pengajuan_ditolak",
          title: "Status Pengajuan Konsinyasi",
          body: `Pengajuan brand "${application.brandName}" kamu belum disetujui. Alasan: ${
            reason || "Belum memenuhi kriteria saat ini."
          }`,
        },
      });

      return updatedApp;
    });

    res.json({
      message: "Pengajuan konsinyasi berhasil ditolak",
      application: result,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/orders — Daftar seluruh pesanan untuk admin
// A7: tambah filter pickupDate=YYYY-MM-DD dan paymentMethod
export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search, pickupDate, paymentMethod, artisanId, refundStatus, page, limit } = req.query;

    for (const [name, value] of Object.entries({ status, search, pickupDate, paymentMethod, artisanId, refundStatus, page, limit })) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ error: `${name} harus berupa string` });
      }
    }

    const parsedPage = typeof page === "string" && /^\d+$/.test(page) && parseInt(page, 10) > 0 ? parseInt(page, 10) : undefined;
    const rawLimit = typeof limit === "string" && /^\d+$/.test(limit) && parseInt(limit, 10) > 0 ? parseInt(limit, 10) : undefined;
    const parsedLimit = rawLimit === undefined ? undefined : Math.min(rawLimit, 100);
    if ((page !== undefined && parsedPage === undefined) || (limit !== undefined && parsedLimit === undefined)) {
      return res.status(400).json({ error: "page dan limit harus berupa bilangan bulat positif" });
    }

    const where: any = {};

    const allowedOrderStatuses = ["menunggu_bayar", "lunas", "selesai", "dibatalkan", "kedaluwarsa", "lewat_batas_pengambilan"];
    if (typeof status === "string" && status.trim()) {
      if (!allowedOrderStatuses.includes(status.trim())) {
        return res.status(400).json({ error: "status order tidak valid" });
      }
      where.status = status.trim();
    }

    if (typeof search === "string" && search.trim()) {
      where.OR = [
        { orderNumber: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    // A7: filter pickupDate (YYYY-MM-DD)
    if (typeof pickupDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
      const dayStart = new Date(pickupDate + "T00:00:00+07:00"); // WIB
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
      where.pickupDate = { gte: dayStart, lte: dayEnd };
    }

    // A7: filter paymentMethod
    if (typeof paymentMethod === "string" && ["midtrans", "cod"].includes(paymentMethod)) {
      where.paymentMethod = paymentMethod;
    }

    if (typeof refundStatus === "string") {
      if (!["tidak_ada", "menunggu", "selesai"].includes(refundStatus)) {
        return res.status(400).json({ error: "refundStatus tidak valid" });
      }
      where.refundStatus = refundStatus;
    }

    // Filter pesanan yang memuat produk dari penjual tertentu (kreator atau Official Store)
    if (typeof artisanId === "string" && artisanId.trim()) {
      where.items = { some: { product: { artisanId: artisanId.trim() } } };
    }

    let total: number | undefined = undefined;
    if (parsedPage !== undefined && parsedLimit !== undefined) {
      total = await prisma.order.count({ where });
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(parsedPage !== undefined && parsedLimit !== undefined
        ? { skip: (parsedPage - 1) * parsedLimit, take: parsedLimit }
        : {}),
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { include: { artisan: { select: { id: true, brandName: true, isOfficial: true } } } },
            variant: true,
          },
        },
        payment: true,
      },
    });

    const responseData: any = { orders };
    if (parsedPage !== undefined && parsedLimit !== undefined && total !== undefined) {
      responseData.pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      };
    }

    res.json(responseData);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/status — Admin ubah status order secara manual
export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body;

    const allowedStatuses = [
      "menunggu_bayar",
      "lunas",
      "selesai",
      "dibatalkan",
      "kedaluwarsa",
      "lewat_batas_pengambilan",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Status tidak valid" });
    }
    if (status === "dibatalkan" && cancelReason !== undefined &&
      (typeof cancelReason !== "string" || !["permintaan_pembeli", "kesalahan_toko"].includes(cancelReason))) {
      throw new HttpError(400, "cancelReason tidak valid", "INVALID_CANCEL_REASON");
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Kunci baris sebelum membaca status agar dua admin yang bersamaan
      // tidak sama-sama memproses status lama dan menaikkan soldCount dua kali.
      const lockedRows: Array<{ id: string }> = await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      if (lockedRows.length === 0) {
        throw { status: 404, message: "Pesanan tidak ditemukan" };
      }

      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true, payment: true },
      });
      if (!order) {
        throw { status: 404, message: "Pesanan tidak ditemukan" };
      }

      const oldStatus = order.status;

      // F-17: Batasi transisi status yang tidak valid dan mencegah order terminal dihidupkan kembali.
      const allowedTransitions: Record<string, string[]> = {
        menunggu_bayar: ["lunas", "dibatalkan", "kedaluwarsa"],
        lunas: ["selesai", "dibatalkan", "lewat_batas_pengambilan"],
        lewat_batas_pengambilan: ["selesai", "dibatalkan"],
        selesai: [],
        dibatalkan: [],
        kedaluwarsa: [],
      };
      if (oldStatus !== status && !allowedTransitions[oldStatus]?.includes(status)) {
        throw { status: 400, message: `Transisi status ${oldStatus} ke ${status} tidak diizinkan` };
      }

      if (status === "dibatalkan") {
        if (oldStatus === "dibatalkan") return order;
        const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
        const refund = computeRefund({ order, payment: order.payment, settings });
        const effectiveReason = cancelReason || (refund.paid ? "kesalahan_toko" : undefined);
        if (effectiveReason === "permintaan_pembeli" && refund.paid) {
          if (oldStatus === "lewat_batas_pengambilan") {
            throw new HttpError(400, "Pesanan sudah lewat batas pengambilan. Gunakan alasan kesalahan toko bila memang kesalahan toko.", "PICKUP_DEADLINE_PASSED");
          }
          if (!refund.canCancelByBuyerRequest) {
            throw new HttpError(400, "Batas waktu refund sudah lewat. Gunakan alasan kesalahan toko bila memang kesalahan toko.", "REFUND_WINDOW_PASSED");
          }
        }
        return cancelOrderInTx(tx, order, { reason: effectiveReason as "permintaan_pembeli" | "kesalahan_toko" | undefined });
      }

      // 1. Jika pindah ke 'lunas' dan pickupDeadline belum ada, hitung pickupDeadline
      let pickupDeadline = order.pickupDeadline;
      if (status === "lunas" && !pickupDeadline) {
        let settings = await tx.appSettings.findUnique({ where: { id: 1 } });
        const deadlineDays = settings?.pickupDeadlineDays || 14;
        pickupDeadline = new Date(new Date(order.pickupDate).getTime() + deadlineDays * 86400000);
      }

      // 2. Update status order
      const updated = await tx.order.update({
        where: { id },
        data: {
          status,
          ...(pickupDeadline && { pickupDeadline }),
        },
      });

      // 3. Increment soldCount jika order COD berpindah ke 'selesai' untuk pertama kali
      if (order.paymentMethod === "cod" && status === "selesai" && oldStatus !== "selesai") {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          });
        }
      }

      // 4. Kirim notifikasi in-app ke pengguna mengenai perubahan status pesanan
      if (oldStatus !== status) {
        const readableStatus = status.replace(/_/g, " ");
        await tx.notification.create({
          data: {
            userId: order.userId,
            type: "pesanan_update",
            title: "Update Status Pesanan",
            body: `Pesanan kamu (${order.orderNumber}) telah diperbarui menjadi: ${readableStatus}.`,
          },
        });
      }

      return updated;
    });

    res.json({ message: "Status pesanan berhasil diperbarui", order: updatedOrder });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return next(err);
    }
    if (err?.status) {
      return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    next(err);
  }
};

// PATCH /api/admin/orders/:id/refunded — Admin menandai refund manual sudah selesai
export const markOrderRefunded = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await prisma.$transaction(async (tx) => {
      const lockedRows: Array<{ id: string }> = await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      if (lockedRows.length === 0) throw new HttpError(404, "Pesanan tidak ditemukan", "NOT_FOUND");

      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new HttpError(404, "Pesanan tidak ditemukan", "NOT_FOUND");
      if (order.refundStatus !== "menunggu") {
        throw new HttpError(409, "Pesanan ini tidak sedang menunggu refund", "REFUND_NOT_PENDING");
      }

      const updated = await tx.order.update({
        where: { id },
        data: { refundStatus: "selesai", refundedAt: new Date() },
      });
      await tx.notification.create({
        data: {
          userId: order.userId,
          type: "pesanan_update",
          title: "Dana Dikembalikan",
          body: `Pengembalian dana untuk pesanan ${order.orderNumber} sudah diproses oleh admin.`,
        },
      });
      return updated;
    });

    res.json({ message: "Refund ditandai selesai", order: result });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/extend-hold — Admin perpanjang waktu hold pesanan Cash/QRIS
export const extendOrderHold = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { additionalMinutes } = req.body;

    if (!Number.isInteger(additionalMinutes) || additionalMinutes < 1 || additionalMinutes > 2880) {
      return res.status(400).json({ error: "additionalMinutes harus berupa bilangan bulat antara 1 dan 2880" });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    if (order.paymentMethod !== "cod") {
      return res.status(400).json({ error: "Perpanjangan hold hanya berlaku untuk pesanan Bayar di Toko (COD)" });
    }

    if (order.status !== "menunggu_bayar") {
      return res.status(400).json({ error: `Pesanan berstatus ${order.status} tidak dapat diperpanjang hold-nya` });
    }

    // Hitung batas maksimal perpanjangan: 2 hari (48 jam) total dari order.createdAt
    const maxHoldUntil = new Date(order.createdAt.getTime() + 2 * 86400000);
    const currentHold = order.holdExpiresAt || new Date();
    const newHoldExpiresAt = new Date(currentHold.getTime() + additionalMinutes * 60000);

    if (newHoldExpiresAt > maxHoldUntil) {
      return res.status(400).json({
        error: "Perpanjangan melebihi batas maksimal total 2 hari sejak pesanan dibuat",
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        holdExpiresAt: newHoldExpiresAt,
        holdExtendedMinutes: order.holdExtendedMinutes + additionalMinutes,
      },
    });

    res.json({
      message: `Waktu hold berhasil diperpanjang ${additionalMinutes} menit`,
      order: updatedOrder,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/scan-qr/verify — Verifikasi pickup via Scan QR Kamera Browser / Input Manual Kode Order (SDK-XXXX)
export const verifyScanQr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.body;
    if (!orderNumber || typeof orderNumber !== "string" || !orderNumber.trim()) {
      return res.status(400).json({ error: "orderNumber wajib diisi" });
    }

    const updatedOrder = await prisma.$transaction(
      async (tx) => {
        // Cari dan lock order di dalam transaksi (F-06: Mencegah race condition double scan)
        const rawOrder = await tx.order.findUnique({
          where: { orderNumber: orderNumber.trim() },
        });

        if (!rawOrder) {
          throw { status: 404, message: "Pesanan tidak ditemukan" };
        }

        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${rawOrder.id} FOR UPDATE`;

        const order = await tx.order.findUnique({
          where: { id: rawOrder.id },
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: { include: { product: true, variant: true } },
          },
        });

        if (!order) {
          throw { status: 404, message: "Pesanan tidak ditemukan" };
        }

        if (order.status === "selesai") {
          throw { status: 400, message: "Pesanan ini sudah pernah diambil (status: Selesai)", order };
        }

        if (order.status === "dibatalkan" || order.status === "kedaluwarsa") {
          throw { status: 400, message: `Pesanan tidak dapat diambil karena berstatus ${order.status}`, order };
        }

        // F-06: Tolak jika pesanan Midtrans belum dibayar (status bukan lunas/lewat_batas_pengambilan)
        if (order.paymentMethod === "midtrans" && !["lunas", "lewat_batas_pengambilan"].includes(order.status)) {
          throw {
            status: 400,
            message: `Pesanan Midtrans berstatus '${order.status}' belum lunas dan tidak dapat diserahkan`,
            order,
          };
        }

        const updated = await tx.order.update({
          where: { id: order.id },
          data: { status: "selesai" },
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: { include: { product: true, variant: true } },
          },
        });

        // Increment soldCount HANYA jika COD (karena Midtrans sudah dihitung saat webhook settlement)
        if (order.paymentMethod === "cod") {
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { soldCount: { increment: item.quantity } },
            });
          }
        }

        return updated;
      },
      { isolationLevel: "ReadCommitted" }
    );

    res.json({
      message: "Verifikasi pickup berhasil! Pesanan telah ditandai Selesai",
      order: updatedOrder,
    });
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, order: err.order });
    }
    next(err);
  }
};

// GET /api/admin/settings — Ambil pengaturan sistem (AppSettings singleton id: 1)
export const getSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: 1 } });
    }
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/settings — Update pengaturan sistem (AppSettings)
export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { holdDurationMinutes, autoCancelEnabled, pickupDeadlineDays, whatsappAdminNumber, notificationEmail, refundWindowDays } = req.body;

    // F-23: Validasi rentang angka
    let parsedHold: number | undefined = undefined;
    if (holdDurationMinutes !== undefined) {
      parsedHold = parseInt(holdDurationMinutes);
      if (isNaN(parsedHold) || parsedHold < 15 || parsedHold > 1440) {
        return res.status(400).json({ error: "holdDurationMinutes harus berupa angka antara 15 dan 1440 menit" });
      }
    }

    let parsedDeadline: number | undefined = undefined;
    if (pickupDeadlineDays !== undefined) {
      parsedDeadline = parseInt(pickupDeadlineDays);
      if (isNaN(parsedDeadline) || ![7, 14, 30].includes(parsedDeadline)) {
        return res.status(400).json({ error: "pickupDeadlineDays harus bernilai 7, 14, atau 30 hari" });
      }
    }

    let parsedRefundWindow: number | undefined = undefined;
    if (refundWindowDays !== undefined) {
      parsedRefundWindow = parseInt(refundWindowDays);
      if (isNaN(parsedRefundWindow) || typeof refundWindowDays !== "number" || ![1, 3, 7].includes(parsedRefundWindow)) {
        return res.status(400).json({ error: "refundWindowDays harus bernilai 1, 3, atau 7 hari" });
      }
    }

    // A9: autoCancelEnabled harus boolean sungguhan (bukan string "true"/"false")
    if (autoCancelEnabled !== undefined && typeof autoCancelEnabled !== "boolean") {
      return res.status(400).json({ error: "autoCancelEnabled harus bertipe boolean (true/false), bukan string" });
    }

    // A9: whatsappAdminNumber hanya digit (boleh diawali +)
    if (whatsappAdminNumber !== undefined && whatsappAdminNumber !== null) {
      if (typeof whatsappAdminNumber !== "string" || !/^\+?\d+$/.test(whatsappAdminNumber)) {
        return res.status(400).json({ error: "whatsappAdminNumber hanya boleh berisi digit (boleh diawali +)" });
      }
    }
    if (notificationEmail !== undefined && notificationEmail !== null &&
      (typeof notificationEmail !== "string" || notificationEmail.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail))) {
      return res.status(400).json({ error: "notificationEmail harus berupa email valid maksimal 191 karakter atau null" });
    }

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        ...(parsedHold !== undefined && { holdDurationMinutes: parsedHold }),
        ...(autoCancelEnabled !== undefined && { autoCancelEnabled }),
        ...(parsedDeadline !== undefined && { pickupDeadlineDays: parsedDeadline }),
        ...(whatsappAdminNumber !== undefined && { whatsappAdminNumber }),
        ...(notificationEmail !== undefined && { notificationEmail }),
        ...(parsedRefundWindow !== undefined && { refundWindowDays: parsedRefundWindow }),
      },
      update: {
        ...(parsedHold !== undefined && { holdDurationMinutes: parsedHold }),
        ...(autoCancelEnabled !== undefined && { autoCancelEnabled }),
        ...(parsedDeadline !== undefined && { pickupDeadlineDays: parsedDeadline }),
        ...(whatsappAdminNumber !== undefined && { whatsappAdminNumber }),
        ...(notificationEmail !== undefined && { notificationEmail }),
        ...(parsedRefundWindow !== undefined && { refundWindowDays: parsedRefundWindow }),
      },
    });

    res.json({ message: "Pengaturan sistem berhasil diperbarui", settings });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/reviews/:id/hide — Sembunyikan / Tampilkan ulasan
export const toggleReviewHide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      return res.status(404).json({ error: "Ulasan tidak ditemukan" });
    }

    const newStatus = review.status === "tampil" ? "disembunyikan" : "tampil";
    const updated = await prisma.review.update({
      where: { id },
      data: { status: newStatus },
    });

    res.json({ message: `Status ulasan diubah menjadi '${newStatus}'`, review: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/reviews/:id — Hapus ulasan tidak pantas
export const deleteReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      return res.status(404).json({ error: "Ulasan tidak ditemukan" });
    }

    await prisma.review.delete({ where: { id } });
    res.json({ message: "Ulasan berhasil dihapus" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/artisans/:id/toggle-status — Ubah status aktif/nonaktif kreator
export const toggleArtisanStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const artisan = await prisma.artisan.findUnique({ where: { id } });

    if (!artisan) {
      return res.status(404).json({ error: "Kreator tidak ditemukan" });
    }

    if (artisan.isOfficial) {
      throw new HttpError(400, "Official Store tidak dapat dinonaktifkan", "OFFICIAL_STORE_PROTECTED");
    }

    const newStatus = artisan.status === "aktif" ? "nonaktif" : "aktif";
    const updated = await prisma.artisan.update({
      where: { id },
      data: { status: newStatus },
    });

    res.json({ message: `Status kreator berhasil diubah menjadi '${newStatus}'`, artisan: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/artisans — A5: Daftar seluruh kreator untuk admin (dengan productCount, avgRating, user.email)
export const listAdminArtisans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, isOfficial } = req.query;
    const where: any = {};
    if (status === "aktif" || status === "nonaktif") {
      where.status = status;
    }
    if (isOfficial !== undefined) {
      if (isOfficial !== "true" && isOfficial !== "false") {
        return res.status(400).json({ error: "isOfficial harus 'true' atau 'false'" });
      }
      where.isOfficial = isOfficial === "true";
    }

    const artisans = await prisma.artisan.findMany({
      where,
      orderBy: [{ isOfficial: "desc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        products: { select: { id: true, isActive: true } },
      },
    });

    const artisanIds = artisans.map((a) => a.id);
    const reviews = await prisma.review.findMany({
      where: {
        status: "tampil",
        product: { artisanId: { in: artisanIds } },
      },
      select: {
        rating: true,
        product: { select: { artisanId: true } },
      },
    });

    const ratingMap: Record<string, { sum: number; count: number }> = {};
    for (const r of reviews) {
      const aId = r.product?.artisanId;
      if (!aId) continue;
      if (!ratingMap[aId]) ratingMap[aId] = { sum: 0, count: 0 };
      ratingMap[aId].sum += r.rating;
      ratingMap[aId].count += 1;
    }

    const artisansWithStats = artisans.map((a) => {
      const stats = ratingMap[a.id];
      const avgRating = stats && stats.count > 0 ? Number((stats.sum / stats.count).toFixed(1)) : 0;
      return {
        id: a.id,
        userId: a.userId,
        brandName: a.brandName,
        bio: a.bio,
        avatarUrl: a.avatarUrl,
        status: a.status,
        isOfficial: a.isOfficial,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        user: a.user,
        productCount: a.products.length,
        avgRating,
      };
    });

    res.json({ artisans: artisansWithStats });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/products — A5: Daftar seluruh produk untuk admin (termasuk nonaktif)
export const listAdminProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, categoryId, artisanId } = req.query;
    if (q !== undefined && typeof q !== "string") {
      return res.status(400).json({ error: "q harus berupa string" });
    }
    if (categoryId !== undefined && typeof categoryId !== "string") {
      return res.status(400).json({ error: "categoryId harus berupa string" });
    }
    if (artisanId !== undefined && typeof artisanId !== "string") {
      return res.status(400).json({ error: "artisanId harus berupa string" });
    }
    const where: any = {};

    if (typeof categoryId === "string" && categoryId.trim()) {
      where.categoryId = categoryId.trim();
    }

    if (typeof artisanId === "string" && artisanId.trim()) {
      where.artisanId = artisanId.trim();
    }

    if (typeof q === "string" && q.trim()) {
      const query = q.trim().toLowerCase();
      where.OR = [
        { name: { contains: query } },
        { shortDescription: { contains: query } },
        { artisan: { brandName: { contains: query } } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        artisan: true,
        variantOptions: true,
        variants: true,
        story: true,
      },
    });

    res.json({ products });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/products/:id/active — A5: Ubah status aktif/nonaktif produk
export const toggleProductActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Field isActive wajib berupa boolean (true/false)" });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { isActive },
    });

    res.json({
      message: `Produk berhasil di${isActive ? "aktifkan" : "nonaktifkan"}`,
      product: updated,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/reviews — A5: Daftar ulasan untuk admin (dengan filter rating, status, q, dan summary)
export const listAdminReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rating, status, q, page, limit } = req.query;
    const where: any = {};

    if (rating !== undefined && typeof rating !== "string") {
      return res.status(400).json({ error: "rating harus berupa string" });
    }
    if (status !== undefined && typeof status !== "string") {
      return res.status(400).json({ error: "status harus berupa string" });
    }
    if (q !== undefined && typeof q !== "string") {
      return res.status(400).json({ error: "q harus berupa string" });
    }
    for (const [name, value] of Object.entries({ page, limit })) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ error: `${name} harus berupa string` });
      }
    }
    const hasPagination = page !== undefined || limit !== undefined;
    const parsedPage = typeof page === "string" && /^\d+$/.test(page) && parseInt(page, 10) > 0 ? parseInt(page, 10) : undefined;
    const rawLimit = typeof limit === "string" && /^\d+$/.test(limit) && parseInt(limit, 10) > 0 ? parseInt(limit, 10) : undefined;
    if (hasPagination && (parsedPage === undefined || rawLimit === undefined)) {
      return res.status(400).json({ error: "page dan limit harus berupa bilangan bulat positif" });
    }
    const parsedLimit = rawLimit === undefined ? undefined : Math.min(rawLimit, 100);

    if (typeof rating === "string") {
      if (!/^[1-5]$/.test(rating)) {
        return res.status(400).json({ error: "rating harus berupa angka 1 sampai 5" });
      }
      where.rating = Number(rating);
    }

    if (typeof status === "string" && !["tampil", "disembunyikan"].includes(status)) {
      return res.status(400).json({ error: "status ulasan tidak valid" });
    }
    if (status === "tampil" || status === "disembunyikan") {
      where.status = status;
    }

    if (typeof q === "string" && q.trim()) {
      const query = q.trim().toLowerCase();
      where.OR = [
        { comment: { contains: query } },
        { user: { name: { contains: query } } },
        { product: { name: { contains: query } } },
      ];
    }

    const [reviews, total, summaryAggregate, summaryByStatus] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(hasPagination ? { skip: (parsedPage! - 1) * parsedLimit!, take: parsedLimit } : {}),
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          product: { select: { id: true, name: true, images: true } },
        },
      }),
      hasPagination ? prisma.review.count({ where }) : Promise.resolve(0),
      prisma.review.aggregate({ _avg: { rating: true } }),
      prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const visibleCount = summaryByStatus.find((row) => row.status === "tampil")?._count._all || 0;
    const hiddenCount = summaryByStatus.find((row) => row.status === "disembunyikan")?._count._all || 0;
    const totalReviews = summaryByStatus.reduce((sum, row) => sum + row._count._all, 0);
    const avgRating = summaryAggregate._avg.rating ? Number(summaryAggregate._avg.rating.toFixed(1)) : 0;

    const response: any = {
      reviews,
      summary: {
        avgRating,
        visibleCount,
        hiddenCount,
        totalReviews,
      },
    };
    if (hasPagination) {
      response.pagination = { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit!) };
    }
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export default {
  getDashboard,
  listApplications,
  approveApplication,
  rejectApplication,
  listOrders,
  updateOrderStatus,
  markOrderRefunded,
  extendOrderHold,
  verifyScanQr,
  getSettings,
  updateSettings,
  toggleReviewHide,
  deleteReview,
  toggleArtisanStatus,
  listAdminArtisans,
  listAdminProducts,
  toggleProductActive,
  listAdminReviews,
};
