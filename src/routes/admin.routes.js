const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const prisma = require("../lib/prisma");

const router = express.Router();

// Semua route di bawah ini WAJIB login sebagai admin
router.use(requireAuth, requireRole("admin"));

// GET /api/admin/dashboard — ringkasan buat StatCard dashboard
router.get("/dashboard", async (req, res, next) => {
  try {
    const [ordersToday, readyForPickup, pendingApplications, lowStockCount] = await Promise.all([
      prisma.order.count({
        where: { pickupDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.order.count({ where: { status: "lunas" } }),
      prisma.artisanApplication.count({ where: { status: "pending" } }),
      prisma.productVariant.count({ where: { stock: { lt: 6 } } }),
    ]);

    res.json({ ordersToday, readyForPickup, pendingApplications, lowStockCount });
  } catch (err) {
    next(err);
  }
});

// TODO: CRUD produk, kelola pesanan (ubah status, extend hold — validasi cap 2 hari),
// kurasi pengajuan kreator (approve/reject), moderasi review, pengaturan (AppSettings)

module.exports = router;
