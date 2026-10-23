import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { cartesianProduct } from "../lib/variants";
import { attachEffectiveStockToVariants } from "../lib/stock";
import { getEditableProduct } from "../dal/productOwnership";
import { isHttpsUrl, isString } from "../lib/validate";
import { shouldCountView } from "../lib/viewDedupe";
import { HttpError } from "../lib/httpError";
import { badRequest, notFound } from "../dal/errors";
import { getOfficialArtisan } from "../lib/officialStore";

// Helper untuk membuat slug sederhana dari nama produk
function createSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const randomSuffix = crypto.randomInt(1000, 10000);
  return `${base}-${randomSuffix}`;
}

function validateProductImages(images: unknown): string[] | null {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.some((image) => !isHttpsUrl(image))) return null;
  return images;
}

// GET /api/products — list semua produk aktif (dukung filter categoryId, search, sort)
export const listProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, category, search, sort, page, limit } = req.query;

    for (const [name, value] of Object.entries({ categoryId, category, search, sort, page, limit })) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ error: `${name} harus berupa string` });
      }
    }
    if (sort !== undefined && !["termurah", "termahal", "terlaris", "terpopuler"].includes(sort as string)) {
      return res.status(400).json({ error: "sort tidak valid" });
    }

    const parsedPage = typeof page === "string" && /^\d+$/.test(page) && parseInt(page, 10) > 0 ? parseInt(page, 10) : undefined;
    const rawLimit = typeof limit === "string" && /^\d+$/.test(limit) && parseInt(limit, 10) > 0 ? parseInt(limit, 10) : undefined;
    const parsedLimit = rawLimit === undefined ? undefined : Math.min(rawLimit, 100);
    if ((page !== undefined && parsedPage === undefined) || (limit !== undefined && parsedLimit === undefined)) {
      return res.status(400).json({ error: "page dan limit harus berupa bilangan bulat positif" });
    }

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
    const allVariants = products.flatMap((product) => product.variants);
    const allVariantsWithStock = await attachEffectiveStockToVariants(allVariants);
    // 1e: ganti filter+some O(n²) dengan Map berdasarkan variantId
    const variantStockMap = new Map(allVariantsWithStock.map((v) => [v.id, v]));
    const variantsByProduct = new Map<string, typeof allVariantsWithStock>();
    for (const product of products) {
      variantsByProduct.set(product.id, product.variants.map((v) => variantStockMap.get(v.id)!).filter(Boolean));
    }
    const productsWithStock = products.map((p) => {
      const stats = ratingMap[p.id] || { avgRating: 0, reviewCount: 0 };
      return { ...p, avgRating: stats.avgRating, reviewCount: stats.reviewCount, variants: variantsByProduct.get(p.id) || [] };
    });

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

    if (shouldCountView(id, req)) {
      await prisma.product.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
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

    const parsedPrice = typeof price === "number" && Number.isInteger(price)
      ? price
      : typeof price === "string" && /^\d+$/.test(price) ? Number(price) : NaN;
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0 || parsedPrice > 2147483647) {
      return res.status(400).json({ error: "price harus berupa angka bulat positif" });
    }
    if (!isString(name, { max: 191 }) || !name.trim() || !isString(description) || !description.trim()) {
      return res.status(400).json({ error: "name dan description wajib berupa teks" });
    }
    if (shortDescription !== undefined && !isString(shortDescription, { max: 191 })) {
      return res.status(400).json({ error: "shortDescription harus berupa string maksimal 191 karakter" });
    }
    if (typeof categoryId !== "string" || !categoryId) {
      return res.status(400).json({ error: "categoryId wajib berupa string" });
    }
    if (isLimited !== undefined && typeof isLimited !== "boolean") {
      return res.status(400).json({ error: "isLimited harus berupa boolean" });
    }
    const parsedImages = validateProductImages(images);
    if (parsedImages === null) {
      return res.status(400).json({ error: "images harus berupa array URL HTTPS" });
    }
    if (shopeeUrl !== undefined && shopeeUrl !== null && !isHttpsUrl(shopeeUrl)) {
      return res.status(400).json({ error: "shopeeUrl harus berupa URL HTTPS" });
    }
    if (!Array.isArray(variantOptions) && variantOptions !== undefined) {
      return res.status(400).json({ error: "variantOptions harus berupa array" });
    }
    if (Array.isArray(variantOptions) && variantOptions.some((option) =>
      !option || typeof option.name !== "string" || !option.name.trim() ||
      !Array.isArray(option.values) || option.values.some((value: unknown) => typeof value !== "string" || !value.trim())
    )) {
      return res.status(400).json({ error: "Setiap opsi varian harus memiliki name dan values berupa array teks" });
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }

    // Cari artisanId penjual produk
    let artisanId: string;
    if (req.user.role === "admin") {
      const rawArtisanId = req.body.artisanId;
      if (rawArtisanId === undefined || rawArtisanId === null || rawArtisanId === "") {
        // Tidak memilih penjual: produk dijual atas nama Official Store
        const official = await getOfficialArtisan();
        if (!official) {
          throw new HttpError(
            409,
            "Official Store belum dibuat. Jalankan: npm run prisma:seed:official",
            "OFFICIAL_STORE_MISSING"
          );
        }
        artisanId = official.id;
      } else {
        if (typeof rawArtisanId !== "string") {
          throw badRequest("artisanId harus berupa string");
        }
        const existingArtisan = await prisma.artisan.findUnique({ where: { id: rawArtisanId } });
        if (!existingArtisan) throw notFound("Kreator tidak ditemukan");
        if (existingArtisan.status !== "aktif") throw badRequest("Kreator tidak aktif");
        artisanId = existingArtisan.id;
      }
    } else {
      // Creator: cari artisan yang terikat dengan userId ini
      const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
      if (!artisan || artisan.status !== "aktif") {
        return res.status(403).json({ error: "Profil kreator kamu tidak ditemukan atau sedang nonaktif" });
      }
      artisanId = artisan.id;
    }

    const slug = createSlug(name);
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
          isLimited: isLimited === true,
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
    // HttpError diteruskan ke error handler global agar field `code` ikut terkirim
    if (err instanceof HttpError) {
      return next(err);
    }
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
    await getEditableProduct(req.user, id);

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

    if (price !== undefined) {
      const parsedPrice = typeof price === "number" && Number.isInteger(price)
        ? price
        : typeof price === "string" && /^\d+$/.test(price) ? Number(price) : NaN;
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0 || parsedPrice > 2147483647) {
        return res.status(400).json({ error: "price harus berupa angka bulat positif" });
      }
    }
    if (name !== undefined && (!isString(name, { max: 191 }) || !name.trim())) {
      return res.status(400).json({ error: "name harus berupa teks maksimal 191 karakter" });
    }
    // 1d: shortDescription nullable di schema — null menghapus nilai, string divalidasi, undefined tidak mengubah
    if (shortDescription !== undefined && shortDescription !== null && !isString(shortDescription, { max: 191 })) {
      return res.status(400).json({ error: "shortDescription harus berupa string maksimal 191 karakter" });
    }
    if (description !== undefined && !isString(description)) {
      return res.status(400).json({ error: "description harus berupa teks" });
    }
    if (categoryId !== undefined) {
      if (typeof categoryId !== "string" || !categoryId) {
        return res.status(400).json({ error: "categoryId harus berupa string" });
      }
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }
    if (images !== undefined && validateProductImages(images) === null) {
      return res.status(400).json({ error: "images harus berupa array URL HTTPS" });
    }
    if (isLimited !== undefined && typeof isLimited !== "boolean") {
      return res.status(400).json({ error: "isLimited harus berupa boolean" });
    }
    if (shopeeUrl !== undefined && shopeeUrl !== null && !isHttpsUrl(shopeeUrl)) {
      return res.status(400).json({ error: "shopeeUrl harus berupa URL HTTPS" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update data produk dasar
      await tx.product.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(categoryId && { categoryId }),
          ...(shortDescription !== undefined && { shortDescription }),
          ...(description && { description }),
          ...(price !== undefined && { price: typeof price === "number" ? price : Number(price) }),
          ...(images && { images: Array.isArray(images) ? images : [] }),
          ...(isLimited !== undefined && { isLimited }),
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
    const { title, content, process, coverImageUrl, processImages } = req.body;

    if (!isString(title, { max: 191 }) || !title.trim() || !isString(content, { max: 10000 }) || !content.trim()) {
      return res.status(400).json({ error: "title dan content cerita wajib diisi" });
    }
    if (process !== undefined && process !== null && typeof process !== "string") {
      return res.status(400).json({ error: "process harus berupa string atau null" });
    }
    if (coverImageUrl !== undefined && coverImageUrl !== null && !isHttpsUrl(coverImageUrl)) {
      return res.status(400).json({ error: "coverImageUrl harus berupa URL HTTPS" });
    }
    if (processImages !== undefined && (!Array.isArray(processImages) || processImages.length > 10 || processImages.some((image) => !isHttpsUrl(image)))) {
      return res.status(400).json({ error: "processImages harus berupa maksimal 10 URL HTTPS" });
    }

    await getEditableProduct(req.user, id);

    const story = await prisma.productStory.upsert({
      where: { productId: id },
      create: {
        productId: id,
        title,
        content,
        process: typeof process === "string" ? process : null,
        coverImageUrl,
        processImages: Array.isArray(processImages) ? processImages : [],
      },
      update: {
        title,
        content,
        process: process === undefined ? undefined : process,
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

    const allVariants = products.flatMap((product) => product.variants);
    const allVariantsWithStock = await attachEffectiveStockToVariants(allVariants);
    const productsWithStock = products.map((p) => {
      const stats = ratingMap[p.id] || { avgRating: 0, reviewCount: 0 };
      const variants = allVariantsWithStock.filter((variant) => p.variants.some((item) => item.id === variant.id));
      return { ...p, avgRating: stats.avgRating, reviewCount: stats.reviewCount, variants };
    });

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
