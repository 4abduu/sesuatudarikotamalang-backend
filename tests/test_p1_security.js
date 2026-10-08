/**
 * test_p1_security.js — Tes Paket P1 (Keamanan akun & akses)
 *
 * Tes: F-01, F-03, F-10, F-19, F-14
 * Jalankan: node tests/test_p1_security.js
 * Database: sesuatu_darikota_malang_test
 */

// Pastikan pakai DB test
const dbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "mysql://root:@localhost:3306/sesuatu_darikota_malang_test";

if (!dbUrl.includes("_test")) {
  console.error("[FATAL] DATABASE_URL tidak mengandung '_test'. Tolak eksekusi untuk melindungi DB utama.");
  process.exit(1);
}
process.env.DATABASE_URL = dbUrl;

const prisma = require("../src/lib/prisma");
const { forgotPasswordVerify, changeEmailVerify, googleLogin } = require("../src/controllers/auth.controller");
const { updateProduct, getProductById } = require("../src/controllers/products.controller");
const { applyConsignment } = require("../src/controllers/artisans.controller");
const { approveApplication } = require("../src/controllers/admin.controller");

// ──────────────────────────────────────────
// Helper: mock Express req/res/next
// ──────────────────────────────────────────
function mockReqRes(body = {}, user = null, params = {}) {
  let statusCode = 200;
  let jsonResponse = null;

  const req = { body, user, params };
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { jsonResponse = data; return this; },
  };
  const next = (err) => {
    if (err) {
      if (err.status) {
        statusCode = err.status;
        jsonResponse = { error: err.message };
      } else {
        throw err;
      }
    }
  };

  return { req, res, next, result: () => ({ statusCode, jsonResponse }) };
}

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ──────────────────────────────────────────
// Main
// ──────────────────────────────────────────
async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`DATABASE: ${process.env.DATABASE_URL}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("=== PAKET P1 — Keamanan Akun & Akses ===\n");

  const ts = Date.now();

  // Setup: buat user, category, artisan, product, variant
  const user = await prisma.user.create({
    data: { name: `P1User${ts}`, email: `p1_${ts}@test.com`, passwordHash: "dummy", role: "buyer" },
  });

  const creatorUser = await prisma.user.create({
    data: { name: `CreatorA${ts}`, email: `creatorA_${ts}@test.com`, passwordHash: "dummy", role: "creator" },
  });

  const creatorUserB = await prisma.user.create({
    data: { name: `CreatorB${ts}`, email: `creatorB_${ts}@test.com`, passwordHash: "dummy", role: "creator" },
  });

  const adminUser = await prisma.user.create({
    data: { name: `AdminP1${ts}`, email: `admin_p1_${ts}@test.com`, passwordHash: "dummy", role: "admin" },
  });

  const category = await prisma.category.create({
    data: { name: `CatP1${ts}`, slug: `cat-p1-${ts}` },
  });

  const artisanA = await prisma.artisan.create({
    data: { userId: creatorUser.id, brandName: `BrandA${ts}` },
  });

  const artisanB = await prisma.artisan.create({
    data: { userId: creatorUserB.id, brandName: `BrandB${ts}` },
  });

  const productA = await prisma.product.create({
    data: {
      artisanId: artisanA.id,
      categoryId: category.id,
      name: `ProdA${ts}`,
      slug: `prod-a-${ts}`,
      description: "A",
      price: 10000,
      images: [],
    },
  });

  const variantA = await prisma.productVariant.create({
    data: { productId: productA.id, combination: [], stock: 10 },
  });

  const productB = await prisma.product.create({
    data: {
      artisanId: artisanB.id,
      categoryId: category.id,
      name: `ProdB${ts}`,
      slug: `prod-b-${ts}`,
      description: "B",
      price: 20000,
      images: [],
    },
  });

  const variantB = await prisma.productVariant.create({
    data: { productId: productB.id, combination: [], stock: 5 },
  });

  // ═══════════════════════════════════════════
  // F-01: Injeksi Operator Prisma di OTP
  // ═══════════════════════════════════════════
  console.log("[F-01] Injeksi operator Prisma di verifikasi OTP");

  const injectionPayloads = [
    { label: 'code: {"not": ""}', code: { not: "" } },
    { label: 'code: {"contains": ""}', code: { contains: "" } },
    { label: "code: 123456 (number)", code: 123456 },
    { label: "code: [\"123456\"]", code: ["123456"] },
    { label: 'code: {"gt": ""}', code: { gt: "" } },
    { label: "code: null", code: null },
  ];

  for (const payload of injectionPayloads) {
    const m = mockReqRes({
      email: user.email,
      code: payload.code,
      newPassword: "NewPassword123!",
    });
    await forgotPasswordVerify(m.req, m.res, m.next);
    const r = m.result();
    assert(`forgotPasswordVerify ${payload.label} → 400`, r.statusCode === 400, `got ${r.statusCode}`);
  }

  // Juga tes changeEmailVerify
  const changeEmailPayloads = [
    { label: 'code: {"not": ""}', code: { not: "" } },
    { label: "code: 123456 (number)", code: 123456 },
  ];

  for (const payload of changeEmailPayloads) {
    const m = mockReqRes({ code: payload.code }, user);
    await changeEmailVerify(m.req, m.res, m.next);
    const r = m.result();
    assert(`changeEmailVerify ${payload.label} → 400`, r.statusCode === 400, `got ${r.statusCode}`);
  }

  // Tes format OTP valid (bukan 6 digit)
  const invalidFormats = [
    { label: 'code: "12345" (5 digit)', code: "12345" },
    { label: 'code: "1234567" (7 digit)', code: "1234567" },
    { label: 'code: "abcdef"', code: "abcdef" },
    { label: 'code: "12 34 56"', code: "12 34 56" },
  ];

  for (const payload of invalidFormats) {
    const m = mockReqRes({
      email: user.email,
      code: payload.code,
      newPassword: "NewPassword123!",
    });
    await forgotPasswordVerify(m.req, m.res, m.next);
    const r = m.result();
    assert(`forgotPasswordVerify ${payload.label} → 400`, r.statusCode === 400, `got ${r.statusCode}`);
  }

  // ═══════════════════════════════════════════
  // F-03: IDOR — kreator A ubah varian produk B
  // ═══════════════════════════════════════════
  console.log("\n[F-03] IDOR: kreator A mengubah varian produk B → 404");

  // Catat stok awal variantB
  const variantBBefore = await prisma.productVariant.findUnique({ where: { id: variantB.id } });

  const mIdr = mockReqRes(
    { variantStocks: [{ id: variantB.id, stock: 0 }] },
    creatorUser,
    { id: productA.id } // kreator A mengakses productA tapi kirim variantB.id
  );
  await updateProduct(mIdr.req, mIdr.res, mIdr.next);
  const rIdr = mIdr.result();
  assert("updateProduct lintas-kreator → 404", rIdr.statusCode === 404, `got ${rIdr.statusCode}`);

  // Pastikan stok B tidak berubah
  const variantBAfter = await prisma.productVariant.findUnique({ where: { id: variantB.id } });
  assert("Stok produk B tidak berubah", variantBBefore.stock === variantBAfter.stock,
    `was ${variantBBefore.stock}, now ${variantBAfter.stock}`);

  // Tes valid: kreator A ubah variannya sendiri → berhasil
  const mValid = mockReqRes(
    { variantStocks: [{ id: variantA.id, stock: 8 }] },
    creatorUser,
    { id: productA.id }
  );
  await updateProduct(mValid.req, mValid.res, mValid.next);
  const rValid = mValid.result();
  assert("updateProduct pemilik sendiri → 200", rValid.statusCode === 200, `got ${rValid.statusCode}`);

  const variantAAfter = await prisma.productVariant.findUnique({ where: { id: variantA.id } });
  assert("Stok produk A berubah ke 8", variantAAfter.stock === 8, `got ${variantAAfter.stock}`);

  // ═══════════════════════════════════════════
  // F-10: Google Login tanpa GOOGLE_CLIENT_ID
  // ═══════════════════════════════════════════
  console.log("\n[F-10] Google login tanpa GOOGLE_CLIENT_ID → 503");

  const origGoogleId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;

  const mGoogle = mockReqRes({ idToken: "fake-token" });
  await googleLogin(mGoogle.req, mGoogle.res, mGoogle.next);
  const rGoogle = mGoogle.result();
  assert("googleLogin tanpa CLIENT_ID → 503", rGoogle.statusCode === 503, `got ${rGoogle.statusCode}`);

  // Restore
  if (origGoogleId) process.env.GOOGLE_CLIENT_ID = origGoogleId;

  // ═══════════════════════════════════════════
  // F-19: Tolak pengajuan non-buyer + admin tidak terdegradasi
  // ═══════════════════════════════════════════
  console.log("\n[F-19] Pengajuan konsinyasi oleh non-buyer → 403");

  // Creator mengajukan → 403
  const mApplyCreator = mockReqRes(
    { applicantName: "Test", contact: "08123", brandName: "Brand", description: "Desc" },
    creatorUser
  );
  await applyConsignment(mApplyCreator.req, mApplyCreator.res, mApplyCreator.next);
  const rApplyCreator = mApplyCreator.result();
  assert("applyConsignment oleh creator → 403", rApplyCreator.statusCode === 403, `got ${rApplyCreator.statusCode}`);

  // Admin mengajukan → 403
  const mApplyAdmin = mockReqRes(
    { applicantName: "Test", contact: "08123", brandName: "Brand", description: "Desc" },
    adminUser
  );
  await applyConsignment(mApplyAdmin.req, mApplyAdmin.res, mApplyAdmin.next);
  const rApplyAdmin = mApplyAdmin.result();
  assert("applyConsignment oleh admin → 403", rApplyAdmin.statusCode === 403, `got ${rApplyAdmin.statusCode}`);

  // Buyer mengajukan → 201
  const mApplyBuyer = mockReqRes(
    { applicantName: "Test", contact: "08123", brandName: `BrandNew${ts}`, description: "Desc" },
    user
  );
  await applyConsignment(mApplyBuyer.req, mApplyBuyer.res, mApplyBuyer.next);
  const rApplyBuyer = mApplyBuyer.result();
  assert("applyConsignment oleh buyer → 201", rApplyBuyer.statusCode === 201, `got ${rApplyBuyer.statusCode}`);

  // Tes admin approve tidak menimpa role admin
  console.log("\n[F-19] Approve application tidak menimpa role admin");

  // Buat application dari adminUser (langsung di DB, bypass check)
  const adminApp = await prisma.artisanApplication.create({
    data: {
      userId: adminUser.id,
      applicantName: "Admin Test",
      contact: "08123",
      brandName: `AdminBrand${ts}`,
      description: "Desc",
      status: "pending",
    },
  });

  const mApprove = mockReqRes({}, adminUser, { id: adminApp.id });
  await approveApplication(mApprove.req, mApprove.res, mApprove.next);
  const rApprove = mApprove.result();
  assert("approveApplication → 200", rApprove.statusCode === 200, `got ${rApprove.statusCode}`);

  // Periksa role admin tetap admin
  const adminAfterApprove = await prisma.user.findUnique({ where: { id: adminUser.id } });
  assert("Admin role tetap admin setelah approve", adminAfterApprove.role === "admin",
    `got ${adminAfterApprove.role}`);

  // ═══════════════════════════════════════════
  // F-14: Detail produk tidak bocorkan data order
  // ═══════════════════════════════════════════
  console.log("\n[F-14] Detail produk tidak membocorkan data order di review");

  // Buat order + review untuk productA
  const order = await prisma.order.create({
    data: {
      orderNumber: `SDK-P14-${ts}`,
      userId: user.id,
      paymentMethod: "cod",
      status: "selesai",
      totalAmount: 10000,
      pickupDate: new Date(),
      pickupSlot: "10:00",
      items: {
        create: {
          productId: productA.id,
          variantId: variantA.id,
          quantity: 1,
          priceSnapshot: 10000,
        },
      },
    },
    include: { items: true },
  });

  await prisma.review.create({
    data: {
      userId: user.id,
      productId: productA.id,
      orderItemId: order.items[0].id,
      rating: 5,
      comment: "Bagus sekali!",
      status: "tampil",
    },
  });

  // Panggil getProductById dan periksa response
  const mDetail = mockReqRes({}, null, { id: productA.id });
  await getProductById(mDetail.req, mDetail.res, mDetail.next);
  const rDetail = mDetail.result();
  assert("getProductById → 200", rDetail.statusCode === 200, `got ${rDetail.statusCode}`);

  if (rDetail.statusCode === 200 && rDetail.jsonResponse?.product?.reviews?.length > 0) {
    const review = rDetail.jsonResponse.product.reviews[0];
    assert("Review memiliki user.name", !!review.user?.name);
    assert("Review memiliki rating", review.rating !== undefined);
    assert("Review memiliki comment", !!review.comment);
    assert("Review TIDAK memiliki orderItem", review.orderItem === undefined);
    assert("Review TIDAK memiliki order data", review.order === undefined);

    // Cek tidak ada field order sensitif
    const reviewStr = JSON.stringify(review);
    assert("Review tidak mengandung orderNumber", !reviewStr.includes("orderNumber"));
    assert("Review tidak mengandung totalAmount", !reviewStr.includes("totalAmount"));
    assert("Review tidak mengandung paymentMethod", !reviewStr.includes("paymentMethod"));
  }

  // ═══════════════════════════════════════════
  // Ringkasan
  // ═══════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`Hasil: ${passed} lulus, ${failed} gagal`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("\n[FATAL ERROR]:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
