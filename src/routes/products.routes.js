const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/products — list semua produk aktif (contoh dasar, kembangkan sesuai kebutuhan:
// filter kategori, search nama/deskripsi/kategori/kreator, sort, pagination, dst)
router.get("/", async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, artisan: true, variants: true, story: true },
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — detail satu produk
router.get("/:id", async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        artisan: true,
        variantOptions: true,
        variants: true,
        story: true,
        reviews: { where: { status: "tampil" } },
      },
    });
    if (!product) return res.status(404).json({ error: "Produk tidak ditemukan" });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// TODO: POST/PUT/DELETE (khusus creator/admin, pasang requireAuth + requireRole)

module.exports = router;
