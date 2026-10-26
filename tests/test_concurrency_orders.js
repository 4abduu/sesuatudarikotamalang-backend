/**
 * test_concurrency_orders.js — Tes konkurensi createOrder (tanpa server HTTP)
 *
 * Memanggil controller langsung dari ../dist (jalankan `npm run build` dulu) di database TEST.
 * Data dibuat sendiri (tidak perlu seed), memakai tanggal ke depan, dan dibersihkan di akhir,
 * sehingga aman dijalankan berulang.
 *
 * TEST 1  6 order paralel dari 6 user ke 1 slot berkapasitas 3
 *         -> tepat 3 sukses (201) dan 3 ditolak 409 SLOT_FULL.
 *         (Baris app_settings sengaja DIHAPUS dulu: membuktikan kunci tetap bekerja bila baris belum ada.)
 * TEST 2  5 order paralel dari 1 user ke 5 slot berbeda
 *         -> tepat 3 sukses dan 2 ditolak 429 (batas order aktif).
 * TEST 3  5 order paralel dari 5 user (slot berbeda) untuk produk berstok 1
 *         -> tepat 1 sukses dan 4 ditolak 409 stok habis (bukan SLOT_FULL).
 *
 * Jalankan: node tests/test_concurrency_orders.js
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { createOrder } = require("../dist/controllers/ordersController");
const { snapshotSlots, restoreSlots, setAllCapacity } = require("./helpers/pickupSlots");

const SLOTS = ["10:00", "11:00", "13:00", "15:00", "17:00"];

/** Tanggal WIB (YYYY-MM-DD) sekian hari dari sekarang. */
function wibDate(offsetDays) {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Memanggil handler Express dengan req/res tiruan dan mengembalikan { status, data }. */
function call(handler, body, user) {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(data) {
        resolve({ status, data });
        return this;
      },
    };
    const next = (err) =>
      resolve({ status: (err && err.status) || 500, data: { error: err && err.message, code: err && err.code } });
    Promise.resolve(handler({ body, user, params: {}, query: {}, headers: {} }, res, next)).catch((e) =>
      resolve({ status: (e && e.status) || 500, data: { error: e && e.message, code: e && e.code } })
    );
  });
}

const created = { users: [], categories: [], artisans: [], products: [] };

async function makeUsers(n, tag) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const u = await prisma.user.create({
      data: { name: `Conc ${tag} ${i}`, email: `conc-${tag}-${i}-${Date.now()}@test.local`, passwordHash: "x", role: "buyer" },
    });
    created.users.push(u.id);
    out.push(u);
  }
  return out;
}

async function makeProduct(tag, stock) {
  const ts = Date.now();
  const category = await prisma.category.create({ data: { name: `Conc Cat ${tag} ${ts}`, slug: `conc-cat-${tag}-${ts}` } });
  const artisan = await prisma.artisan.create({ data: { brandName: `Conc Brand ${tag} ${ts}`, status: "aktif" } });
  const product = await prisma.product.create({
    data: {
      artisanId: artisan.id,
      categoryId: category.id,
      name: `Conc Produk ${tag} ${ts}`,
      slug: `conc-produk-${tag}-${ts}`,
      description: "produk uji konkurensi",
      price: 50000,
      images: [],
      isActive: true,
    },
  });
  await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock } });
  created.categories.push(category.id);
  created.artisans.push(artisan.id);
  created.products.push(product.id);
  return product;
}

function summarize(results) {
  const count = (fn) => results.filter(fn).length;
  return {
    created: count((r) => r.status === 201),
    slotFull: count((r) => r.status === 409 && r.data && r.data.code === "SLOT_FULL"),
    stockOut: count((r) => r.status === 409 && !(r.data && r.data.code === "SLOT_FULL")),
    limit429: count((r) => r.status === 429),
    other: count((r) => ![201, 409, 429].includes(r.status)),
  };
}

function report(name, ok, s, results) {
  console.log(`  ${name}: ${ok ? "LULUS" : "GAGAL"}  ->`, JSON.stringify(s));
  if (!ok) results.forEach((r) => console.log("     ", r.status, JSON.stringify(r.data)));
  return ok;
}

async function test1() {
  console.log("\nTEST 1: 6 order paralel ke 1 slot (kapasitas 3), baris app_settings dihapus dulu");
  await prisma.appSettings.deleteMany(); // aman: database test
  const users = await makeUsers(6, "slot");
  const product = await makeProduct("slot", 100);
  const date = wibDate(5);
  const results = await Promise.all(
    users.map((u) => call(createOrder, { productId: product.id, pickupDate: date, pickupSlot: "10:00", paymentMethod: "cod" }, u))
  );
  const s = summarize(results);
  const rowExists = (await prisma.appSettings.findUnique({ where: { id: 1 } })) !== null;
  const ok = s.created === 3 && s.slotFull === 3 && s.other === 0 && rowExists;
  console.log(`  baris app_settings terbentuk kembali: ${rowExists}`);
  return report("hasil", ok, s, results);
}

async function test2() {
  console.log("\nTEST 2: 5 order paralel dari 1 user ke 5 slot berbeda (batas order aktif = 3)");
  const [user] = await makeUsers(1, "limit");
  const product = await makeProduct("limit", 100);
  const date = wibDate(6);
  const results = await Promise.all(
    SLOTS.map((slot) => call(createOrder, { productId: product.id, pickupDate: date, pickupSlot: slot, paymentMethod: "cod" }, user))
  );
  const s = summarize(results);
  const ok = s.created === 3 && s.limit429 === 2 && s.other === 0;
  return report("hasil", ok, s, results);
}

async function test3() {
  console.log("\nTEST 3: 5 user paralel memesan produk berstok 1 (slot berbeda)");
  const users = await makeUsers(5, "stock");
  const product = await makeProduct("stock", 1);
  const date = wibDate(7);
  const results = await Promise.all(
    users.map((u, i) => call(createOrder, { productId: product.id, pickupDate: date, pickupSlot: SLOTS[i], paymentMethod: "cod" }, u))
  );
  const s = summarize(results);
  const ok = s.created === 1 && s.stockOut === 4 && s.slotFull === 0 && s.other === 0;
  return report("hasil", ok, s, results);
}

async function cleanup() {
  const tryDo = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`  (cleanup ${label} dilewati: ${e.message.split("\n")[0]})`);
    }
  };
  const orders = await prisma.order.findMany({ where: { userId: { in: created.users } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await tryDo("orderItem", () => prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }));
  await tryDo("payment", () => prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }));
  await tryDo("notification", () => prisma.notification.deleteMany({ where: { userId: { in: created.users } } }));
  await tryDo("order", () => prisma.order.deleteMany({ where: { id: { in: orderIds } } }));
  await tryDo("variant", () => prisma.productVariant.deleteMany({ where: { productId: { in: created.products } } }));
  await tryDo("product", () => prisma.product.deleteMany({ where: { id: { in: created.products } } }));
  await tryDo("artisan", () => prisma.artisan.deleteMany({ where: { id: { in: created.artisans } } }));
  await tryDo("category", () => prisma.category.deleteMany({ where: { id: { in: created.categories } } }));
  await tryDo("user", () => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

(async () => {
  console.log("==================================================");
  console.log("TES KONKURENSI createOrder (database test, kapasitas slot = 3)");
  console.log("==================================================");
  const outcomes = [];
  let snapshot;
  try {
    snapshot = await snapshotSlots(prisma);
    await setAllCapacity(prisma, 3);
    outcomes.push(await test1());
    outcomes.push(await test2());
    outcomes.push(await test3());
  } catch (err) {
    console.error("\nERROR TAK TERDUGA:", err);
    outcomes.push(false);
  } finally {
    await cleanup();
    if (snapshot) await restoreSlots(prisma, snapshot);
    await prisma.$disconnect();
  }
  const pass = outcomes.length === 3 && outcomes.every(Boolean);
  console.log("\n==================================================");
  console.log(pass ? "SEMUA TES KONKURENSI LULUS" : "ADA TES KONKURENSI YANG GAGAL");
  console.log("==================================================");
  process.exit(pass ? 0 : 1);
})();
