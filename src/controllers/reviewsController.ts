import { Request, Response, NextFunction } from "express";
import { createReviewForUser, listMyReviews as listMyReviewsDal } from "../dal/reviews";
import prisma from "../lib/prisma";

// GET /api/reviews — List ulasan publik (dukung filter productId)
export const listReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, page, limit } = req.query;
    for (const [name, value] of Object.entries({ productId, page, limit })) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ error: `${name} harus berupa string` });
      }
    }
    const hasPagination = page !== undefined || limit !== undefined;
    const parsedPage = typeof page === "string" && /^\d+$/.test(page) && parseInt(page, 10) > 0 ? parseInt(page, 10) : undefined;
    const rawLimit = typeof limit === "string" && /^\d+$/.test(limit) && parseInt(limit, 10) > 0 ? parseInt(limit, 10) : undefined;
    if (hasPagination && (parsedPage === undefined || rawLimit === undefined)) {
      return res.status(400).json({ error: "page dan limit harus berupa bilangan bulat positif" });
    }
    const parsedLimit = rawLimit === undefined ? undefined : Math.min(rawLimit, 100);
    const where: any = { status: "tampil" };

    if (typeof productId === "string") {
      where.productId = productId;
    }

    const reviews = hasPagination
      ? await prisma.review.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            product: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (parsedPage! - 1) * parsedLimit!,
          take: parsedLimit,
        })
      : await prisma.review.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            product: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

    // Hitung rating rata-rata (baik untuk produk spesifik maupun toko keseluruhan)
    if (!hasPagination) {
      const avgRating = reviews.length > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
        : 0;
      return res.json({ reviews, avgRating, totalReviews: reviews.length });
    }

    const [total, aggregate] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);
    res.json({
      reviews,
      avgRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 0,
      totalReviews: total,
      pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit!) },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/reviews — Tambah ulasan baru (butuh login, wajib terikat pesanan yang sudah selesai)
export const createReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const review = await createReviewForUser(req.user, req.body);

    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
};

// GET /api/reviews/mine — A4: Ulasan milik pengguna yang sedang login (semua status)
export const listMyReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const reviews = await listMyReviewsDal(req.user);

    res.json({ reviews });
  } catch (err) {
    next(err);
  }
};

export default {
  listReviews,
  createReview,
  listMyReviews,
};

