import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { attachEffectiveStockToVariants } from "../lib/stock";

// GET /api/search — Search produk dan kreator untuk mobile/customer (query: ?q=)
export const search = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    if (!q) {
      return res.json({ products: [], creators: [] });
    }

    const [products, creators] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          artisan: { status: "aktif" }, // F-13: filter kreator aktif saja
          OR: [
            { name: { contains: q } },
            { shortDescription: { contains: q } },
            { description: { contains: q } },
            { category: { name: { contains: q } } },
            { artisan: { brandName: { contains: q } } },
          ],
        },
        include: {
          category: true,
          artisan: true,
          variantOptions: true,
          variants: true,
          story: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.artisan.findMany({
        where: {
          status: "aktif",
          OR: [
            { brandName: { contains: q } },
            { bio: { contains: q } },
          ],
        },
        include: {
          products: { where: { isActive: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // A3: Agregasi rating dan reviewCount untuk produk
    const productIds = products.map((p) => p.id);
    const reviewAggregates = await prisma.review.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        status: "tampil",
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const ratingMap: Record<string, { avgRating: number; reviewCount: number }> = {};
    for (const agg of reviewAggregates) {
      if (agg.productId) {
        ratingMap[agg.productId] = {
          avgRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : 0,
          reviewCount: agg._count.rating || 0,
        };
      }
    }

    // F-25: Lampirkan effectiveStock ke tiap varian produk di pencarian + rating info
    const productsWithStock = await Promise.all(
      products.map(async (p) => {
        const variantsWithStock = await attachEffectiveStockToVariants(p.variants);
        const stats = ratingMap[p.id] || { avgRating: 0, reviewCount: 0 };
        return {
          ...p,
          avgRating: stats.avgRating,
          reviewCount: stats.reviewCount,
          variants: variantsWithStock,
        };
      })
    );

    // A3: Agregasi rating & productCount untuk kreator
    const creatorIds = creators.map((c) => c.id);
    const creatorReviews = await prisma.review.findMany({
      where: {
        status: "tampil",
        product: { artisanId: { in: creatorIds } },
      },
      select: {
        rating: true,
        product: { select: { artisanId: true } },
      },
    });

    const creatorRatingMap: Record<string, { sum: number; count: number }> = {};
    for (const r of creatorReviews) {
      const aId = r.product?.artisanId;
      if (!aId) continue;
      if (!creatorRatingMap[aId]) creatorRatingMap[aId] = { sum: 0, count: 0 };
      creatorRatingMap[aId].sum += r.rating;
      creatorRatingMap[aId].count += 1;
    }

    const creatorsWithStats = creators.map((c) => {
      const stats = creatorRatingMap[c.id];
      const avgRating = stats && stats.count > 0 ? Number((stats.sum / stats.count).toFixed(1)) : 0;
      return {
        ...c,
        productCount: c.products.length,
        avgRating,
      };
    });

    res.json({ products: productsWithStock, creators: creatorsWithStats });
  } catch (err) {
    next(err);
  }
};

export default { search };
