import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

// GET /api/reviews — List ulasan publik (dukung filter productId)
export const listReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.query;
    const where: any = { status: "tampil" };

    if (typeof productId === "string") {
      where.productId = productId;
    }

    const reviews = await prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Hitung rating rata-rata (baik untuk produk spesifik maupun toko keseluruhan)
    let avgRating = 0;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      avgRating = Number((sum / reviews.length).toFixed(1));
    }

    res.json({ reviews, avgRating, totalReviews: reviews.length });
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

    const { orderItemId, rating, comment } = req.body;

    const numericRating = parseInt(rating, 10);
    if (!rating || isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: "rating wajib diisi (angka 1-5)" });
    }

    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "comment ulasan wajib diisi" });
    }

    let productId: string | null = null;

    if (orderItemId) {
      // Ulasan produk spesifik dari pesanan
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: orderItemId },
        include: { order: true },
      });

      if (!orderItem) {
        return res.status(404).json({ error: "Item pesanan tidak ditemukan" });
      }

      if (orderItem.order.userId !== req.user.id) {
        return res.status(403).json({ error: "Kamu tidak memiliki akses memberikan ulasan untuk pesanan ini" });
      }

      if (orderItem.order.status !== "selesai") {
        return res.status(400).json({ error: "Ulasan hanya dapat diberikan untuk pesanan yang sudah selesai" });
      }

      const existingReview = await prisma.review.findUnique({
        where: { orderItemId },
      });

      if (existingReview) {
        return res.status(400).json({ error: "Kamu sudah memberikan ulasan untuk item pesanan ini" });
      }

      productId = orderItem.productId;
    } else {
      // Ulasan umum toko: Syaratkan user pernah menyelesaikan minimal 1 pesanan & maksimal 1 ulasan toko per user
      const completedOrder = await prisma.order.findFirst({
        where: { userId: req.user.id, status: "selesai" },
      });

      if (!completedOrder) {
        return res.status(403).json({
          error: "Kamu harus pernah menyelesaikan minimal 1 pesanan di toko ini sebelum memberikan ulasan toko.",
        });
      }

      const existingStoreReview = await prisma.review.findFirst({
        where: { userId: req.user.id, productId: null, orderItemId: null },
      });

      if (existingStoreReview) {
        return res.status(400).json({ error: "Kamu sudah pernah memberikan ulasan umum untuk toko ini." });
      }
    }

    const review = await prisma.review.create({
      data: {
        userId: req.user.id,
        productId,
        orderItemId: orderItemId || null,
        rating: numericRating,
        comment: comment.trim(),
        status: "tampil",
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        product: { include: { artisan: true } },
      },
    });

    // Jika review untuk produk spesifik, kirim notifikasi 'ulasan_baru' ke kreator pembuat produk
    if (review.product && review.product.artisan && review.product.artisan.userId) {
      const creatorUserId = review.product.artisan.userId;
      if (creatorUserId !== req.user.id) {
        await prisma.notification.create({
          data: {
            userId: creatorUserId,
            type: "ulasan_baru",
            title: "Ulasan Baru Produk",
            body: `${req.user.name} memberikan ulasan bintang ${numericRating} untuk produk "${review.product.name}": "${comment.trim()}"`,
          },
        }).catch(() => {});
      }
    }

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

    const reviews = await prisma.review.findMany({
      where: { userId: req.user.id },
      include: {
        product: { select: { id: true, name: true, images: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });

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

