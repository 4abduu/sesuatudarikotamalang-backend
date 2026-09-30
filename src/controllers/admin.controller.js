const prisma = require("../lib/prisma");

// GET /api/admin/dashboard — ringkasan statcard + data grafik dashboard admin
const getDashboard = async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      ordersToday,
      readyForPickup,
      pendingApplications,
      lowStockCount,
      statusDistribution,
      topSellingProducts,
      recentPaidOrders,
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
      // 5. Distribusi status pesanan
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      // 6. Produk terlaris (soldCount tertinggi)
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { soldCount: "desc" },
        take: 5,
        include: { artisan: { select: { brandName: true } }, category: true },
      }),
      // 7. Pesanan 7 hari terakhir (untuk hitung pendapatan 7 hari terakhir)
      prisma.order.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          OR: [{ status: "lunas" }, { status: "selesai" }],
        },
        select: { totalAmount: true, createdAt: true },
      }),
    ]);

    const revenue7Days = recentPaidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    res.json({
      ordersToday,
      readyForPickup,
      pendingApplications,
      lowStockCount,
      revenue7Days,
      statusDistribution: statusDistribution.map((s) => ({ status: s.status, count: s._count._all })),
      topSellingProducts,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/applications — Daftar pengajuan konsinyasi (filter status: pending/diterima/ditolak)
const listApplications = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) {
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
const approveApplication = async (req, res, next) => {
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

      // 2. Ubah role user jadi "creator"
      await tx.user.update({
        where: { id: application.userId },
        data: { role: "creator" },
      });

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
const rejectApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

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
const listOrders = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: true, variant: true } },
        payment: true,
      },
    });

    res.json({ orders });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/status — Admin ubah status order secara manual
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

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

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    const oldStatus = order.status;

    const updatedOrder = await prisma.$transaction(async (tx) => {
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
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/extend-hold — Admin perpanjang waktu hold pesanan Cash/QRIS
const extendOrderHold = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { additionalMinutes } = req.body;

    if (!additionalMinutes || typeof additionalMinutes !== "number" || additionalMinutes <= 0) {
      return res.status(400).json({ error: "additionalMinutes harus berupa angka positif" });
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
const verifyScanQr = async (req, res, next) => {
  try {
    const { orderNumber } = req.body;
    if (!orderNumber || !orderNumber.trim()) {
      return res.status(400).json({ error: "orderNumber wajib diisi" });
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim() },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: true, variant: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    if (order.status === "selesai") {
      return res.status(400).json({ error: "Pesanan ini sudah pernah diambil (status: Selesai)", order });
    }

    if (order.status === "dibatalkan" || order.status === "kedaluwarsa") {
      return res.status(400).json({ error: `Pesanan tidak dapat diambil karena berstatus ${order.status}`, order });
    }

    // Ubah status pesanan menjadi 'selesai' dan increment soldCount jika COD (karena Midtrans sudah dihitung saat webhook)
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: "selesai" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { include: { product: true, variant: true } },
        },
      });

      if (order.paymentMethod === "cod" && order.status !== "selesai") {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          });
        }
      }

      return updated;
    });

    res.json({
      message: "Verifikasi pickup berhasil! Pesanan telah ditandai Selesai",
      order: updatedOrder,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/settings — Ambil pengaturan sistem (AppSettings singleton id: 1)
const getSettings = async (req, res, next) => {
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
const updateSettings = async (req, res, next) => {
  try {
    const { holdDurationMinutes, autoCancelEnabled, pickupDeadlineDays, whatsappAdminNumber, notificationEmail } = req.body;

    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        ...(holdDurationMinutes !== undefined && { holdDurationMinutes: parseInt(holdDurationMinutes) }),
        ...(autoCancelEnabled !== undefined && { autoCancelEnabled: Boolean(autoCancelEnabled) }),
        ...(pickupDeadlineDays !== undefined && { pickupDeadlineDays: parseInt(pickupDeadlineDays) }),
        ...(whatsappAdminNumber !== undefined && { whatsappAdminNumber }),
        ...(notificationEmail !== undefined && { notificationEmail }),
      },
      update: {
        ...(holdDurationMinutes !== undefined && { holdDurationMinutes: parseInt(holdDurationMinutes) }),
        ...(autoCancelEnabled !== undefined && { autoCancelEnabled: Boolean(autoCancelEnabled) }),
        ...(pickupDeadlineDays !== undefined && { pickupDeadlineDays: parseInt(pickupDeadlineDays) }),
        ...(whatsappAdminNumber !== undefined && { whatsappAdminNumber }),
        ...(notificationEmail !== undefined && { notificationEmail }),
      },
    });

    res.json({ message: "Pengaturan sistem berhasil diperbarui", settings });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/reviews/:id/hide — Sembunyikan / Tampilkan ulasan
const toggleReviewHide = async (req, res, next) => {
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
const deleteReview = async (req, res, next) => {
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
const toggleArtisanStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const artisan = await prisma.artisan.findUnique({ where: { id } });

    if (!artisan) {
      return res.status(404).json({ error: "Kreator tidak ditemukan" });
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

module.exports = {
  getDashboard,
  listApplications,
  approveApplication,
  rejectApplication,
  listOrders,
  updateOrderStatus,
  extendOrderHold,
  verifyScanQr,
  getSettings,
  updateSettings,
  toggleReviewHide,
  deleteReview,
  toggleArtisanStatus,
};
