import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import {
  createApplicationForUser,
  getMyApplications as getMyApplicationsDal,
  getMyArtisanProfile as getMyArtisanProfileDal,
  updateMyArtisanProfile,
} from "../dal/artisanProfile";
import { presentArtisan } from "../lib/presentArtisan";

// GET /api/artisans/applications/mine — Cek status pengajuan konsinyasi milik user yang login (Daftarkan sebelum /:id)
export const getMyApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const applications = await getMyApplicationsDal(req.user);
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

    const updated = await updateMyArtisanProfile(req.user, req.body);
    // owner: true → sertakan ownAvatarUrl
    res.json({ message: "Profil kreator berhasil diperbarui", artisan: presentArtisan(updated, { owner: true }) });
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

    const artisan = await getMyArtisanProfileDal(req.user);
    // owner: true → sertakan ownAvatarUrl
    res.json({ artisan: presentArtisan(artisan, { owner: true }) });
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
        user: { select: { avatarUrl: true } },
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
      // Publik: tanpa ownAvatarUrl
      return {
        ...presentArtisan(a),
        productCount: a.products.length,
        avgRating,
      };
    });

    // Official Store tidak masuk daftar kreator; dikirim terpisah lewat field officialStore
    res.json({
      artisans: artisansWithStats.filter((a) => !(a as any).isOfficial),
      officialStore: artisansWithStats.find((a) => (a as any).isOfficial) ?? null,
    });
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
        user: { select: { avatarUrl: true } },
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
      // Publik: tanpa ownAvatarUrl
      artisan: {
        ...presentArtisan(artisan),
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

    // brandName kini opsional (2.2: default ke users.name bila tidak diisi)
    if (!applicantName || !contact || !description) {
      return res.status(400).json({
        error: "applicantName, contact, dan description wajib diisi",
      });
    }
    const application = await createApplicationForUser(req.user, {
      applicantName,
      contact,
      brandName,       // boleh undefined/null/kosong
      categoryId,
      description,
      sampleFileUrl,
      samplePhotos,
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
