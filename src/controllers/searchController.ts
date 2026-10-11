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

    // F-25: Lampirkan effectiveStock ke tiap varian produk di pencarian
    const productsWithStock = await Promise.all(
      products.map(async (p) => {
        const variantsWithStock = await attachEffectiveStockToVariants(p.variants);
        return {
          ...p,
          variants: variantsWithStock,
        };
      })
    );

    res.json({ products: productsWithStock, creators });
  } catch (err) {
    next(err);
  }
};

export default { search };
