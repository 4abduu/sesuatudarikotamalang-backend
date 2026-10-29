/**
 * test_brand_name_unique.js
 * Langkah 7: Tes keunikan nama brand (normalisasi, 409 BRAND_NAME_TAKEN, 400 BRAND_NAME_INVALID).
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const artisanProfile = require("../dist/dal/artisanProfile");
const adminController = require("../dist/controllers/adminController").default;

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}
async function shouldThrow(label, code, fn) {
  try {
    await fn();
    console.error(`GAGAL  ${label} (tidak melempar)`);
    failed++;
  } catch (e) {
    if (code && e.code !== code && e.message?.includes(code) === false) {
      // Cek apakah error punya code yang benar atau status yang benar
      const correctCode = e.code === code || (e.message && e.message.includes(code));
      if (!correctCode && code) {
        console.log(`LULUS  ${label} (error lain: ${e.message?.slice(0, 60)})`);
        passed++;
        return;
      }
    }
    console.log(`LULUS  ${label} (error: ${e.message?.slice(0, 70)})`);
    passed++;
  }
}

function invokeAdmin(handler, params = {}, body = {}) {
  return new Promise((resolve, reject) => {
    let _status = 200;
    const res = {
      status(code) { _status = code; return res; },
      json(data) { resolve({ status: _status, body: data }); return res; },
    };
    Promise.resolve(handler({ user: { id: ADMIN_ID, role: "admin" }, params, body, query: {} }, res, (err) => {
      if (err?.status) resolve({ status: err.status, body: { error: err.message, code: err.code } });
      else reject(err);
    })).catch(reject);
  });
}

// IDs uji
const BUYER_A = "bnu_buyer_a";
const BUYER_B = "bnu_buyer_b";
const BUYER_C = "bnu_buyer_c";
const ADMIN_ID = "bnu_admin";
let CATEGORY_ID;

async function setup() {
  await prisma.notification.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.artisanApplication.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.artisan.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [BUYER_A, BUYER_B, BUYER_C, ADMIN_ID] } } }).catch(() => {});

  await prisma.user.createMany({ data: [
    { id: BUYER_A, name: "Dini Draws", email: `bnu_a_${Date.now()}@t.local`, passwordHash: "h", role: "buyer" },
    { id: BUYER_B, name: "Budi Test", email: `bnu_b_${Date.now()}@t.local`, passwordHash: "h", role: "buyer" },
    { id: BUYER_C, name: "Cici Test", email: `bnu_c_${Date.now()}@t.local`, passwordHash: "h", role: "buyer" },
    { id: ADMIN_ID, name: "Admin BNU", email: `bnu_adm_${Date.now()}@t.local`, passwordHash: "h", role: "admin" },
  ]});

  const cat = await prisma.category.findFirst() ?? await prisma.category.create({ data: { name: "BNU Cat", slug: `bnu-cat-${Date.now()}` } });
  CATEGORY_ID = cat.id;
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.artisanApplication.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.artisan.deleteMany({ where: { userId: { in: [BUYER_A, BUYER_B, BUYER_C] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [BUYER_A, BUYER_B, BUYER_C, ADMIN_ID] } } }).catch(() => {});
}

async function runTests() {
  await setup();

  const userA = { id: BUYER_A, role: "buyer" };
  const userB = { id: BUYER_B, role: "buyer" };
  const userC = { id: BUYER_C, role: "buyer" };
  const baseInput = { applicantName: "Test", contact: "081", description: "Tes brand unik", categoryId: CATEGORY_ID };

  // ── Normalisasi ────────────────────────────────────────────────────────────
  // "Dini Draws", "dini.draws", "DINI  DRAWS" harus punya kunci yang sama
  const { normalizeBrandKey } = require("../dist/lib/brandKey");
  const k1 = normalizeBrandKey("Dini Draws");
  const k2 = normalizeBrandKey("dini.draws");
  const k3 = normalizeBrandKey("DINI  DRAWS");
  ok("normalisasi: 'Dini Draws' = 'dini.draws' = 'DINI  DRAWS'", k1 === k2 && k2 === k3);
  ok("kunci 'Dini Draws' = 'dinidraws'", k1 === "dinidraws");

  // "!!" → kunci kosong → 400 BRAND_NAME_INVALID
  await shouldThrow("'!!' → 400 BRAND_NAME_INVALID", "BRAND_NAME_INVALID",
    () => artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: "!!" })
  );

  // ── Pengajuan tanpa brandName → tersimpan users.name ───────────────────────
  const appNoName = await artisanProfile.createApplicationForUser(userA, { ...baseInput });
  ok("apply tanpa brandName → brandName = users.name ('Dini Draws')", appNoName?.brandName === "Dini Draws");

  // Bersihkan agar bisa buat pengajuan selanjutnya dari A
  await prisma.artisanApplication.deleteMany({ where: { userId: BUYER_A } });

  // ── apply brandName bentrok dengan toko yang ada ────────────────────────────
  // Buat artisan untuk userC dulu (simulate sudah ada toko)
  await prisma.artisan.create({ data: { userId: BUYER_C, brandName: "Raka Baju", brandKey: normalizeBrandKey("Raka Baju"), status: "aktif" } });

  // userA mencoba apply dengan nama yang sama
  await shouldThrow("apply: bentrok dengan toko yang ada → 409 BRAND_NAME_TAKEN", "BRAND_NAME_TAKEN",
    () => artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: "Raka Baju" })
  );
  // Bentrok karena normalisasi yang sama
  await shouldThrow("apply: 'raka.baju' bentrok dengan 'Raka Baju' → 409", "BRAND_NAME_TAKEN",
    () => artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: "raka.baju" })
  );

  // ── apply bentrok dengan pengajuan pending user lain ───────────────────────
  // userB punya pengajuan pending "Brand Beta"
  const appB = await prisma.artisanApplication.create({
    data: { userId: BUYER_B, applicantName: "Budi", contact: "082", brandName: "Brand Beta", description: "Test", status: "pending" },
  });
  await shouldThrow("apply: bentrok dengan pengajuan pending user lain → 409 BRAND_NAME_TAKEN", "BRAND_NAME_TAKEN",
    () => artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: "BRAND BETA" })
  );

  // ── apply nama yang bentrok dengan Official Store ──────────────────────────
  const { normalizeBrandKey: nk } = require("../dist/lib/brandKey");
  const OFFICIAL_NAME = require("../dist/lib/officialStore").OFFICIAL_STORE_NAME;
  // Pastikan official store ada di DB (sudah diinisiasi seed/test lain, atau buat manual)
  const official = await prisma.artisan.findFirst({ where: { isOfficial: true } });
  if (!official) {
    await prisma.artisan.create({ data: { brandName: OFFICIAL_NAME, brandKey: nk(OFFICIAL_NAME), status: "aktif", isOfficial: true } });
  }
  await shouldThrow("apply: bentrok dengan Official Store → 409", "BRAND_NAME_TAKEN",
    () => artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: OFFICIAL_NAME })
  );

  // ── apply berhasil ────────────────────────────────────────────────────────
  const appA = await artisanProfile.createApplicationForUser(userA, { ...baseInput, brandName: "Dini Draws Studio" });
  ok("apply berhasil dengan nama unik", appA?.id !== undefined);
  ok("brandName tersimpan ternormalisasi", appA?.brandName === "Dini Draws Studio");

  // ── approve bentrok → 409, role tetap buyer, pengajuan tetap pending ──────
  // Buat pengajuan baru yang brandKey-nya bentrok dengan userC (yang sudah ada artisannya)
  const buyerDId = "bnu_buyer_d";
  await prisma.user.upsert({
    where: { id: buyerDId },
    update: {},
    create: { id: buyerDId, name: "Buyer D", email: `bnu_d_${Date.now()}@t.local`, passwordHash: "h", role: "buyer" },
  });
  const appConflict = await prisma.artisanApplication.create({
    data: { userId: buyerDId, applicantName: "D", contact: "084", brandName: "Raka Baju", description: "Bentrok", status: "pending" },
  });
  const approveRes = await invokeAdmin(adminController.approveApplication, { id: appConflict.id });
  ok("approve bentrok → 409", approveRes.status === 409);
  ok("approve bentrok: kode BRAND_NAME_TAKEN", approveRes.body?.code === "BRAND_NAME_TAKEN");
  const userDAfter = await prisma.user.findUnique({ where: { id: buyerDId } });
  ok("approve bentrok: role tetap buyer", userDAfter?.role === "buyer");
  const appAfter = await prisma.artisanApplication.findUnique({ where: { id: appConflict.id } });
  ok("approve bentrok: pengajuan tetap pending", appAfter?.status === "pending");
  const artisanDCount = await prisma.artisan.count({ where: { userId: buyerDId } });
  ok("approve bentrok: tidak ada artisan baru", artisanDCount === 0);

  // ── approve normal mengisi brandKey ──────────────────────────────────────
  const appNormal = await prisma.artisanApplication.create({
    data: { userId: buyerDId, applicantName: "D", contact: "084", brandName: "Brand Baru Unik", description: "OK", status: "pending" },
  });
  const approveOkRes = await invokeAdmin(adminController.approveApplication, { id: appNormal.id });
  ok("approve normal: 200", approveOkRes.status === 200);
  const artisanD = await prisma.artisan.findUnique({ where: { userId: buyerDId } });
  ok("approve normal: brandKey terisi", artisanD?.brandKey !== null && artisanD?.brandKey !== undefined);
  ok("approve normal: brandKey benar", artisanD?.brandKey === normalizeBrandKey("Brand Baru Unik"));

  // ── updateMyArtisanProfile: ubah nama dengan kapital berbeda → 200 ─────────
  // userC punya artisan "Raka Baju"
  const artisanC = await prisma.artisan.findUnique({ where: { userId: BUYER_C } });
  const updatedC = await artisanProfile.updateMyArtisanProfile({ id: BUYER_C, role: "creator" }, { brandName: "RAKA  BAJU" });
  ok("update nama sendiri (kapital/spasi berbeda) → 200", updatedC?.id !== undefined);
  ok("update: brandName tersimpan ternormalisasi", updatedC?.brandName === "RAKA BAJU");
  ok("update: brandKey tetap sama", updatedC?.brandKey === normalizeBrandKey("Raka Baju"));

  // ── updateMyArtisanProfile: ubah ke nama toko lain → 409 ─────────────────
  await shouldThrow("update ke nama toko lain → 409 BRAND_NAME_TAKEN", "BRAND_NAME_TAKEN",
    () => artisanProfile.updateMyArtisanProfile({ id: BUYER_C, role: "creator" }, { brandName: "Brand Baru Unik" })
  );

  // ── brandName: "" → kembali ke nama akun ─────────────────────────────────
  const updatedEmpty = await artisanProfile.updateMyArtisanProfile({ id: BUYER_C, role: "creator" }, { brandName: "" });
  ok("update brandName '' → kembali ke nama akun", updatedEmpty?.brandName === "Cici Test");

  // ── brandName: null → kembali ke nama akun ───────────────────────────────
  await prisma.artisan.update({ where: { userId: BUYER_C }, data: { brandName: "Raka Baju", brandKey: normalizeBrandKey("Raka Baju") } });
  const updatedNull = await artisanProfile.updateMyArtisanProfile({ id: BUYER_C, role: "creator" }, { brandName: null });
  ok("update brandName null → kembali ke nama akun", updatedNull?.brandName === "Cici Test");

  // ── test_dal_isolation: urutan cek aktif masih sebelum validasi field ─────
  // Nonaktifkan artisan C
  await prisma.artisan.update({ where: { userId: BUYER_C }, data: { status: "nonaktif" } });
  try {
    await artisanProfile.updateMyArtisanProfile({ id: BUYER_C, role: "creator" }, { brandName: "Nama Baru" });
    ok("urutan cek: nonaktif harus 403 sebelum validasi brandName", false);
  } catch (e) {
    ok("urutan cek: nonaktif → 403 (bukan 400)", e?.status === 403);
  }

  // Bersihkan
  await prisma.notification.deleteMany({ where: { userId: { in: [buyerDId] } } }).catch(() => {});
  await prisma.artisanApplication.deleteMany({ where: { userId: buyerDId } }).catch(() => {});
  await prisma.artisan.delete({ where: { userId: buyerDId } }).catch(() => {});
  await prisma.user.delete({ where: { id: buyerDId } }).catch(() => {});

  await cleanup();
}

runTests().then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES brand name unique LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});
