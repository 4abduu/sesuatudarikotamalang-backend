require("./helpers/requireTestDb")();

const { forgotPasswordVerify } = require("../dist/controllers/authController");
const { extractBearerToken } = require("../dist/middleware/authMiddleware");
const { createReviewForUser } = require("../dist/dal/reviews");
const prisma = require("../dist/lib/prisma").default;
const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log("LULUS ", label);
    passed++;
  } else {
    console.error("GAGAL ", label, detail);
    failed++;
  }
}

// ─── 1c: extractBearerToken ──────────────────────────────────────────────────
function testExtractBearerToken() {
  assert("Bearer abc → 'abc'", extractBearerToken("Bearer abc") === "abc");
  assert("bearer abc (lowercase) → 'abc'", extractBearerToken("bearer abc") === "abc");
  // regex \s+ greedy: "Bearer  abc" (spasi ganda) → diterima, token = "abc"
  assert("Bearer  abc (spasi ganda) → 'abc' (diterima)", extractBearerToken("Bearer  abc") === "abc");
  assert("Token abc (bukan Bearer) → null", extractBearerToken("Token abc") === null);
  assert("tanpa header → null", extractBearerToken(undefined) === null);
  assert("string kosong → null", extractBearerToken("") === null);
  assert("Bearer saja tanpa token → null", extractBearerToken("Bearer ") === null);
}

// ─── 1a: OTP atomic — 8 request serentak, harus hangus ──────────────────────
async function testOtpAtomicHangus() {
  const email = `otp_atomic_${Date.now()}@test.com`;
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("Password1", 10);
  const user = await prisma.user.create({
    data: { name: "Atomic Test", email, passwordHash: hash, role: "buyer" },
  });

  const { hashOtp } = require("../dist/lib/otp");
  const rawCode = "123456";
  const otpRecord = await prisma.otpCode.create({
    data: {
      userId: user.id,
      code: hashOtp(rawCode),
      purpose: "lupa_password",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      isUsed: false,
    },
  });

  const fakeCode = "000000";
  const requests = Array.from({ length: 8 }, () => {
    const req = { body: { email, code: fakeCode, newPassword: "Password2" }, params: {}, user: null, headers: {} };
    const res = { status: () => ({ json: () => {} }), json: () => {} };
    return forgotPasswordVerify(req, res, () => {});
  });
  await Promise.all(requests);

  const updated = await prisma.otpCode.findUnique({ where: { id: otpRecord.id } });
  assert("1a: 8 percobaan serentak → OTP hangus (isUsed = true)", updated?.isUsed === true, `isUsed=${updated?.isUsed}`);

  const result = await new Promise((resolve) => {
    const req = { body: { email, code: rawCode, newPassword: "Password2" }, params: {}, user: null, headers: {} };
    let status = 200;
    const res = {
      status: (s) => { status = s; return { json: () => resolve(status) }; },
      json: () => resolve(status),
    };
    forgotPasswordVerify(req, res, () => {});
  });
  assert("1a: kode benar setelah hangus → ditolak (400)", result === 400, `status=${result}`);

  await prisma.otpCode.delete({ where: { id: otpRecord.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

// ─── 1b: P2002 review paralel ────────────────────────────────────────────────
async function testReviewP2002() {
  const email = `review_p2002_${Date.now()}@test.com`;
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("Password1", 10);
  const user = await prisma.user.create({ data: { name: "ReviewP2002", email, passwordHash: hash, role: "buyer" } });

  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({ data: { name: "TestKat_" + Date.now(), slug: "testkat_" + Date.now() } });
  }
  // Cari artisan tanpa filter isOfficial (field belum ada — Langkah 2 migrasi)
  let artisan = await prisma.artisan.findFirst();
  if (!artisan) {
    const artisanUser = await prisma.user.create({
      data: { name: "ArtisanP2002", email: `artisan_p2002_${Date.now()}@test.com`, passwordHash: hash, role: "creator" },
    });
    artisan = await prisma.artisan.create({ data: { userId: artisanUser.id, brandName: "TestArtisan_" + Date.now(), status: "aktif" } });
  }

  const product = await prisma.product.create({
    data: {
      name: "ProdukP2002_" + Date.now(), slug: "produk-p2002-" + Date.now(),
      description: "Test", price: 10000, images: [], categoryId: category.id, artisanId: artisan.id,
    },
  });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 10 } });
  const order = await prisma.order.create({
    data: { userId: user.id, orderNumber: "SDK-P2002-" + Date.now(), totalAmount: 10000, pickupDate: new Date(), pickupSlot: "08:00-10:00", paymentMethod: "cod", status: "selesai" },
  });
  const orderItem = await prisma.orderItem.create({
    data: { orderId: order.id, productId: product.id, variantId: variant.id, quantity: 1, priceSnapshot: 10000 },
  });

  const authUser = { id: user.id, name: user.name, email: user.email, role: "buyer", avatarUrl: null };

  const [r1, r2] = await Promise.allSettled([
    createReviewForUser(authUser, { orderItemId: orderItem.id, rating: 5, comment: "Bagus sekali produknya" }),
    createReviewForUser(authUser, { orderItemId: orderItem.id, rating: 4, comment: "Cukup memuaskan sih" }),
  ]);

  const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled").length;
  const rejected = [r1, r2].filter((r) => r.status === "rejected").length;
  assert("1b: satu berhasil, satu gagal", fulfilled === 1 && rejected === 1, `fulfilled=${fulfilled} rejected=${rejected}`);

  const failedReason = r1.status === "rejected" ? r1.reason : r2.status === "rejected" ? r2.reason : null;
  assert("1b: yang gagal berupa 400 (bukan 500)", failedReason?.status === 400, `status=${failedReason?.status}`);

  await prisma.review.deleteMany({ where: { orderItemId: orderItem.id } });
  await prisma.orderItem.delete({ where: { id: orderItem.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.productVariant.delete({ where: { id: variant.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

// ─── 1d: null menghapus field nullable ───────────────────────────────────────
async function testNullFieldClearing() {
  const { updateMyArtisanProfile } = require("../dist/dal/artisanProfile");
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("Password1", 10);
  const email = `null_field_${Date.now()}@test.com`;
  const user = await prisma.user.create({ data: { name: "NullField", email, passwordHash: hash, role: "creator" } });
  const artisan = await prisma.artisan.create({
    data: {
      userId: user.id, brandName: "TestBrand_" + Date.now(), status: "aktif",
      avatarUrl: "https://res.cloudinary.com/testcloud/image/upload/v1/test.jpg",
    },
  });
  const authUser = { id: user.id, name: user.name, email, role: "creator", avatarUrl: null };

  let err = null;
  try {
    await updateMyArtisanProfile(authUser, { avatarUrl: null });
  } catch (e) {
    err = e;
  }
  assert("1d: avatarUrl: null diterima (tidak 400)", err === null || err?.status !== 400, err?.message);

  const updated = await prisma.artisan.findUnique({ where: { id: artisan.id } });
  assert("1d: avatarUrl: null mengosongkan field di DB", updated?.avatarUrl === null, `avatarUrl=${updated?.avatarUrl}`);

  await prisma.artisan.delete({ where: { id: artisan.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

// ─── 1f: code RATE_LIMITED pada semua limiter — grep compiled output ─────────
function testRateLimitedCode() {
  // express-rate-limit menyimpan message di closure, tidak bisa diakses dari luar function.
  // Verifikasi dengan membaca file dist/ yang sudah dikompilasi.
  const distFile = path.resolve(__dirname, "../dist/middleware/rateLimiter.js");
  const src = fs.readFileSync(distFile, "utf8");
  const matches = (src.match(/RATE_LIMITED/g) || []).length;
  assert(
    `1f: dist/rateLimiter.js memuat RATE_LIMITED (${matches}x, minimal 9 untuk 9 limiter)`,
    matches >= 9,
    `ditemukan ${matches} kemunculan`
  );
}

// ─── Jalankan semua ──────────────────────────────────────────────────────────
(async () => {
  console.log("\n>>>>>>>>>> test_langkah1_fixes.js");
  testExtractBearerToken();
  testRateLimitedCode();

  try { await testOtpAtomicHangus(); } catch (e) { console.error("GAGAL  1a (exception):", e); failed++; }
  try { await testReviewP2002(); } catch (e) { console.error("GAGAL  1b (exception):", e); failed++; }
  try { await testNullFieldClearing(); } catch (e) { console.error("GAGAL  1d (exception):", e); failed++; }

  console.log(`\n${failed === 0 ? "SEMUA TES LANGKAH 1 LULUS" : `${failed} TES GAGAL`} (${passed} lulus, ${failed} gagal)\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
