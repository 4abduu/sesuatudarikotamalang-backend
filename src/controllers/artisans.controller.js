const prisma = require("../lib/prisma");

// GET /api/artisans/applications/mine — Cek status pengajuan konsinyasi milik user yang login (Daftarkan sebelum /:id)
const getMyApplications = async (req, res, next) => {
  try {
    const applications = await prisma.artisanApplication.findMany({
      where: { userId: req.user.id },
      orderBy: { submittedAt: "desc" },
      include: { category: true },
    });
    res.json({ applications });
  } catch (err) {
    next(err);
  }
};

// PUT /api/artisans/mine — Update profil kreator (bio, avatarUrl, brandName) oleh kreator sendiri (Daftarkan sebelum /:id)
const updateMyProfile = async (req, res, next) => {
  try {
    const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
    if (!artisan) {
      return res.status(404).json({ error: "Profil kreator tidak ditemukan" });
    }

    const { brandName, bio, avatarUrl } = req.body;
    const updated = await prisma.artisan.update({
      where: { id: artisan.id },
      data: {
        ...(brandName && { brandName }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
    });

    res.json({ message: "Profil kreator berhasil diperbarui", artisan: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/artisans — daftar kreator aktif
const listArtisans = async (req, res, next) => {
  try {
    const artisans = await prisma.artisan.findMany({
      where: { status: "aktif" },
      include: {
        products: { where: { isActive: true } },
      },
    });
    res.json({ artisans });
  } catch (err) {
    next(err);
  }
};

// GET /api/artisans/:id — profil + karya kreator (hanya jika aktif dan produk aktif)
const getArtisanById = async (req, res, next) => {
  try {
    const artisan = await prisma.artisan.findFirst({
      where: { id: req.params.id, status: "aktif" },
      include: {
        products: {
          where: { isActive: true },
          include: { story: true },
        },
      },
    });
    if (!artisan) return res.status(404).json({ error: "Kreator tidak ditemukan atau sedang nonaktif" });
    res.json({ artisan });
  } catch (err) {
    next(err);
  }
};

// POST /api/artisans/apply — ajukan pendaftaran konsinyasi (butuh login)
const applyConsignment = async (req, res, next) => {
  try {
    const { applicantName, contact, brandName, categoryId, description, sampleFileUrl } = req.body;

    if (!applicantName || !contact || !brandName || !description) {
      return res.status(400).json({
        error: "applicantName, contact, brandName, dan description wajib diisi",
      });
    }

    // F-19: Hanya buyer yang boleh mengajukan konsinyasi
    if (req.user.role !== "buyer") {
      return res.status(403).json({
        error: "Hanya pengguna dengan role buyer yang dapat mengajukan konsinyasi",
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
};

module.exports = {
  getMyApplications,
  updateMyProfile,
  listArtisans,
  getArtisanById,
  applyConsignment,
};
