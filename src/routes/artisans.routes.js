const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/artisans — daftar kreator aktif
router.get("/", async (req, res, next) => {
  try {
    const artisans = await prisma.artisan.findMany({
      where: { status: "aktif" },
      include: { products: true },
    });
    res.json({ artisans });
  } catch (err) {
    next(err);
  }
});

// GET /api/artisans/:id — profil + karya kreator
router.get("/:id", async (req, res, next) => {
  try {
    const artisan = await prisma.artisan.findUnique({
      where: { id: req.params.id },
      include: { products: { include: { story: true } } },
    });
    if (!artisan) return res.status(404).json({ error: "Kreator tidak ditemukan" });
    res.json({ artisan });
  } catch (err) {
    next(err);
  }
});

// TODO: POST /apply (form pengajuan konsinyasi -> tabel artisan_applications)

module.exports = router;
