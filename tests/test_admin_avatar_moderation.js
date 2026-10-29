/**
 * test_admin_avatar_moderation.js
 * Langkah 10: Tes endpoint moderasi foto admin (Langkah 9B).
 * - GET /api/admin/users (filter, search, hasAvatar, role, pagination)
 * - POST /api/admin/users/:id/reset-avatar (hapus foto, kirim notif, releaseUrls)
 * - POST /api/admin/artisans/:id/reset-avatar (hapus foto toko, proteksi official store)
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const adminController = require("../dist/controllers/adminController").default;
const { listAdminUsers, resetUserAvatar, resetArtisanAvatar } = adminController;

// Stub Cloudinary
const cloudinaryMod = require("../dist/lib/cloudinary");
let deletedIds = [];
cloudinaryMod.deleteFromCloudinary = async (publicId) => { deletedIds.push(publicId); };

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    let _status = 200;
    const res = {
      status(code) { _status = code; return res; },
      json(data) { resolve({ status: _status, body: data }); return res; },
    };
    const next = (err) => {
      if (err?.status) resolve({ status: err.status, body: { error: err.message } });
      else reject(err);
    };
    Promise.resolve(handler(req, res, next)).catch(reject);
  });
}

// IDs uji
const ADMIN_USER_ID = "mod_test_admin_id";
const BUYER_ID = "mod_test_buyer_id";
const CREATOR_ID = "mod_test_creator_id";
const ARTISAN_ID = "mod_test_artisan_id";
const AVATAR_URL = "https://res.cloudinary.com/test/image/upload/mod_avatar.jpg";
const ARTISAN_AVATAR = "https://res.cloudinary.com/test/image/upload/mod_artisan_av.jpg";

async function setup() {
  // Buat user admin pembuat request
  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: {},
    create: { id: ADMIN_USER_ID, name: "Admin Mod", email: `admin_mod_${Date.now()}@test.local`, passwordHash: "h", role: "admin" },
  });
  // Buyer dengan avatar
  await prisma.user.upsert({
    where: { id: BUYER_ID },
    update: { avatarUrl: AVATAR_URL },
    create: { id: BUYER_ID, name: "Buyer Mod", email: `buyer_mod_${Date.now()}@test.local`, passwordHash: "h", role: "buyer", avatarUrl: AVATAR_URL },
  });
  // Creator untuk artisan test
  await prisma.user.upsert({
    where: { id: CREATOR_ID },
    update: {},
    create: { id: CREATOR_ID, name: "Creator Mod", email: `creator_mod_${Date.now()}@test.local`, passwordHash: "h", role: "creator" },
  });
  await prisma.artisan.upsert({
    where: { id: ARTISAN_ID },
    update: { avatarUrl: ARTISAN_AVATAR },
    create: { id: ARTISAN_ID, userId: CREATOR_ID, brandName: "Toko Mod", status: "aktif", avatarUrl: ARTISAN_AVATAR, isOfficial: false },
  });
  // Record UploadedFile agar releaseUrls bisa temukan (tidak wajib untuk tes ini)
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: [BUYER_ID, CREATOR_ID] } } }).catch(() => {});
  await prisma.artisan.delete({ where: { id: ARTISAN_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_USER_ID, BUYER_ID, CREATOR_ID] } } }).catch(() => {});
}

function adminReq(params = {}, body = {}, query = {}) {
  return { user: { id: ADMIN_USER_ID, role: "admin" }, params, body, query };
}

async function runTests() {
  await setup();

  // ── GET /api/admin/users ─────────────────────────────────────────────────────
  const listAll = await invoke(listAdminUsers, adminReq({}, {}, {}));
  ok("listAdminUsers: 200", listAll.status === 200);
  ok("listAdminUsers: ada field 'users'", Array.isArray(listAll.body?.users));
  ok("listAdminUsers: ada field 'pagination'", listAll.body?.pagination !== undefined);

  // Filter hasAvatar
  const listAvatar = await invoke(listAdminUsers, adminReq({}, {}, { hasAvatar: "true" }));
  ok("listAdminUsers?hasAvatar=true: 200", listAvatar.status === 200);
  ok("listAdminUsers: semua punya avatar", listAvatar.body?.users?.every((u) => u.avatarUrl !== null));

  // Filter role tidak valid → 400
  const listBadRole = await invoke(listAdminUsers, adminReq({}, {}, { role: "superuser" }));
  ok("listAdminUsers?role=superuser → 400", listBadRole.status === 400);

  // Filter hasAvatar nilai salah → 400
  const listBadAv = await invoke(listAdminUsers, adminReq({}, {}, { hasAvatar: "false" }));
  ok("listAdminUsers?hasAvatar=false → 400", listBadAv.status === 400);

  // Filter role=admin → 200
  const listAdmins = await invoke(listAdminUsers, adminReq({}, {}, { role: "admin" }));
  ok("listAdminUsers?role=admin: 200", listAdmins.status === 200);

  // ── POST /api/admin/users/:id/reset-avatar ───────────────────────────────────
  deletedIds = [];
  const resetBuyer = await invoke(resetUserAvatar, adminReq({ id: BUYER_ID }, { reason: "Tidak sesuai" }));
  ok("resetUserAvatar buyer: 200", resetBuyer.status === 200);
  ok("resetUserAvatar: user.avatarUrl null",    resetBuyer.body?.user?.avatarUrl === null);
  ok("resetUserAvatar: ada notifikasi di DB",   (await prisma.notification.findFirst({ where: { userId: BUYER_ID } })) !== null);

  // Cek user di DB
  const buyerAfter = await prisma.user.findUnique({ where: { id: BUYER_ID } });
  ok("resetUserAvatar: DB avatarUrl null",    buyerAfter?.avatarUrl === null);

  // Reset ulang → 400 (sudah tidak punya avatar)
  const resetAgain = await invoke(resetUserAvatar, adminReq({ id: BUYER_ID }, {}));
  ok("resetUserAvatar 2x: 400",              resetAgain.status === 400);

  // Reset avatar admin → 403
  const resetAdmin = await invoke(resetUserAvatar, adminReq({ id: ADMIN_USER_ID }, {}));
  ok("resetUserAvatar sesama admin: 403",    resetAdmin.status === 403);

  // User tidak ada → 404
  const reset404 = await invoke(resetUserAvatar, adminReq({ id: "tidak-ada" }, {}));
  ok("resetUserAvatar user tidak ada: 404", reset404.status === 404);

  // reason > 200 char → 400
  const resetLongReason = await invoke(resetUserAvatar, adminReq({ id: BUYER_ID }, { reason: "x".repeat(201) }));
  ok("resetUserAvatar reason >200 char: 400", resetLongReason.status === 400);

  // ── POST /api/admin/artisans/:id/reset-avatar ────────────────────────────────
  deletedIds = [];
  const resetArtisan = await invoke(resetArtisanAvatar, adminReq({ id: ARTISAN_ID }, { reason: "Foto tidak pantas" }));
  ok("resetArtisanAvatar: 200",             resetArtisan.status === 200);
  ok("resetArtisanAvatar: avatarUrl null",  resetArtisan.body?.artisan?.avatarUrl === null);
  const artisanAfter = await prisma.artisan.findUnique({ where: { id: ARTISAN_ID } });
  ok("resetArtisanAvatar: DB null",         artisanAfter?.avatarUrl === null);
  ok("resetArtisanAvatar: notif terkirim",  (await prisma.notification.findFirst({ where: { userId: CREATOR_ID } })) !== null);

  // Reset lagi → 400 (sudah tidak punya avatar)
  const resetArtisanAgain = await invoke(resetArtisanAvatar, adminReq({ id: ARTISAN_ID }, {}));
  ok("resetArtisanAvatar 2x: 400",          resetArtisanAgain.status === 400);

  // Artisan tidak ada → 404
  const artisan404 = await invoke(resetArtisanAvatar, adminReq({ id: "tidak-ada" }, {}));
  ok("resetArtisanAvatar tidak ada: 404",   artisan404.status === 404);

  // Lindungi Official Store: tandai isOfficial = true lalu coba reset
  await prisma.artisan.update({ where: { id: ARTISAN_ID }, data: { isOfficial: true } });
  const resetOfficial = await invoke(resetArtisanAvatar, adminReq({ id: ARTISAN_ID }, {}));
  ok("resetArtisanAvatar official store: 400", resetOfficial.status === 400);
  ok("resetArtisanAvatar: kode OFFICIAL_STORE_PROTECTED", resetOfficial.body?.code === "OFFICIAL_STORE_PROTECTED");

  await cleanup();
}

runTests().then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES moderasi avatar LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});
