const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const { cartesianProduct } = require("../lib/variants");
const { attachEffectiveStockToVariants } = require("../lib/stock");

const router = express.Router();

// Helper untuk membuat slug sederhana dari nama produk
function createSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${randomSuffix}`;
}

// GET /api/products — list semua produk aktif (dukung filter categoryId, search, sort)
router.get("/", async (req, res, next) => {
  try {
    const { categoryId, search, sort } = req.query;

    const where = { isActive: true };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      const q = search.toLowerCase();
      where.OR = [
        { name: { contains: q } },
        { shortDescription: { contains: q } },
        { description: { contains: q } },
        { category: { name: { contains: q } } },
        { artisan: { brandName: { contains: q } } },
      ];
    }

    let orderBy = { createdAt: "desc" };
    if (sort === "termurah") orderBy = { price: "asc" };
    if (sort === "termahal") orderBy = { price: "desc" };
    if (sort === "terlaris") orderBy = { soldCount: "desc" };
    if (sort === "terpopuler") orderBy = { viewCount: "desc" };

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: true,
        artisan: true,
        variantOptions: true,
        variants: true,
        story: true,
      },
    });

    // Lampirkan effectiveStock ke tiap varian
    const productsWithStock = await Promise.all(
      products.map(async (p) => {
        const variantsWithStock = await attachEffectiveStockToVariants(p.variants);
        return {
          ...p,
          variants: variantsWithStock,
        };
      })
    );

    res.json({ products: productsWithStock });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — detail satu produk (increment viewCount)
router.get("/:id", async (req, res, next) => {
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
        reviews: {
          where: { status: "tampil" },
          include: {
            orderItem: {
              include: {
                order: {
                  include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!product || !product.isActive) {
      return res.status(404).json({ error: "Produk tidak ditemukan atau tidak aktif" });
    }

    const variantsWithStock = await attachEffectiveStockToVariants(product.variants);

    res.json({
      product: {
        ...product,
        variants: variantsWithStock,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/products — Tambah produk (Creator / Admin)
router.post("/", requireAuth, requireRole("creator", "admin"), async (req, res, next) => {
  try {
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

    if (!name || !categoryId || !price || !description) {
      return res.status(400).json({ error: "name, categoryId, price, dan description wajib diisi" });
    }

    // Cari artisanId pengunggah
    let artisanId;
    if (req.user.role === "admin") {
      // Jika admin, izinkan spesifikasi artisanId di body atau gunakan default
      if (req.body.artisanId) {
        artisanId = req.body.artisanId;
      } else {
        const firstArtisan = await prisma.artisan.findFirst();
        if (!firstArtisan) {
          return res.status(400).json({ error: "Belum ada profil artisan/kreator di database" });
        }
        artisanId = firstArtisan.id;
      }
    } else {
      // Creator: cari artisan yang terikat dengan userId ini
      const artisan = await prisma.artisan.findUnique({ where: { userId: req.user.id } });
      if (!artisan) {
        return res.status(403).json({ error: "Profil kreator tidak ditemukan" });
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
          price: parseInt(price),
          images: parsedImages,
          isLimited: Boolean(isLimited),
          shopeeUrl,
        },
      });

      // Simpan variantOptions jika ada
      const savedOptions = [];
      if (Array.isArray(variantOptions) && variantOptions.length > 0) {
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
        // Jika ada variantStocks dari body, cari stoknya
        if (Array.isArray(variantStocks)) {
          const matched = variantStocks.find(
            (vs) => JSON.stringify(vs.combination) === JSON.stringify(combo)
          );
          if (matched && typeof matched.stock === "number") {
            stock = matched.stock;
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
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id — Edit produk (Creator pemilik produk / Admin)
router.put("/:id", requireAuth, requireRole("creator", "admin"), async (req, res, next) => {
  try {
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
      const prod = await tx.product.update({
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
      if (Array.isArray(variantStocks)) {
        for (const vs of variantStocks) {
          if (vs.id && typeof vs.stock === "number") {
            await tx.productVariant.update({
              where: { id: vs.id },
              data: { stock: Math.max(0, vs.stock) },
            });
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
});

// DELETE /api/products/:id — Soft Delete produk (Admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
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
});

// POST /api/products/:id/story — Tambah / Update cerita Behind the Design (Creator pemilik / Admin)
router.post("/:id/story", requireAuth, requireRole("creator", "admin"), async (req, res, next) => {
  try {
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
});

module.exports = router;
