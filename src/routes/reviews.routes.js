const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/reviews?productId=... — review per produk, atau review umum toko kalau tanpa productId
router.get("/", async (req, res, next) => {
  try {
    const { productId } = req.query;
    const reviews = await prisma.review.findMany({
      where: { status: "tampil", productId: productId || null },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
});

// TODO: POST / (buat review baru — validasi orderItemId benar-benar milik user & sudah selesai,
// dan belum pernah direview sebelumnya)

module.exports = router;
