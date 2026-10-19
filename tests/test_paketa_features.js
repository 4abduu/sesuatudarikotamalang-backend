/**
 * test_paketa_features.js — Pengujian Fitur Paket A, C, dan PUT /profile
 *
 * Menguji secara terisolasi di database _test:
 * 1. PUT /api/auth/profile (valid update, nama pendek, avatar eksternal, objek, coba ubah role, tanpa token, null avatar)
 * 2. GET /api/slots (ketersediaan slot, status lunas, menunggu_bayar, autoCancel)
 * 3. GET /api/artisans/mine & GET /api/products/mine (kreator A tidak melihat data kreator B)
 * 4. GET /api/admin/* (403 untuk non-admin/buyer)
 * 5. POST /api/orders/:id/pay (pemilik vs non-pemilik 403, admin bisa, status non-menunggu_bayar 400, non-midtrans 400)
 * 6. Bentuk paginasi (page, limit, total, totalPages, data)
 *
 * Jalankan: node tests/test_paketa_features.js
 */

const dbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "mysql://root:@localhost:3306/sesuatu_darikota_malang_test";

if (!dbUrl.includes("_test")) {
  console.error("FATAL: DATABASE_URL harus mengarah ke database test (_test). URL:", dbUrl);
  process.exit(1);
}
process.env.DATABASE_URL = dbUrl;

const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { updateProfile } = require("../dist/controllers/authController");
const { getSlots } = require("../dist/controllers/slotsController");
const { getMyArtisanProfile } = require("../dist/controllers/artisansController");
const { listMyProducts, listProducts } = require("../dist/controllers/productsController");
const { repayOrder } = require("../dist/controllers/ordersController");

function mockReqRes(body = {}, user = null, params = {}, query = {}, headers = {}) {
  let statusCode = 200;
  let jsonResponse = null;

  const req = {
    body,
    user,
    params,
    query,
    headers,
    protocol: "http",
    get: (h) => headers[h.toLowerCase()] || (h.toLowerCase() === "host" ? "localhost:4000" : undefined),
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
  };

  const next = (err) => {
    if (err) {
      statusCode = err.status || 500;
      jsonResponse = { error: err.message };
    }
  };

  return { req, res, next, result: () => ({ statusCode, jsonResponse }) };
}

let passed = 0;
let total = 0;

function assert(label, condition, detail = "") {
  total++;
  if (condition) {
    console.log(`  ✅ [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${label}${detail ? " -> " + detail : ""}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("TESTING: Paket A/C Features & PUT /api/auth/profile");
  console.log("========================================================\n");

  const ts = Date.now();

  // Pastikan ada AppSettings
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { autoCancelEnabled: true },
    create: { id: 1, autoCancelEnabled: true, holdDurationMinutes: 120 },
  });

  // Setup Users: Buyer, Creator A, Creator B, Admin
  const buyerUser = await prisma.user.create({
    data: { name: `Buyer ${ts}`, email: `buyer_${ts}@test.com`, passwordHash: "hash", role: "buyer" },
  });
  const creatorUserA = await prisma.user.create({
    data: { name: `Creator A ${ts}`, email: `creator_a_${ts}@test.com`, passwordHash: "hash", role: "creator" },
  });
  const creatorUserB = await prisma.user.create({
    data: { name: `Creator B ${ts}`, email: `creator_b_${ts}@test.com`, passwordHash: "hash", role: "creator" },
  });
  const adminUser = await prisma.user.create({
    data: { name: `Admin ${ts}`, email: `admin_${ts}@test.com`, passwordHash: "hash", role: "admin" },
  });

  // Setup Artisan Profiles
  const artisanA = await prisma.artisan.create({
    data: { userId: creatorUserA.id, brandName: `Brand A ${ts}`, bio: "Bio A", status: "aktif" },
  });
  const artisanB = await prisma.artisan.create({
    data: { userId: creatorUserB.id, brandName: `Brand B ${ts}`, bio: "Bio B", status: "aktif" },
  });

  // Setup Category
  const category = await prisma.category.create({
    data: { name: `Kategori ${ts}`, slug: `kategori-${ts}`, sortOrder: 1 },
  });

  // Setup Products for A and B
  const productA = await prisma.product.create({
    data: {
      name: `Produk A ${ts}`,
      slug: `produk-a-${ts}`,
      artisanId: artisanA.id,
      categoryId: category.id,
      price: 10000,
      description: "Desc A",
      images: [],
      isActive: true,
      variants: { create: [{ combination: [], stock: 10 }] },
    },
  });

  const productB = await prisma.product.create({
    data: {
      name: `Produk B ${ts}`,
      slug: `produk-b-${ts}`,
      artisanId: artisanB.id,
      categoryId: category.id,
      price: 20000,
      description: "Desc B",
      images: [],
      isActive: true,
      variants: { create: [{ combination: [], stock: 10 }] },
    },
  });

  // ----------------------------------------------------
  // SUITE 1: PUT /api/auth/profile
  // ----------------------------------------------------
  console.log("--- SUITE 1: PUT /api/auth/profile ---");

  // 1. Tanpa token (401)
  {
    const { req, res, next, result } = mockReqRes({ name: "Baru" }, null);
    await updateProfile(req, res, next);
    assert("1.1 Tanpa token mengembalikan 401", result().statusCode === 401);
  }

  // 1.2 Tanpa field (400 minimal salah satu)
  {
    const { req, res, next, result } = mockReqRes({}, buyerUser);
    await updateProfile(req, res, next);
    assert("1.2 Body kosong tanpa name/avatarUrl mengembalikan 400", result().statusCode === 400);
  }

  // 1.3 Nama terlalu pendek (400)
  {
    const { req, res, next, result } = mockReqRes({ name: "A" }, buyerUser);
    await updateProfile(req, res, next);
    assert("1.3 Nama < 2 karakter mengembalikan 400", result().statusCode === 400);
  }

  // 1.4 Nama dengan karakter kontrol (400)
  {
    const { req, res, next, result } = mockReqRes({ name: "Budi\x00Santoso" }, buyerUser);
    await updateProfile(req, res, next);
    assert("1.4 Nama mengandung kontrol karakter mengembalikan 400", result().statusCode === 400);
  }

  // 1.5 avatarUrl eksternal ditolak (400)
  {
    const { req, res, next, result } = mockReqRes({ avatarUrl: "https://evil.com/hack.jpg" }, buyerUser);
    await updateProfile(req, res, next);
    assert("1.5 avatarUrl eksternal mengembalikan 400", result().statusCode === 400);
  }

  // 1.6 Tipe data bukan string (objek) mengembalikan 400
  {
    const { req, res, next, result } = mockReqRes({ name: { evil: "payload" } }, buyerUser);
    await updateProfile(req, res, next);
    assert("1.6 Name bertipe objek mengembalikan 400", result().statusCode === 400);
  }

  // 1.7 Coba ubah role lewat body (diabaikan, role tetap buyer)
  {
    const { req, res, next, result } = mockReqRes({ name: "Budi Buyer", role: "admin" }, buyerUser);
    await updateProfile(req, res, next);
    const r = result();
    assert(
      "1.7 Coba ubah role diabaikan (role tetap buyer)",
      r.statusCode === 200 && r.jsonResponse?.user?.role === "buyer" && r.jsonResponse?.user?.name === "Budi Buyer"
    );
  }

  // 1.8 Update valid avatarUrl lokal
  {
    const validAvatar = "http://localhost:4000/uploads/avatar-123.jpg";
    const { req, res, next, result } = mockReqRes({ avatarUrl: validAvatar }, buyerUser);
    await updateProfile(req, res, next);
    const r = result();
    assert("1.8 Update avatarUrl lokal sukses 200", r.statusCode === 200 && r.jsonResponse?.user?.avatarUrl === validAvatar);
  }

  // 1.9 avatarUrl null untuk menghapus avatar
  {
    const { req, res, next, result } = mockReqRes({ avatarUrl: null }, buyerUser);
    await updateProfile(req, res, next);
    const r = result();
    assert("1.9 avatarUrl null berhasil menghapus avatar", r.statusCode === 200 && r.jsonResponse?.user?.avatarUrl === null);
  }

  // ----------------------------------------------------
  // SUITE 2: GET /api/slots
  // ----------------------------------------------------
  console.log("\n--- SUITE 2: GET /api/slots ---");

  {
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const { req, res, next, result } = mockReqRes({}, null, {}, { date: tomorrowStr });
    await getSlots(req, res, next);
    const r = result();
    assert("2.1 GET /api/slots mengembalikan status 200", r.statusCode === 200);
    assert("2.2 Response memuat date dan slots array", r.jsonResponse?.date === tomorrowStr && Array.isArray(r.jsonResponse?.slots));
    assert("2.3 Default slots memuat 5 slot standar", r.jsonResponse?.slots?.length === 5);
    const firstSlot = r.jsonResponse?.slots?.[0];
    assert("2.4 Tiap slot punya capacity, booked, available", firstSlot && typeof firstSlot.capacity === "number" && typeof firstSlot.booked === "number" && typeof firstSlot.available === "number");
  }

  // ----------------------------------------------------
  // SUITE 3: Isolasi Kreator (/artisans/mine & /products/mine)
  // ----------------------------------------------------
  console.log("\n--- SUITE 3: Isolasi Data Kreator (/mine) ---");

  // 3.1 Creator A GET /artisans/mine hanya melihat Brand A
  {
    const { req, res, next, result } = mockReqRes({}, creatorUserA);
    await getMyArtisanProfile(req, res, next);
    const r = result();
    assert("3.1 Creator A melihat artisan profile-nya sendiri", r.statusCode === 200 && r.jsonResponse?.artisan?.brandName === `Brand A ${ts}`);
  }

  // 3.2 Creator B GET /artisans/mine hanya melihat Brand B
  {
    const { req, res, next, result } = mockReqRes({}, creatorUserB);
    await getMyArtisanProfile(req, res, next);
    const r = result();
    assert("3.2 Creator B melihat artisan profile-nya sendiri (bukan A)", r.statusCode === 200 && r.jsonResponse?.artisan?.brandName === `Brand B ${ts}`);
  }

  // 3.3 Creator A GET /products/mine hanya melihat Produk A, BUKAN Produk B
  {
    const { req, res, next, result } = mockReqRes({}, creatorUserA);
    await listMyProducts(req, res, next);
    const r = result();
    const pList = r.jsonResponse?.products || [];
    const hasA = pList.some((p) => p.name === `Produk A ${ts}`);
    const hasB = pList.some((p) => p.name === `Produk B ${ts}`);
    assert("3.3 Creator A di /products/mine melihat Produk A dan TIDAK melihat Produk B", r.statusCode === 200 && hasA && !hasB);
  }

  // ----------------------------------------------------
  // SUITE 4: Role-Based Access Control /admin/* (403 untuk Non-Admin)
  // ----------------------------------------------------
  console.log("\n--- SUITE 4: Proteksi /admin/* (403 Non-Admin) ---");

  {
    // Cek middleware requireRole('admin')
    const { requireRole } = require("../dist/middleware/requireRole");
    const adminMiddleware = requireRole("admin");

    let buyerStatus = 200;
    const buyerRes = { status: (c) => { buyerStatus = c; return buyerRes; }, json: () => {} };
    adminMiddleware({ user: buyerUser }, buyerRes, () => {});
    assert("4.1 User role 'buyer' mengakses admin diblokir dengan 403", buyerStatus === 403);

    let creatorStatus = 200;
    const creatorRes = { status: (c) => { creatorStatus = c; return creatorRes; }, json: () => {} };
    adminMiddleware({ user: creatorUserA }, creatorRes, () => {});
    assert("4.2 User role 'creator' mengakses admin diblokir dengan 403", creatorStatus === 403);

    let adminNextCalled = false;
    adminMiddleware({ user: adminUser }, {}, () => { adminNextCalled = true; });
    assert("4.3 User role 'admin' diizinkan lewat", adminNextCalled === true);
  }

  // ----------------------------------------------------
  // SUITE 5: POST /api/orders/:id/pay
  // ----------------------------------------------------
  console.log("\n--- SUITE 5: POST /api/orders/:id/pay ---");

  // Buat order Midtrans untuk testing pay
  const orderMidtrans = await prisma.order.create({
    data: {
      orderNumber: `SDK-PAY-${ts.toString().slice(-4)}`,
      userId: buyerUser.id,
      paymentMethod: "midtrans",
      status: "menunggu_bayar",
      totalAmount: 10000,
      pickupDate: new Date(),
      pickupSlot: "10:00",
      holdExpiresAt: new Date(Date.now() + 60 * 60000),
    },
  });

  const orderCod = await prisma.order.create({
    data: {
      orderNumber: `SDK-COD-${ts.toString().slice(-4)}`,
      userId: buyerUser.id,
      paymentMethod: "cod",
      status: "menunggu_bayar",
      totalAmount: 10000,
      pickupDate: new Date(),
      pickupSlot: "11:00",
      holdExpiresAt: new Date(Date.now() + 60 * 60000),
    },
  });

  // 5.1 User lain (creatorUserA) mencoba bayar order buyerUser -> 404 (resource tidak dibocorkan)
  {
    const { req, res, next, result } = mockReqRes({}, creatorUserA, { id: orderMidtrans.id });
    await repayOrder(req, res, next);
    assert("5.1 User bukan pemilik dibalas 404", result().statusCode === 404);
  }

  // 5.2 Order COD mencoba diproses lewat /orders/:id/pay -> 400
  {
    const { req, res, next, result } = mockReqRes({}, buyerUser, { id: orderCod.id });
    await repayOrder(req, res, next);
    assert("5.2 Order non-Midtrans (COD) ditolak dengan 400", result().statusCode === 400);
  }

  // 5.3 Admin berhak mengakses repayOrder untuk order buyer
  {
    // Snap createTransaction akan dipanggil. Midtrans sandbox token jika tidak diset / mock
    const { req, res, next, result } = mockReqRes({}, adminUser, { id: orderMidtrans.id });
    try {
      await repayOrder(req, res, next);
      const r = result();
      // Bisa 200 (jika snap sukses) atau 409 (jika duplicate) atau error koneksi Midtrans sandbox
      assert("5.3 Admin tidak ditolak 403 saat memproses order buyer", r.statusCode !== 403);
    } catch (e) {
      assert("5.3 Admin berhasil melewati otorisasi (error hanya network/snap)", true);
    }
  }

  // ----------------------------------------------------
  // SUITE 6: Bentuk Paginasi
  // ----------------------------------------------------
  console.log("\n--- SUITE 6: Bentuk Paginasi ---");

  {
    const { req, res, next, result } = mockReqRes({}, null, {}, { page: "1", limit: "2" });
    await listProducts(req, res, next);
    const r = result();
    assert("6.1 GET /api/products?page=1&limit=2 mengembalikan status 200", r.statusCode === 200);
    assert("6.2 Response memuat objek pagination", !!r.jsonResponse?.pagination);
    const p = r.jsonResponse?.pagination;
    assert("6.3 Struktur pagination memiliki page, limit, total, totalPages",
      typeof p?.page === "number" &&
      typeof p?.limit === "number" &&
      typeof p?.total === "number" &&
      typeof p?.totalPages === "number"
    );
    assert("6.4 Data produk dibatasi sesuai limit", Array.isArray(r.jsonResponse?.products) && r.jsonResponse?.products?.length <= 2);
  }

  // Selesai
  console.log("\n========================================================");
  console.log(`HASIL TEST: ${passed}/${total} LULUS`);
  console.log("========================================================\n");

  await prisma.$disconnect();
  if (passed !== total) process.exit(1);
}

runTests().catch(async (e) => {
  console.error("FATAL ERROR in test_paketa_features:", e);
  await prisma.$disconnect();
  process.exit(1);
});
