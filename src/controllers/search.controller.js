const prisma = require("../lib/prisma");

// GET /api/search — Search produk dan kreator untuk mobile/customer (query: ?q=)
const search = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();

    if (!q) {
      return res.json({ products: [], creators: [] });
    }

    const [products, creators] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
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

    res.json({ products, creators });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  search,
};
