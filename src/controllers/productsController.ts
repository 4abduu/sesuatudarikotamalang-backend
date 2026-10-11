import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { cartesianProduct } from "../lib/variants";
import { attachEffectiveStockToVariants } from "../lib/stock";

// Helper untuk membuat slug sederhana dari nama produk
function createSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${randomSuffix}`;
}

// GET /api/products — list semua produk aktif (dukung filter categoryId, search, sort)
export const listProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, category, search, sort, page, limit } = req.query;

    const parsedPage = typeof page === "string" && !isNaN(parseInt(page)) && parseInt(page) > 0 ? parseInt(page) : undefined;
    const parsedLimit = typeof limit === "string" && !isNaN(parseInt(limit)) && parseInt(limit) > 0 ? parseInt(limit) : undefined;

    const where: any = {
      isActive: true,
      artisan: { status: "aktif" },
    };

    if (typeof category === "string" && category.trim()) {
      const foundCategory = await prisma.category.findUnique({
        where: { slug: category.trim() },
      });
      if (!foundCategory) {
        return res.json({ products: [] });
      }
      where.categoryId = foundCategory.id;
    } else if (typeof categoryId === "string") {
      where.categoryId = categoryId;
    }

    if (typeof search === "string" && search.trim()) {
      const q = search.toLowerCase();
      where.OR = [
        { name: { contains: q } },
        { shortDescription: { contains: q } },
        { description: { contains: q } },
        { category: { name: { contains: q } } },
        { artisan: { brandName: { contains: q } } },
      ];
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "termurah") orderBy = { price: "asc" };
    if (sort === "termahal") orderBy = { price: "desc" };
    if (sort === "terlaris") orderBy = { soldCount: "desc" };
    if (sort === "terpopuler") orderBy = { viewCount: "desc" };

    let total: number | undefined = undefined;
    if (parsedPage !== undefined && parsedLimit !== undefined) {
      total = await prisma.product.count({ where });
    }

    const products = await prisma.product.findMany({
      where,
      orderBy,
      ...(parsedPage !== undefined && parsedLimit !== undefined
        ? { skip: (parsedPage - 1) * parsedLimit, take: parsedLimit }
        : {}),
      include: {
        category: true,
        artisan: true,
        variantOptions: true,
        variants: true,
        story: true,
      },
    });

    // A3: Agregasi rating dan jumlah ulasan (hanya review tampil) dengan satu groupBy
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

    // Lampirkan effectiveStock ke tiap varian + rating info
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

    const responseData: any = { products: productsWithStock };
    if (parsedPage !== undefined && parsedLimit !== undefined && total !== undefined) {
      responseData.pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      };
    }

    res.json(responseData);
  } catch (err) {
    next(err);
  }
};

// GET /api/products/:id — detail satu produk (increment viewCount)
export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Increment viewCount secara async
    await prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {}); // abaikan jika ID tidak ketemu di tahap increment ini

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        artisan: true,
        variantOptions: true,
        variants: true,
        story: true,
        // F-14: Select aman — jangan bocorkan data order ke publik
        reviews: {
          where: { status: "tampil" },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!product || !product.isActive || product.artisan.status !== "aktif") {
      return res.status(404).json({ error: "Produk tidak ditemukan atau tidak aktif" });
    }

    const variantsWithStock = await attachEffectiveStockToVariants(product.variants);

    // A3: Hitung avgRating dan reviewCount dari ulasan yang berstatus tampil
    const totalReviews = product.reviews.length;
    const avgRating = totalReviews > 0
      ? Number((product.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
      : 0;

    res.json({
      product: {
        ...product,
        avgRating,
        reviewCount: totalReviews,
        variants: variantsWithStock,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/products — Tambah produk (Creator / Admin)
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const {
      name,
      categoryId,
      description,
      shortDescription,
      price,
      images,
      isLimited,
      shopeeUrl,
      variantOptions, // array of { name: "Motif", values: ["Ubin", "Sulur"] }
      variantStocks,  // opsional: array of { combination: ["Ubin"], stock: 10 }
    } = req.body;

    const parsedPrice = parseInt(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "price harus berupa angka bulat positif" });
    }

    // Cari artisanId pengunggah
    let artisanId: string;
    if (req.user.role === "admin") {
      if (!req.body.artisanId) {
        return res.status(400).json({ error: "artisanId wajib diisi oleh Admin saat menambahkan produk" });
      }
      const existingArtisan = await prisma.artisan.findUnique({ where: { id: req.body.artisanId } });
      if (!existingArtisan) {
        return res.status(404).json({ error: "Profil kreator (artisanId) tidak ditemukan" });
      }
      artisanId = req.body.artisanId;
    } else {
      // Creator: cari artisan yang terikat dengan userId ini
      const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
      if (!artisan || artisan.status !== "aktif") {
        return res.status(403).json({ error: "Profil kreator kamu tidak ditemukan atau sedang nonaktif" });
      }
      artisanId = artisan.id;
    }

    const slug = createSlug(name);
    const parsedImages = Array.isArray(images) ? images : [];

    // Buat produk + variantOptions + variants dalam satu transaksi
    const newProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          artisanId,
          categoryId,
          name,
          slug,
          shortDescription,
          description,
          price: parsedPrice,
          images: parsedImages,
          isLimited: Boolean(isLimited),
          shopeeUrl,
        },
      });

      // Simpan variantOptions jika ada
      const savedOptions: any[] = [];
      if (Array.isArray(variantOptions) && variantOptions.length > 0) {
        // A9: Validasi batas varian — maks 3 opsi, 10 nilai per opsi
        if (variantOptions.length > 3) {
          throw { status: 400, message: "Maksimal 3 opsi varian per produk" };
        }
        for (const opt of variantOptions) {
          if (Array.isArray(opt.values) && opt.values.length > 10) {
            throw { status: 400, message: `Opsi varian "${opt.name}" memiliki lebih dari 10 nilai. Maksimal 10 nilai per opsi.` };
          }
        }

        for (let i = 0; i < variantOptions.length; i++) {
          const opt = variantOptions[i];
          const createdOpt = await tx.productVariantOption.create({
            data: {
              productId: product.id,
              name: opt.name,
              values: opt.values || [],
              sortOrder: i,
            },
          });
          savedOptions.push(createdOpt);
        }
      }

      // Generate kombinasi varian (Cartesian product)
      const combinations = cartesianProduct(savedOptions);

      // Buat baris ProductVariant per kombinasi
      for (const combo of combinations) {
        let stock = 0;
        if (combo.length === 0 && req.body.stock !== undefined) {
          const parsed = Number(req.body.stock);
          if (Number.isInteger(parsed) && parsed >= 0) {
            stock = parsed;
          } else {
            throw { status: 400, message: "Nilai stok harus berupa angka bulat non-negatif" };
          }
        } else if (Array.isArray(variantStocks)) {
          const matched = variantStocks.find(
            (vs: any) => JSON.stringify(vs.combination) === JSON.stringify(combo)
          );
          if (matched && matched.stock !== undefined) {
            const parsed = Number(matched.stock);
            if (Number.isInteger(parsed) && parsed >= 0) {
              stock = parsed;
            } else {
              throw { status: 400, message: "Nilai stok varian harus berupa angka bulat non-negatif" };
            }
          }
        }

        await tx.productVariant.create({
          data: {
            productId: product.id,
            combination: combo,
            stock,
          },
        });
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: { category: true, artisan: true, variantOptions: true, variants: true },
      });
    });

    res.status(201).json({ product: newProduct });
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

// PUT /api/products/:id — Edit produk (Creator pemilik produk / Admin)
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { id } = req.params;
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { artisan: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    }

    // Validasi kepemilikan jika role === creator
    if (req.user.role === "creator") {
      const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
      if (!artisan || existing.artisanId !== artisan.id) {
        return res.status(403).json({ error: "Kamu tidak memiliki akses untuk mengubah produk ini" });
      }
    }

    const {
      name,
      categoryId,
      shortDescription,
      description,
      price,
      images,
      isLimited,
      shopeeUrl,
      variantStocks, // array of { id: "variantId", stock: 15 }
    } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      // Update data produk dasar
      await tx.product.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(categoryId && { categoryId }),
          ...(shortDescription !== undefined && { shortDescription }),
          ...(description && { description }),
          ...(price && { price: parseInt(price) }),
          ...(images && { images: Array.isArray(images) ? images : [] }),
          ...(isLimited !== undefined && { isLimited: Boolean(isLimited) }),
          ...(shopeeUrl !== undefined && { shopeeUrl }),
        },
      });

      // Update stok varian jika diberikan ID varian dan stoknya
      // F-03: cek productId agar kreator tidak bisa ubah varian milik produk lain
      if (Array.isArray(variantStocks)) {
        for (const vs of variantStocks) {
          if (vs.id && vs.stock !== undefined) {
            const parsed = Number(vs.stock);
            if (!Number.isInteger(parsed) || parsed < 0) {
              throw { status: 400, message: "Nilai stok varian harus berupa angka bulat non-negatif" };
            }
            const result = await tx.productVariant.updateMany({
              where: { id: vs.id, productId: id },
              data: { stock: parsed },
            });
            if (result.count !== 1) {
              throw { status: 404, message: "Varian tidak ditemukan pada produk ini" };
            }
          }
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: { category: true, artisan: true, variantOptions: true, variants: true, story: true },
      });
    });

    res.json({ product: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/products/:id — Soft Delete produk (Admin only)
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.product.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    }

    // Soft delete dengan menonaktifkan produk
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: "Produk berhasil dinonaktifkan (soft delete)" });
  } catch (err) {
    next(err);
  }
};

// POST /api/products/:id/story — Tambah / Update cerita Behind the Design (Creator pemilik / Admin)
export const upsertStory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { id } = req.params;
    const { title, content, coverImageUrl, processImages } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "title dan content cerita wajib diisi" });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    }

    if (req.user.role === "creator") {
      const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
      if (!artisan || product.artisanId !== artisan.id) {
        return res.status(403).json({ error: "Kamu tidak memiliki akses ke cerita produk ini" });
      }
    }

    const story = await prisma.productStory.upsert({
      where: { productId: id },
      create: {
        productId: id,
        title,
        content,
        coverImageUrl,
        processImages: Array.isArray(processImages) ? processImages : [],
      },
      update: {
        title,
        content,
        coverImageUrl,
        processImages: Array.isArray(processImages) ? processImages : [],
      },
    });

    res.json({ story });
  } catch (err) {
    next(err);
  }
};

// GET /api/products/mine — A4: Produk milik kreator yang sedang login (termasuk nonaktif)
export const listMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
    if (!artisan) {
      return res.status(404).json({ error: "Profil kreator tidak ditemukan" });
    }

    const products = await prisma.product.findMany({
      where: { artisanId: artisan.id },
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        variantOptions: true,
        variants: true,
        story: true,
      },
    });

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

    res.json({ products: productsWithStock });
  } catch (err) {
    next(err);
  }
};

export default {
  listProducts,
  getProductById,
  listMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  upsertStory,
};
