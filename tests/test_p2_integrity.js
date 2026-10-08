/**
 * test_p2_integrity.js — Tes Paket P2 (Konsistensi Stok, QR Scan, & Pembatalan)
 *
 * Tes: F-02 (Oversell & Race Condition pada Order Paralel), F-06 (Scan QR Order Unpaid Midtrans), F-15 (Pembatalan Order Lunas/Expired)
 * Jalankan: node tests/test_p2_integrity.js
 * Database: sesuatu_darikota_malang_test
 */

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!dbUrl.includes("_test")) {
  console.error("FATAL: DATABASE_URL harus mengarah ke database test (_test). URL saat ini:", dbUrl);
  process.exit(1);
}

const prisma = require("../src/lib/prisma");
const { createOrder, cancelOrder } = require("../src/controllers/orders.controller");
const { verifyScanQr } = require("../src/controllers/admin.controller");

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

let testUser1, testUser2, adminUser, testProduct, testVariant;

async function setupTestData() {
  console.log("--> Setting up test data for Paket P2...");

  // Clean test tables
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.artisan.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  testUser1 = await prisma.user.create({
    data: { name: "User 1", email: "user1@test.com", passwordHash: "hash", role: "buyer" },
  });
  testUser2 = await prisma.user.create({
    data: { name: "User 2", email: "user2@test.com", passwordHash: "hash", role: "buyer" },
  });
  adminUser = await prisma.user.create({
    data: { name: "Admin", email: "admin@test.com", passwordHash: "hash", role: "admin" },
  });

  const artisanUser = await prisma.user.create({
    data: { name: "Artisan", email: "artisan@test.com", passwordHash: "hash", role: "creator" },
  });
  const artisan = await prisma.artisan.create({
    data: { user: { connect: { id: artisanUser.id } }, brandName: "Toko Malang P2", status: "aktif" },
  });

  await prisma.category.deleteMany();
  const category = await prisma.category.create({
    data: { name: "Makanan P2", slug: "makanan-p2" },
  });

  // Product with stock = 1
  testProduct = await prisma.product.create({
    data: {
      artisan: { connect: { id: artisan.id } },
      category: { connect: { id: category.id } },
      name: "Keripik Limited Edition",
      slug: "keripik-limited-p2",
      price: 25000,
      description: "Terbatas",
      images: [],
      isActive: true,
    },
  });

  testVariant = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      combination: [{ name: "Rasa", value: "Pedas" }],
      stock: 1,
    },
  });
}

async function runP2Tests() {
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  await setupTestData();

  console.log("\n==================================================");
  console.log("TESTING PAKET P2");
  console.log("==================================================\n");

  // ═══════════════════════════════════════════
  // F-02: Concurrency & Oversell Protection (5 Parallel Order Requests for Stock = 1)
  // ═══════════════════════════════════════════
  console.log("[F-02] Uji Konkurensi createOrder (5 Order Paralel untuk Stok = 1)");

  const requests = Array.from({ length: 5 }).map((_, idx) => {
    const req = {
      user: idx % 2 === 0 ? testUser1 : testUser2,
      body: {
        productId: testProduct.id,
        variantId: testVariant.id,
        pickupDate: new Date().toISOString(),
        pickupSlot: "10:00-12:00",
        paymentMethod: "cod",
      },
    };
    const res = mockRes();
    return createOrder(req, res, (err) => {
      res.statusCode = err.status || 500;
      res.body = { error: err.message };
    }).then(() => res);
  });

  const responses = await Promise.all(requests);

  const successCount = responses.filter((r) => r.statusCode === 201).length;
  const conflictCount = responses.filter((r) => r.statusCode === 409).length;

  assert(successCount === 1, `Tepat 1 order berhasil dibuat (201). Actual: ${successCount}`);
  assert(conflictCount === 4, `Tepat 4 order ditolak stok habis (409). Actual: ${conflictCount}`);

  // ═══════════════════════════════════════════
  // F-06: QR Scan Protection on Unpaid Midtrans Order
  // ═══════════════════════════════════════════
  console.log("\n[F-06] Uji Scan QR Pick-Up untuk Order Midtrans Belum Lunas");

  // Create an unpaid Midtrans order
  const unpaidMidtransOrder = await prisma.order.create({
    data: {
      orderNumber: "SDK-MIDTRANS-UNPAID",
      userId: testUser1.id,
      paymentMethod: "midtrans",
      status: "menunggu_bayar",
      totalAmount: 50000,
      pickupDate: new Date(),
      pickupSlot: "10:00-12:00",
      items: {
        create: [
          {
            productId: testProduct.id,
            variantId: testVariant.id,
            quantity: 1,
            priceSnapshot: 50000,
          },
        ],
      },
    },
  });

  const qrReq = { body: { orderNumber: unpaidMidtransOrder.orderNumber } };
  const qrRes = mockRes();
  await verifyScanQr(qrReq, qrRes, (err) => {
    qrRes.statusCode = err.status || 500;
    qrRes.body = { error: err.message };
  });

  assert(qrRes.statusCode === 400, "Scan QR order Midtrans unpaid ditolak (400)");
  assert(
    qrRes.body.error && qrRes.body.error.includes("belum lunas"),
    `Pesan error menyebutkan 'belum lunas'. Actual: '${qrRes.body.error}'`
  );

  // ═══════════════════════════════════════════
  // F-15: Restriction on Buyer Cancelling Paid / Expired Deadline Orders
  // ═══════════════════════════════════════════
  console.log("\n[F-15] Uji Pembatalan Order oleh Buyer");

  // Create a paid order
  const paidOrder = await prisma.order.create({
    data: {
      orderNumber: "SDK-PAID-01",
      userId: testUser1.id,
      paymentMethod: "midtrans",
      status: "lunas",
      totalAmount: 25000,
      pickupDate: new Date(),
      pickupSlot: "10:00-12:00",
    },
  });

  // Create a lewat_batas_pengambilan order
  const expiredDeadlineOrder = await prisma.order.create({
    data: {
      orderNumber: "SDK-DEADLINE-01",
      userId: testUser1.id,
      paymentMethod: "midtrans",
      status: "lewat_batas_pengambilan",
      totalAmount: 25000,
      pickupDate: new Date(),
      pickupSlot: "10:00-12:00",
    },
  });

  // Buyer tries to cancel paid order -> 403
  const cancelPaidReq = { user: testUser1, params: { id: paidOrder.id } };
  const cancelPaidRes = mockRes();
  await cancelOrder(cancelPaidReq, cancelPaidRes, (err) => {
    cancelPaidRes.statusCode = err.status || 500;
    cancelPaidRes.body = { error: err.message };
  });

  assert(cancelPaidRes.statusCode === 403, "Buyer tidak bisa membatalkan order status 'lunas' (403)");

  // Buyer tries to cancel lewat_batas_pengambilan order -> 403
  const cancelDeadlineReq = { user: testUser1, params: { id: expiredDeadlineOrder.id } };
  const cancelDeadlineRes = mockRes();
  await cancelOrder(cancelDeadlineReq, cancelDeadlineRes, (err) => {
    cancelDeadlineRes.statusCode = err.status || 500;
    cancelDeadlineRes.body = { error: err.message };
  });

  assert(
    cancelDeadlineRes.statusCode === 403,
    "Buyer tidak bisa membatalkan order status 'lewat_batas_pengambilan' (403)"
  );

  console.log("\n==================================================");
  console.log(`HASIL TES PAKET P2: ${passed}/${total} LULUS`);
  console.log("==================================================\n");

  await prisma.$disconnect();
  if (passed !== total) process.exit(1);
}

runP2Tests().catch((err) => {
  console.error("Fatal error running P2 tests:", err);
  prisma.$disconnect().then(() => process.exit(1));
});
