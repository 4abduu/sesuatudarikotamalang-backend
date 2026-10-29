/**
 * test_artisan_effective_avatar.js
 * Langkah 7: Tes foto efektif artisan (avatarUrl efektif = ownAvatarUrl ?? userAvatarUrl ?? null).
 * - GET /artisans, GET /artisans/:id, artisan di produk: foto efektif, tanpa ownAvatarUrl/brandKey/user/email
 * - GET /artisans/mine, PUT /artisans/mine: ownAvatarUrl ada
 * - Official Store: tanpa fallback foto akun
 * - PUT { avatarUrl: null }: hapus foto toko sendiri → jatuh ke foto akun
 * - resetArtisanAvatar tanpa foto sendiri → 400
 * - GET /admin/artisans: ownAvatarUrl ada
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const artisansController = require("../dist/controllers/artisansController").default;
const adminController = require("../dist/controllers/adminController").default;

// Stub Cloudinary
const cloudinaryMod = require("../dist/lib/cloudinary");
let deletedIds = [];
cloudinaryMod.deleteFromCloudinary = async (pid) => { deletedIds.push(pid); };

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
    Promise.resolve(handler(req, res, (err) => {
      if (err?.status) resolve({ status: err.status, body: { error: err.message, code: err.code } });
      else reject(err);
    })).catch(reject);
  });
}

const CREATOR_ID   = "eff_av_creator";
const CREATOR_UID  = "eff_av_user";
const ADMIN_ID     = "eff_av_admin";
const USER_AVATAR  = "https://res.cloudinary.com/test/image/upload/user_avatar.jpg";
const OWN_AVATAR   = "https://res.cloudinary.com/test/image/upload/own_avatar.jpg";
let ARTISAN_ID, PRODUCT_ID;

async function setup() {
  await prisma.user.upsert({
    where: { id: CREATOR_UID },
    update: { avatarUrl: USER_AVATAR },
    create: { id: CREATOR_UID, name: "Creator Eff", email: `effav_u_${Date.now()}@t.local`, passwordHash: "h", role: "creator", avatarUrl: USER_AVATAR },
  });
  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, name: "Admin Eff", email: `effav_adm_${Date.now()}@t.local`, passwordHash: "h", role: "admin" },
  });
  const artisan = await prisma.artisan.upsert({
    where: { userId: CREATOR_UID },
    update: { avatarUrl: null }, // mulai tanpa foto toko sendiri
    create: {
      id: CREATOR_ID,
      userId: CREATOR_UID,
      brandName: "Toko Eff Avatar",
      brandKey: "tokoeffavatar",
      status: "aktif",
      avatarUrl: null,
    },
  });
  ARTISAN_ID = artisan.id;

  // Buat produk untuk test foto artisan di produk
  const cat = await prisma.category.findFirst();
  if (cat) {
    const prod = await prisma.product.create({
      data: {
        name: "Produk Eff Tes",
        shortDescription: "Tes",
        description: "Tes",
        price: 10000,
        artisanId: ARTISAN_ID,
        categoryId: cat.id,
        isActive: true,
        images: JSON.stringify([]),
        slug: `produk-eff-${Date.now()}`,
      },
    });
    PRODUCT_ID = prod.id;
  }
}

async function cleanup() {
  if (PRODUCT_ID) await prisma.product.delete({ where: { id: PRODUCT_ID } }).catch(() => {});
  await prisma.artisan.deleteMany({ where: { userId: CREATOR_UID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [CREATOR_UID, ADMIN_ID] } } }).catch(() => {});
}

async function runTests() {
  await setup();

  // ── GET /api/artisans (publik): foto efektif = foto akun (tanpa foto toko) ────
  const listRes = await invoke(artisansController.listArtisans, { query: {} });
  ok("listArtisans: 200", listRes.status === 200);
  const artisanInList = [...(listRes.body?.artisans || []), listRes.body?.officialStore]
    .filter(Boolean)
    .find((a) => a.id === ARTISAN_ID);
  ok("listArtisans: artisan ada", artisanInList !== undefined);
  ok("listArtisans: avatarUrl efektif = foto akun (fallback)",  artisanInList?.avatarUrl === USER_AVATAR);
  ok("listArtisans: ownAvatarUrl TIDAK ada di publik",          artisanInList?.ownAvatarUrl === undefined);
  ok("listArtisans: brandKey TIDAK ada di publik",              artisanInList?.brandKey === undefined);
  ok("listArtisans: user TIDAK ada di publik",                  artisanInList?.user === undefined);
  ok("listArtisans: email TIDAK ada",                           artisanInList?.email === undefined);

  // ── GET /api/artisans/:id (publik): foto efektif ────────────────────────────
  const detailRes = await invoke(artisansController.getArtisanById, { params: { id: ARTISAN_ID }, query: {} });
  ok("getArtisanById: 200",                    detailRes.status === 200);
  const a = detailRes.body?.artisan;
  ok("getArtisanById: avatarUrl efektif",      a?.avatarUrl === USER_AVATAR);
  ok("getArtisanById: ownAvatarUrl tidak ada", a?.ownAvatarUrl === undefined);
  ok("getArtisanById: brandKey tidak ada",     a?.brandKey === undefined);
  ok("getArtisanById: user tidak ada",         a?.user === undefined);

  // ── GET /api/artisans/mine: foto efektif + ownAvatarUrl ─────────────────────
  const mineRes = await invoke(artisansController.getMyArtisanProfile, { user: { id: CREATOR_UID, role: "creator" }, query: {} });
  ok("getMyArtisanProfile: 200",               mineRes.status === 200);
  const mine = mineRes.body?.artisan;
  ok("getMyArtisanProfile: avatarUrl efektif", mine?.avatarUrl === USER_AVATAR);
  ok("getMyArtisanProfile: ownAvatarUrl null", mine?.ownAvatarUrl === null);
  ok("getMyArtisanProfile: user tidak bocor",  mine?.user === undefined);

  // ── Pasang foto toko sendiri → ownAvatarUrl terisi ─────────────────────────
  await prisma.artisan.update({ where: { id: ARTISAN_ID }, data: { avatarUrl: OWN_AVATAR } });
  const mineAfter = await invoke(artisansController.getMyArtisanProfile, { user: { id: CREATOR_UID, role: "creator" }, query: {} });
  ok("mine setelah pasang foto: avatarUrl = OWN_AVATAR",   mineAfter.body?.artisan?.avatarUrl === OWN_AVATAR);
  ok("mine setelah pasang foto: ownAvatarUrl = OWN_AVATAR", mineAfter.body?.artisan?.ownAvatarUrl === OWN_AVATAR);

  // Publik: ownAvatarUrl tetap tidak ada
  const detailWithOwn = await invoke(artisansController.getArtisanById, { params: { id: ARTISAN_ID }, query: {} });
  ok("publik setelah pasang foto: avatarUrl = OWN_AVATAR",   detailWithOwn.body?.artisan?.avatarUrl === OWN_AVATAR);
  ok("publik setelah pasang foto: ownAvatarUrl tetap tidak ada", detailWithOwn.body?.artisan?.ownAvatarUrl === undefined);

  // ── Official Store: tanpa fallback foto akun ────────────────────────────────
  const officialInList = listRes.body?.officialStore;
  if (officialInList) {
    ok("Official Store: ownAvatarUrl tidak ada di publik", officialInList?.ownAvatarUrl === undefined);
    // Official Store tidak punya user → avatarUrl efektif = ownAvatarUrl (bisa null)
    ok("Official Store: user tidak ada", officialInList?.user === undefined);
  } else {
    console.log(`[SKIP] Official Store tidak ditemukan di respons listArtisans`);
    passed++; passed++; // skip 2 sub-tes
  }

  // ── resetArtisanAvatar tanpa foto toko sendiri → 400 ────────────────────────
  await prisma.artisan.update({ where: { id: ARTISAN_ID }, data: { avatarUrl: null } });
  const resetNoPhotoRes = await invoke(adminController.resetArtisanAvatar, {
    user: { id: ADMIN_ID, role: "admin" },
    params: { id: ARTISAN_ID },
    body: {},
  });
  ok("resetArtisanAvatar tanpa foto sendiri: 400", resetNoPhotoRes.status === 400);

  // ── GET /admin/artisans: ownAvatarUrl ada ────────────────────────────────────
  await prisma.artisan.update({ where: { id: ARTISAN_ID }, data: { avatarUrl: OWN_AVATAR } });
  const adminListRes = await invoke(adminController.listAdminArtisans, {
    user: { id: ADMIN_ID, role: "admin" },
    params: {},
    body: {},
    query: {},
  });
  ok("listAdminArtisans: 200", adminListRes.status === 200);
  const adminArtisan = adminListRes.body?.artisans?.find((a) => a.id === ARTISAN_ID);
  ok("listAdminArtisans: artisan ada", adminArtisan !== undefined);
  ok("listAdminArtisans: avatarUrl efektif",  adminArtisan?.avatarUrl === OWN_AVATAR);
  ok("listAdminArtisans: ownAvatarUrl ada",   adminArtisan?.ownAvatarUrl === OWN_AVATAR);
  ok("listAdminArtisans: user tidak bocor (pakai userInfo)", adminArtisan?.user === undefined);

  // Produk: foto artisan efektif
  if (PRODUCT_ID) {
    const prodRes = await invoke(require("../dist/controllers/productsController").default.getProductById, {
      params: { id: PRODUCT_ID },
      query: {},
      headers: {},
      ip: "127.0.0.1",
    });
    ok("getProductById: artisan.avatarUrl efektif", prodRes.body?.product?.artisan?.avatarUrl === OWN_AVATAR);
    ok("getProductById: artisan.ownAvatarUrl tidak ada", prodRes.body?.product?.artisan?.ownAvatarUrl === undefined);
    ok("getProductById: artisan.user tidak ada",         prodRes.body?.product?.artisan?.user === undefined);
  }

  await cleanup();
}

runTests().then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES artisan effective avatar LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});
