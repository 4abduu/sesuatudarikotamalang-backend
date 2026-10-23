require("./helpers/requireTestDb")();

const assert = require("assert");
const { PrismaClient } = require("@prisma/client");

const { errorHandler } = require("../dist/app");
const { createProduct, updateProduct } = require("../dist/controllers/productsController");
const { toggleArtisanStatus, listAdminArtisans, listAdminProducts, listOrders } = require("../dist/controllers/adminController");
const { listArtisans } = require("../dist/controllers/artisansController");
const { search } = require("../dist/controllers/searchController");
const { createReviewForUser } = require("../dist/dal/reviews");
const { listMyOrders } = require("../dist/dal/orders");
const { ensureOfficialStore, getOfficialArtisan, OFFICIAL_STORE_NAME } = require("../dist/lib/officialStore");

const prisma = new PrismaClient();
const TAG = "STEP3-TEST";
const stamp = Date.now();
const admin = { id: "step3-admin", name: "Admin", email: "admin@step3.test", role: "admin" };

const created = { userIds: [], artisanIds: [], categoryId: null };
let preexistingOfficialIds = [];
let failed = 0;

// Panggil controller dengan req/res tiruan; error dari next() diproses error handler global
// supaya yang diperiksa sama dengan yang diterima klien.
async function call(handler, { user, body = {}, query = {}, params = {} } = {}) {
  const req = { user, body, query, params, method: "TEST", path: "/test" };
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  let error = null;
  await handler(req, res, (err) => { error = err; });
  if (error) {
    const original = console.error;
    console.error = () => {};
    try { errorHandler(error, req, res, () => {}); } finally { console.error = original; }
  }
  return res;
}

async function check(name, fn) {
  try {
    await fn();
    console.log("LULUS  " + name);
  } catch (err) {
    failed++;
    console.error("GAGAL  " + name + "\n       " + err.message);
  }
}

function productBody(extra = {}) {
  return {
    name: TAG + " Produk " + Math.random().toString(36).slice(2, 8),
    categoryId: created.categoryId,
    description: "Deskripsi produk uji",
    price: 15000,
    images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    stock: 5,
    ...extra,
  };
}

async function makeCreator(label, status) {
  const user = await prisma.user.create({
    data: { name: TAG + " " + label, email: `step3-${label}-${stamp}@example.test`, role: "creator" },
  });
  created.userIds.push(user.id);
  const artisan = await prisma.artisan.create({
    data: { userId: user.id, brandName: TAG + " " + label, status },
  });
  created.artisanIds.push(artisan.id);
  return { user, artisan, authUser: { id: user.id, name: user.name, email: user.email, role: "creator" } };
}

async function makeOrder(buyerId, productId, n) {
  return prisma.order.create({
    data: {
      orderNumber: `S3-${stamp}-${n}`,
      userId: buyerId,
      paymentMethod: "cod",
      totalAmount: 15000,
      status: "selesai",
      pickupDate: new Date(),
      pickupSlot: "10:00",
      items: { create: [{ productId, quantity: 1, priceSnapshot: 15000 }] },
    },
    include: { items: true },
  });
}

async function cleanup() {
  await prisma.review.deleteMany({
    where: { OR: [{ userId: { in: created.userIds } }, { product: { name: { startsWith: TAG } } }] },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.order.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.artisan.deleteMany({ where: { id: { in: created.artisanIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  if (created.categoryId) await prisma.category.deleteMany({ where: { id: created.categoryId } });
  if (preexistingOfficialIds.length) {
    await prisma.artisan.updateMany({ where: { id: { in: preexistingOfficialIds } }, data: { isOfficial: true } });
  }
}

async function main() {
  assert(/_test(\?.*)?$/.test(process.env.DATABASE_URL || ""), "DATABASE_URL harus berakhiran _test");

  // Pastikan tes mulai dari keadaan "Official Store belum ada". Baris Official yang sudah ada
  // hanya dinonaktifkan penandanya sementara dan dipulihkan di cleanup().
  const existing = await prisma.artisan.findMany({ where: { isOfficial: true }, select: { id: true } });
  preexistingOfficialIds = existing.map((a) => a.id);
  if (preexistingOfficialIds.length) {
    await prisma.artisan.updateMany({ where: { id: { in: preexistingOfficialIds } }, data: { isOfficial: false } });
  }

  const category = await prisma.category.create({ data: { name: TAG + " Kategori " + stamp, slug: "step3-test-" + stamp } });
  created.categoryId = category.id;
  const creatorA = await makeCreator("kreatorA", "aktif");
  const creatorB = await makeCreator("kreatorB", "nonaktif");
  const buyer = await prisma.user.create({ data: { name: TAG + " Buyer", email: `step3-buyer-${stamp}@example.test` } });
  created.userIds.push(buyer.id);
  const buyerAuth = { id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer" };

  let official = null;
  let officialProductId = null;
  let creatorProductId = null;

  await check("3c: tanpa artisanId dan Official belum ada -> 409 OFFICIAL_STORE_MISSING (code sampai ke klien)", async () => {
    const res = await call(createProduct, { user: admin, body: productBody() });
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.code, "OFFICIAL_STORE_MISSING");
    assert(res.body.error.includes("prisma:seed:official"));
  });

  await check("3b: ensureOfficialStore idempoten (dua kali -> satu baris, tanpa userId)", async () => {
    const first = await ensureOfficialStore(prisma);
    const second = await ensureOfficialStore(prisma);
    official = first.artisan;
    created.artisanIds.push(official.id);
    assert.strictEqual(first.created, true);
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.artisan.id, official.id);
    assert.strictEqual(await prisma.artisan.count({ where: { isOfficial: true } }), 1);
    assert.strictEqual(official.userId, null);
    assert.strictEqual(official.brandName, OFFICIAL_STORE_NAME);
    assert.strictEqual(official.status, "aktif");
    assert.strictEqual((await getOfficialArtisan(prisma)).id, official.id);
  });

  await check("3c: admin tanpa artisanId -> produk atas nama Official (artisan.isOfficial = true)", async () => {
    const res = await call(createProduct, { user: admin, body: productBody() });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.product.artisanId, official.id);
    assert.strictEqual(res.body.product.artisan.isOfficial, true);
    officialProductId = res.body.product.id;
  });

  await check("3c: artisanId string kosong diperlakukan sama seperti tidak diisi -> Official", async () => {
    const res = await call(createProduct, { user: admin, body: productBody({ artisanId: "" }) });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.product.artisanId, official.id);
  });

  await check("3c: admin dengan artisanId kreator aktif -> produk atas nama kreator", async () => {
    const res = await call(createProduct, { user: admin, body: productBody({ artisanId: creatorA.artisan.id }) });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.product.artisanId, creatorA.artisan.id);
    assert.strictEqual(res.body.product.artisan.isOfficial, false);
    creatorProductId = res.body.product.id;
  });

  await check("3c: artisanId tidak ada -> 404", async () => {
    const res = await call(createProduct, { user: admin, body: productBody({ artisanId: "tidak-ada-" + stamp }) });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.error, "Kreator tidak ditemukan");
  });

  await check("3c: kreator nonaktif -> 400 'Kreator tidak aktif'", async () => {
    const res = await call(createProduct, { user: admin, body: productBody({ artisanId: creatorB.artisan.id }) });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, "Kreator tidak aktif");
  });

  await check("3c: artisanId bukan string -> 400", async () => {
    const res = await call(createProduct, { user: admin, body: productBody({ artisanId: 12345 }) });
    assert.strictEqual(res.statusCode, 400);
  });

  await check("3c: jalur kreator tidak berubah (produk otomatis milik kreator itu)", async () => {
    const res = await call(createProduct, { user: creatorA.authUser, body: productBody() });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.product.artisanId, creatorA.artisan.id);
  });

  await check("3d: toggle Official -> 400 OFFICIAL_STORE_PROTECTED dan status tetap aktif", async () => {
    const res = await call(toggleArtisanStatus, { user: admin, params: { id: official.id } });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, "OFFICIAL_STORE_PROTECTED");
    assert.strictEqual(res.body.error, "Official Store tidak dapat dinonaktifkan");
    assert.strictEqual((await prisma.artisan.findUnique({ where: { id: official.id } })).status, "aktif");
  });

  await check("3d: toggle kreator biasa tetap berfungsi", async () => {
    const res = await call(toggleArtisanStatus, { user: admin, params: { id: creatorB.artisan.id } });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.artisan.status, "aktif");
  });

  await check("3e: GET /artisans -> Official tidak ada di artisans, ada di officialStore", async () => {
    const res = await call(listArtisans);
    assert.strictEqual(res.statusCode, 200);
    assert(!res.body.artisans.some((a) => a.id === official.id), "Official bocor ke daftar kreator");
    assert(res.body.artisans.some((a) => a.id === creatorA.artisan.id), "kreator biasa hilang");
    const store = res.body.officialStore;
    assert(store, "officialStore null");
    assert.strictEqual(store.id, official.id);
    assert.strictEqual(store.isOfficial, true);
    assert.strictEqual(typeof store.avgRating, "number");
    assert(store.productCount >= 2, "productCount Official salah: " + store.productCount);
  });

  await check("3e: search -> creators tanpa Official, produk Official tetap muncul", async () => {
    const byName = await call(search, { query: { q: OFFICIAL_STORE_NAME.toLowerCase() } });
    assert.strictEqual(byName.statusCode, 200);
    assert(!byName.body.creators.some((c) => c.id === official.id), "Official muncul di creators");
    const byProduct = await call(search, { query: { q: (TAG + " Produk").toLowerCase() } });
    assert(byProduct.body.products.some((p) => p.artisan && p.artisan.isOfficial === true), "produk Official tidak muncul");
  });

  await check("3f: listAdminArtisans -> Official paling atas, tiap item punya isOfficial", async () => {
    const res = await call(listAdminArtisans, { user: admin });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.artisans[0].id, official.id);
    assert(res.body.artisans.every((a) => typeof a.isOfficial === "boolean"));
  });

  await check("3f: listAdminArtisans filter isOfficial=true / false / nilai lain", async () => {
    const yes = await call(listAdminArtisans, { user: admin, query: { isOfficial: "true" } });
    assert.deepStrictEqual(yes.body.artisans.map((a) => a.id), [official.id]);
    const no = await call(listAdminArtisans, { user: admin, query: { isOfficial: "false" } });
    assert(no.body.artisans.every((a) => a.isOfficial === false));
    assert(no.body.artisans.some((a) => a.id === creatorA.artisan.id));
    const bad = await call(listAdminArtisans, { user: admin, query: { isOfficial: "mungkin" } });
    assert.strictEqual(bad.statusCode, 400);
    const withStatus = await call(listAdminArtisans, { user: admin, query: { status: "aktif", isOfficial: "true" } });
    assert.deepStrictEqual(withStatus.body.artisans.map((a) => a.id), [official.id]);
  });

  await check("3f: listAdminProducts filter artisanId, memuat penjual + isOfficial", async () => {
    const res = await call(listAdminProducts, { user: admin, query: { artisanId: official.id } });
    assert.strictEqual(res.statusCode, 200);
    assert(res.body.products.length >= 2);
    assert(res.body.products.every((p) => p.artisanId === official.id && p.artisan.isOfficial === true));
    const bad = await call(listAdminProducts, { user: admin, query: { artisanId: ["a", "b"] } });
    assert.strictEqual(bad.statusCode, 400);
  });

  const orderOfficial = await makeOrder(buyer.id, officialProductId, 1);
  const orderCreator = await makeOrder(buyer.id, creatorProductId, 2);

  await check("3f: listOrders admin filter artisanId, tiap item memuat artisan {id, brandName, isOfficial}", async () => {
    const res = await call(listOrders, { user: admin, query: { artisanId: official.id } });
    assert.strictEqual(res.statusCode, 200);
    const ids = res.body.orders.map((o) => o.id);
    assert(ids.includes(orderOfficial.id), "order Official tidak ditemukan");
    assert(!ids.includes(orderCreator.id), "order kreator ikut terbawa");
    const item = res.body.orders.find((o) => o.id === orderOfficial.id).items[0];
    assert.strictEqual(item.product.artisan.id, official.id);
    assert.strictEqual(item.product.artisan.isOfficial, true);
    assert.strictEqual(typeof item.product.artisan.brandName, "string");
    const bad = await call(listOrders, { user: admin, query: { artisanId: ["a", "b"] } });
    assert.strictEqual(bad.statusCode, 400);
  });

  await check("3e: respons order pembeli (orderInclude) memuat artisan.isOfficial", async () => {
    const orders = await listMyOrders(buyerAuth);
    const mine = orders.find((o) => o.id === orderOfficial.id);
    assert.strictEqual(mine.items[0].product.artisan.isOfficial, true);
    const other = orders.find((o) => o.id === orderCreator.id);
    assert.strictEqual(other.items[0].product.artisan.isOfficial, false);
  });

  await check("3g: kreator mengubah produk Official -> 403", async () => {
    const res = await call(updateProduct, { user: creatorA.authUser, params: { id: officialProductId }, body: { name: "Dibajak" } });
    assert.strictEqual(res.statusCode, 403);
  });

  await check("3g: ulasan produk Official tidak membuat notifikasi dan tidak error", async () => {
    const before = await prisma.notification.count();
    const review = await createReviewForUser(buyerAuth, {
      rating: 5, comment: "Bagus sekali", orderItemId: orderOfficial.items[0].id,
    });
    assert.strictEqual(review.productId, officialProductId);
    assert.strictEqual(await prisma.notification.count(), before);
  });

  await check("3g (kontrol): ulasan produk kreator tetap membuat notifikasi untuk kreatornya", async () => {
    const before = await prisma.notification.count({ where: { userId: creatorA.user.id } });
    await createReviewForUser(buyerAuth, { rating: 4, comment: "Mantap", orderItemId: orderCreator.items[0].id });
    assert.strictEqual(await prisma.notification.count({ where: { userId: creatorA.user.id } }), before + 1);
  });

  console.log(failed === 0 ? "\nSEMUA TES OFFICIAL STORE LULUS" : "\n" + failed + " TES GAGAL");
}

main()
  .catch((err) => {
    failed++;
    console.error(err);
  })
  .finally(async () => {
    try { await cleanup(); } catch (err) { failed++; console.error("Cleanup gagal:", err.message); }
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });