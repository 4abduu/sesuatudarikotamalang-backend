/**
 * test_creator_application_flow.js
 * Langkah 10: Tes alur pengajuan kreator end-to-end:
 * - Batas samplePhotos = 10 (bukan 5)
 * - createApplicationForUser sukses dengan 10 foto
 * - Tidak bisa kirim 2 pengajuan sekaligus
 * - approve: role naik ke creator, artisan dibuat, admin tidak terturunkan
 * - reject: status ditolak, notif terkirim
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const { createApplicationForUser, getMyApplications } =
  require("../dist/dal/artisanProfile");
const adminController = require("../dist/controllers/adminController").default;

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}
async function throws(label, fn) {
  try { await fn(); console.error(`GAGAL  ${label} (tidak melempar)`); failed++; }
  catch (e) { console.log(`LULUS  ${label} (error: ${e.message?.slice(0, 60)})`); passed++; }
}

function invokeAdmin(handler, req) {
  return new Promise((resolve, reject) => {
    let _status = 200;
    const res = {
      status(code) { _status = code; return res; },
      json(data) { resolve({ status: _status, body: data }); return res; },
    };
    Promise.resolve(handler(req, res, (err) => {
      if (err?.status) resolve({ status: err.status, body: { error: err.message } });
      else reject(err);
    })).catch(reject);
  });
}

const BUYER_ID = "flow_test_buyer_id";
const ADMIN_ID = "flow_test_admin_id";
let CATEGORY_ID;

// 10 URL HTTPS uji
const SAMPLE_PHOTOS_10 = Array.from({ length: 10 }, (_, i) => `https://res.cloudinary.com/test/image/upload/sample${i}.jpg`);

async function setup() {
  // Bersihkan data lama
  await prisma.notification.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.artisanApplication.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.artisan.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [BUYER_ID, ADMIN_ID] } } }).catch(() => {});

  await prisma.user.create({ data: { id: BUYER_ID, name: "Buyer Flow", email: `buyer_flow_${Date.now()}@test.local`, passwordHash: "h", role: "buyer" } });
  await prisma.user.create({ data: { id: ADMIN_ID, name: "Admin Flow", email: `admin_flow_${Date.now()}@test.local`, passwordHash: "h", role: "admin" } });

  // Ambil atau buat kategori
  const cat = await prisma.category.findFirst() ?? await prisma.category.create({ data: { name: "Test Cat", slug: `test-cat-${Date.now()}` } });
  CATEGORY_ID = cat.id;
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.artisanApplication.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.artisan.deleteMany({ where: { userId: BUYER_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [BUYER_ID, ADMIN_ID] } } }).catch(() => {});
}

async function runTests() {
  await setup();

  const buyer = { id: BUYER_ID, role: "buyer" };

  // ── batas samplePhotos = 10 ───────────────────────────────────────────────
  // 10 foto → diterima
  const app10 = await createApplicationForUser(buyer, {
    applicantName: "Buyer Flow",
    contact: "08123456789",
    brandName: "BrandFlow10",
    categoryId: CATEGORY_ID,
    description: "Karya anyaman terbaik",
    samplePhotos: SAMPLE_PHOTOS_10,
  });
  ok("createApplication: 10 foto diterima", app10?.id !== undefined);
  ok("samplePhotos tersimpan",               Array.isArray(app10?.samplePhotos) && app10.samplePhotos.length === 10);

  // Pengajuan kedua saat pending → error
  await throws("pengajuan kedua saat pending → error",
    () => createApplicationForUser(buyer, {
      applicantName: "Buyer Flow",
      contact: "081",
      brandName: "BrandDua",
      description: "Tidak bisa",
      samplePhotos: [],
    })
  );

  // getMyApplications mengembalikan daftar
  const myApps = await getMyApplications(buyer);
  ok("getMyApplications: ada pengajuan",  myApps.length >= 1);
  ok("getMyApplications: include category", myApps[0]?.category !== undefined);

  // 11 foto → error
  await throws("11 foto → error",
    () => createApplicationForUser({ id: "dummy", role: "buyer" }, {
      applicantName: "X",
      contact: "X",
      brandName: "X",
      description: "X",
      samplePhotos: [...SAMPLE_PHOTOS_10, "https://res.cloudinary.com/test/image/upload/extra.jpg"],
    })
  );

  // ── Approve: periksa role naik ke creator, artisan dibuat ────────────────
  const adminReq = (params, body = {}) => ({
    user: { id: ADMIN_ID, role: "admin" },
    params,
    body,
    query: {},
  });

  const approveRes = await invokeAdmin(adminController.approveApplication, adminReq({ id: app10.id }));
  ok("approveApplication: 200",               approveRes.status === 200);

  const userAfter = await prisma.user.findUnique({ where: { id: BUYER_ID } });
  ok("approve: role berubah ke creator",      userAfter?.role === "creator");

  const artisanCreated = await prisma.artisan.findUnique({ where: { userId: BUYER_ID } });
  ok("approve: artisan dibuat",               artisanCreated !== null);

  const notifApprove = await prisma.notification.findFirst({ where: { userId: BUYER_ID, type: "pengajuan_diterima" } });
  ok("approve: notifikasi dikirim",           notifApprove !== null);

  const appAfterApprove = await prisma.artisanApplication.findUnique({ where: { id: app10.id } });
  ok("approve: status = diterima",            appAfterApprove?.status === "diterima");
  ok("approve: decidedAt tidak null",         appAfterApprove?.decidedAt !== null);

  // Approve lagi → 400
  const approveAgain = await invokeAdmin(adminController.approveApplication, adminReq({ id: app10.id }));
  ok("approve 2x: 400",                       approveAgain.status === 400);

  // ── Proteksi role admin tidak terturunkan ─────────────────────────────────
  // Buat pengajuan dari admin (edge case)
  const adminUser = await prisma.user.findUnique({ where: { id: ADMIN_ID } });
  // Admin sudah role admin, buat pengajuan manual
  const adminApp = await prisma.artisanApplication.create({
    data: {
      userId: ADMIN_ID,
      applicantName: "Admin Creator",
      contact: "082",
      brandName: "AdminBrand",
      description: "Test",
      status: "pending",
    },
  });
  const approveAdminRes = await invokeAdmin(adminController.approveApplication, adminReq({ id: adminApp.id }));
  ok("approve pengajuan admin: 200",          approveAdminRes.status === 200);
  const adminAfter = await prisma.user.findUnique({ where: { id: ADMIN_ID } });
  ok("role admin tidak diturunkan",           adminAfter?.role === "admin");

  // ── Reject ────────────────────────────────────────────────────────────────
  // Buat pengajuan baru untuk reject
  await prisma.artisanApplication.deleteMany({ where: { userId: BUYER_ID, status: "pending" } }).catch(() => {});
  const appForReject = await prisma.artisanApplication.create({
    data: {
      userId: BUYER_ID,
      applicantName: "Buyer Flow",
      contact: "08123456789",
      brandName: "BrandReject",
      description: "Pengajuan kedua",
      status: "pending",
    },
  });
  const rejectRes = await invokeAdmin(adminController.rejectApplication, adminReq({ id: appForReject.id }, { reason: "Belum memenuhi kriteria" }));
  ok("rejectApplication: 200",               rejectRes.status === 200);
  const appAfterReject = await prisma.artisanApplication.findUnique({ where: { id: appForReject.id } });
  ok("reject: status = ditolak",             appAfterReject?.status === "ditolak");
  ok("reject: rejectReason tersimpan",       appAfterReject?.rejectReason?.includes("Belum memenuhi"));

  const notifReject = await prisma.notification.findFirst({ where: { userId: BUYER_ID, type: "pengajuan_ditolak" } });
  ok("reject: notifikasi dikirim",           notifReject !== null);

  // Reject lagi → 400
  const rejectAgain = await invokeAdmin(adminController.rejectApplication, adminReq({ id: appForReject.id }));
  ok("reject 2x: 400",                       rejectAgain.status === 400);

  // reason > 500 → 400
  const rejectLong = await invokeAdmin(adminController.rejectApplication, adminReq({ id: appForReject.id }, { reason: "x".repeat(501) }));
  ok("reject reason >500 char: 400",         rejectLong.status === 400);

  await cleanup();
}

runTests().then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES creator application flow LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});
