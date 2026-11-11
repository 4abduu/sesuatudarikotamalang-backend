// import { Prisma, PrismaClient } from "@prisma/client";
// import bcrypt from "bcrypt";
// import { ensureOfficialStore } from "../src/lib/officialStore";
// import { normalizeBrandKey } from "../src/lib/brandKey";
// import { calculateMonthlyReport } from "../src/lib/monthlyReport";

// const prisma = new PrismaClient();
// const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// type SeedUser = Awaited<ReturnType<typeof prisma.user.upsert>>;
// type SeedArtisan = Awaited<ReturnType<typeof prisma.artisan.upsert>>;
// type SeedProduct = Awaited<ReturnType<typeof prisma.product.upsert>>;
// type SeedVariant = Awaited<ReturnType<typeof prisma.productVariant.create>>;

// const imageUrls = {
//   paper: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=85",
//   postcard: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=85",
//   textile: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
//   bag: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
//   ceramic: "https://images.unsplash.com/photo-1572119865084-43c1a0861b7b?auto=format&fit=crop&w=900&q=85",
//   craft: "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=900&q=85",
//   workspace: "https://images.unsplash.com/photo-1455390582262-044c61d1cfe2?auto=format&fit=crop&w=900&q=85",
//   art: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=85",
//   portrait: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=85",
//   portraitTwo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=85",
//   portraitThree: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=85",
// };

// function nowWibDate(): string {
//   return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
// }

// function addDays(dateString: string, days: number): string {
//   const date = new Date(`${dateString}T00:00:00.000Z`);
//   date.setUTCDate(date.getUTCDate() + days);
//   return date.toISOString().slice(0, 10);
// }

// function addMonths(dateString: string, months: number): string {
//   const date = new Date(`${dateString}T00:00:00.000Z`);
//   date.setUTCMonth(date.getUTCMonth() + months);
//   return date.toISOString().slice(0, 10);
// }

// function dateOnly(dateString: string): Date {
//   return new Date(`${dateString}T00:00:00.000Z`);
// }

// function wibTimestamp(dateString: string, time = "12:00:00"): Date {
//   return new Date(`${dateString}T${time}+07:00`);
// }

// function previousMonth(dateString: string): string {
//   return addMonths(`${dateString.slice(0, 7)}-01`, -1).slice(0, 7);
// }

// function monthsAgo(dateString: string, months: number): string {
//   return addMonths(`${dateString.slice(0, 7)}-01`, -months).slice(0, 7);
// }

// function jsonArrayEqual(value: unknown, expected: string[]): boolean {
//   return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
// }

// async function upsertUser(input: {
//   email: string;
//   name: string;
//   role: "buyer" | "creator" | "admin";
//   passwordHash: string;
//   avatarUrl?: string | null;
// }): Promise<SeedUser> {
//   return prisma.user.upsert({
//     where: { email: input.email },
//     update: { name: input.name, role: input.role, passwordHash: input.passwordHash, authProvider: "email", avatarUrl: input.avatarUrl ?? null },
//     create: { email: input.email, name: input.name, role: input.role, passwordHash: input.passwordHash, authProvider: "email", avatarUrl: input.avatarUrl ?? null },
//   });
// }

// async function upsertArtisan(input: {
//   userId?: string | null;
//   brandName: string;
//   bio: string;
//   avatarUrl?: string | null;
//   creatorSharePercent?: number | null;
// }): Promise<SeedArtisan> {
//   const existing = input.userId
//     ? await prisma.artisan.findUnique({ where: { userId: input.userId } })
//     : await prisma.artisan.findFirst({ where: { brandKey: normalizeBrandKey(input.brandName) } });
//   const data = {
//     brandName: input.brandName,
//     brandKey: normalizeBrandKey(input.brandName),
//     bio: input.bio,
//     avatarUrl: input.avatarUrl ?? null,
//     status: "aktif" as const,
//     isOfficial: false,
//     creatorSharePercent: input.creatorSharePercent ?? null,
//   };
//   if (existing) return prisma.artisan.update({ where: { id: existing.id }, data });
//   return prisma.artisan.create({ data: { ...data, userId: input.userId ?? null } });
// }

// async function upsertVariant(productId: string, combination: string[], stock: number, key: string): Promise<SeedVariant> {
//   const variants = await prisma.productVariant.findMany({ where: { productId } });
//   const existing = variants.find((variant) => jsonArrayEqual(variant.combination, combination));
//   if (existing) return prisma.productVariant.update({ where: { id: existing.id }, data: { stock, combination } });
//   return prisma.productVariant.create({ data: { id: `seed-variant-${key}`, productId, combination, stock } });
// }

// async function upsertProduct(input: {
//   key: string;
//   artisanId: string;
//   categoryId: string;
//   name: string;
//   price: number;
//   description: string;
//   shortDescription: string;
//   images: string[];
//   isLimited?: boolean;
//   isActive?: boolean;
//   approvalStatus?: "menunggu" | "disetujui" | "ditolak";
//   statusNote?: string | null;
//   withdrawnAt?: Date | null;
//   createdAt?: Date;
//   soldCount?: number;
//   viewCount?: number;
//   imageVariants?: Array<{ url: string; option: string; value: string }>;
//   options?: Array<{ name: string; values: string[] }>;
//   variants: Array<{ combination: string[]; stock: number }>;
//   story?: { title: string; content: string; process?: string | null; coverImageUrl?: string | null; processImages: string[] };
// }): Promise<{ product: SeedProduct; variants: SeedVariant[] }> {
//   const createdAt = input.createdAt ?? wibTimestamp(addDays(nowWibDate(), -30), "10:00:00");
//   const product = await prisma.product.upsert({
//     where: { slug: input.key },
//     update: { artisanId: input.artisanId, categoryId: input.categoryId, name: input.name, shortDescription: input.shortDescription, description: input.description, price: input.price, images: input.images, imageVariants: input.imageVariants ?? Prisma.JsonNull, isLimited: input.isLimited ?? false, isActive: input.isActive ?? true, approvalStatus: input.approvalStatus ?? "disetujui", statusNote: input.statusNote ?? null, withdrawnAt: input.withdrawnAt ?? null, soldCount: input.soldCount ?? 0, viewCount: input.viewCount ?? 0, createdAt },
//     create: { slug: input.key, artisanId: input.artisanId, categoryId: input.categoryId, name: input.name, shortDescription: input.shortDescription, description: input.description, price: input.price, images: input.images, imageVariants: input.imageVariants ?? Prisma.JsonNull, isLimited: input.isLimited ?? false, isActive: input.isActive ?? true, approvalStatus: input.approvalStatus ?? "disetujui", statusNote: input.statusNote ?? null, withdrawnAt: input.withdrawnAt ?? null, soldCount: input.soldCount ?? 0, viewCount: input.viewCount ?? 0, createdAt },
//   });
//   for (const [index, option] of (input.options ?? []).entries()) {
//     const existing = await prisma.productVariantOption.findFirst({ where: { productId: product.id, name: option.name } });
//     if (existing) await prisma.productVariantOption.update({ where: { id: existing.id }, data: { values: option.values, sortOrder: index } });
//     else await prisma.productVariantOption.create({ data: { id: `seed-option-${input.key}-${index}`, productId: product.id, name: option.name, values: option.values, sortOrder: index } });
//   }
//   const variants: SeedVariant[] = [];
//   for (const variant of input.variants) variants.push(await upsertVariant(product.id, variant.combination, variant.stock, `${input.key}-${variant.combination.join("-") || "single"}`));
//   if (input.story) await prisma.productStory.upsert({ where: { productId: product.id }, update: input.story, create: { productId: product.id, ...input.story } });
//   return { product, variants };
// }

// async function upsertOrder(input: {
//   key: string;
//   userId: string;
//   productId: string;
//   variantId: string;
//   quantity: number;
//   price: number;
//   paymentMethod: "midtrans" | "cod";
//   status: "menunggu_bayar" | "lunas" | "selesai" | "dibatalkan" | "kedaluwarsa" | "lewat_batas_pengambilan";
//   pickupDate: string;
//   pickupSlot: string;
//   createdAt: Date;
//   holdExpiresAt?: Date | null;
//   pickupDeadline?: Date | null;
//   refundStatus?: "tidak_ada" | "menunggu" | "selesai";
//   refundedAt?: Date | null;
//   cancelReason?: "permintaan_pembeli" | "kesalahan_toko" | null;
//   completedAt?: Date | null;
//   payment?: { status: string; paidAt?: Date | null; transactionId?: string | null };
// }): Promise<{ order: Awaited<ReturnType<typeof prisma.order.upsert>>; itemId: string }> {
//   const order = await prisma.order.upsert({
//     where: { orderNumber: input.key },
//     update: { userId: input.userId, paymentMethod: input.paymentMethod, status: input.status, totalAmount: input.price * input.quantity, pickupDate: dateOnly(input.pickupDate), pickupSlot: input.pickupSlot, holdExpiresAt: input.holdExpiresAt ?? null, pickupDeadline: input.pickupDeadline ?? null, refundStatus: input.refundStatus ?? "tidak_ada", refundedAt: input.refundedAt ?? null, cancelReason: input.cancelReason ?? null, completedAt: input.completedAt ?? null, createdAt: input.createdAt },
//     create: { id: `seed-order-${input.key.toLowerCase()}`, orderNumber: input.key, userId: input.userId, paymentMethod: input.paymentMethod, status: input.status, totalAmount: input.price * input.quantity, pickupDate: dateOnly(input.pickupDate), pickupSlot: input.pickupSlot, holdExpiresAt: input.holdExpiresAt ?? null, pickupDeadline: input.pickupDeadline ?? null, refundStatus: input.refundStatus ?? "tidak_ada", refundedAt: input.refundedAt ?? null, cancelReason: input.cancelReason ?? null, completedAt: input.completedAt ?? null, createdAt: input.createdAt },
//   });
//   const itemId = `seed-item-${input.key.toLowerCase()}`;
//   await prisma.orderItem.upsert({ where: { id: itemId }, update: { orderId: order.id, productId: input.productId, variantId: input.variantId, quantity: input.quantity, priceSnapshot: input.price }, create: { id: itemId, orderId: order.id, productId: input.productId, variantId: input.variantId, quantity: input.quantity, priceSnapshot: input.price } });
//   if (input.payment) await prisma.payment.upsert({ where: { orderId: order.id }, update: { status: input.payment.status, paidAt: input.payment.paidAt ?? null, midtransTransactionId: input.payment.transactionId ?? null }, create: { orderId: order.id, status: input.payment.status, paidAt: input.payment.paidAt ?? null, midtransTransactionId: input.payment.transactionId ?? null } });
//   return { order, itemId };
// }

// async function upsertNotification(input: {
//   id: string;
//   userId: string;
//   type: "pengajuan_diterima" | "pengajuan_ditolak" | "ulasan_baru" | "pesanan_update" | "umum" | "stok_menipis" | "produk_mendekati_batas" | "produk_ditarik" | "produk_disetujui" | "produk_ditolak" | "produk_disembunyikan" | "libur_terdampak" | "laporan_final";
//   title: string;
//   body: string;
//   isRead?: boolean;
//   createdAt: Date;
// }) {
//   return prisma.notification.upsert({ where: { id: input.id }, update: { userId: input.userId, type: input.type, title: input.title, body: input.body, isRead: input.isRead ?? false, createdAt: input.createdAt }, create: { ...input, isRead: input.isRead ?? false } });
// }

// async function main() {
//   if (process.env.NODE_ENV === "production") {
//     console.error("Seed ditolak: jangan jalankan seeder di lingkungan production.");
//     process.exit(1);
//   }
//   const adminEmail = process.env.SEED_ADMIN_EMAIL;
//   const adminRawPassword = process.env.SEED_ADMIN_PASSWORD;
//   if (!adminEmail || !adminRawPassword) {
//     console.error("Seed ditolak: SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib didefinisikan di environment.");
//     process.exit(1);
//   }
//   const demoRawPassword = process.env.SEED_DEMO_PASSWORD || adminRawPassword;
//   const adminPassword = await bcrypt.hash(adminRawPassword, 10);
//   const demoPassword = await bcrypt.hash(demoRawPassword, 10);
//   const today = nowWibDate();
//   const reportMonth = previousMonth(today);
//   const reportDate = `${reportMonth}-15`;
//   const holidayDate = addDays(today, 10);
//   console.log("Menyiapkan data demo SDKM...");

//   const categoryData = [
//     ["postcard", "Postcard", "Kartu pos ilustrasi tangan", "mail"],
//     ["pin-enamel", "Pin Enamel", "Pin kecil bertema lokal", "circle-dot"],
//     ["apparel", "Apparel", "Kaos dan pakaian sablon", "shirt"],
//     ["stiker", "Stiker", "Stiker vinyl ornamen", "sticker"],
//     ["kriya-kayu", "Kriya Kayu", "Gantungan dan hiasan kayu", "tree-pine"],
//     ["tote-bag", "Tote Bag", "Tas kanvas hasil sablon", "shopping-bag"],
//     ["keramik", "Keramik", "Mug dan cangkir tanah liat", "coffee"],
//     ["zine", "Zine", "Buku kecil cerita kota", "book-open"],
//   ] as const;
//   const categories: Record<string, { id: string; name: string }> = {};
//   for (const [index, [slug, name, blurb, iconName]] of categoryData.entries()) {
//     const category = await prisma.category.upsert({ where: { slug }, update: { name, blurb, iconName, sortOrder: index + 1 }, create: { id: slug, slug, name, blurb, iconName, sortOrder: index + 1 } });
//     categories[slug] = category;
//   }

//   const admin = await upsertUser({ email: adminEmail, name: "Admin Sesuatu DariKota", role: "admin", passwordHash: adminPassword, avatarUrl: imageUrls.portraitTwo });
//   const demoAdmin = await upsertUser({ email: process.env.SEED_DEMO_ADMIN_EMAIL || "demo.admin@sesuatu.test", name: "Admin Demo SDKM", role: "admin", passwordHash: demoPassword, avatarUrl: imageUrls.portraitTwo });
//   const buyer = await upsertUser({ email: process.env.SEED_BUYER_EMAIL || "buyer@test.com", name: "Budi Santoso", role: "buyer", passwordHash: demoPassword, avatarUrl: imageUrls.portrait });
//   const buyerTwo = await upsertUser({ email: "sari.demo@sesuatudarikota.test", name: "Sari Wulandari", role: "buyer", passwordHash: demoPassword, avatarUrl: null });
//   const buyerThree = await upsertUser({ email: "rizal.demo@sesuatudarikota.test", name: "Rizal Mahendra", role: "buyer", passwordHash: demoPassword, avatarUrl: imageUrls.portraitThree });
//   const applicant = await upsertUser({ email: "calon.kreator@sesuatudarikota.test", name: "Nadia Permata", role: "buyer", passwordHash: demoPassword, avatarUrl: null });
//   const creatorDiniUser = await upsertUser({ email: "dini@sesuatudarikota.com", name: "Dini Aulia", role: "creator", passwordHash: demoPassword, avatarUrl: imageUrls.portrait });
//   const creatorBagasUser = await upsertUser({ email: "bagas@sesuatudarikota.com", name: "Bagas Pratama", role: "creator", passwordHash: demoPassword, avatarUrl: imageUrls.portraitTwo });
//   const creatorRaraUser = await upsertUser({ email: "rara@sesuatudarikota.com", name: "Rara Kamila", role: "creator", passwordHash: demoPassword, avatarUrl: null });
//   const creatorDemoUser = await upsertUser({ email: process.env.SEED_DEMO_CREATOR_EMAIL || "demo.creator@sesuatu.test", name: "Alya Prameswari", role: "creator", passwordHash: demoPassword, avatarUrl: imageUrls.portraitThree });

//   const artisanDini = await upsertArtisan({ userId: creatorDiniUser.id, brandName: "Dini Draws", bio: "Ilustrator yang menggambar sudut Kayutangan, genteng tua, dan jendela heritage Malang.", avatarUrl: null, creatorSharePercent: null });
//   const artisanBagas = await upsertArtisan({ userId: creatorBagasUser.id, brandName: "Bagas Pin Co", bio: "Perajin pin, kayu, dan keramik kecil yang terinspirasi dari cerita kota Malang.", avatarUrl: imageUrls.portraitTwo, creatorSharePercent: 75 });
//   const artisanRara = await upsertArtisan({ userId: creatorRaraUser.id, brandName: "Rara Sablon", bio: "Sablon manual satu per satu dengan motif ornamen rumah tua dan kampung heritage.", avatarUrl: null, creatorSharePercent: null });
//   const artisanDemo = await upsertArtisan({ userId: creatorDemoUser.id, brandName: "Alya Handmade", bio: "Toko demo kreator dengan koleksi kecil kerajinan dan cerita di balik prosesnya.", avatarUrl: imageUrls.portraitThree, creatorSharePercent: 65 });
//   const official = (await ensureOfficialStore(prisma)).artisan;

//   await prisma.appSettings.upsert({ where: { id: 1 }, update: { holdDurationMinutes: 1440, autoCancelEnabled: true, pickupDeadlineDays: 14, refundWindowDays: 3, pickupOpenTime: "09:00", pickupCloseTime: "19:00", pickupLeadMinutes: 30, whatsappAdminNumber: "+6281234567890", notificationEmail: "admin@sesuatudarikota.com", lowStockThreshold: 5, defaultCreatorSharePercent: 70, weeklyOffEnabled: true, weeklyOffDays: [7] }, create: { id: 1, holdDurationMinutes: 1440, autoCancelEnabled: true, pickupDeadlineDays: 14, refundWindowDays: 3, pickupOpenTime: "09:00", pickupCloseTime: "19:00", pickupLeadMinutes: 30, whatsappAdminNumber: "+6281234567890", notificationEmail: "admin@sesuatudarikota.com", lowStockThreshold: 5, defaultCreatorSharePercent: 70, weeklyOffEnabled: true, weeklyOffDays: [7] } });
//   for (const [index, time] of ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].entries()) await prisma.pickupSlot.upsert({ where: { time }, update: { capacity: index < 3 ? 4 : 3, isActive: true }, create: { time, capacity: index < 3 ? 4 : 3, isActive: true } });
//   await prisma.pickupHoliday.upsert({ where: { id: "seed-holiday-demo" }, update: { startDate: dateOnly(holidayDate), endDate: dateOnly(holidayDate), reason: "Persiapan bazar komunitas Kayutangan", createdById: admin.id }, create: { id: "seed-holiday-demo", startDate: dateOnly(holidayDate), endDate: dateOnly(holidayDate), reason: "Persiapan bazar komunitas Kayutangan", createdById: admin.id } });
//   for (const [id, daysAgo, reason] of [["seed-holiday-history-1", 48, "Penataan ulang ruang galeri"], ["seed-holiday-history-2", 21, "Libur persiapan acara komunitas"]] as const) await prisma.pickupHoliday.upsert({ where: { id }, update: { startDate: dateOnly(addDays(today, -daysAgo)), endDate: dateOnly(addDays(today, -daysAgo)), reason, createdById: admin.id }, create: { id, startDate: dateOnly(addDays(today, -daysAgo)), endDate: dateOnly(addDays(today, -daysAgo)), reason, createdById: admin.id } });

//   const products: Record<string, { product: SeedProduct; variants: SeedVariant[] }> = {};
//   const add = async (key: string, spec: Omit<Parameters<typeof upsertProduct>[0], "key" | "artisanId" | "categoryId"> & { artisanId: string; categoryId: string }) => { products[key] = await upsertProduct({ key, ...spec }); };
//   await add("kartu-pos-sudut-kayutangan", { artisanId: artisanDini.id, categoryId: categories.postcard.id, name: "Kartu Pos Sudut Kayutangan", price: 15000, description: "Kartu pos cetak tebal dengan ilustrasi cat air sudut bangunan kolonial Kayutangan Malang.", shortDescription: "Ilustrasi bangunan kolonial Kayutangan.", images: [imageUrls.postcard, imageUrls.paper], variants: [{ combination: [], stock: 25 }], createdAt: wibTimestamp(addDays(today, -140), "10:00:00"), soldCount: 18, viewCount: 138, isLimited: true, story: { title: "Kenangan di Tikungan Kayutangan", content: "Sudut ini selalu ramai saat sore hari. Bangunan lama dan kedai kecilnya menyimpan banyak cerita warga Malang.", process: "Disketsa langsung di lokasi menggunakan pensil 2B, lalu diwarnai dengan cat air di atas kertas cold-pressed.", coverImageUrl: imageUrls.postcard, processImages: [imageUrls.workspace, imageUrls.art] } });
//   await add("pin-enamel-trem-antik-malang", { artisanId: artisanBagas.id, categoryId: categories["pin-enamel"].id, name: "Pin Enamel Trem Antik Malang", price: 35000, description: "Pin logam berenamel keras dengan detail trem uap bersejarah yang dulu melintasi pusat kota Malang.", shortDescription: "Pin enamel trem uap bersejarah Malang.", images: [imageUrls.craft], variants: [{ combination: [], stock: 15 }], createdAt: wibTimestamp(addDays(today, -120), "10:00:00"), soldCount: 24, viewCount: 226 });
//   await add("kaos-kerawang-malang-tempo-dulu", { artisanId: artisanRara.id, categoryId: categories.apparel.id, name: "Kaos Kerawang Malang Tempo Dulu", price: 135000, description: "Kaos katun combed dengan sablon manual motif ventilasi kerawang rumah kuno Klojen.", shortDescription: "Kaos sablon manual motif rumah kuno.", images: [imageUrls.textile, imageUrls.bag], options: [{ name: "Ukuran", values: ["S", "M", "L", "XL"] }], variants: [{ combination: ["S"], stock: 4 }, { combination: ["M"], stock: 8 }, { combination: ["L"], stock: 6 }, { combination: ["XL"], stock: 3 }], createdAt: wibTimestamp(addDays(today, -100), "10:00:00"), soldCount: 16, viewCount: 174, imageVariants: [{ url: imageUrls.textile, option: "Ukuran", value: "M" }, { url: imageUrls.bag, option: "Ukuran", value: "L" }], story: { title: "Menyelamatkan Ornamen yang Terlupakan", content: "Motif ventilasi rumah lama Klojen dipindahkan ke kain agar tetap mudah dikenali generasi baru.", process: "Klise sablon dibuat manual dan dicetak satu per satu menggunakan tinta yang tahan cuci.", coverImageUrl: null, processImages: [imageUrls.textile] } });
//   await add("stiker-vinyl-ornamen-arema", { artisanId: artisanDini.id, categoryId: categories.stiker.id, name: "Stiker Vinyl Ornamen Arema Klasik", price: 8000, description: "Stiker vinyl tahan air dengan grafis tipografi khas Arema klasik untuk laptop, botol, dan jurnal.", shortDescription: "Stiker tahan air grafis klasik Malang.", images: [imageUrls.art], variants: [{ combination: [], stock: 50 }], createdAt: wibTimestamp(addDays(today, -105), "10:00:00"), soldCount: 31, viewCount: 310 });
//   await add("tatakan-gelas-kayu-jati", { artisanId: artisanBagas.id, categoryId: categories["kriya-kayu"].id, name: "Tatakan Gelas Kayu Jati Kayutangan", price: 25000, description: "Coaster kayu jati sisa perajin mebel lokal dengan ukiran inisial sudut Kayutangan.", shortDescription: "Coaster kayu jati daur ulang halus.", images: [], variants: [{ combination: [], stock: 2 }], soldCount: 8, viewCount: 95 });
//   await add("tote-bag-kanvas-singosari", { artisanId: artisanRara.id, categoryId: categories["tote-bag"].id, name: "Tote Bag Kanvas Sablon Candi Singosari", price: 65000, description: "Tote bag kanvas tebal dengan ritsleting dan sablon siluet arca Dwarapala Singosari.", shortDescription: "Tote bag kanvas tebal sablon Dwarapala.", images: [imageUrls.bag, imageUrls.textile], variants: [{ combination: [], stock: 12 }], createdAt: wibTimestamp(addDays(today, -110), "10:00:00"), soldCount: 12, viewCount: 154 });
//   await add("cangkir-keramik-dinoyo", { artisanId: artisanBagas.id, categoryId: categories.keramik.id, name: "Cangkir Keramik Gerabah Dinoyo", price: 45000, description: "Cangkir tanah liat bakar khas kampung keramik Dinoyo dengan glasir hijau botol antik.", shortDescription: "Cangkir glasir hijau khas Dinoyo.", images: [imageUrls.ceramic], variants: [{ combination: [], stock: 10 }], soldCount: 10, viewCount: 112 });
//   await add("zine-cerita-kajoetangan", { artisanId: artisanDini.id, categoryId: categories.zine.id, name: "Zine Cerita Kampung Kajoetangan", price: 28000, description: "Buku saku mini berisi esai foto dan sketsa warga tertua di koridor Kayutangan.", shortDescription: "Buku saku ilustrasi dan esai foto warga.", images: [imageUrls.paper, imageUrls.workspace], variants: [{ combination: [], stock: 20 }], createdAt: wibTimestamp(addDays(today, -130), "10:00:00"), soldCount: 14, viewCount: 182, story: { title: "Cerita dari Teras Rumah Lama", content: "Zine ini mengumpulkan cerita singkat dari orang-orang yang tumbuh di sekitar koridor Kayutangan.", process: "Wawancara singkat, foto analog, dan sketsa tinta disusun menjadi buku saku.", coverImageUrl: imageUrls.paper, processImages: [imageUrls.workspace] } });
//   await add("gantungan-kunci-kayu-ojek", { artisanId: artisanBagas.id, categoryId: categories["kriya-kayu"].id, name: "Gantungan Kunci Kayu Ikon Malang", price: 18000, description: "Gantungan kunci kayu ringan dengan bentuk ikon kota dan finishing minyak alami.", shortDescription: "Souvenir kayu kecil untuk oleh-oleh.", images: [imageUrls.craft], variants: [{ combination: [], stock: 6 }], soldCount: 7, viewCount: 78 });
//   await add("notebook-sampul-kain", { artisanId: artisanDemo.id, categoryId: categories.zine.id, name: "Notebook Sampul Kain Heritage", price: 32000, description: "Notebook kertas daur ulang dengan sampul kain bermotif ubin rumah lama.", shortDescription: "Notebook daur ulang sampul kain.", images: [], variants: [{ combination: [], stock: 7 }], createdAt: wibTimestamp(addDays(today, -100), "10:00:00"), soldCount: 8, viewCount: 48 });
//   await add("mug-lukis-tangan-pasar-besar", { artisanId: official.id, categoryId: categories.keramik.id, name: "Mug Lukis Tangan Pasar Besar", price: 55000, description: "Mug lini toko dengan ilustrasi suasana Pasar Besar Malang dan pegangan nyaman.", shortDescription: "Mug oleh-oleh lini toko.", images: [imageUrls.ceramic, imageUrls.craft], variants: [{ combination: [], stock: 18 }], soldCount: 21, viewCount: 250, isLimited: true });
//   await add("produk-menunggu-persetujuan-demo", { artisanId: artisanDemo.id, categoryId: categories.postcard.id, name: "Poster Matahari Kayutangan", price: 42000, description: "Poster ilustrasi matahari sore di koridor Kayutangan yang sedang menunggu persetujuan admin.", shortDescription: "Poster ilustrasi baru dari kreator.", images: [imageUrls.postcard], variants: [{ combination: [], stock: 9 }], approvalStatus: "menunggu", isActive: false, soldCount: 0, viewCount: 4 });
//   await add("produk-ditolak-perlu-revisi-demo", { artisanId: artisanDemo.id, categoryId: categories.stiker.id, name: "Stiker Sketsa Alun-Alun", price: 9000, description: "Set stiker sketsa alun-alun kota untuk contoh produk yang perlu revisi.", shortDescription: "Produk demo berstatus ditolak.", images: [], variants: [{ combination: [], stock: 20 }], approvalStatus: "ditolak", statusNote: "Foto produk dan deskripsi perlu diperjelas sebelum disetujui.", isActive: false, soldCount: 0, viewCount: 7 });
//   await add("produk-disembunyikan-admin-demo", { artisanId: artisanRara.id, categoryId: categories["tote-bag"].id, name: "Pouch Kanvas Motif Ubin", price: 48000, description: "Pouch kanvas contoh untuk memperlihatkan status disembunyikan admin.", shortDescription: "Produk yang disembunyikan sementara.", images: [imageUrls.bag], variants: [{ combination: [], stock: 5 }], approvalStatus: "disetujui", statusNote: "Sementara disembunyikan untuk penataan katalog.", isActive: false, soldCount: 5, viewCount: 34 });
//   await add("produk-ditarik-lama-demo", { artisanId: artisanDini.id, categoryId: categories.postcard.id, name: "Kartu Pos Gang Lama", price: 12000, description: "Produk lama yang sudah ditarik admin karena tidak laku selama enam bulan.", shortDescription: "Produk demo berstatus ditarik.", images: [], variants: [{ combination: [], stock: 0 }], approvalStatus: "disetujui", statusNote: "Tidak laku selama 6 bulan", isActive: false, withdrawnAt: wibTimestamp(addDays(today, -200), "09:00:00"), createdAt: wibTimestamp(addDays(today, -230), "10:00:00"), soldCount: 1, viewCount: 20 });
//   await add("produk-ditarik-demo-alya", { artisanId: artisanDemo.id, categoryId: categories.postcard.id, name: "Sketsa Gang Ijen Lama", price: 26000, description: "Produk lama milik Alya Handmade yang ditarik sebagai contoh alur penggantian produk.", shortDescription: "Produk lama yang sudah ditarik admin.", images: [], variants: [{ combination: [], stock: 0 }], approvalStatus: "disetujui", statusNote: "Tidak laku selama 6 bulan", isActive: false, withdrawnAt: wibTimestamp(addDays(today, -205), "09:00:00"), createdAt: wibTimestamp(addDays(today, -235), "10:00:00"), soldCount: 0, viewCount: 12 });
//   await add("produk-lambat-peringatan-demo", { artisanId: artisanDemo.id, categoryId: categories["kriya-kayu"].id, name: "Rak Mini Kayu Kampung", price: 85000, description: "Rak mini dari kayu sisa produksi yang belum banyak terjual.", shortDescription: "Produk slow mover untuk peringatan.", images: [imageUrls.craft], variants: [{ combination: [], stock: 3 }], createdAt: wibTimestamp(addDays(today, -155), "10:00:00"), soldCount: 0, viewCount: 29 });
//   await add("produk-lambat-tarik-demo", { artisanId: artisanDemo.id, categoryId: categories["kriya-kayu"].id, name: "Baki Kayu Motif Sawah", price: 72000, description: "Baki kayu koleksi lama yang masuk daftar tarik manual.", shortDescription: "Produk slow mover level tarik.", images: [], variants: [{ combination: [], stock: 1 }], createdAt: wibTimestamp(addDays(today, -190), "10:00:00"), soldCount: 0, viewCount: 16 });
//   await prisma.product.update({ where: { slug: "produk-menunggu-persetujuan-demo" }, data: { replacesProductId: products["produk-ditarik-demo-alya"].product.id } });

//   for (const [key, entry] of Object.entries(products)) for (const [index, variant] of entry.variants.entries()) await prisma.stockMovement.upsert({ where: { id: `seed-stock-in-${key}-${index}` }, update: { productId: entry.product.id, variantId: variant.id, delta: variant.stock, stockAfter: variant.stock, reason: "barang_masuk", note: "Stok awal demo", actorId: admin.id, createdAt: entry.product.createdAt }, create: { id: `seed-stock-in-${key}-${index}`, productId: entry.product.id, variantId: variant.id, delta: variant.stock, stockAfter: variant.stock, reason: "barang_masuk", note: "Stok awal demo", actorId: admin.id, createdAt: entry.product.createdAt } });

//   const createOrder = async (input: Parameters<typeof upsertOrder>[0]) => upsertOrder(input);
//   await createOrder({ key: "SDK-DEMO-0001", userId: buyer.id, productId: products["kartu-pos-sudut-kayutangan"].product.id, variantId: products["kartu-pos-sudut-kayutangan"].variants[0].id, quantity: 1, price: 15000, paymentMethod: "midtrans", status: "lunas", pickupDate: today, pickupSlot: "10:00", createdAt: wibTimestamp(today, "08:20:00"), pickupDeadline: wibTimestamp(addDays(today, 14), "23:59:00"), payment: { status: "settlement", paidAt: wibTimestamp(today, "08:25:00"), transactionId: "demo-midtrans-0001" } });
//   await createOrder({ key: "SDK-DEMO-0002", userId: buyer.id, productId: products["tote-bag-kanvas-singosari"].product.id, variantId: products["tote-bag-kanvas-singosari"].variants[0].id, quantity: 1, price: 65000, paymentMethod: "midtrans", status: "lunas", pickupDate: holidayDate, pickupSlot: "11:00", createdAt: wibTimestamp(today, "09:10:00"), pickupDeadline: wibTimestamp(addDays(holidayDate, 14), "23:59:00"), payment: { status: "settlement", paidAt: wibTimestamp(today, "09:15:00"), transactionId: "demo-midtrans-0002" } });
//   await createOrder({ key: "SDK-DEMO-0003", userId: buyerTwo.id, productId: products["pin-enamel-trem-antik-malang"].product.id, variantId: products["pin-enamel-trem-antik-malang"].variants[0].id, quantity: 2, price: 35000, paymentMethod: "cod", status: "menunggu_bayar", pickupDate: addDays(today, 2), pickupSlot: "14:00", createdAt: wibTimestamp(today, "07:40:00"), holdExpiresAt: wibTimestamp(addDays(today, 1), "23:59:00") });
//   await createOrder({ key: "SDK-DEMO-0004", userId: buyerThree.id, productId: products["cangkir-keramik-dinoyo"].product.id, variantId: products["cangkir-keramik-dinoyo"].variants[0].id, quantity: 1, price: 45000, paymentMethod: "midtrans", status: "lunas", pickupDate: addDays(today, 3), pickupSlot: "15:00", createdAt: wibTimestamp(addDays(today, -1), "13:10:00"), pickupDeadline: wibTimestamp(addDays(today, 17), "23:59:00"), payment: { status: "settlement", paidAt: wibTimestamp(addDays(today, -1), "13:15:00"), transactionId: "demo-midtrans-0004" } });
//   await createOrder({ key: "SDK-DEMO-0005", userId: buyer.id, productId: products["zine-cerita-kajoetangan"].product.id, variantId: products["zine-cerita-kajoetangan"].variants[0].id, quantity: 2, price: 28000, paymentMethod: "midtrans", status: "selesai", pickupDate: addDays(reportDate, 2), pickupSlot: "10:00", createdAt: wibTimestamp(reportDate, "10:00:00"), pickupDeadline: wibTimestamp(addDays(reportDate, 16), "23:59:00"), completedAt: wibTimestamp(addDays(reportDate, 2), "11:30:00"), payment: { status: "settlement", paidAt: wibTimestamp(reportDate, "10:05:00"), transactionId: "demo-midtrans-0005" } });
//   const completedForReview = await createOrder({ key: "SDK-DEMO-0006", userId: buyerTwo.id, productId: products["pin-enamel-trem-antik-malang"].product.id, variantId: products["pin-enamel-trem-antik-malang"].variants[0].id, quantity: 1, price: 35000, paymentMethod: "cod", status: "selesai", pickupDate: addDays(reportDate, 8), pickupSlot: "13:00", createdAt: wibTimestamp(addDays(reportDate, 7), "09:00:00"), completedAt: wibTimestamp(addDays(reportDate, 8), "13:20:00") });
//   await createOrder({ key: "SDK-DEMO-0011", userId: buyerTwo.id, productId: products["tote-bag-kanvas-singosari"].product.id, variantId: products["tote-bag-kanvas-singosari"].variants[0].id, quantity: 1, price: 65000, paymentMethod: "cod", status: "selesai", pickupDate: addDays(reportDate, 10), pickupSlot: "14:00", createdAt: wibTimestamp(addDays(reportDate, 9), "09:00:00"), completedAt: wibTimestamp(addDays(reportDate, 10), "14:20:00") });
//   await createOrder({ key: "SDK-DEMO-0012", userId: buyerThree.id, productId: products["notebook-sampul-kain"].product.id, variantId: products["notebook-sampul-kain"].variants[0].id, quantity: 2, price: 32000, paymentMethod: "midtrans", status: "selesai", pickupDate: addDays(reportDate, 12), pickupSlot: "15:00", createdAt: wibTimestamp(addDays(reportDate, 11), "09:00:00"), pickupDeadline: wibTimestamp(addDays(reportDate, 25), "23:59:00"), completedAt: wibTimestamp(addDays(reportDate, 12), "15:20:00"), payment: { status: "settlement", paidAt: wibTimestamp(addDays(reportDate, 11), "09:05:00"), transactionId: "demo-midtrans-0012" } });
//   await createOrder({ key: "SDK-DEMO-0007", userId: buyerThree.id, productId: products["tatakan-gelas-kayu-jati"].product.id, variantId: products["tatakan-gelas-kayu-jati"].variants[0].id, quantity: 1, price: 25000, paymentMethod: "midtrans", status: "dibatalkan", pickupDate: addDays(today, -3), pickupSlot: "09:00", createdAt: wibTimestamp(addDays(today, -10), "10:00:00"), pickupDeadline: wibTimestamp(addDays(today, 11), "23:59:00"), refundStatus: "menunggu", cancelReason: "kesalahan_toko", payment: { status: "settlement", paidAt: wibTimestamp(addDays(today, -10), "10:05:00"), transactionId: "demo-midtrans-0007" } });
//   await createOrder({ key: "SDK-DEMO-0008", userId: buyer.id, productId: products["gantungan-kunci-kayu-ojek"].product.id, variantId: products["gantungan-kunci-kayu-ojek"].variants[0].id, quantity: 1, price: 18000, paymentMethod: "cod", status: "kedaluwarsa", pickupDate: addDays(today, -6), pickupSlot: "16:00", createdAt: wibTimestamp(addDays(today, -8), "10:00:00"), holdExpiresAt: wibTimestamp(addDays(today, -7), "10:00:00") });
//   await createOrder({ key: "SDK-DEMO-0009", userId: buyerTwo.id, productId: products["stiker-vinyl-ornamen-arema"].product.id, variantId: products["stiker-vinyl-ornamen-arema"].variants[0].id, quantity: 1, price: 8000, paymentMethod: "midtrans", status: "lewat_batas_pengambilan", pickupDate: addDays(today, -12), pickupSlot: "12:00", createdAt: wibTimestamp(addDays(today, -20), "10:00:00"), pickupDeadline: wibTimestamp(addDays(today, -5), "23:59:00"), payment: { status: "settlement", paidAt: wibTimestamp(addDays(today, -20), "10:05:00"), transactionId: "demo-midtrans-0009" } });
//   await createOrder({ key: "SDK-DEMO-0010", userId: buyerThree.id, productId: products["kartu-pos-sudut-kayutangan"].product.id, variantId: products["kartu-pos-sudut-kayutangan"].variants[0].id, quantity: 1, price: 15000, paymentMethod: "cod", status: "menunggu_bayar", pickupDate: addDays(today, 5), pickupSlot: "17:00", createdAt: wibTimestamp(today, "11:00:00"), holdExpiresAt: wibTimestamp(addDays(today, 1), "23:59:00") });

//   const historicalProducts = [
//     ["kartu-pos-sudut-kayutangan", buyer.id, 15000, "09:00"],
//     ["pin-enamel-trem-antik-malang", buyerTwo.id, 35000, "11:00"],
//     ["tote-bag-kanvas-singosari", buyerThree.id, 65000, "14:00"],
//     ["notebook-sampul-kain", buyer.id, 32000, "16:00"],
//   ] as const;
//   for (let months = 3; months >= 1; months--) {
//     const month = monthsAgo(today, months);
//     for (const [index, [productKey, userId, price, pickupSlot]] of historicalProducts.entries()) {
//       const pickupDate = addDays(`${month}-01`, 5 + index * 4);
//       const orderNumber = `SDK-HIST-${month.replace("-", "")}-${index + 1}`;
//       const paymentMethod = index % 2 === 0 ? "midtrans" : "cod";
//       await createOrder({
//         key: orderNumber,
//         userId,
//         productId: products[productKey].product.id,
//         variantId: products[productKey].variants[0].id,
//         quantity: index === 3 ? 2 : 1,
//         price,
//         paymentMethod,
//         status: "selesai",
//         pickupDate,
//         pickupSlot,
//         createdAt: wibTimestamp(addDays(pickupDate, -1), "10:00:00"),
//         pickupDeadline: paymentMethod === "midtrans" ? wibTimestamp(addDays(pickupDate, 14), "23:59:00") : null,
//         completedAt: wibTimestamp(pickupDate, "16:30:00"),
//         payment: paymentMethod === "midtrans" ? { status: "settlement", paidAt: wibTimestamp(addDays(pickupDate, -1), "10:05:00"), transactionId: `hist-${month}-${index + 1}` } : undefined,
//       });
//     }
//     await createOrder({ key: `SDK-HIST-${month.replace("-", "")}-CANCEL`, userId: buyerTwo.id, productId: products["stiker-vinyl-ornamen-arema"].product.id, variantId: products["stiker-vinyl-ornamen-arema"].variants[0].id, quantity: 1, price: 8000, paymentMethod: "midtrans", status: "dibatalkan", pickupDate: addDays(`${month}-01`, 22), pickupSlot: "10:00", createdAt: wibTimestamp(addDays(`${month}-01`, 18), "10:00:00"), pickupDeadline: wibTimestamp(addDays(`${month}-01`, 36), "23:59:00"), cancelReason: "permintaan_pembeli", payment: { status: "expire", paidAt: null, transactionId: `hist-cancel-${month}` } });
//     await createOrder({ key: `SDK-HIST-${month.replace("-", "")}-EXPIRED`, userId: buyerThree.id, productId: products["gantungan-kunci-kayu-ojek"].product.id, variantId: products["gantungan-kunci-kayu-ojek"].variants[0].id, quantity: 1, price: 18000, paymentMethod: "cod", status: "kedaluwarsa", pickupDate: addDays(`${month}-01`, 25), pickupSlot: "12:00", createdAt: wibTimestamp(addDays(`${month}-01`, 23), "10:00:00"), holdExpiresAt: wibTimestamp(addDays(`${month}-01`, 24), "10:00:00") });
//   }

//   const historyMovements = [
//     ["seed-stock-history-opname", "kartu-pos-sudut-kayutangan", "opname", -3, 22, "Hasil opname bulanan Oktober", addDays(today, -36)],
//     ["seed-stock-history-cashier", "pin-enamel-trem-antik-malang", "terjual_kasir", -2, 13, "Penjualan kasir tidak masuk laporan aplikasi", addDays(today, -29)],
//     ["seed-stock-history-damaged", "tote-bag-kanvas-singosari", "rusak_hilang", -1, 11, "Kemasan rusak saat penyimpanan", addDays(today, -24)],
//     ["seed-stock-history-correction", "notebook-sampul-kain", "koreksi", 2, 9, "Koreksi hasil hitung stok", addDays(today, -17)],
//   ] as const;
//   for (const [id, productKey, reason, delta, stockAfter, note, date] of historyMovements) {
//     await prisma.stockMovement.upsert({ where: { id }, update: { productId: products[productKey].product.id, variantId: products[productKey].variants[0].id, reason, delta, stockAfter, note, actorId: admin.id, createdAt: wibTimestamp(date, "15:00:00") }, create: { id, productId: products[productKey].product.id, variantId: products[productKey].variants[0].id, reason, delta, stockAfter, note, actorId: admin.id, createdAt: wibTimestamp(date, "15:00:00") } });
//   }

//   await prisma.review.upsert({ where: { orderItemId: `seed-item-sdk-demo-0006` }, update: { userId: buyerTwo.id, productId: products["pin-enamel-trem-antik-malang"].product.id, rating: 5, comment: "Barangnya rapi, detailnya bagus, dan kemasannya aman.", status: "tampil", createdAt: wibTimestamp(addDays(today, -4), "16:00:00") }, create: { id: "seed-review-order-0006", orderItemId: completedForReview.itemId, userId: buyerTwo.id, productId: products["pin-enamel-trem-antik-malang"].product.id, rating: 5, comment: "Barangnya rapi, detailnya bagus, dan kemasannya aman.", status: "tampil", createdAt: wibTimestamp(addDays(today, -4), "16:00:00") } });
//   await prisma.review.upsert({ where: { id: "seed-review-buyer-0005" }, update: { orderItemId: "seed-item-sdk-demo-0005", userId: buyer.id, productId: products["zine-cerita-kajoetangan"].product.id, rating: 5, comment: "Zine-nya menarik dan ilustrasinya membuat saya ingin jalan-jalan lagi di Kayutangan.", status: "tampil", createdAt: wibTimestamp(addDays(today, -2), "14:00:00") }, create: { id: "seed-review-buyer-0005", orderItemId: "seed-item-sdk-demo-0005", userId: buyer.id, productId: products["zine-cerita-kajoetangan"].product.id, rating: 5, comment: "Zine-nya menarik dan ilustrasinya membuat saya ingin jalan-jalan lagi di Kayutangan.", status: "tampil", createdAt: wibTimestamp(addDays(today, -2), "14:00:00") } });
//   await prisma.review.upsert({ where: { id: "seed-review-hidden" }, update: { userId: buyerThree.id, productId: products["tatakan-gelas-kayu-jati"].product.id, rating: 2, comment: "Ulasan contoh yang disembunyikan admin untuk demo moderasi.", status: "disembunyikan", createdAt: wibTimestamp(addDays(today, -18), "13:00:00") }, create: { id: "seed-review-hidden", userId: buyerThree.id, productId: products["tatakan-gelas-kayu-jati"].product.id, rating: 2, comment: "Ulasan contoh yang disembunyikan admin untuk demo moderasi.", status: "disembunyikan", createdAt: wibTimestamp(addDays(today, -18), "13:00:00") } });
//   for (const [id, userId, rating, comment, createdAt] of [["seed-review-general-1", buyer.id, 5, "Toko kecil yang kurasinya terasa personal. Banyak produk unik untuk oleh-oleh.", addDays(today, -28)], ["seed-review-general-2", buyerThree.id, 4, "Pickup mudah dan adminnya responsif saat saya bertanya lewat WhatsApp.", addDays(today, -11)]] as const) await prisma.review.upsert({ where: { id }, update: { userId, productId: null, rating, comment, status: "tampil", createdAt: wibTimestamp(createdAt, "12:00:00") }, create: { id, userId, productId: null, rating, comment, status: "tampil", createdAt: wibTimestamp(createdAt, "12:00:00") } });

//   const applications = [
//     { id: "seed-application-buyer-pending", userId: buyer.id, applicantName: buyer.name, contact: "081298765432", brandName: "Budi Kayu", categoryId: categories["kriya-kayu"].id, description: "Pengajuan demo milik akun buyer utama untuk mencoba halaman status pengajuan.", status: "pending" as const, samplePhotos: [imageUrls.craft] },
//     { id: "seed-application-pending", userId: applicant.id, applicantName: applicant.name, contact: "081234567890", brandName: "Nadia Keramik", categoryId: categories.keramik.id, description: "Saya membuat keramik kecil dengan motif flora dari halaman rumah di Malang.", status: "pending" as const, samplePhotos: [imageUrls.ceramic, imageUrls.craft] },
//     { id: "seed-application-rejected", userId: buyerThree.id, applicantName: buyerThree.name, contact: "082233445566", brandName: "Rizal Print", categoryId: categories.zine.id, description: "Saya ingin menitipkan produk cetak dan poster ilustrasi.", status: "ditolak" as const, rejectReason: "Mohon tambahkan foto proses dan contoh kemasan produk.", samplePhotos: [] },
//     { id: "seed-application-approved", userId: creatorDiniUser.id, applicantName: creatorDiniUser.name, contact: "081122334455", brandName: artisanDini.brandName, categoryId: categories.postcard.id, description: "Pengajuan kreator yang sudah diterima untuk data riwayat.", status: "diterima" as const, samplePhotos: [imageUrls.postcard] },
//   ];
//   for (const application of applications) {
//     const ageDays = application.status === "pending" ? 15 : application.id.includes("rejected") ? 80 : 120;
//     const submittedAt = wibTimestamp(addDays(today, -ageDays), "10:00:00");
//     const decidedAt = application.status === "pending" ? null : wibTimestamp(addDays(today, -(ageDays - 3)), "15:00:00");
//     await prisma.artisanApplication.upsert({ where: { id: application.id }, update: { ...application, submittedAt, decidedAt }, create: { ...application, submittedAt, decidedAt } });
//   }

//   await upsertNotification({ id: "seed-notification-buyer-order", userId: buyer.id, type: "pesanan_update", title: "Pesanan siap diambil", body: "Pesanan SDK-DEMO-0001 sudah lunas dan dapat diambil hari ini pukul 10:00.", createdAt: wibTimestamp(today, "08:30:00") });
//   await upsertNotification({ id: "seed-notification-buyer-holiday", userId: buyer.id, type: "libur_terdampak", title: "Pickup terdampak jadwal libur", body: `Toko libur pada tanggal pickup ${holidayDate}. Pesanan dapat diambil kapan saja saat toko buka dan admin akan menghubungi lewat WhatsApp.`, createdAt: wibTimestamp(today, "09:20:00") });
//   await upsertNotification({ id: "seed-notification-buyer-review", userId: buyer.id, type: "umum", title: "Terima kasih sudah berbelanja", body: "Jangan lupa ceritakan pengalamanmu setelah mengambil pesanan.", isRead: true, createdAt: wibTimestamp(addDays(today, -1), "12:00:00") });
//   await upsertNotification({ id: "seed-notification-buyer-application", userId: buyer.id, type: "umum", title: "Pengajuan kreator diterima sistem", body: "Pengajuan Budi Kayu sedang menunggu pemeriksaan admin.", createdAt: wibTimestamp(today, "09:30:00") });
//   await upsertNotification({ id: "seed-notification-creator-application-approved", userId: creatorDiniUser.id, type: "pengajuan_diterima", title: "Pengajuan kreator diterima", body: "Pengajuan toko Dini Draws telah diterima. Selamat berkarya di SDKM.", isRead: true, createdAt: wibTimestamp(addDays(today, -12), "15:00:00") });
//   await upsertNotification({ id: "seed-notification-buyer-application-rejected", userId: buyerThree.id, type: "pengajuan_ditolak", title: "Pengajuan kreator perlu dilengkapi", body: "Pengajuan Rizal Print ditolak. Mohon tambahkan foto proses dan contoh kemasan produk.", createdAt: wibTimestamp(addDays(today, -12), "15:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-approved", userId: creatorDiniUser.id, type: "produk_disetujui", title: "Produk disetujui", body: "Produk Kartu Pos Sudut Kayutangan sudah disetujui dan tampil di katalog.", createdAt: wibTimestamp(addDays(today, -2), "11:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-rejected", userId: creatorDemoUser.id, type: "produk_ditolak", title: "Produk perlu revisi", body: "Produk Stiker Sketsa Alun-Alun ditolak. Foto produk dan deskripsi perlu diperjelas sebelum disetujui.", createdAt: wibTimestamp(addDays(today, -1), "13:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-hidden", userId: creatorRaraUser.id, type: "produk_disembunyikan", title: "Produk disembunyikan", body: "Pouch Kanvas Motif Ubin sementara disembunyikan untuk penataan katalog.", createdAt: wibTimestamp(addDays(today, -3), "13:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-withdrawn", userId: creatorDiniUser.id, type: "produk_ditarik", title: "Produk ditarik", body: "Kartu Pos Gang Lama ditarik karena tidak laku selama 6 bulan.", isRead: true, createdAt: wibTimestamp(addDays(today, -4), "13:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-stock", userId: creatorBagasUser.id, type: "stok_menipis", title: "Stok menipis", body: "Stok Tatakan Gelas Kayu Jati Kayutangan tersisa 2.", createdAt: wibTimestamp(today, "10:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-slow", userId: creatorDemoUser.id, type: "produk_mendekati_batas", title: "Produk mendekati batas", body: "Rak Mini Kayu Kampung sudah 155 hari belum terjual. Pertimbangkan evaluasi produk.", createdAt: wibTimestamp(addDays(today, -1), "10:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-report", userId: creatorDiniUser.id, type: "laporan_final", title: "Laporan bulanan tersedia", body: `Laporan bulan ${reportMonth} sudah difinalkan.`, createdAt: wibTimestamp(addDays(today, -2), "15:00:00") });
//   await upsertNotification({ id: "seed-notification-creator-review", userId: creatorBagasUser.id, type: "ulasan_baru", title: "Ulasan baru", body: "Produk Pin Enamel Trem Antik Malang mendapatkan ulasan baru.", isRead: true, createdAt: wibTimestamp(addDays(today, -5), "16:00:00") });
//   for (let months = 3; months >= 1; months--) {
//     const month = monthsAgo(today, months);
//     await upsertNotification({ id: `seed-notification-history-order-${month}`, userId: buyer.id, type: "pesanan_update", title: "Pesanan selesai", body: `Pesanan historis SDK-HIST-${month.replace("-", "")} selesai diproses.`, isRead: true, createdAt: wibTimestamp(`${month}-25`, "17:00:00") });
//     await upsertNotification({ id: `seed-notification-history-report-${month}`, userId: creatorDiniUser.id, type: "laporan_final", title: "Laporan bulanan tersedia", body: `Laporan bulan ${month} sudah difinalkan oleh admin.`, isRead: true, createdAt: wibTimestamp(`${month}-28`, "16:00:00") });
//   }

//   for (let months = 3; months >= 1; months--) {
//     const month = monthsAgo(today, months);
//     const snapshot = await calculateMonthlyReport(month, prisma);
//     const finalizedDate = addDays(addMonths(`${month}-01`, 1), -1);
//     await prisma.monthlyReport.upsert({ where: { month }, update: { status: "final", finalizedAt: wibTimestamp(finalizedDate, "16:00:00"), finalizedById: admin.id, snapshot: snapshot as any }, create: { month, status: "final", finalizedAt: wibTimestamp(finalizedDate, "16:00:00"), finalizedById: admin.id, snapshot: snapshot as any } });
//   }

//   const reportOrders = [
//     ["SDK-DEMO-0005", "zine-cerita-kajoetangan", -2, 10],
//     ["SDK-DEMO-0011", "tote-bag-kanvas-singosari", -1, 14],
//     ["SDK-DEMO-0012", "notebook-sampul-kain", -2, 15],
//   ] as const;
//   for (const [orderNumber, productKey, delta, hour] of reportOrders) {
//     const reportOrder = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
//     const product = products[productKey];
//     await prisma.stockMovement.upsert({ where: { id: `seed-stock-sale-${orderNumber.toLowerCase()}` }, update: { productId: product.product.id, variantId: product.variants[0].id, delta, stockAfter: product.variants[0].stock, reason: "pesanan", orderId: reportOrder.id, actorId: null, note: "Penjualan melalui aplikasi", createdAt: wibTimestamp(reportDate, `${String(hour).padStart(2, "0")}:05:00`) }, create: { id: `seed-stock-sale-${orderNumber.toLowerCase()}`, productId: product.product.id, variantId: product.variants[0].id, delta, stockAfter: product.variants[0].stock, reason: "pesanan", orderId: reportOrder.id, actorId: null, note: "Penjualan melalui aplikasi", createdAt: wibTimestamp(reportDate, `${String(hour).padStart(2, "0")}:05:00`) } });
//   }

//   console.log("Seed selesai.");
//   console.log(`Akun admin: ${admin.email}`);
//   console.log(`Akun admin demo: ${demoAdmin.email}`);
//   console.log(`Akun buyer demo: ${buyer.email}`);
//   console.log(`Akun kreator demo: ${creatorDemoUser.email}`);
//   console.log(`Laporan final tersedia untuk ${reportMonth}.`);
//   console.log("Sebagian produk memakai gambar HTTPS dan sebagian memakai images kosong untuk menguji fallback UI.");
// }

// main()
//   .catch((error) => {
//     console.error("Seed gagal:", error);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });

/**
 * prisma/seed.ts — Seeder DEMO "Sesuatu DariKota Malang" (SDKM)
 *
 * Tujuan: mengisi database seolah aplikasi sudah berjalan ±5 bulan, sehingga SEMUA halaman
 * admin web dan aplikasi mobile (pembeli + kreator) berisi data saat didemokan.
 *
 * PENTING
 * - Seeder ini MERESET data aplikasi (user, kreator, produk, pesanan, ulasan, notifikasi, stok,
 *   laporan, jadwal). Tabel `uploaded_files` dan `revoked_tokens` tidak disentuh.
 * - Tanggal dibuat RELATIF terhadap waktu seeder dijalankan. Jalankan ulang seeder tepat sebelum
 *   demo/ujian supaya "pesanan hari ini", pendapatan 7 hari terakhir, dan masa hold tetap segar.
 * - Data deterministik (PRNG dengan seed tetap): isi yang sama setiap dijalankan, hanya tanggalnya bergeser.
 * - Menolak berjalan di NODE_ENV=production.
 *
 * Env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (wajib) | SEED_DEMO_PASSWORD, SEED_DEMO_ADMIN_EMAIL,
 *      SEED_BUYER_EMAIL, SEED_DEMO_CREATOR_EMAIL, SEED_WEEKLY_OFF_DAY (1-7, ISO) (opsional)
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { ensureOfficialStore } from "../src/lib/officialStore";
import { normalizeBrandKey } from "../src/lib/brandKey";
import { calculateMonthlyReport } from "../src/lib/monthlyReport";

/* ========================================================================== */
/* 0. WAKTU, PRNG, UTIL                                                        */
/* ========================================================================== */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WIB_MS = 7 * HOUR;
const NOW = new Date();
const HIST_DAYS = 165; // lama "riwayat" pesanan ke belakang
const DEADLINE_DAYS = 14; // = AppSettings.pickupDeadlineDays
const LEAD_MINUTES = 30; // = AppSettings.pickupLeadMinutes

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(20261111);
const rint = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));
const chance = (p: number): boolean => rand() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return null;
  let r = rand() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const pad = (n: number): string => String(n).padStart(2, "0");
const wibDate = (d: Date): string => new Date(d.getTime() + WIB_MS).toISOString().slice(0, 10);
const TODAY = wibDate(NOW);
function addDays(ds: string, n: number): string {
  const d = new Date(`${ds}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isoWeekday = (ds: string): number => {
  const g = new Date(`${ds}T00:00:00Z`).getUTCDay();
  return g === 0 ? 7 : g;
};
const wibAt = (ds: string, hhmm: string): Date => new Date(`${ds}T${hhmm}:00+07:00`);
const dateOnly = (ds: string): Date => new Date(`${ds}T00:00:00.000Z`);
const monthWib = (d: Date): string => wibDate(d).slice(0, 7);
const minusMin = (d: Date, n: number): Date => new Date(d.getTime() - n * MIN);
const plusMin = (d: Date, n: number): Date => new Date(d.getTime() + n * MIN);
const isPast = (d: Date): boolean => d.getTime() < NOW.getTime();
/** Waktu acak pada hari WIB tertentu; jika jatuh di masa depan, dimundurkan ke sebelum sekarang. */
function randomTimeOnDay(ds: string, hours?: [number, number]): Date {
  const h = hours ? rint(hours[0], hours[1]) : pickHour();
  const t = wibAt(ds, `${pad(h)}:${pad(rint(0, 59))}`);
  if (t.getTime() <= NOW.getTime() - 3 * MIN) return t;
  const startOfDay = wibAt(ds, "00:01").getTime();
  const fallback = NOW.getTime() - rint(5, 600) * MIN;
  return new Date(Math.max(startOfDay + 5 * MIN, Math.min(fallback, NOW.getTime() - 3 * MIN)));
}
function pickHour(): number {
  const w: Array<[number, number]> = [[8, 2], [9, 4], [10, 6], [11, 8], [12, 8], [13, 7], [14, 6], [15, 6], [16, 6], [17, 6], [18, 7], [19, 8], [20, 7], [21, 4]];
  return weightedPick(w, (x) => x[1])![0];
}
/** createdAt untuk entitas "x hari lalu": bilangan bulat = tanggal WIB acak jam kerja, pecahan = tepat n hari dari sekarang. */
function agoDate(days: number): Date {
  if (Number.isInteger(days)) return randomTimeOnDay(addDays(TODAY, -days), [8, 17]);
  return new Date(NOW.getTime() - days * DAY);
}

/* ========================================================================== */
/* 1. DATA STATIS                                                              */
/* ========================================================================== */

// Hanya URL yang sudah terbukti dipakai di seeder lama. Tambah URL baru di sini bila perlu variasi.
const IMG: Record<string, string> = {
  paper: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=85",
  postcard: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=900&q=85",
  textile: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
  bag: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
  ceramic: "https://images.unsplash.com/photo-1572119865084-43c1a0861b7b?auto=format&fit=crop&w=900&q=85",
  craft: "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=900&q=85",
  workspace: "https://images.unsplash.com/photo-1455390582262-044c61d1cfe2?auto=format&fit=crop&w=900&q=85",
  art: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=85",
  portrait: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=85",
  portraitTwo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=85",
  portraitThree: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=85",
};
const urls = (keys: string[]): string[] => keys.map((k) => IMG[k]);

const CATEGORIES: ReadonlyArray<readonly [string, string, string, string]> = [
  ["postcard", "Postcard", "Kartu pos ilustrasi tangan", "mail"],
  ["pin-enamel", "Pin Enamel", "Pin kecil bertema lokal", "circle-dot"],
  ["apparel", "Apparel", "Kaos dan pakaian sablon", "shirt"],
  ["stiker", "Stiker", "Stiker vinyl ornamen", "sticker"],
  ["kriya-kayu", "Kriya Kayu", "Gantungan dan hiasan kayu", "tree-pine"],
  ["tote-bag", "Tote Bag", "Tas kanvas hasil sablon", "shopping-bag"],
  ["keramik", "Keramik", "Mug dan cangkir tanah liat", "coffee"],
  ["zine", "Zine", "Buku kecil cerita kota", "book-open"],
];

interface CreatorSpec {
  key: string;
  name: string;
  email: string;
  brand: string;
  bio: string;
  userAvatar: string | null;
  shopAvatar: string | null;
  share: number | null;
  status: "aktif" | "nonaktif";
  joinedAgo: number;
  phone: string;
  appCat: string;
  appDesc: string;
  deactivatedAgo?: number;
}

function creatorSpecs(demoCreatorEmail: string): CreatorSpec[] {
  return [
    { key: "dini", name: "Dini Aulia", email: "dini@sesuatudarikota.com", brand: "Dini Draws", bio: "Ilustrator yang menggambar sudut Kayutangan, genteng tua, dan jendela heritage Malang.", userAvatar: "portrait", shopAvatar: null, share: null, status: "aktif", joinedAgo: 230, phone: "081122334455", appCat: "postcard", appDesc: "Saya menggambar kartu pos dan stiker bertema bangunan tua Malang dengan cat air." },
    { key: "bagas", name: "Bagas Pratama", email: "bagas@sesuatudarikota.com", brand: "Bagas Pin Co", bio: "Perajin pin, kayu, dan keramik kecil yang terinspirasi dari cerita kota Malang.", userAvatar: "portraitTwo", shopAvatar: "portraitTwo", share: 75, status: "aktif", joinedAgo: 226, phone: "081233445566", appCat: "pin-enamel", appDesc: "Membuat pin enamel dan kriya kayu kecil dengan ikon-ikon kota Malang." },
    { key: "rara", name: "Rara Kamila", email: "rara@sesuatudarikota.com", brand: "Rara Sablon", bio: "Sablon manual satu per satu dengan motif ornamen rumah tua dan kampung heritage.", userAvatar: null, shopAvatar: null, share: null, status: "aktif", joinedAgo: 218, phone: "081344556677", appCat: "apparel", appDesc: "Sablon manual di kaos dan tote bag dengan motif ornamen rumah tua." },
    { key: "alya", name: "Alya Prameswari", email: demoCreatorEmail, brand: "Alya Handmade", bio: "Toko demo kreator dengan koleksi kecil kerajinan, jurnal, dan cerita di balik prosesnya.", userAvatar: "portraitThree", shopAvatar: "portraitThree", share: 65, status: "aktif", joinedAgo: 212, phone: "081455667788", appCat: "zine", appDesc: "Jurnal dan notebook sampul kain, plus kriya kayu kecil buatan sendiri." },
    { key: "sinta", name: "Sinta Maharani", email: "sinta@sesuatudarikota.com", brand: "Tanah Dinoyo", bio: "Pengrajin gerabah dari kampung keramik Dinoyo. Setiap mug dibakar dan diglasir satu per satu.", userAvatar: null, shopAvatar: "portrait", share: 60, status: "aktif", joinedAgo: 205, phone: "081566778899", appCat: "keramik", appDesc: "Keramik gerabah Dinoyo: mug, vas, dan piring hias dengan glasir hijau botol." },
    { key: "yoga", name: "Yoga Prasetyo", email: "yoga@sesuatudarikota.com", brand: "Malang Tempo Doeloe", bio: "Mengumpulkan arsip foto dan peta lama Malang, lalu mengolahnya jadi zine, poster, dan kaos.", userAvatar: null, shopAvatar: null, share: null, status: "aktif", joinedAgo: 200, phone: "081677889900", appCat: "zine", appDesc: "Zine, poster, dan kaos dari arsip foto serta peta lama kota Malang." },
    { key: "hendra", name: "Hendra Wijaya", email: "hendra@sesuatudarikota.com", brand: "Kayu Kampung Studio", bio: "Kriya kayu jati sisa perajin mebel Kampung Kayutangan. Sedang vakum sementara.", userAvatar: null, shopAvatar: null, share: 70, status: "nonaktif", joinedAgo: 186, phone: "081788990011", appCat: "kriya-kayu", appDesc: "Gantungan dan hiasan dinding dari kayu jati sisa produksi mebel.", deactivatedAgo: 38 },
  ];
}

interface ProductSpec {
  key: string;
  seller: string; // key kreator atau "official"
  cat: string;
  name: string;
  price: number;
  short: string;
  desc: string;
  photos: string[];
  added: number; // hari lalu (pecahan = tepat n hari dari sekarang)
  stock: number | number[]; // stok TERSEDIA saat ini (stok efektif) per varian
  w?: number; // bobot penjualan
  q?: number; // kualitas (rata-rata rating)
  cap?: number; // maks jumlah pesanan
  status?: "menunggu" | "ditolak" | "disembunyikan" | "ditarik";
  statusAgo?: number;
  note?: string;
  replaces?: string;
  limited?: boolean;
  noSales?: boolean;
  oldSale?: number; // satu penjualan lama (hari lalu) untuk produk slow mover
  options?: Array<{ name: string; values: string[] }>;
  imageVariants?: Array<[string, string, string]>; // [fotoKey, opsi, nilai]
}

const PRODUCTS: ProductSpec[] = [
  /* --- Dini Draws --- */
  { key: "kartu-pos-sudut-kayutangan", seller: "dini", cat: "postcard", name: "Kartu Pos Sudut Kayutangan", price: 15000, short: "Ilustrasi bangunan kolonial Kayutangan.", desc: "Kartu pos cetak tebal dengan ilustrasi cat air sudut bangunan kolonial Kayutangan Malang.", photos: ["postcard", "paper"], added: 150, stock: 22, w: 10, q: 4.8, limited: true },
  { key: "kartu-pos-pasar-bunga", seller: "dini", cat: "postcard", name: "Kartu Pos Pasar Bunga Splendid", price: 15000, short: "Suasana pasar bunga yang berwarna.", desc: "Kartu pos bergambar kios-kios bunga Pasar Splendid dengan warna cat air yang hangat.", photos: ["paper"], added: 112, stock: 30, w: 6, q: 4.6 },
  { key: "stiker-vinyl-ornamen-arema", seller: "dini", cat: "stiker", name: "Stiker Vinyl Ornamen Arema Klasik", price: 8000, short: "Stiker tahan air grafis klasik Malang.", desc: "Stiker vinyl tahan air dengan grafis tipografi khas Arema klasik untuk laptop, botol, dan jurnal.", photos: ["art"], added: 140, stock: 45, w: 9, q: 4.7 },
  { key: "stiker-set-bangunan-heritage", seller: "dini", cat: "stiker", name: "Set Stiker Bangunan Heritage Malang", price: 22000, short: "Satu set stiker bangunan ikonik.", desc: "Set 8 stiker vinyl bergambar bangunan ikonik Malang: Balai Kota, Tugu, Toko Oen, dan lainnya.", photos: [], added: 72, stock: 18, w: 4, q: 4.0 },
  { key: "zine-cerita-kajoetangan", seller: "dini", cat: "zine", name: "Zine Cerita Kampung Kajoetangan", price: 28000, short: "Buku saku ilustrasi dan esai foto warga.", desc: "Buku saku mini berisi esai foto dan sketsa warga tertua di koridor Kayutangan.", photos: ["paper", "workspace"], added: 125, stock: 16, w: 6, q: 4.7 },
  { key: "kartu-pos-gang-lama", seller: "dini", cat: "postcard", name: "Kartu Pos Gang Lama", price: 12000, short: "Produk lama yang sudah ditarik.", desc: "Kartu pos gang-gang sempit kampung lama. Produk ini sudah ditarik karena tidak laku selama enam bulan.", photos: [], added: 226, stock: 0, status: "ditarik", statusAgo: 40, note: "Tidak laku selama 6 bulan", noSales: true },
  { key: "stiker-hologram-tugu", seller: "dini", cat: "stiker", name: "Stiker Hologram Tugu Malang", price: 12000, short: "Stiker hologram ikon Tugu.", desc: "Stiker hologram dengan gambar Tugu Malang, dicetak di bahan metalik.", photos: [], added: 9, stock: 30, status: "ditolak", statusAgo: 7, note: "Bahan stiker hologram belum sesuai standar konsinyasi SDKM. Silakan ajukan ulang dengan bahan vinyl biasa.", noSales: true },
  { key: "tote-mini-ilustrasi-dini", seller: "dini", cat: "tote-bag", name: "Tote Bag Mini Ilustrasi Dini", price: 55000, short: "Tote bag mini ilustrasi sudut kota.", desc: "Tote bag kanvas ukuran mini dengan sablon ilustrasi sudut kota karya Dini.", photos: ["bag"], added: 0.2, stock: 12, status: "menunggu", noSales: true },
  /* --- Bagas Pin Co --- */
  { key: "pin-enamel-trem-antik-malang", seller: "bagas", cat: "pin-enamel", name: "Pin Enamel Trem Antik Malang", price: 35000, short: "Pin enamel trem uap bersejarah Malang.", desc: "Pin logam berenamel keras dengan detail trem uap bersejarah yang dulu melintasi pusat kota Malang.", photos: ["craft"], added: 155, stock: 14, w: 8, q: 4.8 },
  { key: "pin-enamel-tugu-malang", seller: "bagas", cat: "pin-enamel", name: "Pin Enamel Tugu Balaikota", price: 32000, short: "Pin enamel ikon Tugu dan Balai Kota.", desc: "Pin enamel dengan siluet Tugu dan Balai Kota Malang, pengait kupu-kupu ganda.", photos: [], added: 100, stock: 20, w: 5, q: 4.5 },
  { key: "pin-set-ikon-malang", seller: "bagas", cat: "pin-enamel", name: "Set Pin Mini Ikon Malang (3 pcs)", price: 75000, short: "Edisi terbatas, satu set tiga pin mini.", desc: "Satu set tiga pin mini ikon Malang dalam kotak kecil. Produksi terbatas, jumlah tidak banyak.", photos: ["craft", "art"], added: 60, stock: 0, w: 5, q: 4.9, cap: 6, limited: true },
  { key: "tatakan-gelas-kayu-jati", seller: "bagas", cat: "kriya-kayu", name: "Tatakan Gelas Kayu Jati Kayutangan", price: 25000, short: "Coaster kayu jati daur ulang halus.", desc: "Coaster kayu jati sisa perajin mebel lokal dengan ukiran inisial sudut Kayutangan.", photos: [], added: 130, stock: 2, w: 4, q: 3.7, cap: 9 },
  { key: "gantungan-kunci-kayu-ikon-malang", seller: "bagas", cat: "kriya-kayu", name: "Gantungan Kunci Kayu Ikon Malang", price: 18000, short: "Souvenir kayu kecil untuk oleh-oleh.", desc: "Gantungan kunci kayu ringan dengan bentuk ikon kota dan finishing minyak alami.", photos: ["craft"], added: 120, stock: 6, w: 4, q: 4.4 },
  { key: "cangkir-keramik-dinoyo", seller: "bagas", cat: "keramik", name: "Cangkir Keramik Gerabah Dinoyo", price: 45000, short: "Cangkir glasir khas Dinoyo.", desc: "Cangkir tanah liat bakar khas kampung keramik Dinoyo dengan glasir antik pilihan warna.", photos: ["ceramic"], added: 135, stock: [8, 6], w: 6, q: 4.6, options: [{ name: "Warna", values: ["Hijau Botol", "Cokelat Tanah"] }], imageVariants: [["ceramic", "Warna", "Hijau Botol"], ["craft", "Warna", "Cokelat Tanah"]] },
  /* --- Rara Sablon --- */
  { key: "kaos-kerawang-malang-tempo-dulu", seller: "rara", cat: "apparel", name: "Kaos Kerawang Malang Tempo Dulu", price: 135000, short: "Kaos sablon manual motif rumah kuno.", desc: "Kaos katun combed dengan sablon manual motif ventilasi kerawang rumah kuno Klojen.", photos: ["textile", "bag"], added: 148, stock: [1, 7, 5, 0], w: 6, q: 4.7, options: [{ name: "Ukuran", values: ["S", "M", "L", "XL"] }], imageVariants: [["textile", "Ukuran", "M"], ["bag", "Ukuran", "L"]] },
  { key: "kaos-ornamen-ubin-tegel", seller: "rara", cat: "apparel", name: "Kaos Sablon Motif Ubin Tegel", price: 125000, short: "Kaos motif ubin tegel tempo dulu.", desc: "Kaos katun dengan sablon motif ubin tegel rumah lama, tersedia dua warna dan tiga ukuran.", photos: ["textile"], added: 90, stock: [4, 6, 5, 3, 2, 4], w: 4, q: 4.1, options: [{ name: "Ukuran", values: ["M", "L", "XL"] }, { name: "Warna", values: ["Krem", "Hitam"] }] },
  { key: "tote-bag-kanvas-singosari", seller: "rara", cat: "tote-bag", name: "Tote Bag Kanvas Sablon Candi Singosari", price: 65000, short: "Tote bag kanvas tebal sablon Dwarapala.", desc: "Tote bag kanvas tebal dengan ritsleting dan sablon siluet arca Dwarapala Singosari.", photos: ["bag", "textile"], added: 140, stock: 12, w: 6, q: 4.6 },
  { key: "tote-bag-motif-trem", seller: "rara", cat: "tote-bag", name: "Tote Bag Motif Trem Antik", price: 70000, short: "Tote bag sablon trem uap Malang.", desc: "Tote bag kanvas dengan sablon trem uap Malang tempo dulu, tali panjang yang nyaman.", photos: [], added: 55, stock: 14, w: 4, q: 4.5 },
  { key: "pouch-kanvas-motif-ubin", seller: "rara", cat: "tote-bag", name: "Pouch Kanvas Motif Ubin", price: 48000, short: "Pouch kanvas motif ubin.", desc: "Pouch kanvas kecil bermotif ubin, cocok untuk alat tulis atau dompet koin.", photos: ["bag"], added: 100, stock: 5, w: 3, q: 4.4, status: "disembunyikan", statusAgo: 25, note: "Sementara disembunyikan untuk penataan katalog." },
  /* --- Alya Handmade (akun demo kreator) --- */
  { key: "notebook-sampul-kain", seller: "alya", cat: "zine", name: "Notebook Sampul Kain Heritage", price: 32000, short: "Notebook daur ulang sampul kain.", desc: "Notebook kertas daur ulang dengan sampul kain bermotif ubin rumah lama.", photos: [], added: 115, stock: 7, w: 3, q: 4.4 },
  { key: "jurnal-kertas-daur-ulang", seller: "alya", cat: "zine", name: "Jurnal Kertas Daur Ulang Heritage", price: 38000, short: "Jurnal polos kertas daur ulang tebal.", desc: "Jurnal polos berisi 80 halaman kertas daur ulang, dijilid benang manual.", photos: ["paper"], added: 80, stock: 12, w: 4, q: 4.6 },
  { key: "bookmark-kayu-ukir-kayutangan", seller: "alya", cat: "kriya-kayu", name: "Bookmark Kayu Ukir Kayutangan", price: 14000, short: "Pembatas buku kayu ukir ornamen.", desc: "Pembatas buku dari kayu tipis dengan ukiran ornamen jendela heritage Kayutangan.", photos: ["craft"], added: 45, stock: 25, w: 5, q: 4.8 },
  { key: "kartu-pos-bunga-kertas", seller: "alya", cat: "postcard", name: "Kartu Pos Bunga Kertas", price: 14000, short: "Kartu pos bunga kertas warna-warni.", desc: "Kartu pos dengan ilustrasi bunga kertas yang tumbuh di pagar rumah-rumah lama.", photos: ["postcard"], added: 5, stock: 28, w: 4, q: 4.5 },
  { key: "rak-mini-kayu-kampung", seller: "alya", cat: "kriya-kayu", name: "Rak Mini Kayu Kampung", price: 85000, short: "Rak mini kayu sisa produksi.", desc: "Rak mini dari kayu sisa produksi mebel kampung yang belum banyak terjual.", photos: ["craft"], added: 155, stock: 3, noSales: true },
  { key: "baki-kayu-motif-sawah", seller: "alya", cat: "kriya-kayu", name: "Baki Kayu Motif Sawah", price: 72000, short: "Baki kayu koleksi lama motif sawah.", desc: "Baki kayu koleksi lama dengan ukiran motif sawah bertingkat.", photos: [], added: 190, stock: 1, noSales: true },
  { key: "sketsa-gang-ijen-lama", seller: "alya", cat: "postcard", name: "Sketsa Gang Ijen Lama", price: 26000, short: "Produk lama yang sudah ditarik admin.", desc: "Sketsa gang di kawasan Ijen tempo dulu. Ditarik sebagai contoh alur penggantian produk.", photos: [], added: 205, stock: 0, status: "ditarik", statusAgo: 20, note: "Tidak laku selama 6 bulan", noSales: true },
  { key: "poster-matahari-kayutangan", seller: "alya", cat: "postcard", name: "Poster Matahari Kayutangan", price: 42000, short: "Poster ilustrasi matahari sore Kayutangan.", desc: "Poster ilustrasi matahari sore di koridor Kayutangan. Diajukan sebagai pengganti produk yang ditarik.", photos: ["postcard"], added: 2, stock: 9, status: "menunggu", replaces: "sketsa-gang-ijen-lama", noSales: true },
  { key: "stiker-sketsa-alun-alun", seller: "alya", cat: "stiker", name: "Stiker Sketsa Alun-Alun", price: 9000, short: "Set stiker sketsa alun-alun kota.", desc: "Set stiker sketsa alun-alun kota untuk contoh produk yang perlu revisi.", photos: [], added: 4, stock: 20, status: "ditolak", statusAgo: 1, note: "Foto produk dan deskripsi perlu diperjelas sebelum disetujui.", noSales: true },
  /* --- Tanah Dinoyo --- */
  { key: "mug-keramik-glasir-dinoyo", seller: "sinta", cat: "keramik", name: "Mug Keramik Glasir Dinoyo", price: 52000, short: "Mug gerabah glasir hijau botol.", desc: "Mug gerabah dengan glasir hijau botol dan pegangan lebar yang nyaman digenggam.", photos: ["ceramic"], added: 100, stock: 12, w: 5, q: 4.7 },
  { key: "vas-bunga-mini-gerabah", seller: "sinta", cat: "keramik", name: "Vas Bunga Mini Gerabah", price: 58000, short: "Vas mini untuk bunga kering.", desc: "Vas mini dari tanah liat bakar, pas untuk bunga kering di meja kerja.", photos: ["ceramic", "craft"], added: 3, stock: 8, w: 3, q: 4.6 },
  { key: "set-tatakan-keramik", seller: "sinta", cat: "keramik", name: "Set Tatakan Keramik (4 pcs)", price: 85000, short: "Set empat tatakan keramik glasir.", desc: "Satu set empat tatakan keramik bergaris glasir, dikemas dalam kotak kardus daur ulang.", photos: [], added: 25, stock: 10, w: 3, q: 4.5, limited: true },
  { key: "piring-hias-mini-glasir", seller: "sinta", cat: "keramik", name: "Piring Hias Mini Glasir", price: 48000, short: "Piring hias mini untuk pajangan.", desc: "Piring hias mini bermotif flora dengan glasir bening, untuk pajangan atau tempat perhiasan.", photos: ["ceramic"], added: 162, stock: 4, noSales: true, oldSale: 158 },
  { key: "cangkir-cat-air-mini", seller: "sinta", cat: "keramik", name: "Cangkir Cat Air Mini", price: 40000, short: "Cangkir mini lukis cat air.", desc: "Cangkir mini dengan lukisan cat air bunga liar.", photos: [], added: 6, stock: 10, status: "ditolak", statusAgo: 4, note: "Foto produk belum menampilkan detail dari beberapa sisi. Mohon unggah foto tambahan.", noSales: true },
  /* --- Malang Tempo Doeloe --- */
  { key: "zine-peta-malang-lama", seller: "yoga", cat: "zine", name: "Zine Peta Malang Lama", price: 30000, short: "Zine berisi peta-peta Malang lama.", desc: "Kumpulan peta kota Malang dari berbagai tahun lengkap dengan catatan singkat perubahannya.", photos: ["paper"], added: 186, stock: 8, noSales: true },
  { key: "poster-a3-kayutangan-1920", seller: "yoga", cat: "postcard", name: "Poster A3 Kayutangan 1920-an", price: 55000, short: "Poster arsip foto Kayutangan 1920-an.", desc: "Poster ukuran A3 dari restorasi arsip foto koridor Kayutangan tahun 1920-an.", photos: ["art"], added: 60, stock: 15, w: 4, q: 4.7 },
  { key: "stiker-pack-tempo-doeloe", seller: "yoga", cat: "stiker", name: "Stiker Pack Tempo Doeloe", price: 20000, short: "Paket stiker arsip tempo dulu.", desc: "Paket stiker bergaya arsip foto hitam putih tempo dulu.", photos: ["art"], added: 45, stock: 40, w: 5, q: 4.6 },
  { key: "kaos-arek-malang-heritage", seller: "yoga", cat: "apparel", name: "Kaos Arek Malang Edisi Heritage", price: 145000, short: "Kaos katun combed edisi heritage.", desc: "Kaos katun combed 24s dengan sablon plastisol peta lama Malang di bagian dada.", photos: ["textile"], added: 35, stock: [5, 8, 6], w: 4, q: 4.5, options: [{ name: "Ukuran", values: ["S", "M", "L"] }] },
  { key: "kartu-pos-set-alun-alun-tugu", seller: "yoga", cat: "postcard", name: "Kartu Pos Set Alun-Alun Tugu (5 pcs)", price: 55000, short: "Set lima kartu pos alun-alun dan Tugu.", desc: "Set lima kartu pos bergambar alun-alun dan Tugu Malang dari arsip foto lama.", photos: ["postcard", "paper"], added: 1, stock: 15, status: "menunggu", noSales: true },
  /* --- Kayu Kampung Studio (kreator nonaktif) --- */
  { key: "gantungan-kunci-wayang-kayu", seller: "hendra", cat: "kriya-kayu", name: "Gantungan Kunci Wayang Kayu", price: 20000, short: "Gantungan kunci wayang dari kayu jati.", desc: "Gantungan kunci berbentuk wayang kulit mini dari kayu jati sisa.", photos: ["craft"], added: 120, stock: 10, w: 3, q: 4.4 },
  { key: "hiasan-dinding-kayu-jati", seller: "hendra", cat: "kriya-kayu", name: "Hiasan Dinding Kayu Jati", price: 95000, short: "Hiasan dinding ukir kayu jati.", desc: "Hiasan dinding ukir dari kayu jati bermotif sulur, siap digantung.", photos: [], added: 100, stock: 4, w: 2, q: 4.3 },
  /* --- Official Store --- */
  { key: "mug-lukis-tangan-pasar-besar", seller: "official", cat: "keramik", name: "Mug Lukis Tangan Pasar Besar", price: 55000, short: "Mug oleh-oleh lini toko.", desc: "Mug lini toko dengan ilustrasi suasana Pasar Besar Malang dan pegangan nyaman.", photos: ["ceramic", "craft"], added: 200, stock: 18, w: 8, q: 4.7, limited: true },
  { key: "tote-bag-official-kayutangan", seller: "official", cat: "tote-bag", name: "Tote Bag Official Kayutangan", price: 60000, short: "Tote bag kanvas lini toko.", desc: "Tote bag kanvas dengan logo Sesuatu DariKota dan ilustrasi koridor Kayutangan.", photos: ["bag"], added: 170, stock: 20, w: 5, q: 4.5 },
  { key: "paket-kartu-pos-oleh-oleh", seller: "official", cat: "postcard", name: "Paket Kartu Pos Oleh-Oleh Malang (6 pcs)", price: 40000, short: "Paket enam kartu pos pilihan toko.", desc: "Paket enam kartu pos pilihan toko dari berbagai kreator lokal, cocok untuk oleh-oleh.", photos: ["postcard", "paper"], added: 160, stock: 24, w: 6, q: 4.8 },
  { key: "kaos-official-sesuatu-darikota", seller: "official", cat: "apparel", name: "Kaos Official Sesuatu DariKota", price: 120000, short: "Kaos katun lini toko.", desc: "Kaos katun combed dengan sablon logo Sesuatu DariKota di dada.", photos: ["textile"], added: 150, stock: [3, 9, 10, 5], w: 5, q: 4.5, options: [{ name: "Ukuran", values: ["S", "M", "L", "XL"] }] },
  { key: "pin-enamel-logo-sdkm", seller: "official", cat: "pin-enamel", name: "Pin Enamel Logo Sesuatu DariKota", price: 30000, short: "Pin enamel logo toko.", desc: "Pin enamel dengan logo Sesuatu DariKota Malang.", photos: [], added: 140, stock: 18, w: 4, q: 4.4 },
  { key: "stiker-pack-kayutangan-official", seller: "official", cat: "stiker", name: "Stiker Pack Kayutangan Official", price: 15000, short: "Paket stiker kawasan Kayutangan.", desc: "Paket stiker bertema kawasan Kayutangan Heritage dari lini toko.", photos: ["art"], added: 130, stock: 35, w: 6, q: 4.6 },
];

interface StorySpec { title: string; content: string; process: string | null; cover: string | null; proc: string[] }
const STORIES: Record<string, StorySpec> = {
  "kartu-pos-sudut-kayutangan": { title: "Kenangan di Tikungan Kayutangan", content: "Sudut ini selalu ramai saat sore hari. Bangunan lama dan kedai kecilnya menyimpan banyak cerita warga Malang.", process: "Disketsa langsung di lokasi menggunakan pensil 2B, lalu diwarnai dengan cat air di atas kertas cold-pressed.", cover: "postcard", proc: ["workspace", "art"] },
  "zine-cerita-kajoetangan": { title: "Cerita dari Teras Rumah Lama", content: "Zine ini mengumpulkan cerita singkat dari orang-orang yang tumbuh di sekitar koridor Kayutangan.", process: "Wawancara singkat, foto analog, dan sketsa tinta disusun menjadi buku saku.", cover: "paper", proc: ["workspace"] },
  "pin-enamel-trem-antik-malang": { title: "Trem yang Pernah Melintas", content: "Sebelum bus dan angkot, trem uap melintasi jalan-jalan utama Malang. Pin ini mengingatkan kita pada kota yang pernah berjalan pelan.", process: "Desain digambar ulang dari foto arsip, dicetak cetakan logam, lalu diisi enamel keras satu per satu.", cover: "craft", proc: ["craft", "workspace"] },
  "cangkir-keramik-dinoyo": { title: "Tanah dari Kampung Keramik", content: "Dinoyo dikenal sebagai kampung keramik sejak lama. Cangkir ini dibuat dengan cara tradisional agar tetap hangat dipegang.", process: "Tanah liat dibentuk di meja putar, dijemur dua hari, dibakar, lalu diglasir dan dibakar lagi.", cover: "ceramic", proc: ["ceramic"] },
  "kaos-kerawang-malang-tempo-dulu": { title: "Menyelamatkan Ornamen yang Terlupakan", content: "Motif ventilasi rumah lama Klojen dipindahkan ke kain agar tetap mudah dikenali generasi baru.", process: "Klise sablon dibuat manual dan dicetak satu per satu menggunakan tinta yang tahan cuci.", cover: null, proc: ["textile"] },
  "vas-bunga-mini-gerabah": { title: "Rumah Kecil untuk Bunga Kering", content: "Vas mini ini dibuat untuk meja kerja yang sempit, supaya selalu ada sedikit warna di sudut ruangan.", process: "Dibentuk dengan teknik pilin, dihaluskan dengan spons basah, lalu dibakar dua kali.", cover: "ceramic", proc: [] },
  "poster-a3-kayutangan-1920": { title: "Kayutangan Seratus Tahun Lalu", content: "Foto-foto lama koridor Kayutangan dipulihkan supaya kita bisa membayangkan jalan yang sama puluhan tahun lalu.", process: "Arsip dipindai, dibersihkan dari noda dan goresan secara digital, lalu dicetak di kertas matte tebal.", cover: "art", proc: ["art", "workspace"] },
  "kaos-arek-malang-heritage": { title: "Peta di Dada", content: "Peta lama Malang dicetak di bagian dada, supaya penggunanya selalu membawa kota ini ke mana pun pergi.", process: "Peta digambar ulang garis demi garis lalu disablon plastisol di atas katun combed.", cover: "textile", proc: [] },
  "mug-lukis-tangan-pasar-besar": { title: "Pagi di Pasar Besar", content: "Mug ini menangkap suasana pagi Pasar Besar: pedagang menata dagangan sambil menyeduh kopi pertama hari itu.", process: "Setiap mug dilukis tangan dengan cat keramik food-safe, lalu dibakar ulang agar warnanya awet.", cover: "ceramic", proc: ["craft"] },
  "jurnal-kertas-daur-ulang": { title: "Kertas yang Diberi Kesempatan Kedua", content: "Jurnal ini dibuat dari kertas sisa percetakan yang dipilah dan dipres ulang, supaya tidak berakhir jadi sampah.", process: "Kertas direndam, dihancurkan, dicetak ulang di kerangka, dijemur, lalu dijilid benang secara manual.", cover: "paper", proc: ["workspace"] },
  "bookmark-kayu-ukir-kayutangan": { title: "Jendela Kecil di Antara Halaman", content: "Ornamen jendela heritage Kayutangan diperkecil jadi pembatas buku, agar setiap halaman punya sudut kota yang menunggu.", process: "Pola digambar di kayu tipis, diukir dengan pisau kecil, diamplas halus lalu dilapis minyak alami.", cover: "craft", proc: ["craft", "workspace"] },
  "mug-keramik-glasir-dinoyo": { title: "Hijau Botol dari Tungku Dinoyo", content: "Warna hijau botol berasal dari glasir yang diracik sendiri. Setiap mug punya gradasi sedikit berbeda.", process: "Dibentuk di meja putar, dibakar biskuit, dicelup glasir, lalu dibakar lagi pada suhu tinggi.", cover: "ceramic", proc: ["ceramic", "craft"] },
  "tote-bag-kanvas-singosari": { title: "Penjaga dari Singosari", content: "Siluet Dwarapala dipilih karena menjadi penjaga gerbang yang tenang dan kokoh, seperti kanvas yang menopang bawaanmu.", process: "Sablon manual satu warna di atas kanvas tebal, dijemur, lalu difiksasi dengan setrika panas.", cover: "bag", proc: ["textile"] },
};

const COMMENTS_BY_RATING: Record<number, string[]> = {
  5: [
    "Barangnya rapi, detailnya bagus, dan kemasannya aman banget.",
    "Suka banget sama desainnya, persis seperti di foto.",
    "Pickup gampang, tinggal tunjukkan QR. Produknya juga cakep!",
    "Cocok buat oleh-oleh, teman-teman pada suka.",
    "Kualitasnya melebihi ekspektasi untuk harga segini.",
    "Packing rapi dan produk sesuai deskripsi. Pasti beli lagi.",
    "Khas Malang banget, jadi pengingat kampung halaman.",
    "Adminnya ramah dan responsif waktu saya tanya jam pickup.",
    "Hasil cetaknya tajam, warnanya cantik. Recommended!",
    "Bagus banget buat hadiah, penerimanya senang.",
    "Worth it! Kelihatan dibuat dengan niat dari detail kecilnya.",
    "Cerita di balik produknya bikin makin sayang.",
  ],
  4: [
    "Bagus, sesuai deskripsi. Cuma antrean pickup agak lama sedikit.",
    "Produknya oke, warnanya sedikit beda dari foto tapi tetap cantik.",
    "Kualitas baik untuk harganya, kemasan bisa lebih tebal lagi.",
    "Desainnya keren, ukurannya agak lebih kecil dari bayangan saya.",
    "Overall puas, pickup di toko lancar.",
    "Sesuai ekspektasi. Semoga stoknya selalu ada.",
    "Rapi dan bagus, hanya ada sedikit goresan di sudut.",
  ],
  3: ["Lumayan, tapi finishing-nya kurang rapi di beberapa bagian.", "Biasa saja, sesuai harga. Pelayanan toko baik.", "Desain bagus tapi bahannya kurang tebal."],
  2: ["Kurang puas, ada bagian yang lecet waktu saya ambil.", "Warna tidak sesuai foto, agak kecewa."],
  1: ["Produk cacat dan tidak sesuai deskripsi, mohon kualitasnya diperbaiki."],
};
const COMMENT_TAIL: Record<string, string> = {
  postcard: "Kertasnya tebal dan ilustrasinya detail.",
  "pin-enamel": "Enamelnya halus dan pengaitnya kuat.",
  apparel: "Bahan adem, sablonnya awet dicuci.",
  stiker: "Tahan air dan nempelnya kuat.",
  "kriya-kayu": "Kayunya halus dan wangi alami.",
  "tote-bag": "Kanvasnya tebal, muat banyak.",
  keramik: "Glasirnya cantik dan nyaman dipegang.",
  zine: "Isinya menarik, enak dibaca santai.",
};
const HIDDEN_REVIEW_TEXTS: Array<[number, string]> = [
  [1, "Dasar toko abal-abal, admin sombong!! pelayanan sampah"],
  [1, "Mau jual followers murah? hubungi WA 0812xxxx saya aja"],
  [2, "Kunjungi situs belanja murah saya di link bio ya kak"],
  [1, "Barangnya jelek banget, penipu semua isi toko ini!!!"],
  [2, "test test ulasan"],
];
const STORE_REVIEW_TEXTS = [
  "Toko kecil yang kurasinya terasa personal. Banyak produk unik untuk oleh-oleh.",
  "Pickup mudah dan adminnya responsif saat saya bertanya lewat WhatsApp.",
  "Suka konsep konsinyasi kreator lokalnya, jadi tahu siapa yang membuat tiap barang.",
  "Lokasinya enak di Kayutangan, sekalian jalan-jalan. Produknya beragam.",
  "Sistem reservasi online-nya memudahkan, tidak takut kehabisan barang.",
  "Tempatnya nyaman dan stafnya ramah. Bakal balik lagi bawa teman.",
  "Kualitas produk konsisten dan packing selalu rapi.",
  "Pembayarannya fleksibel, bisa Midtrans atau bayar di toko.",
  "Pilihan oleh-oleh khas Malang yang tidak pasaran.",
  "Senang bisa mendukung kreator lokal lewat aplikasi ini.",
  "Admin sabar menjelaskan jadwal libur dan pickup.",
  "Aplikasinya simpel, tinggal pilih jam ambil. Mantap!",
];
const FIRST_NAMES = ["Ayu", "Bima", "Citra", "Dewi", "Eko", "Fitri", "Gilang", "Hana", "Indra", "Jihan", "Kevin", "Laras", "Maya", "Nanda", "Oki", "Putri", "Rangga", "Salsa", "Tegar", "Umi", "Vina", "Wahyu", "Yusuf", "Zahra", "Aldi", "Bella", "Candra", "Dian", "Erwin", "Farah", "Galih", "Hesti", "Ilham", "Jessica"];
const LAST_NAMES = ["Pratama", "Wijaya", "Lestari", "Saputra", "Ramadhan", "Kusuma", "Santoso", "Hidayat", "Nugraha", "Anggraini", "Utami", "Firmansyah", "Setiawan", "Maharani", "Permana"];

/* ========================================================================== */
/* 2. TIPE & STATE DALAM MEMORI                                                */
/* ========================================================================== */

type Method = "midtrans" | "cod";
type OStatus = "menunggu_bayar" | "lunas" | "selesai" | "dibatalkan" | "kedaluwarsa" | "lewat_batas_pengambilan";
type Outcome = "selesai" | "lunas" | "cod_lunas" | "menunggu" | "kedaluwarsa" | "batal_unpaid" | "batal_refund" | "lewat_batas";
type CancelWhy = "permintaan_pembeli" | "kesalahan_toko";
type NType = "pengajuan_diterima" | "pengajuan_ditolak" | "ulasan_baru" | "pesanan_update" | "umum" | "stok_menipis" | "produk_mendekati_batas" | "produk_ditarik" | "produk_disetujui" | "produk_ditolak" | "produk_disembunyikan" | "libur_terdampak" | "laporan_final";

interface UserRec { id: string; key: string; name: string; email: string; role: "buyer" | "creator" | "admin"; avatarUrl: string | null; createdAt: Date; weight: number }
interface CreatorRec { spec: CreatorSpec; user: UserRec; artisanId: string; joinedAt: Date; deactivatedAt: Date | null }
interface VariantRec { id: string; combination: string[]; avail: number; raw: number }
interface ProductRec {
  spec: ProductSpec; id: string; createdAt: Date; updatedAt: Date; categoryId: string; artisanId: string; creator: CreatorRec | null;
  variants: VariantRec[]; statusAt: Date | null; assigned: number; soldCount: number; slowWarnedAt: Date | null; lowStockNotifiedAt: Date | null;
}
interface OrderRec {
  id: string; itemId: string; number: string; user: UserRec; product: ProductRec; variant: VariantRec; method: Method; status: OStatus;
  price: number; createdAt: Date; updatedAt: Date; pickupDate: string; slot: string; holdExpiresAt: Date; holdExt: number; pickupDeadline: Date | null;
  refundStatus: "tidak_ada" | "menunggu" | "selesai"; refundedAt: Date | null; cancelReason: CancelWhy | null; completedAt: Date | null;
  payment: { status: string; paidAt: Date | null; token: string } | null; paidAt: Date | null; cancelledAt: Date | null; adminLunasAt: Date | null;
  adminNotified: boolean; noReview: boolean;
}
interface NotifRow { userId: string; type: NType; title: string; body: string; at: Date }

// Konfigurasi runtime (diisi di runSeed)
let WEEKLY_OFF = 7;
let HOLIDAYS: Array<{ id: string; start: string; end: string; reason: string }> = [];
let SLOTS: Array<{ time: string; capacity: number; active: boolean }> = [];
const slotLoad = new Map<string, number>();
const orderNumbers = new Set<string>();
let orderSeq = 0;

const isClosed = (ds: string): boolean => isoWeekday(ds) === WEEKLY_OFF || HOLIDAYS.some((h) => h.start <= ds && h.end >= ds);
function nextOpen(ds: string): string {
  let d = ds;
  for (let i = 0; i < 40 && isClosed(d); i++) d = addDays(d, 1);
  return d;
}
const slotKey = (date: string, slot: string): string => `${date}|${slot}`;
const slotCapacity = (slot: string): number => SLOTS.find((s) => s.time === slot && s.active)?.capacity ?? 0;
const slotFree = (date: string, slot: string): boolean => (slotLoad.get(slotKey(date, slot)) ?? 0) < slotCapacity(slot);
const activeSlotTimes = (): string[] => SLOTS.filter((s) => s.active).map((s) => s.time);
const SLOT_WEIGHT: Record<string, number> = { "09:00": 1, "10:00": 2, "11:00": 3, "13:00": 3, "13:30": 2, "14:00": 3, "15:00": 3, "16:00": 3, "17:00": 2, "18:00": 1 };

function newOrderNumber(): string {
  for (let i = 0; i < 50; i++) {
    const n = `SDK-${rint(1000, 9999)}`;
    if (!orderNumbers.has(n)) { orderNumbers.add(n); return n; }
  }
  throw new Error("Gagal membuat nomor pesanan unik");
}
const hex = (n: number): string => Array.from({ length: n }, () => rint(0, 15).toString(16)).join("");
const uuidLike = (): string => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

/** Perpanjangan hold (menit) agar hold COD mencakup jam pickup; null bila melebihi batas 2 hari. */
function codExt(created: Date, slotStart: Date): number | null {
  const need = Math.ceil((slotStart.getTime() - created.getTime()) / MIN) + 80; // margin: pengambilan bisa molor ±70 menit
  if (need <= 1440) return 0;
  const ext = Math.ceil((need - 1440) / 360) * 360;
  return ext <= 1440 ? ext : null;
}

/**
 * Cari tanggal+slot pickup yang masih kosong, mulai `lead` hari dari tanggal createdAt.
 * `past=true` -> hanya slot yang sudah lewat (untuk pesanan yang sudah selesai diambil).
 */
function findPickup(created: Date, lead: number, method: Method, exactDate?: string, past = false): { date: string; slot: string; ext: number } | null {
  const okSlot = (d: string, sl: string): boolean => {
    if (!slotFree(d, sl)) return false;
    const start = wibAt(d, sl);
    if (start.getTime() < created.getTime() + 45 * MIN) return false;
    if (past && start.getTime() + 25 * MIN >= NOW.getTime()) return false;
    return method === "midtrans" || codExt(created, start) !== null;
  };
  const choose = (d: string): { date: string; slot: string; ext: number } | null => {
    const cands = activeSlotTimes().filter((sl) => okSlot(d, sl));
    if (!cands.length) return null;
    const sl = weightedPick(cands, (c) => SLOT_WEIGHT[c] ?? 1)!;
    return { date: d, slot: sl, ext: method === "cod" ? codExt(created, wibAt(d, sl)) ?? 0 : 0 };
  };
  if (exactDate) return choose(exactDate);
  if (past) {
    const target = nextOpen(addDays(wibDate(created), lead));
    const days: string[] = [];
    let d = nextOpen(wibDate(created));
    for (let i = 0; i < 12 && d <= TODAY; i++) { days.push(d); d = nextOpen(addDays(d, 1)); }
    const dist = (x: string): number => Math.abs(new Date(`${x}T00:00:00Z`).getTime() - new Date(`${target}T00:00:00Z`).getTime());
    for (const x of days.sort((m, n) => dist(m) - dist(n))) {
      const r = choose(x);
      if (r) return r;
    }
    return null;
  }
  let d = nextOpen(addDays(wibDate(created), lead));
  for (let tries = 0; tries < 6; tries++) {
    const r = choose(d);
    if (r) return r;
    d = nextOpen(addDays(d, 1));
  }
  return null;
}

interface BuildSpec {
  user: UserRec; product: ProductRec; variant: VariantRec; method: Method; outcome: Outcome; createdAt: Date;
  date: string; slot: string; ext?: number; reason?: CancelWhy; refund?: "menunggu" | "selesai"; adminNotified?: boolean; noReview?: boolean;
}

/** Membangun satu pesanan yang KONSISTEN dengan aturan backend (hold, deadline, refund, kapasitas slot). */
function buildOrder(s: BuildSpec): OrderRec {
  const t = s.createdAt;
  const mid = s.method === "midtrans";
  const fail = (m: string): never => { throw new Error(`Pesanan tidak konsisten [${s.outcome}/${s.method}/${s.date} ${s.slot}]: ${m}`); };
  if (t.getTime() > NOW.getTime()) fail("createdAt di masa depan");
  const slotStart = wibAt(s.date, s.slot);
  const ext = mid ? 0 : s.ext ?? 0;
  const holdExpiresAt = plusMin(t, mid ? 60 : 1440 + ext);
  const deadline = new Date(dateOnly(s.date).getTime() + DEADLINE_DAYS * DAY);
  const paidAt = mid ? plusMin(t, rint(2, 9)) : null;
  const o: OrderRec = {
    id: `seed-order-${++orderSeq}`, itemId: `seed-item-${orderSeq}`, number: "", user: s.user, product: s.product, variant: s.variant, method: s.method,
    status: "menunggu_bayar", price: s.product.spec.price, createdAt: t, updatedAt: t, pickupDate: s.date, slot: s.slot, holdExpiresAt, holdExt: ext,
    pickupDeadline: mid ? deadline : null, refundStatus: "tidak_ada", refundedAt: null, cancelReason: null, completedAt: null, payment: null, paidAt: null,
    cancelledAt: null, adminLunasAt: null, adminNotified: s.adminNotified ?? false, noReview: s.noReview ?? false,
  };
  const settle = (): void => { o.paidAt = paidAt; o.payment = { status: "settlement", paidAt, token: uuidLike() }; };
  let counted = false;
  switch (s.outcome) {
    case "selesai": {
      if (slotStart.getTime() + 5 * MIN >= NOW.getTime()) fail("slot belum lewat");
      const done = new Date(Math.min(NOW.getTime() - MIN, slotStart.getTime() + rint(5, 70) * MIN));
      if (done.getTime() <= t.getTime()) fail("completedAt sebelum createdAt");
      if (!mid && done.getTime() > holdExpiresAt.getTime()) fail("COD selesai setelah hold habis");
      o.status = "selesai"; o.completedAt = done; o.updatedAt = done;
      if (mid) settle();
      counted = true;
      break;
    }
    case "lunas": {
      if (!mid) fail("lunas hanya untuk Midtrans");
      if (deadline.getTime() <= NOW.getTime()) fail("batas pengambilan sudah lewat");
      o.status = "lunas"; settle(); o.updatedAt = paidAt!;
      counted = true;
      break;
    }
    case "cod_lunas": {
      if (mid) fail("cod_lunas hanya untuk COD");
      const at = new Date(Math.min(plusMin(t, rint(60, 480)).getTime(), holdExpiresAt.getTime() - 5 * MIN, NOW.getTime() - 2 * MIN));
      o.status = "lunas"; o.adminLunasAt = at; o.updatedAt = at; o.pickupDeadline = deadline; o.adminNotified = true;
      counted = true;
      break;
    }
    case "menunggu": {
      if (mid && NOW.getTime() - t.getTime() > 50 * MIN) fail("Midtrans menunggu harus dibuat <50 menit lalu");
      if (!mid && holdExpiresAt.getTime() <= NOW.getTime()) fail("hold COD sudah habis");
      o.payment = mid ? { status: "pending", paidAt: null, token: uuidLike() } : null;
      counted = true;
      break;
    }
    case "kedaluwarsa": {
      if (holdExpiresAt.getTime() >= NOW.getTime()) fail("hold belum habis");
      o.status = "kedaluwarsa"; o.updatedAt = holdExpiresAt;
      if (mid) o.payment = { status: "expire", paidAt: null, token: uuidLike() };
      break;
    }
    case "batal_unpaid": {
      if (mid) fail("batal_unpaid hanya untuk COD");
      const at = plusMin(t, rint(20, 600));
      if (at.getTime() >= Math.min(holdExpiresAt.getTime(), NOW.getTime() - 2 * MIN)) fail("pembatalan di luar masa hold");
      o.status = "dibatalkan"; o.cancelledAt = at; o.updatedAt = at; o.adminNotified = true;
      break;
    }
    case "batal_refund": {
      if (!mid) fail("batal_refund hanya untuk Midtrans");
      settle();
      let why: CancelWhy = s.reason ?? (chance(0.55) ? "permintaan_pembeli" : "kesalahan_toko");
      const gap = (slotStart.getTime() - paidAt!.getTime()) / MIN;
      if (why === "permintaan_pembeli" && gap < 120) why = "kesalahan_toko";
      const span = why === "permintaan_pembeli" ? Math.min(60 * 60, gap - 30) : 70 * 60;
      let at = plusMin(paidAt!, rint(20, Math.max(25, Math.floor(span))));
      at = new Date(Math.min(at.getTime(), NOW.getTime() - 2 * MIN));
      if (at.getTime() <= paidAt!.getTime() + 5 * MIN) fail("pembatalan terlalu dekat dengan pembayaran");
      const done = s.refund ? s.refund === "selesai" : NOW.getTime() - at.getTime() > 3.5 * DAY;
      o.status = "dibatalkan"; o.cancelReason = why; o.cancelledAt = at; o.updatedAt = at;
      if (done) {
        const ref = new Date(Math.min(at.getTime() + rint(120, 2400) * MIN, NOW.getTime() - MIN));
        o.refundStatus = "selesai"; o.refundedAt = ref; o.updatedAt = ref;
      } else o.refundStatus = "menunggu";
      break;
    }
    case "lewat_batas": {
      if (!mid) fail("lewat_batas hanya untuk Midtrans");
      if (deadline.getTime() >= NOW.getTime()) fail("batas pengambilan belum lewat");
      o.status = "lewat_batas_pengambilan"; settle(); o.updatedAt = deadline;
      break;
    }
  }
  if (counted) {
    const k = slotKey(s.date, s.slot);
    if ((slotLoad.get(k) ?? 0) >= slotCapacity(s.slot)) fail("kapasitas slot penuh");
    slotLoad.set(k, (slotLoad.get(k) ?? 0) + 1);
  }
  o.number = newOrderNumber();
  return o;
}

/* ========================================================================== */
/* 3. SEEDER UTAMA                                                             */
/* ========================================================================== */

export interface SeedSummary {
  users: number; creators: number; products: number; orders: number; reviews: number; notifications: number;
  stockMovements: number; reports: number; accounts: Array<{ role: string; email: string }>;
}

async function insertChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>, size = 400): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function runSeed(prisma: PrismaClient): Promise<SeedSummary> {
  if (process.env.NODE_ENV === "production") throw new Error("Seed ditolak: jangan jalankan seeder di lingkungan production.");
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminRawPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminRawPassword) throw new Error("Seed ditolak: SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib didefinisikan di environment.");
  const demoRawPassword = process.env.SEED_DEMO_PASSWORD || adminRawPassword;
  const demoAdminEmail = process.env.SEED_DEMO_ADMIN_EMAIL || "demo.admin@sesuatu.test";
  const buyerEmail = process.env.SEED_BUYER_EMAIL || "buyer@test.com";
  const demoCreatorEmail = process.env.SEED_DEMO_CREATOR_EMAIL || "demo.creator@sesuatu.test";

  // reset state modul supaya runSeed aman dipanggil lebih dari sekali
  rand = mulberry32(20261111);
  slotLoad.clear(); orderNumbers.clear(); orderSeq = 0;
  console.log("Menyiapkan data demo SDKM (database akan DIRESET)...");

  const [adminHash, demoHash] = await Promise.all([bcrypt.hash(adminRawPassword, 10), bcrypt.hash(demoRawPassword, 10)]);

  /* ---------- 3.1 reset ---------- */
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.order.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.productStory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productVariantOption.deleteMany();
  await prisma.product.deleteMany();
  await prisma.artisanApplication.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.artisan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.pickupHoliday.deleteMany();
  await prisma.pickupSlot.deleteMany();
  await prisma.monthlyReport.deleteMany();
  await prisma.appSettings.deleteMany();

  /* ---------- 3.2 pengaturan, slot, libur ---------- */
  const todayIso = isoWeekday(TODAY);
  WEEKLY_OFF = Number(process.env.SEED_WEEKLY_OFF_DAY) || (todayIso === 7 ? 1 : 7);
  if (WEEKLY_OFF === todayIso) WEEKLY_OFF = (WEEKLY_OFF % 7) + 1; // jangan menutup toko di hari seeder dijalankan

  SLOTS = [
    { time: "09:00", capacity: 4, active: true }, { time: "10:00", capacity: 4, active: true }, { time: "11:00", capacity: 4, active: true },
    { time: "12:00", capacity: 2, active: false }, { time: "13:00", capacity: 3, active: true }, { time: "13:30", capacity: 3, active: true },
    { time: "14:00", capacity: 3, active: true }, { time: "15:00", capacity: 4, active: true }, { time: "16:00", capacity: 4, active: true },
    { time: "17:00", capacity: 3, active: true }, { time: "18:00", capacity: 3, active: true },
  ];
  const openDay = (offset: number): string => { let d = addDays(TODAY, offset); while (isoWeekday(d) === WEEKLY_OFF) d = addDays(d, 1); return d; };
  const h1 = openDay(6);
  const h2s = openDay(12);
  const h2e = addDays(h2s, 2);
  const h3 = openDay(22);
  HOLIDAYS = [
    { id: "seed-holiday-1", start: h1, end: h1, reason: "Persiapan bazar komunitas Kayutangan" },
    { id: "seed-holiday-2", start: h2s, end: h2e, reason: "Festival Kayutangan Heritage, toko tutup untuk kegiatan komunitas" },
    { id: "seed-holiday-3", start: h3, end: h3, reason: "Inventarisasi stok dan penataan ulang toko" },
  ];

  await prisma.appSettings.create({ data: { id: 1, holdDurationMinutes: 1440, autoCancelEnabled: true, pickupDeadlineDays: DEADLINE_DAYS, refundWindowDays: 3, pickupOpenTime: "09:00", pickupCloseTime: "19:00", pickupLeadMinutes: LEAD_MINUTES, whatsappAdminNumber: "+6281234567890", notificationEmail: "admin@sesuatudarikota.com", lowStockThreshold: 5, defaultCreatorSharePercent: 70, weeklyOffEnabled: true, weeklyOffDays: [WEEKLY_OFF] } });
  await prisma.pickupSlot.createMany({ data: SLOTS.map((s) => ({ time: s.time, capacity: s.capacity, isActive: s.active, createdAt: agoDate(200), updatedAt: agoDate(30) })) });
  const catId: Record<string, string> = {};
  for (const [i, [slug, name, blurb, iconName]] of CATEGORIES.entries()) {
    await prisma.category.create({ data: { id: slug, slug, name, blurb, iconName, sortOrder: i + 1 } });
    catId[slug] = slug;
  }

  /* ---------- 3.3 pengguna: admin, kreator, pembeli ---------- */
  const users: UserRec[] = [];
  const userRows: Prisma.UserCreateManyInput[] = [];
  const addUser = (key: string, name: string, email: string, role: UserRec["role"], avatar: string | null, createdAt: Date, weight = 0, hash = demoHash): UserRec => {
    const u: UserRec = { id: `seed-user-${key}`, key, name, email, role, avatarUrl: avatar ? IMG[avatar] : null, createdAt, weight };
    users.push(u);
    userRows.push({ id: u.id, name, email, role, passwordHash: hash, authProvider: "email", avatarUrl: u.avatarUrl, createdAt, updatedAt: createdAt });
    return u;
  };
  const admin = addUser("admin", "Admin Sesuatu DariKota", adminEmail, "admin", "portraitTwo", agoDate(245), 0, adminHash);
  const demoAdmin = addUser("demo-admin", "Admin Demo SDKM", demoAdminEmail, "admin", "portraitTwo", agoDate(200));

  const creators: CreatorRec[] = [];
  for (const spec of creatorSpecs(demoCreatorEmail)) {
    const joinedAt = agoDate(spec.joinedAgo);
    const user = addUser(spec.key, spec.name, spec.email, "creator", spec.userAvatar, agoDate(spec.joinedAgo + 12));
    creators.push({ spec, user, artisanId: `seed-artisan-${spec.key}`, joinedAt, deactivatedAt: spec.deactivatedAgo ? agoDate(spec.deactivatedAgo) : null });
  }
  const creatorByKey = new Map(creators.map((c) => [c.spec.key, c]));

  // pembeli bernama (akun demo) + pembeli generik
  const budi = addUser("budi", "Budi Santoso", buyerEmail, "buyer", "portrait", agoDate(175), 1.6);
  const sari = addUser("sari", "Sari Wulandari", "sari.demo@sesuatudarikota.test", "buyer", null, agoDate(172), 1.4);
  const rizal = addUser("rizal", "Rizal Mahendra", "rizal.demo@sesuatudarikota.test", "buyer", "portraitThree", agoDate(170), 1.4);
  const nadia = addUser("nadia", "Nadia Permata", "calon.kreator@sesuatudarikota.test", "buyer", null, agoDate(60), 1);
  const fajar = addUser("fajar", "Fajar Kurniawan", "fajar.demo@sesuatudarikota.test", "buyer", "portrait", agoDate(44), 1);
  const salsa = addUser("salsa", "Salsa Rahmadani", "salsa.demo@sesuatudarikota.test", "buyer", null, agoDate(30), 1);
  const generated: UserRec[] = [];
  const usedEmails = new Set(users.map((u) => u.email));
  for (let i = 0; i < FIRST_NAMES.length; i++) {
    const first = FIRST_NAMES[i];
    const last = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length];
    let email = `${first}.${last}`.toLowerCase() + "@sesuatudarikota.test";
    if (usedEmails.has(email)) email = `${first}.${last}${i}`.toLowerCase() + "@sesuatudarikota.test";
    usedEmails.add(email);
    const ago = Math.max(4, Math.round(168 - i * 4.9 + rint(-3, 3)));
    const avatar = chance(0.3) ? pick(["portrait", "portraitTwo", "portraitThree"]) : null;
    generated.push(addUser(`b${i + 1}`, `${first} ${last}`, email, "buyer", avatar, agoDate(ago), pick([1, 1, 1, 2, 2, 3])));
  }
  // akun benar-benar baru (sengaja tanpa aktivitas) untuk mendemokan kondisi "akun baru"
  const newcomers = [
    addUser("baru-1", "Tiara Anindya", "tiara.baru@sesuatudarikota.test", "buyer", null, agoDate(1.2)),
    addUser("baru-2", "Dimas Aryo", "dimas.baru@sesuatudarikota.test", "buyer", null, agoDate(2.4)),
  ];
  const namedBuyers = [budi, sari, rizal];
  const allBuyers = users.filter((u) => u.role === "buyer");

  /* ---------- 3.4 produk, varian, cerita ---------- */
  const catIdOf = (slug: string): string => catId[slug];
  const products: ProductRec[] = [];
  const productByKey = new Map<string, ProductRec>();
  for (const spec of PRODUCTS) {
    const creator = spec.seller === "official" ? null : creatorByKey.get(spec.seller)!;
    const created = agoDate(spec.added);
    const minCreated = creator ? creator.joinedAt.getTime() + 2 * DAY : agoDate(240).getTime();
    const createdAt = new Date(Math.max(created.getTime(), minCreated > NOW.getTime() ? created.getTime() : minCreated));
    const combos = (spec.options ?? []).reduce<string[][]>((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
    const p: ProductRec = {
      spec, id: `seed-product-${spec.key}`, createdAt, updatedAt: createdAt, categoryId: catIdOf(spec.cat), artisanId: creator ? creator.artisanId : "", creator,
      variants: combos.map((c, i) => ({ id: `seed-variant-${spec.key}-${i}`, combination: c, avail: Array.isArray(spec.stock) ? spec.stock[i] : spec.stock, raw: 0 })),
      statusAt: spec.statusAgo !== undefined ? agoDate(spec.statusAgo) : null, assigned: 0, soldCount: 0, slowWarnedAt: null, lowStockNotifiedAt: null,
    };
    if (p.statusAt && p.statusAt.getTime() < createdAt.getTime()) p.statusAt = new Date(createdAt.getTime() + 6 * HOUR);
    if (p.statusAt) p.updatedAt = p.statusAt;
    products.push(p);
    productByKey.set(spec.key, p);
  }

  /* ---------- 3.5 artisan + Official Store ---------- */
  const official = (await ensureOfficialStore(prisma)).artisan;
  await prisma.artisan.update({ where: { id: official.id }, data: { createdAt: agoDate(240), avatarUrl: null } });
  for (const p of products) if (!p.creator) p.artisanId = official.id;
  const artisanRows: Prisma.ArtisanCreateManyInput[] = creators.map((c) => ({
    id: c.artisanId, userId: c.user.id, brandName: c.spec.brand, brandKey: normalizeBrandKey(c.spec.brand), bio: c.spec.bio,
    avatarUrl: c.spec.shopAvatar ? IMG[c.spec.shopAvatar] : null, status: c.spec.status, isOfficial: false, creatorSharePercent: c.spec.share,
    createdAt: c.joinedAt, updatedAt: c.deactivatedAt ?? c.joinedAt,
  }));

  /* ---------- 3.6 pengajuan kreator ---------- */
  const appRows: Prisma.ArtisanApplicationCreateManyInput[] = [];
  const notifs: NotifRow[] = [];
  const notify = (userId: string, type: NType, title: string, body: string, at: Date): void => { notifs.push({ userId, type, title, body, at }); };
  creators.forEach((c, i) => {
    const decidedAt = c.joinedAt;
    appRows.push({ id: `seed-application-creator-${c.spec.key}`, userId: c.user.id, applicantName: c.spec.name, contact: c.spec.phone, brandName: c.spec.brand, categoryId: catIdOf(c.spec.appCat), description: c.spec.appDesc, samplePhotos: urls(i % 2 === 0 ? ["postcard", "paper"] : ["craft"]), status: "diterima", submittedAt: new Date(decidedAt.getTime() - 3 * DAY), decidedAt });
    notify(c.user.id, "pengajuan_diterima", "Pengajuan Konsinyasi Diterima", `Selamat! Pengajuan brand "${c.spec.brand}" kamu telah disetujui. Sekarang kamu dapat mengakses Dashboard Kreator dan mulai mengelola produkmu.`, decidedAt);
  });
  const pendingApps: Array<[UserRec, string, string, string, string[], number]> = [
    [budi, "Budi Kayu", "kriya-kayu", "Pengajuan demo milik akun buyer utama untuk mencoba halaman status pengajuan. Saya membuat gantungan dan hiasan kayu kecil.", ["craft"], 3],
    [nadia, "Nadia Keramik", "keramik", "Saya membuat keramik kecil dengan motif flora dari halaman rumah di Malang.", ["ceramic", "craft"], 2],
    [fajar, "Fajar Print Studio", "apparel", "Sablon kaos dengan desain bangunan tua Malang, produksi kecil per batch 20 pcs.", ["textile"], 1.5],
    [salsa, "Salsa Anyaman", "tote-bag", "Tas dan pouch anyaman kain perca dari sisa konveksi rumahan.", [], 0.8],
  ];
  for (const [u, brand, cat, desc, ph, ago] of pendingApps) {
    appRows.push({ id: `seed-application-pending-${u.key}`, userId: u.id, applicantName: u.name, contact: `0812${rint(10000000, 99999999)}`, brandName: brand, categoryId: catIdOf(cat), description: desc, samplePhotos: urls(ph), status: "pending", submittedAt: agoDate(ago) });
  }
  const rejectedApps: Array<[UserRec, string, string, string, string, number]> = [
    [rizal, "Rizal Print", "zine", "Saya ingin menitipkan produk cetak dan poster ilustrasi.", "Mohon tambahkan foto proses dan contoh kemasan produk.", 20],
    [generated[1], "Bima Poster", "postcard", "Poster dan kartu pos bergaya vintage dari foto internet.", "Karya masih menyerupai ilustrasi yang sudah ada di katalog. Silakan ajukan ulang dengan karya orisinal.", 45],
  ];
  for (const [u, brand, cat, desc, reason, ago] of rejectedApps) {
    const decided = agoDate(ago);
    appRows.push({ id: `seed-application-rejected-${u.key}`, userId: u.id, applicantName: u.name, contact: `0813${rint(10000000, 99999999)}`, brandName: brand, categoryId: catIdOf(cat), description: desc, samplePhotos: [], status: "ditolak", rejectReason: reason, submittedAt: new Date(decided.getTime() - 3 * DAY), decidedAt: decided });
    notify(u.id, "pengajuan_ditolak", "Status Pengajuan Konsinyasi", `Pengajuan brand "${brand}" kamu belum disetujui. Alasan: ${reason}`, decided);
  }

  /* ---------- 3.7 simulasi pesanan ---------- */
  const orders: OrderRec[] = [];
  const eligibleAt = (t: Date): ProductRec[] => products.filter((p) => {
    const sp = p.spec;
    if (sp.noSales || sp.status === "menunggu" || sp.status === "ditolak" || sp.status === "ditarik") return false;
    if (sp.status === "disembunyikan" && p.statusAt && t.getTime() >= p.statusAt.getTime()) return false;
    if (p.creator?.deactivatedAt && t.getTime() >= p.creator.deactivatedAt.getTime()) return false;
    if (sp.cap !== undefined && p.assigned >= sp.cap) return false;
    return t.getTime() >= p.createdAt.getTime() + DAY;
  });
  const pickBuyer = (t: Date, exclude?: Set<string>): UserRec | null => weightedPick(allBuyers.filter((u) => u.weight > 0 && u.createdAt.getTime() <= t.getTime() - 2 * HOUR && !exclude?.has(u.id)), (u) => u.weight);
  const pickVariant = (p: ProductRec): VariantRec => pick(p.variants);
  const register = (o: OrderRec): OrderRec => { o.product.assigned++; orders.push(o); return o; };

  const decideOutcome = (t: Date, method: Method, date: string, slot: string, ext: number): Outcome => {
    const slotStart = wibAt(date, slot);
    const passed = slotStart.getTime() + 20 * MIN < NOW.getTime();
    const age = NOW.getTime() - t.getTime();
    const deadlinePassed = dateOnly(date).getTime() + DEADLINE_DAYS * DAY < NOW.getTime();
    if (method === "midtrans") {
      if (age < 70 * MIN) return "lunas";
      const r = rand();
      if (r < 0.05) return "kedaluwarsa";
      if (r < 0.1) return "batal_refund";
      if (!passed) return "lunas";
      if (chance(0.04)) return deadlinePassed ? "lewat_batas" : "lunas";
      return "selesai";
    }
    const holdEnd = t.getTime() + (1440 + ext) * MIN;
    if (holdEnd > NOW.getTime()) return passed && chance(0.85) ? "selesai" : "menunggu";
    const r = rand();
    if (r < 0.14) return "kedaluwarsa";
    if (r < 0.2) return "batal_unpaid";
    return passed ? "selesai" : "kedaluwarsa";
  };

  const dayCount = (d: number): number => {
    const ds = addDays(TODAY, -d);
    const lam = 0.5 + 3.3 * Math.pow(1 - d / HIST_DAYS, 1.2);
    const wd = isoWeekday(ds);
    const boost = wd >= 5 ? 1.35 : wd === 1 ? 0.8 : 1;
    let n = Math.round(lam * boost * (0.6 + 0.8 * rand()));
    if (d <= 7) n = Math.max(n, 3);
    return n;
  };

  for (let d = HIST_DAYS; d >= 0; d--) {
    const ds = addDays(TODAY, -d);
    const n = dayCount(d);
    for (let k = 0; k < n; k++) {
      const t = randomTimeOnDay(ds);
      const product = weightedPick(eligibleAt(t), (p) => (p.spec.w ?? 2) * (t.getTime() - p.createdAt.getTime() < 14 * DAY ? 1.6 : 1));
      const user = pickBuyer(t);
      if (!product || !user) continue;
      let method: Method = chance(0.62) ? "midtrans" : "cod";
      let pk = findPickup(t, method === "cod" ? (chance(0.45) ? 0 : 1) : weightedPick([0, 1, 2, 3, 4, 6], (x) => [15, 30, 25, 15, 8, 7][[0, 1, 2, 3, 4, 6].indexOf(x)])!, method);
      if (!pk && method === "cod") { method = "midtrans"; pk = findPickup(t, 1, method); }
      if (!pk) continue;
      const outcome = decideOutcome(t, method, pk.date, pk.slot, pk.ext);
      register(buildOrder({ user, product, variant: pickVariant(product), method, outcome, createdAt: t, date: pk.date, slot: pk.slot, ext: pk.ext, adminNotified: outcome === "selesai" && chance(0.35) }));
    }
  }

  /* ---------- 3.8 skenario terarah (jaminan halaman tidak kosong) ---------- */
  const randomProduct = (t: Date): ProductRec => weightedPick(eligibleAt(t), (p) => p.spec.w ?? 2) ?? products[0];
  const mk = (o: { user?: UserRec; product?: ProductRec | string; method: Method; outcome: Outcome; created: Date; lead?: number; date?: string; slot?: string; reason?: CancelWhy; refund?: "menunggu" | "selesai"; noReview?: boolean; adminNotified?: boolean }): OrderRec | null => {
    const product = typeof o.product === "string" ? productByKey.get(o.product)! : o.product ?? randomProduct(o.created);
    const user = o.user ?? pickBuyer(o.created);
    if (!user) throw new Error(`Skenario ${o.outcome}: tidak ada pembeli yang sudah terdaftar pada ${o.created.toISOString()}`);
    let ext = 0;
    let date = o.date;
    let slot = o.slot;
    if (!date || !slot) {
      let pk: { date: string; slot: string; ext: number } | null = null;
      if (o.outcome === "selesai") pk = findPickup(o.created, o.lead ?? 1, o.method, undefined, true);
      else for (const L of o.method === "cod" ? [o.lead ?? 1, 0, 1, 2] : [o.lead ?? 1, 0, 2]) { pk = findPickup(o.created, L, o.method, o.date); if (pk) break; }
      if (!pk) return null; // tidak ada slot yang cocok pada waktu seeder dijalankan (mis. tengah malam) -> lewati skenario
      date = pk.date; slot = pk.slot; ext = pk.ext;
    } else if (o.method === "cod") ext = codExt(o.created, wibAt(date, slot)) ?? 0;
    if (o.method === "cod" && o.outcome === "menunggu") {
      // hold harus masih berjalan saat ini; perpanjang bila perlu (maks. total 2 hari)
      const alive = Math.ceil((NOW.getTime() - o.created.getTime()) / MIN) + 90;
      if (1440 + ext < alive) {
        const e2 = Math.ceil((alive - 1440) / 360) * 360;
        if (e2 > 1440) return null;
        ext = e2;
      }
    }
    return register(buildOrder({ user, product, variant: pickVariant(product), method: o.method, outcome: o.outcome, createdAt: o.created, date, slot, ext, reason: o.reason, refund: o.refund, noReview: o.noReview, adminNotified: o.adminNotified }));
  };

  // (a) pickup HARI INI: campuran selesai (slot sudah lewat) dan lunas (slot belum) -> "Pesanan hari ini", "Popular slots"
  const todaySlots = shuffle(activeSlotTimes().filter((s) => slotFree(TODAY, s))).slice(0, 8).sort();
  todaySlots.forEach((sl, i) => {
    const start = wibAt(TODAY, sl);
    const passed = start.getTime() + 25 * MIN < NOW.getTime();
    const method: Method = i % 4 === 3 ? "cod" : "midtrans";
    const created = new Date(Math.min(start.getTime() - rint(100, 600) * MIN, NOW.getTime() - 10 * MIN));
    const created2 = created.getTime() < NOW.getTime() - 20 * HOUR ? new Date(NOW.getTime() - rint(120, 900) * MIN) : created;
    const ct = created2.getTime() + 45 * MIN > start.getTime() ? new Date(start.getTime() - 3 * HOUR) : created2;
    const buyer = i === 0 ? budi : i === 1 ? sari : undefined;
    const outcome: Outcome = passed ? "selesai" : method === "cod" ? "menunggu" : "lunas";
    mk({ user: buyer, method, outcome, created: ct, date: TODAY, slot: sl, adminNotified: passed && i % 2 === 0 });
  });

  // (b) pickup mendatang: lunas, tersebar 1-5 hari ke depan -> "Pickup terdekat", "Siap pickup", QR pembeli
  for (let i = 0; i < 12; i++) {
    const created = new Date(NOW.getTime() - rint(120, 3500) * MIN);
    mk({ user: i === 0 ? budi : i === 1 ? budi : i === 2 ? sari : i === 3 ? rizal : undefined, method: "midtrans", outcome: "lunas", created, lead: 1 + Math.floor(i / 3) });
  }

  // (c) COD menunggu bayar (hold masih berjalan), satu di antaranya hold diperpanjang admin
  const codWaiting: Array<[UserRec | undefined, number]> = [[budi, 3], [sari, 6], [rizal, 11], [undefined, 15], [undefined, 28]];
  for (const [u, hrs] of codWaiting) mk({ user: u, method: "cod", outcome: "menunggu", created: new Date(NOW.getTime() - hrs * HOUR), lead: hrs > 20 ? 1 : 1 });
  mk({ user: generated[4], method: "midtrans", outcome: "menunggu", created: new Date(NOW.getTime() - 14 * MIN), lead: 2 });

  // (d) refund: 3 menunggu + 4 selesai -> kartu "Refund tertunda" + riwayat refund
  const refundWaiting: Array<[UserRec | undefined, number, CancelWhy]> = [[sari, 1.4, "kesalahan_toko"], [undefined, 2.2, "permintaan_pembeli"], [undefined, 0.8, "kesalahan_toko"]];
  for (const [u, days, why] of refundWaiting) mk({ user: u, method: "midtrans", outcome: "batal_refund", created: new Date(NOW.getTime() - days * DAY), lead: 3, reason: why, refund: "menunggu" });
  const refundDone: Array<[UserRec | undefined, number, CancelWhy]> = [[budi, 30, "permintaan_pembeli"], [rizal, 17, "kesalahan_toko"], [undefined, 26, "permintaan_pembeli"], [undefined, 41, "kesalahan_toko"]];
  for (const [u, days, why] of refundDone) mk({ user: u, method: "midtrans", outcome: "batal_refund", created: agoDate(days), lead: 3, reason: why, refund: "selesai" });

  // (e) pickup jatuh di tanggal libur -> badge "terdampak libur" + notifikasi libur
  const holidayPickups: string[] = [h1, h2s, addDays(h2s, 1), h2e];
  const affected: OrderRec[] = [];
  holidayPickups.forEach((hd, i) => {
    const created = new Date(NOW.getTime() - rint(200, 2000) * MIN);
    const pk = findPickup(created, 0, "midtrans", hd);
    if (!pk) return;
    const a = mk({ user: i === 0 ? budi : i === 1 ? rizal : undefined, method: "midtrans", outcome: "lunas", created, date: pk.date, slot: pk.slot });
    if (a) affected.push(a);
  });

  // (f) lewat batas pengambilan
  [[budi, 18], [sari, 23], [undefined, 31], [undefined, 38]].forEach(([u, days]) => {
    const pdate = nextOpen(addDays(TODAY, -(days as number)));
    const created = randomTimeOnDay(addDays(pdate, -3));
    const pk = findPickup(created, 0, "midtrans", pdate);
    if (!pk) return;
    mk({ user: u as UserRec | undefined, method: "midtrans", outcome: "lewat_batas", created, date: pk.date, slot: pk.slot });
  });

  // (g) riwayat akun demo (Budi, Sari, Rizal): setiap status muncul + pesanan selesai yang belum diulas
  const history: Array<[UserRec, Method, Outcome, number, boolean?]> = [
    [budi, "cod", "batal_unpaid", 20], [budi, "cod", "kedaluwarsa", 12], [budi, "midtrans", "selesai", 6, true], [budi, "midtrans", "selesai", 3, true],
    [budi, "cod", "selesai", 45], [budi, "midtrans", "selesai", 70],
    [sari, "cod", "kedaluwarsa", 9], [sari, "cod", "batal_unpaid", 33], [sari, "midtrans", "selesai", 5, true], [sari, "midtrans", "selesai", 50],
    [rizal, "cod", "kedaluwarsa", 14], [rizal, "cod", "batal_unpaid", 27], [rizal, "midtrans", "selesai", 4, true], [rizal, "midtrans", "selesai", 60],
  ];
  for (const [u, method, outcome, days, noReview] of history) {
    const created = randomTimeOnDay(addDays(TODAY, -days), [9, 18]);
    mk({ user: u, method, outcome, created, lead: method === "cod" ? 1 : chance(0.5) ? 1 : 2, noReview, adminNotified: true });
  }

  // (h) produk lama yang bukan slow-mover wajib punya penjualan selesai terbaru (agar tidak ikut daftar "lambat laku")
  for (const p of products) {
    const sp = p.spec;
    if (sp.noSales || sp.status || sp.seller === "official" || p.creator?.spec.status !== "aktif" || sp.added < 140) continue;
    const recent = orders.some((o) => o.product === p && o.status === "selesai" && o.completedAt && o.completedAt.getTime() > NOW.getTime() - 120 * DAY);
    if (!recent) mk({ product: p, method: "midtrans", outcome: "selesai", created: randomTimeOnDay(addDays(TODAY, -rint(12, 90)), [9, 18]), lead: 1 });
  }
  // (i) satu penjualan lama untuk slow-mover yang punya `oldSale` -> kolom "terjual terakhir"
  for (const p of products) {
    if (p.spec.oldSale === undefined) continue;
    mk({ product: p, method: "midtrans", outcome: "selesai", created: randomTimeOnDay(addDays(TODAY, -(p.spec.oldSale + 4)), [9, 18]), lead: 3 });
  }
  // (j) pastikan tiap penjual aktif punya penjualan di bulan berjalan dan bulan lalu (laporan tidak kosong)
  const monthNow = TODAY.slice(0, 7);
  for (const c of creators.filter((x) => x.spec.status === "aktif")) {
    const mine = products.filter((p) => p.creator === c && !p.spec.noSales && !p.spec.status);
    if (!mine.length) continue;
    const has = (m: string): boolean => orders.some((o) => o.product.creator === c && o.status === "selesai" && o.completedAt && monthWib(o.completedAt) === m);
    if (!has(monthNow)) {
      const ds = addDays(TODAY, -rint(1, Math.max(1, Number(TODAY.slice(8)) - 1)));
      if (ds.slice(0, 7) === monthNow) mk({ product: pick(mine), method: "midtrans", outcome: "selesai", created: randomTimeOnDay(addDays(ds, -2), [9, 18]), lead: 2 });
    }
  }

  orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  /* ---------- 3.9 stok: stok mentah = stok tersedia + unit yang terikat pesanan ---------- */
  const reserving = (o: OrderRec): boolean => o.status === "lunas" || o.status === "selesai" || o.status === "lewat_batas_pengambilan" || (o.status === "menunggu_bayar" && o.holdExpiresAt.getTime() > NOW.getTime());
  const reserved = new Map<string, number>();
  for (const o of orders) {
    if (reserving(o)) reserved.set(o.variant.id, (reserved.get(o.variant.id) ?? 0) + 1);
    // aturan backend: Midtrans dihitung saat settlement (termasuk yang lalu dibatalkan), COD dihitung saat selesai
    if ((o.method === "midtrans" && o.payment?.status === "settlement") || (o.method === "cod" && o.status === "selesai")) o.product.soldCount++;
  }
  for (const p of products) for (const v of p.variants) v.raw = v.avail + (reserved.get(v.id) ?? 0);

  const stockRows: Prisma.StockMovementCreateManyInput[] = [];
  const adminIds = [admin.id, demoAdmin.id];
  const NOTES = {
    in: ["Restock dari kreator", "Barang masuk batch baru", "Tambahan stok setelah produksi ulang"],
    kasir: ["Terjual di kasir toko", "Penjualan langsung di toko (akhir pekan)", "Terjual saat bazar komunitas"],
    rusak: ["Kemasan rusak saat display", "Hilang saat stock opname", "Cacat produksi, dikembalikan ke kreator"],
    opname: ["Penyesuaian hasil stock opname", "Hasil hitung ulang rak"],
    koreksi: ["Koreksi salah input stok", "Koreksi stok dari kreator saat edit produk"],
  };
  let moveSeq = 0;
  type Ev = { reason: "barang_masuk" | "opname" | "terjual_kasir" | "rusak_hilang" | "koreksi"; delta: number; note: string; at: Date; actor: string };
  for (const p of products) {
    const actorInitial = p.creator ? p.creator.user.id : admin.id;
    for (const v of p.variants) {
      const F = v.raw;
      const evs: Ev[] = [];
      const t0 = new Date(p.createdAt.getTime() + rint(5, 40) * MIN);
      const windowMs = NOW.getTime() - 2 * HOUR - (t0.getTime() + 2 * DAY);
      const when = (): Date => new Date(NOW.getTime() - 2 * HOUR - windowMs * Math.pow(rand(), 1.4));
      if (p.spec.status === "ditarik") {
        const init = rint(6, 14);
        evs.push({ reason: "barang_masuk", delta: init, note: "Stok awal", at: t0, actor: actorInitial });
        const at = p.statusAt ?? NOW;
        evs.push({ reason: "koreksi", delta: -init, note: "Stok dikembalikan ke kreator (produk ditarik)", at: new Date(at.getTime() + 2 * HOUR), actor: pick(adminIds) });
      } else {
        let neg = 0;
        let pos = 0;
        const extra: Ev[] = [];
        if (windowMs > 3 * DAY) {
          const nNeg = F >= 3 ? rint(0, 3) : rint(0, 1);
          for (let i = 0; i < nNeg; i++) {
            const mag = rint(1, Math.max(1, Math.floor(F * 0.15) + 1));
            const kind = pick(["kasir", "kasir", "rusak"] as const);
            extra.push({ reason: kind === "kasir" ? "terjual_kasir" : "rusak_hilang", delta: -mag, note: pick(NOTES[kind]), at: when(), actor: pick(adminIds) });
            neg += mag;
          }
          if (F >= 8 && chance(0.5)) {
            const mag = rint(4, Math.max(4, Math.min(12, Math.floor(F / 2))));
            if (pos + mag <= Math.floor(F / 2)) { extra.push({ reason: "barang_masuk", delta: mag, note: pick(NOTES.in), at: when(), actor: pick(adminIds) }); pos += mag; }
          }
          if (chance(0.3)) {
            const d = pick([-2, -1, 1, 2]);
            if (d < 0) { extra.push({ reason: "opname", delta: d, note: pick(NOTES.opname), at: when(), actor: pick(adminIds) }); neg += -d; }
            else if (pos + d <= Math.floor(F / 2)) { extra.push({ reason: "opname", delta: d, note: pick(NOTES.opname), at: when(), actor: pick(adminIds) }); pos += d; }
          }
          if (chance(0.15)) { extra.push({ reason: "koreksi", delta: 1, note: pick(NOTES.koreksi), at: when(), actor: p.creator ? p.creator.user.id : pick(adminIds) }); pos += F >= 2 ? 1 : 0; if (F < 2) extra.pop(); }
        }
        // aktivitas terbaru (10 hari terakhir) supaya halaman riwayat stok terlihat hidup
        if (p.spec.status !== "menunggu" && p.spec.status !== "ditolak" && NOW.getTime() - p.createdAt.getTime() > 12 * DAY && F >= 3 && chance(0.35)) {
          const kind = pick(["kasir", "opname"] as const);
          const at = new Date(NOW.getTime() - rint(3, 9 * 24) * HOUR);
          if (kind === "kasir") { extra.push({ reason: "terjual_kasir", delta: -1, note: pick(NOTES.kasir), at, actor: pick(adminIds) }); neg += 1; }
          else { extra.push({ reason: "opname", delta: -1, note: pick(NOTES.opname), at, actor: pick(adminIds) }); neg += 1; }
        }
        const init = F + neg - pos;
        if (init > 0) evs.push({ reason: "barang_masuk", delta: init, note: "Stok awal", at: t0, actor: actorInitial });
        for (const e of extra) if (e.at.getTime() > t0.getTime() + DAY) evs.push(e);
        else if (init > 0) { evs.push({ ...e, at: new Date(t0.getTime() + DAY + rint(1, 600) * MIN) }); }
      }
      evs.sort((a, b) => a.at.getTime() - b.at.getTime());
      let bal = 0;
      for (const e of evs) {
        bal += e.delta;
        if (bal < 0) throw new Error(`Ledger stok negatif pada ${p.spec.key}`);
        stockRows.push({ id: `seed-move-${++moveSeq}`, productId: p.id, variantId: v.id, delta: e.delta, stockAfter: bal, reason: e.reason, note: e.note.slice(0, 200), actorId: e.actor, orderId: null, createdAt: e.at });
      }
      if (bal !== F) throw new Error(`Ledger stok tidak cocok untuk ${p.spec.key}: ledger=${bal} stok=${F}`);
    }
  }

  /* ---------- 3.10 tanda stok menipis / slow mover (meniru job & stock.ts) ---------- */
  const THRESH = 5;
  const todayMidnight = dateOnly(TODAY).getTime();
  for (const p of products) {
    const sp = p.spec;
    const approved = !sp.status || sp.status === "disembunyikan";
    const activeNow = !sp.status;
    const sum = p.variants.reduce((a, v) => a + v.raw, 0);
    if (activeNow && p.creator && sum <= THRESH && p.creator.spec.status === "aktif") {
      const at = new Date(NOW.getTime() - rint(1, 8) * DAY);
      p.lowStockNotifiedAt = at;
      notify(p.creator.user.id, "stok_menipis", "Stok menipis", `Stok produk ${sp.name} menipis (${sum}).`, at);
    }
    if (approved && activeNow && p.creator && p.creator.spec.status === "aktif") {
      const lastSale = orders.filter((o) => o.product === p && o.status === "selesai" && o.completedAt).map((o) => o.completedAt!.getTime()).sort((a, b) => b - a)[0];
      const ref = lastSale ?? p.createdAt.getTime();
      const idle = Math.floor((todayMidnight - ref) / DAY);
      if (idle >= 150) {
        const at = new Date(Math.min(ref + 150 * DAY + 7 * HOUR, NOW.getTime() - HOUR));
        p.slowWarnedAt = at;
        notify(p.creator.user.id, "produk_mendekati_batas", "Produk mendekati batas evaluasi", `Produk ${sp.name} tidak terjual selama 150 hari.`, at);
      }
    }
  }

  /* ---------- 3.11 ulasan ---------- */
  const reviewRows: Prisma.ReviewCreateManyInput[] = [];
  const pickRating = (q: number): number => Math.max(1, Math.min(5, Math.round(q + (rand() - 0.5) * 2.2)));
  const comment = (rating: number, cat: string): string => `${pick(COMMENTS_BY_RATING[rating])}${rating >= 4 && chance(0.4) ? " " + COMMENT_TAIL[cat] : ""}`;
  const reviewedItems: Array<{ order: OrderRec; rating: number; at: Date; text: string; idx: number }> = [];
  for (const o of orders) {
    if (o.status !== "selesai" || o.noReview) continue;
    const named = namedBuyers.includes(o.user);
    if (!chance(named ? 0.92 : 0.45)) continue;
    const rating = pickRating(o.product.spec.q ?? 4.5);
    const at = new Date((o.completedAt as Date).getTime() + rint(180, 7200) * MIN);
    if (at.getTime() > NOW.getTime() - MIN) continue;
    reviewedItems.push({ order: o, rating, at, text: comment(rating, o.product.spec.cat), idx: reviewedItems.length });
  }
  // beberapa ulasan negatif yang tetap tampil (ulasan nyata tidak selalu bagus)
  const lowIdx = new Set<number>();
  const lowPool = shuffle(reviewedItems.filter((r) => !namedBuyers.includes(r.order.user)));
  [2, 2, 1, 3, 3].forEach((rt, i) => {
    const r = lowPool[i];
    if (!r) return;
    r.rating = rt;
    r.text = pick(COMMENTS_BY_RATING[rt]);
    lowIdx.add(r.idx);
  });
  const hiddenIdx = new Set(shuffle(reviewedItems.filter((r) => NOW.getTime() - r.at.getTime() > 4 * DAY && !namedBuyers.includes(r.order.user) && !lowIdx.has(r.idx)).map((r) => r.idx)).slice(0, HIDDEN_REVIEW_TEXTS.length));
  let hi = 0;
  for (const r of reviewedItems) {
    const o = r.order;
    const hidden = hiddenIdx.has(r.idx);
    const [hr, ht] = hidden ? HIDDEN_REVIEW_TEXTS[hi++] : [r.rating, r.text];
    reviewRows.push({ id: `seed-review-${r.idx + 1}`, userId: o.user.id, productId: o.product.id, orderItemId: o.itemId, rating: hr, comment: ht, status: hidden ? "disembunyikan" : "tampil", createdAt: r.at });
    if (o.product.creator) notify(o.product.creator.user.id, "ulasan_baru", "Ulasan Baru Produk", `${o.user.name} memberikan ulasan bintang ${hr} untuk produk "${o.product.spec.name}": "${ht}"`, r.at);
  }
  // ulasan umum toko (productId null): hanya pengguna yang pernah punya pesanan selesai, satu per pengguna
  const firstDone = new Map<string, Date>();
  for (const o of orders) if (o.status === "selesai" && o.completedAt && !firstDone.has(o.user.id)) firstDone.set(o.user.id, o.completedAt);
  const storeAuthors = [...namedBuyers, ...shuffle(allBuyers.filter((u) => !namedBuyers.includes(u) && firstDone.has(u.id)))].filter((u) => firstDone.has(u.id)).slice(0, 14);
  storeAuthors.forEach((u, i) => {
    const first = firstDone.get(u.id)!;
    const at = new Date(Math.min(first.getTime() + rint(1, 40) * DAY, NOW.getTime() - 2 * HOUR));
    reviewRows.push({ id: `seed-review-store-${i + 1}`, userId: u.id, productId: null, orderItemId: null, rating: i % 5 === 3 ? 4 : 5, comment: STORE_REVIEW_TEXTS[i % STORE_REVIEW_TEXTS.length], status: "tampil", createdAt: at });
  });

  /* ---------- 3.12 notifikasi pembeli dari pesanan, status produk, libur ---------- */
  for (const o of orders) {
    const uid = o.user.id;
    const upd = (status: string, at: Date): void => notify(uid, "pesanan_update", "Update Status Pesanan", `Pesanan kamu (${o.number}) telah diperbarui menjadi: ${status.replace(/_/g, " ")}.`, at);
    if (o.status === "selesai" && o.adminNotified && o.completedAt) upd("selesai", plusMin(o.completedAt, 1));
    if (o.adminLunasAt) upd("lunas", o.adminLunasAt);
    if (o.status === "dibatalkan" && o.cancelledAt) {
      if (o.method === "midtrans") notify(uid, "pesanan_update", "Pesanan Dibatalkan", `Pesanan ${o.number} dibatalkan. Pembayaranmu sudah kami terima. Hubungi admin lewat WhatsApp untuk proses pengembalian dana.`, o.cancelledAt);
      else upd("dibatalkan", o.cancelledAt);
      if (o.refundStatus === "selesai" && o.refundedAt) notify(uid, "pesanan_update", "Dana Dikembalikan", `Pengembalian dana untuk pesanan ${o.number} sudah diproses oleh admin.`, o.refundedAt);
    }
  }
  for (const o of affected) {
    const hol = HOLIDAYS.find((h) => h.start <= o.pickupDate && h.end >= o.pickupDate);
    notify(o.user.id, "libur_terdampak", "Jadwal Pickup Terdampak Libur", `Pickup pesanan ${o.number} jatuh pada tanggal libur (${hol?.reason ?? "libur"}). Pesanan tetap dapat diambil kapan saja saat toko buka. Admin akan menghubungi lewat WhatsApp.`, new Date(o.createdAt.getTime() + rint(5, 40) * MIN));
  }
  for (const p of products) {
    if (!p.creator) continue;
    const sp = p.spec;
    const uid = p.creator.user.id;
    const reasonTxt = sp.note ? ` Alasan: ${sp.note}` : "";
    if (!sp.status || sp.status === "disembunyikan" || sp.status === "ditarik") notify(uid, "produk_disetujui", "Produk disetujui", `Produk disetujui: ${sp.name}.`, new Date(p.createdAt.getTime() + rint(3, 30) * HOUR));
    if (sp.status === "ditolak" && p.statusAt) notify(uid, "produk_ditolak", "Produk ditolak", `Produk ditolak: ${sp.name}.${reasonTxt}`, p.statusAt);
    if (sp.status === "disembunyikan" && p.statusAt) notify(uid, "produk_disembunyikan", "Produk disembunyikan", `Produk disembunyikan: ${sp.name}.${reasonTxt}`, p.statusAt);
    if (sp.status === "ditarik" && p.statusAt) notify(uid, "produk_ditarik", "Produk ditarik", `Produk ditarik: ${sp.name}.${reasonTxt}`, p.statusAt);
  }
  // moderasi foto profil oleh admin (dua pembeli, foto dihapus -> notifikasi umum)
  for (const [u, ago, why] of [[generated[6], 12, "Foto tidak menampilkan wajah pemilik akun"], [generated[11], 5, "Foto mengandung konten tidak pantas"]] as Array<[UserRec, number, string]>) {
    u.avatarUrl = null;
    const row = userRows.find((r) => r.id === u.id);
    if (row) row.avatarUrl = null;
    notify(u.id, "umum", "Foto profil dihapus oleh admin", `Foto profilmu dihapus oleh admin karena tidak sesuai ketentuan. Alasan: ${why}. Kamu bisa mengunggah foto baru yang sesuai kapan saja.`, agoDate(ago));
  }

  /* ---------- 3.13 tulis ke database (urut sesuai FK) ---------- */
  const productRows: Prisma.ProductCreateManyInput[] = products.map((p) => {
    const sp = p.spec;
    const sold = p.soldCount;
    const view = sp.status === "menunggu" || sp.status === "ditolak" ? rint(0, 8) : sold > 0 ? sold * rint(9, 18) + rint(15, 120) : rint(10, 70);
    const replaces = sp.replaces ? productByKey.get(sp.replaces)!.id : null;
    return {
      id: p.id, artisanId: p.artisanId, categoryId: p.categoryId, name: sp.name, slug: sp.key, shortDescription: sp.short, description: sp.desc, price: sp.price,
      images: urls(sp.photos), imageVariants: sp.imageVariants ? sp.imageVariants.map(([k, opt, val]) => ({ url: IMG[k], option: opt, value: val })) : Prisma.JsonNull,
      isLimited: sp.limited ?? false, isActive: !sp.status || sp.status === "menunggu" ? sp.status !== "menunggu" : false,
      soldCount: sold, viewCount: view, approvalStatus: sp.status === "menunggu" ? "menunggu" : sp.status === "ditolak" ? "ditolak" : "disetujui",
      statusNote: sp.note ?? null, withdrawnAt: sp.status === "ditarik" ? p.statusAt : null, replacesProductId: replaces, slowWarnedAt: p.slowWarnedAt, lowStockNotifiedAt: p.lowStockNotifiedAt,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
    };
  });
  const optionRows: Prisma.ProductVariantOptionCreateManyInput[] = [];
  const variantRows: Prisma.ProductVariantCreateManyInput[] = [];
  const storyRows: Prisma.ProductStoryCreateManyInput[] = [];
  for (const p of products) {
    (p.spec.options ?? []).forEach((o, i) => optionRows.push({ id: `seed-option-${p.spec.key}-${i}`, productId: p.id, name: o.name, values: o.values, sortOrder: i }));
    for (const v of p.variants) variantRows.push({ id: v.id, productId: p.id, combination: v.combination, stock: v.raw });
    const st = STORIES[p.spec.key];
    if (st) storyRows.push({ id: `seed-story-${p.spec.key}`, productId: p.id, title: st.title, content: st.content, process: st.process, coverImageUrl: st.cover ? IMG[st.cover] : null, processImages: urls(st.proc), createdAt: new Date(p.createdAt.getTime() + DAY), updatedAt: new Date(p.createdAt.getTime() + DAY) });
  }
  const orderRows: Prisma.OrderCreateManyInput[] = orders.map((o) => ({
    id: o.id, orderNumber: o.number, userId: o.user.id, paymentMethod: o.method, status: o.status, totalAmount: o.price, pickupDate: dateOnly(o.pickupDate), pickupSlot: o.slot,
    holdExpiresAt: o.holdExpiresAt, holdExtendedMinutes: o.holdExt, pickupDeadline: o.pickupDeadline, refundStatus: o.refundStatus, refundedAt: o.refundedAt,
    cancelReason: o.cancelReason, completedAt: o.completedAt, createdAt: o.createdAt, updatedAt: o.updatedAt,
  }));
  const itemRows: Prisma.OrderItemCreateManyInput[] = orders.map((o) => ({ id: o.itemId, orderId: o.id, productId: o.product.id, variantId: o.variant.id, quantity: 1, priceSnapshot: o.price }));
  const paymentRows: Prisma.PaymentCreateManyInput[] = orders.filter((o) => o.payment).map((o) => ({ id: `seed-payment-${o.id.slice(11)}`, orderId: o.id, midtransTransactionId: o.payment!.token, status: o.payment!.status, paidAt: o.payment!.paidAt, createdAt: o.createdAt }));

  await insertChunks(userRows, (c) => prisma.user.createMany({ data: c }));
  await insertChunks(artisanRows, (c) => prisma.artisan.createMany({ data: c }));
  await insertChunks(appRows, (c) => prisma.artisanApplication.createMany({ data: c }));
  await insertChunks(productRows, (c) => prisma.product.createMany({ data: c }));
  await insertChunks(optionRows, (c) => prisma.productVariantOption.createMany({ data: c }));
  await insertChunks(variantRows, (c) => prisma.productVariant.createMany({ data: c }));
  await insertChunks(storyRows, (c) => prisma.productStory.createMany({ data: c }));
  await insertChunks(orderRows, (c) => prisma.order.createMany({ data: c }));
  await insertChunks(itemRows, (c) => prisma.orderItem.createMany({ data: c }));
  await insertChunks(paymentRows, (c) => prisma.payment.createMany({ data: c }));
  await insertChunks(stockRows, (c) => prisma.stockMovement.createMany({ data: c }));
  await insertChunks(reviewRows, (c) => prisma.review.createMany({ data: c }));
  await prisma.pickupHoliday.createMany({ data: HOLIDAYS.map((h) => ({ id: h.id, startDate: dateOnly(h.start), endDate: dateOnly(h.end), reason: h.reason, createdById: admin.id, createdAt: agoDate(rint(3, 20)) })) });

  /* ---------- 3.14 laporan bulanan (dihitung dari data nyata yang baru dimasukkan) ---------- */
  const months = [...new Set(orders.filter((o) => o.completedAt).map((o) => monthWib(o.completedAt as Date)))].sort();
  let reports = 0;
  for (const m of months) {
    if (m >= TODAY.slice(0, 7)) continue;
    const snap = await calculateMonthlyReport(m, prisma);
    if (snap.totals.revenue === 0) continue;
    const next = new Date(`${m}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const finalizedAt = new Date(Math.min(wibAt(addDays(next.toISOString().slice(0, 10), 1), "10:15").getTime(), NOW.getTime() - HOUR));
    await prisma.monthlyReport.create({ data: { month: m, status: "final", finalizedAt, finalizedById: admin.id, snapshot: snap as unknown as Prisma.InputJsonValue, updatedAt: finalizedAt } });
    reports++;
    for (const c of snap.creators as Array<{ artisanId: string }>) {
      const cr = creators.find((x) => x.artisanId === c.artisanId);
      if (cr) notify(cr.user.id, "laporan_final", "Laporan bulanan tersedia", `Laporan bulan ${m} sudah difinalkan.`, finalizedAt);
    }
  }

  /* ---------- 3.15 notifikasi (terakhir, agar ikut notifikasi laporan) ---------- */
  const notifRows: Prisma.NotificationCreateManyInput[] = notifs
    .filter((n) => n.at.getTime() <= NOW.getTime())
    .map((n, i) => {
      const ageDays = (NOW.getTime() - n.at.getTime()) / DAY;
      const read = ageDays > 3 ? chance(0.93) : ageDays > 1 ? chance(0.5) : chance(0.15);
      return { id: `seed-notif-${i + 1}`, userId: n.userId, type: n.type, title: n.title, body: n.body, isRead: read, createdAt: n.at };
    });
  await insertChunks(notifRows, (c) => prisma.notification.createMany({ data: c }));

  /* ---------- 3.16 ringkasan ---------- */
  const accounts = [
    { role: "admin", email: adminEmail },
    { role: "admin (demo)", email: demoAdminEmail },
    { role: "pembeli (utama)", email: buyerEmail },
    { role: "kreator (demo)", email: demoCreatorEmail },
    { role: "kreator", email: "dini@sesuatudarikota.com" },
    { role: "kreator", email: "bagas@sesuatudarikota.com" },
    { role: "pembeli", email: "sari.demo@sesuatudarikota.test" },
    { role: "pembeli", email: "rizal.demo@sesuatudarikota.test" },
    { role: "pembeli baru (kosong)", email: "tiara.baru@sesuatudarikota.test" },
  ];
  const summary: SeedSummary = { users: userRows.length, creators: creators.length, products: productRows.length, orders: orderRows.length, reviews: reviewRows.length, notifications: notifRows.length, stockMovements: stockRows.length, reports, accounts };
  console.log("Seed selesai.");
  console.log(`  pengguna ${summary.users} | kreator ${summary.creators} (+Official Store) | produk ${summary.products} | pesanan ${summary.orders} | ulasan ${summary.reviews}`);
  console.log(`  notifikasi ${summary.notifications} | pergerakan stok ${summary.stockMovements} | laporan final ${summary.reports} bulan`);
  console.log(`  libur mingguan: ISO hari ke-${WEEKLY_OFF} | libur tanggal: ${HOLIDAYS.map((h) => (h.start === h.end ? h.start : `${h.start}..${h.end}`)).join(", ")}`);
  console.log("Akun demo (password: SEED_DEMO_PASSWORD, atau SEED_ADMIN_PASSWORD bila kosong; admin utama pakai SEED_ADMIN_PASSWORD):");
  for (const a of accounts) console.log(`  - ${a.role}: ${a.email}`);
  console.log("Catatan: jalankan ulang seeder tepat sebelum demo agar data 'hari ini' dan masa hold tetap segar.");
  return summary;
}

/* ========================================================================== */
/* 4. ENTRY POINT                                                              */
/* ========================================================================== */

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const prisma = new PrismaClient();
  runSeed(prisma)
    .catch((error) => {
      console.error("Seed gagal:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
