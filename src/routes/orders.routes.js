const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/orders — riwayat pesanan milik user yang login
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: { include: { product: true, variant: true } }, payment: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// TODO: POST / (buat order baru — WAJIB validasi stok efektif & larangan beli produk sendiri
// di sini, dalam satu database transaction bareng pengurangan stok, lihat dokumen master
// bagian 6 untuk detail aturan bisnisnya)

// TODO: GET /:id (detail 1 order)

// TODO: PATCH /:id/cancel (batalkan pesanan)

module.exports = router;
