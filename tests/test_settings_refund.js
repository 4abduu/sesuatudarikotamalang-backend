require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const { updateSettings, getSettings } = require("../dist/controllers/adminController").default;
const { getPublicSettings } = require("../dist/controllers/settingsController").default;
const { createOrder } = require("../dist/controllers/ordersController").default;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log("LULUS ", label);
    passed++;
  } else {
    console.error("GAGAL ", label, detail ? `(${detail})` : "");
    failed++;
  }
}

function mockRes() {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { body = data; return this; },
    result: () => ({ statusCode, body }),
  };
  return res;
}

const adminUser = { id: "admin-test", role: "admin" };

// ─── validasi refundWindowDays ────────────────────────────────────────────────
async function testRefundWindowValidation() {
  // Nilai yang DITERIMA: 1, 3, 7 (tipe number)
  for (const val of [1, 3, 7]) {
    const res = mockRes();
    await updateSettings({ body: { refundWindowDays: val }, user: adminUser }, res, (e) => { if (e) throw e; });
    assert(`refundWindowDays ${val} diterima (200)`, res.result().statusCode === 200, `status=${res.result().statusCode}`);
  }

  // Nilai yang DITOLAK: 0, 2, 5, 14 (integer di luar set), "3" (string), null
  const rejected = [
    { val: 0, label: "0 (di luar set)" },
    { val: 2, label: "2 (di luar set)" },
    { val: 5, label: "5 (di luar set)" },
    { val: 14, label: "14 (di luar set)" },
    { val: "3", label: "'3' (string)" },
    { val: null, label: "null" },
  ];
  for (const { val, label } of rejected) {
    const res = mockRes();
    let nextErr = null;
    await updateSettings({ body: { refundWindowDays: val }, user: adminUser }, res, (e) => { nextErr = e; });
    assert(
      `refundWindowDays ${label} ditolak (400)`,
      res.result().statusCode === 400 && nextErr === null,
      `status=${res.result().statusCode}`
    );
  }
}

// ─── refundWindowDays terbaca di respons admin dan publik ─────────────────────
async function testRefundWindowInResponse() {
  // Set ke 7 hari dulu
  const res1 = mockRes();
  await updateSettings({ body: { refundWindowDays: 7 }, user: adminUser }, res1, (e) => { if (e) throw e; });
  assert("set refundWindowDays=7 berhasil", res1.result().statusCode === 200);

  // Admin getSettings
  const res2 = mockRes();
  await getSettings({ user: adminUser }, res2, (e) => { if (e) throw e; });
  assert(
    "getSettings (admin) mengembalikan refundWindowDays=7",
    res2.result().body?.settings?.refundWindowDays === 7,
    `dapat=${res2.result().body?.settings?.refundWindowDays}`
  );

  // Public getPublicSettings
  const res3 = mockRes();
  await getPublicSettings({}, res3, (e) => { if (e) throw e; });
  assert(
    "getPublicSettings mengembalikan refundWindowDays=7",
    res3.result().body?.settings?.refundWindowDays === 7,
    `dapat=${res3.result().body?.settings?.refundWindowDays}`
  );

  // Kembalikan ke 3 (default)
  await updateSettings({ body: { refundWindowDays: 3 }, user: adminUser }, mockRes(), (e) => { if (e) throw e; });
}

// ─── fallback 1440 di compiled code + order COD holdExpiresAt ~24 jam ─────────
async function testCodHoldDefault() {
  const fs = require("fs");
  const path = require("path");
  const distFile = path.resolve(__dirname, "../dist/controllers/ordersController.js");
  const src = fs.readFileSync(distFile, "utf8");

  // Verifikasi fallback 1440 ada di compiled output
  assert(
    "dist/ordersController.js memuat fallback 1440 (bukan 120)",
    src.includes("|| 1440") && !src.includes("|| 120"),
    "cek || 1440 di compiled output"
  );

  // Buat order COD nyata dan periksa holdExpiresAt ~24 jam
  // Pastikan AppSettings ada (pakai default schema jika belum ada)
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 }, // holdDurationMinutes @default(1440) dari schema
  });

  const ts = Date.now();
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("Password1", 10);
  const buyer = await prisma.user.create({ data: { name: "HoldBuyer", email: `hold_${ts}@test.com`, passwordHash: hash, role: "buyer" } });

  let cat = await prisma.category.findFirst();
  if (!cat) cat = await prisma.category.create({ data: { name: "HoldKat_" + ts, slug: "holdkat_" + ts } });

  let artisan = await prisma.artisan.findFirst();
  if (!artisan) {
    const au = await prisma.user.create({ data: { name: "HoldArtisan", email: `hold_art_${ts}@test.com`, passwordHash: hash, role: "creator" } });
    artisan = await prisma.artisan.create({ data: { userId: au.id, brandName: "HoldBrand_" + ts, status: "aktif" } });
  }

  const product = await prisma.product.create({
    data: { name: "HoldProd_" + ts, slug: "holdprod-" + ts, description: "Test", price: 15000, images: [], categoryId: cat.id, artisanId: artisan.id },
  });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 5 } });

  // Pilih tanggal besok dan slot pertama yang ada
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const before = Date.now();
  const req = {
    body: {
      productId: product.id,
      variantId: variant.id,
      pickupDate: tomorrowStr,
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    user: { id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer", avatarUrl: null },
    headers: {},
  };
  const res = mockRes();
  await createOrder(req, res, (e) => { if (e) throw e; });
  const after = Date.now();

  assert("createOrder COD → 201", res.result().statusCode === 201, `status=${res.result().statusCode} body=${JSON.stringify(res.result().body)}`);

  const order = res.result().body?.order;
  if (order?.holdExpiresAt) {
    const holdMs = new Date(order.holdExpiresAt).getTime() - before;
    const expectedMs = 1440 * 60 * 1000;
    const tolerance = 15000;
    assert(
      "holdExpiresAt ~24 jam (1440 menit) dari sekarang",
      holdMs >= expectedMs - tolerance && holdMs <= expectedMs + (after - before) + tolerance,
      `holdMs=${Math.round(holdMs / 60000)} menit`
    );
  } else {
    assert("holdExpiresAt ada di respons order", false, "holdExpiresAt tidak ada");
  }

  // Bersih
  const orderId = order?.id;
  if (orderId) {
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
  }
  await prisma.productVariant.delete({ where: { id: variant.id } }).catch(() => {});
  await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: buyer.id } }).catch(() => {});
}


// ─── Jalankan semua ──────────────────────────────────────────────────────────
(async () => {
  console.log("\n>>>>>>>>>> test_settings_refund.js");

  try { await testRefundWindowValidation(); } catch (e) { console.error("GAGAL  validasi (exception):", e); failed++; }
  try { await testRefundWindowInResponse(); } catch (e) { console.error("GAGAL  response (exception):", e); failed++; }
  try { await testCodHoldDefault(); } catch (e) { console.error("GAGAL  hold default (exception):", e); failed++; }

  const label = failed === 0 ? "SEMUA TES SETTINGS REFUND LULUS" : `${failed} TES GAGAL`;
  console.log(`\n${label} (${passed} lulus, ${failed} gagal)\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
