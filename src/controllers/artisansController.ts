import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

// GET /api/artisans/applications/mine — Cek status pengajuan konsinyasi milik user yang login (Daftarkan sebelum /:id)
export const getMyApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

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
export const updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

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

// GET /api/artisans/mine — A4: Profil kreator milik user yang sedang login (sebelum /:id)
export const getMyArtisanProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const artisan = await prisma.artisan.findUnique({
      where: { userId: req.user.id },
      include: {
        products: {
          include: { category: true, variants: true, story: true },
        },
      },
    });

    if (!artisan) {
      return res.status(404).json({ error: "Profil kreator tidak ditemukan" });
    }

    const reviews = await prisma.review.findMany({
      where: {
        status: "tampil",
        product: { artisanId: artisan.id },
      },
      select: { rating: true },
    });

    const avgRating = reviews.length > 0
      ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
      : 0;

    res.json({
      artisan: {
        ...artisan,
        productCount: artisan.products.length,
        avgRating,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/artisans — daftar kreator aktif (A3: dengan productCount & avgRating)
export const listArtisans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisans = await prisma.artisan.findMany({
      where: { status: "aktif" },
      include: {
        products: { where: { isActive: true } },
      },
    });

    // A3: Hitung avgRating satu query untuk semua kreator
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

    const artisanRatingMap: Record<string, { sum: number; count: number }> = {};
    for (const r of reviews) {
      const aId = r.product?.artisanId;
      if (!aId) continue;
      if (!artisanRatingMap[aId]) artisanRatingMap[aId] = { sum: 0, count: 0 };
      artisanRatingMap[aId].sum += r.rating;
      artisanRatingMap[aId].count += 1;
    }

    const artisansWithStats = artisans.map((a) => {
      const stats = artisanRatingMap[a.id];
      const avgRating = stats && stats.count > 0 ? Number((stats.sum / stats.count).toFixed(1)) : 0;
      return {
        ...a,
        productCount: a.products.length,
        avgRating,
      };
    });

    res.json({ artisans: artisansWithStats });
  } catch (err) {
    next(err);
  }
};

// GET /api/artisans/:id — profil + karya kreator (hanya jika aktif dan produk aktif)
export const getArtisanById = async (req: Request, res: Response, next: NextFunction) => {
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

    // A3: Hitung avgRating dari review produk milik kreator ini
    const reviews = await prisma.review.findMany({
      where: {
        status: "tampil",
        product: { artisanId: artisan.id },
      },
      select: { rating: true },
    });
    const avgRating = reviews.length > 0
      ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
      : 0;

    res.json({
      artisan: {
        ...artisan,
        productCount: artisan.products.length,
        avgRating,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/artisans/apply — ajukan pendaftaran konsinyasi (butuh login)
export const applyConsignment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { applicantName, contact, brandName, categoryId, description, sampleFileUrl, samplePhotos } = req.body;

    if (!applicantName || !contact || !brandName || !description) {
      return res.status(400).json({
        error: "applicantName, contact, brandName, dan description wajib diisi",
      });
    }
    if (samplePhotos !== undefined && (!Array.isArray(samplePhotos) || samplePhotos.some((photo) => typeof photo !== "string"))) {
      return res.status(400).json({ error: "samplePhotos harus berupa array URL" });
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
        sampleFileUrl: samplePhotos?.[0] || sampleFileUrl,
        samplePhotos: samplePhotos === undefined ? undefined : samplePhotos,
        status: "pending",
      },
    });

    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
};

export default {
  getMyApplications,
  updateMyProfile,
  getMyArtisanProfile,
  listArtisans,
  getArtisanById,
  applyConsignment,
};
