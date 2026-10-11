import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Seed ditolak: Jangan jalankan seeder di lingkungan production!");
    process.exit(1);
  }

  console.log("🌱 Menjalankan Prisma Seed...");

  // 1. KATEGORI (8 Kategori Sesuai UI)
  const categoriesData = [
    { name: "Postcard", slug: "postcard", sortOrder: 1, iconName: "mail", blurb: "Kartu pos ilustrasi tangan" },
    { name: "Pin Enamel", slug: "pin-enamel", sortOrder: 2, iconName: "circle-dot", blurb: "Pin kecil bertema lokal" },
    { name: "Apparel", slug: "apparel", sortOrder: 3, iconName: "shirt", blurb: "Kaos & kaos tangan" },
    { name: "Stiker", slug: "stiker", sortOrder: 4, iconName: "sticker", blurb: "Stiker vinyl ornamen" },
    { name: "Kriya Kayu", slug: "kriya-kayu", sortOrder: 5, iconName: "tree-pine", blurb: "Gantungan & hiasan kayu" },
    { name: "Tote Bag", slug: "tote-bag", sortOrder: 6, iconName: "shopping-bag", blurb: "Tas kanvas hasil sablon" },
    { name: "Keramik", slug: "keramik", sortOrder: 7, iconName: "coffee", blurb: "Mug & cangkir tanah liat" },
    { name: "Zine", slug: "zine", sortOrder: 8, iconName: "book-open", blurb: "Buku kecil cerita kota" },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    const upserted = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { sortOrder: cat.sortOrder, iconName: cat.iconName, blurb: cat.blurb },
      create: cat,
    });
    categories[cat.slug] = upserted;
  }
  console.log("✅ 8 Kategori berhasil disiapkan.");

  // 2. AKUN PENGGUNA (Admin, Buyer, 3 Kreator)
  // Menolak hardcoded kredensial admin: wajib dari SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminRawPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminRawPassword) {
    console.error("Seed ditolak: SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib didefinisikan di environment!");
    process.exit(1);
  }

  const adminPassword = await bcrypt.hash(adminRawPassword, 10);
  const defaultPassword = await bcrypt.hash(adminRawPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Admin Sesuatu",
      email: adminEmail,
      passwordHash: adminPassword,
      role: "admin",
      authProvider: "email",
    },
  });

  const buyerEmail = process.env.SEED_BUYER_EMAIL || "buyer@test.com";
  const buyer = await prisma.user.upsert({
    where: { email: buyerEmail },
    update: {},
    create: {
      name: "Budi Santoso",
      email: buyerEmail,
      passwordHash: defaultPassword,
      role: "buyer",
      authProvider: "email",
    },
  });

  const creatorsData = [
    {
      name: "Dini Aulia",
      email: "dini@sesuatudarikota.com",
      brandName: "Dini Draws",
      bio: "Ilustrator yang jatuh cinta sama genteng tua dan jendela kayu Kayutangan. Setiap postcard-nya digambar tangan dulu baru dipindai.",
    },
    {
      name: "Bagas Pratama",
      email: "bagas@sesuatudarikota.com",
      brandName: "Bagas Pin Co",
      bio: "Mulai bikin pin enamel dari garasi rumah nenek. Sekarang pin-nya jadi oleh-oleh andalan anak-anak muda yang mampir ke Kayutangan.",
    },
    {
      name: "Rara Kamila",
      email: "rara@sesuatudarikota.com",
      brandName: "Rara Sablon",
      bio: "Sablon manual satu-satu di belakang rumah. Motifnya diambil dari ornamen ubin dan kerawang Malang tempo dulu.",
    },
  ];

  const artisans: Record<string, any> = {};
  for (const c of creatorsData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        passwordHash: defaultPassword,
        role: "creator",
        authProvider: "email",
      },
    });

    const artisan = await prisma.artisan.upsert({
      where: { userId: user.id },
      update: { brandName: c.brandName, bio: c.bio },
      create: {
        userId: user.id,
        brandName: c.brandName,
        bio: c.bio,
        status: "aktif",
      },
    });
    artisans[c.name] = artisan;
  }
  console.log("✅ Akun Admin, Buyer, dan 3 Kreator berhasil disiapkan.");

  // 3. PRODUK & VARIAN (Minimal 8 Produk)
  const productsData = [
    {
      name: "Kartu Pos Sudut Kayutangan",
      slug: "kartu-pos-sudut-kayutangan",
      artisanId: artisans["Dini Aulia"].id,
      categoryId: categories["postcard"].id,
      price: 15000,
      description: "Kartu pos cetak tebal dengan ilustrasi cat air sudut bangunan kolonial Kayutangan Malang.",
      shortDescription: "Kartu pos ilustrasi bangunan kolonial Kayutangan.",
      images: ["https://picsum.photos/seed/postcard1/600/600"],
      stock: 25,
      hasVariant: false,
      story: {
        title: "Kenangan di Tikungan Kayutangan",
        content: "Sudut ini selalu ramai saat sore hari. Bangunan berarsitektur Belanda yang berdiri kokoh ini menjadi saksi ribuan cerita penikmat kopi jalanan.",
        process: "Disketsa langsung di lokasi menggunakan pensil 2B, dilanjutkan pewarnaan cat air di atas kertas cold-pressed 300gsm.",
        coverImageUrl: "https://picsum.photos/seed/story1/800/450",
        processImages: ["https://picsum.photos/seed/story1_1/600/600"],
      },
    },
    {
      name: "Pin Enamel Trem Antik Malang",
      slug: "pin-enamel-trem-antik-malang",
      artisanId: artisans["Bagas Pratama"].id,
      categoryId: categories["pin-enamel"].id,
      price: 35000,
      description: "Pin logam berenamel keras dengan detail trem uap bersejarah yang dulu melintasi pusat kota Malang.",
      shortDescription: "Pin enamel trem uap bersejarah Malang tempo doeloe.",
      images: ["https://picsum.photos/seed/pin1/600/600"],
      stock: 15,
      hasVariant: false,
    },
    {
      name: "Kaos Kerawang Malang Tempo Dulu",
      slug: "kaos-kerawang-malang-tempo-dulu",
      artisanId: artisans["Rara Kamila"].id,
      categoryId: categories["apparel"].id,
      price: 135000,
      description: "Kaos katun combed 24s dengan sablon manual motif ventilasi kerawang rumah kuno Klojen.",
      shortDescription: "Kaos sablon manual motif ventilasi rumah kuno.",
      images: ["https://picsum.photos/seed/apparel1/600/600"],
      hasVariant: true,
      variantOptions: [
        { name: "Ukuran", values: ["M", "L", "XL"] },
      ],
      variants: [
        { combination: ["M"], stock: 5 },
        { combination: ["L"], stock: 8 },
        { combination: ["XL"], stock: 4 },
      ],
      story: {
        title: "Menyelamatkan Ornamen yang Terlupakan",
        content: "Banyak rumah tua di Klojen dibongkar. Kami mendokumentasikan motif ventilasi udaranya ke atas kain sablon.",
        process: "Pembuatan klise sablon manual satu per satu dengan tinta plastisol ramah lingkungan.",
        coverImageUrl: "https://picsum.photos/seed/story2/800/450",
        processImages: ["https://picsum.photos/seed/story2_1/600/600"],
      },
    },
    {
      name: "Stiker Vinyl Ornamen Arema Klasik",
      slug: "stiker-vinyl-ornamen-arema-klasik",
      artisanId: artisans["Dini Aulia"].id,
      categoryId: categories["stiker"].id,
      price: 8000,
      description: "Stiker vinyl tahan air dengan grafis tipografi khas Arema klasik.",
      shortDescription: "Stiker tahan air grafis klasik Malang.",
      images: ["https://picsum.photos/seed/stiker1/600/600"],
      stock: 50,
      hasVariant: false,
    },
    {
      name: "Tatakan Gelas Kayu Jati Kayutangan",
      slug: "tatakan-gelas-kayu-jati-kayutangan",
      artisanId: artisans["Bagas Pratama"].id,
      categoryId: categories["kriya-kayu"].id,
      price: 25000,
      description: "Coaster kayu jati sisa perajin mebel lokal dengan ukiran inisial sudut Kayutangan.",
      shortDescription: "Coaster kayu jati daur ulang halus.",
      images: ["https://picsum.photos/seed/kayu1/600/600"],
      stock: 1, // Stok 1 untuk keperluan uji stok habis / konkurensi
      hasVariant: false,
    },
    {
      name: "Tote Bag Kanvas Sablon Candi Singosari",
      slug: "tote-bag-kanvas-singosari",
      artisanId: artisans["Rara Kamila"].id,
      categoryId: categories["tote-bag"].id,
      price: 65000,
      description: "Tote bag kanvas tebal dengan ritsleting dan sablon siluet arca Dwarapala Singosari.",
      shortDescription: "Tote bag kanvas tebal sablon Dwarapala.",
      images: ["https://picsum.photos/seed/totebag1/600/600"],
      stock: 12,
      hasVariant: false,
    },
    {
      name: "Cangkir Keramik Gerabah Dinoyo",
      slug: "cangkir-keramik-gerabah-dinoyo",
      artisanId: artisans["Bagas Pratama"].id,
      categoryId: categories["keramik"].id,
      price: 45000,
      description: "Cangkir tanah liat bakar khas kampung keramik Dinoyo dengan glasir hijau botol antik.",
      shortDescription: "Cangkir glasir hijau khas Dinoyo Malang.",
      images: ["https://picsum.photos/seed/keramik1/600/600"],
      stock: 10,
      hasVariant: false,
    },
    {
      name: "Zine Cerita Kampung Kajoetangan",
      slug: "zine-cerita-kampung-kajoetangan",
      artisanId: artisans["Dini Aulia"].id,
      categoryId: categories["zine"].id,
      price: 28000,
      description: "Buku saku mini 24 halaman berisi esai foto dan sketsa warga tertua di koridor Kayutangan.",
      shortDescription: "Buku saku mini ilustrasi dan esai foto warga.",
      images: ["https://picsum.photos/seed/zine1/600/600"],
      stock: 20,
      hasVariant: false,
    },
  ];

  for (const p of productsData) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (!existing) {
      const created = await prisma.product.create({
        data: {
          name: p.name,
          slug: p.slug,
          artisanId: p.artisanId,
          categoryId: p.categoryId,
          price: p.price,
          description: p.description,
          shortDescription: p.shortDescription,
          images: p.images,
          isActive: true,
          soldCount: 3,
          viewCount: 15,
        },
      });

      if (p.hasVariant && p.variantOptions && p.variants) {
        for (const opt of p.variantOptions) {
          await prisma.productVariantOption.create({
            data: {
              productId: created.id,
              name: opt.name,
              values: opt.values,
            },
          });
        }
        for (const v of p.variants) {
          await prisma.productVariant.create({
            data: {
              productId: created.id,
              combination: v.combination,
              stock: v.stock,
            },
          });
        }
      } else {
        // Produk tanpa varian: buatkan 1 varian dengan combination: []
        await prisma.productVariant.create({
          data: {
            productId: created.id,
            combination: [],
            stock: p.stock || 10,
          },
        });
      }

      if (p.story) {
        await prisma.productStory.create({
          data: {
            productId: created.id,
            title: p.story.title,
            content: p.story.content,
            process: p.story.process,
            coverImageUrl: p.story.coverImageUrl,
            processImages: p.story.processImages,
          },
        });
      }
    }
  }
  console.log("✅ 8 Produk & varian/cerita berhasil disiapkan.");

  // 4. BEBERAPA ULASAN PRODUK
  const sampleProduct = await prisma.product.findFirst({ where: { slug: "kartu-pos-sudut-kayutangan" } });
  if (sampleProduct) {
    const existingReview = await prisma.review.findFirst({
      where: { productId: sampleProduct.id, userId: buyer.id },
    });
    if (!existingReview) {
      await prisma.review.create({
        data: {
          userId: buyer.id,
          productId: sampleProduct.id,
          rating: 5,
          comment: "Kualitas kertas tebal dan ilustrasinya sangat detail. Mengingatkan masa kecil di Malang!",
          status: "tampil",
        },
      });
      console.log("✅ Ulasan sampel berhasil disiapkan.");
    }
  }

  // 5. APP SETTINGS DEFAULT
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      holdDurationMinutes: 120,
      autoCancelEnabled: true,
      pickupDeadlineDays: 14,
      whatsappAdminNumber: "+6281234567890",
      notificationEmail: "admin@sesuatudarikota.com",
    },
  });
  console.log("✅ AppSettings berhasil disiapkan.");

  console.log("🎉 Seeding selesai dengan sukses!");
}

main()
  .catch((e) => {
    console.error("Error seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
