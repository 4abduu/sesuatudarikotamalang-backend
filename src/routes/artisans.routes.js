const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

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

// POST /api/artisans/apply — ajukan pendaftaran konsinyasi (butuh login)
router.post("/apply", requireAuth, async (req, res, next) => {
  try {
    const { applicantName, contact, brandName, categoryId, description, sampleFileUrl } = req.body;

    if (!applicantName || !contact || !brandName || !description) {
      return res.status(400).json({
        error: "applicantName, contact, brandName, dan description wajib diisi",
      });
    }

    // Cek jika user sudah punya pengajuan yang masih status pending
    const existingPending = await prisma.artisanApplication.findFirst({
      where: { userId: req.user.id, status: "pending" },
    });

    if (existingPending) {
      return res.status(400).json({
        error: "Kamu masih memiliki pengajuan konsinyasi yang sedang diproses (pending)",
      });
    }

    const application = await prisma.artisanApplication.create({
      data: {
        userId: req.user.id,
        applicantName,
        contact,
        brandName,
        categoryId,
        description,
        sampleFileUrl,
        status: "pending",
      },
    });

    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

