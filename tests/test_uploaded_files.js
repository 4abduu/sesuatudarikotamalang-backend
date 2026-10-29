/**
 * test_uploaded_files.js
 * Langkah 10: Tes lib/uploadedFiles.ts — removedUrls, releaseUrls (rule R2),
 * purgeOrphanUploads (rule R5), dan dal/uploadedFiles (listMyUploads, deleteMyUpload).
 * Memakai database test, stub Cloudinary.
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const { removedUrls, collectReferencedUrls, releaseUrls, purgeOrphanUploads } =
  require("../dist/lib/uploadedFiles");
const { listMyUploads, deleteMyUpload } =
  require("../dist/dal/uploadedFiles");

let passed = 0;
let failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}
async function throws(label, fn, expectedMsg = "") {
  try {
    await fn();
    console.error(`GAGAL  ${label} (tidak melempar error)`);
    failed++;
  } catch (e) {
    const match = !expectedMsg || (e.message || "").includes(expectedMsg);
    if (match) { console.log(`LULUS  ${label}`); passed++; }
    else { console.error(`GAGAL  ${label} (pesan: ${e.message})`); failed++; }
  }
}

// Stub deleteFromCloudinary agar tidak hit API nyata
const cloudinaryMod = require("../dist/lib/cloudinary");
let cloudinaryDeletedIds = [];
cloudinaryMod.deleteFromCloudinary = async (publicId) => {
  cloudinaryDeletedIds.push(publicId);
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. removedUrls (fungsi murni)
// ──────────────────────────────────────────────────────────────────────────────
ok("removedUrls: string → string berbeda", JSON.stringify(removedUrls("old.jpg", "new.jpg")) === '["old.jpg"]');
ok("removedUrls: string → null",           removedUrls("old.jpg", null).length === 1);
ok("removedUrls: null → string",           removedUrls(null, "new.jpg").length === 0);
ok("removedUrls: array → subset",          removedUrls(["a.jpg","b.jpg"], ["b.jpg"]).length === 1);
ok("removedUrls: tidak berubah → []",      removedUrls("same.jpg", "same.jpg").length === 0);
ok("removedUrls: [] → []",                 removedUrls([], []).length === 0);

// ──────────────────────────────────────────────────────────────────────────────
// 2. Integrasi DB: releaseUrls dan R2 (tidak hapus bila masih direferensikan)
// ──────────────────────────────────────────────────────────────────────────────
const USER_ID = "uploaded_files_test_user";
const USED_URL = "https://res.cloudinary.com/test/image/upload/used.jpg";
const ORPHAN_URL = "https://res.cloudinary.com/test/image/upload/orphan.jpg";
const LIST_URL = "https://res.cloudinary.com/test/image/upload/list.jpg";
// Semua publicId yang dipakai tes ini. Dibersihkan di AWAL dan di AKHIR supaya tes bisa dijalankan berulang
// (sisa dari jalan sebelumnya yang gagal di tengah tidak boleh membuat batas unik publicId bentrok).
const ALL_PUBIDS = ["test-used-pubid", "test-orphan-pubid", "test-old-orphan-pubid", "test-list-pubid"];

async function setupFixtures() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      name: "UploadedFiles Test",
      email: `uploaded_files_test_${Date.now()}@test.local`,
      passwordHash: "testhash",
      role: "buyer",
      avatarUrl: USED_URL,  // USED_URL direferensikan di sini → R2: tidak boleh dihapus
    },
  });

  // Record UploadedFile untuk USED_URL
  await prisma.uploadedFile.upsert({
    where: { publicId: "test-used-pubid" },
    update: { url: USED_URL, uploadedById: USER_ID },
    create: {
      publicId: "test-used-pubid",
      resourceType: "image",
      url: USED_URL,
      mimetype: "image/jpeg",
      size: 10000,
      uploadedById: USER_ID,
    },
  });

  // Record UploadedFile untuk ORPHAN_URL (tidak direferensikan record mana pun)
  await prisma.uploadedFile.upsert({
    where: { publicId: "test-orphan-pubid" },
    update: { url: ORPHAN_URL, uploadedById: USER_ID },
    create: {
      publicId: "test-orphan-pubid",
      resourceType: "image",
      url: ORPHAN_URL,
      mimetype: "image/jpeg",
      size: 5000,
      uploadedById: USER_ID,
    },
  });
}

async function cleanupFixtures() {
  await prisma.uploadedFile
    .deleteMany({ where: { OR: [{ publicId: { in: ALL_PUBIDS } }, { uploadedById: USER_ID }] } })
    .catch(() => {});
  await prisma.user.delete({ where: { id: USER_ID } }).catch(() => {});
}

async function runDbTests() {
  await cleanupFixtures(); // buang sisa jalan sebelumnya
  await setupFixtures();
  cloudinaryDeletedIds = [];

  // R2: releaseUrls tidak hapus USED_URL karena masih di user.avatarUrl
  const result = await releaseUrls([USED_URL, ORPHAN_URL]);
  ok("R2: USED_URL dipertahankan (kept >= 1)", result.kept >= 1);
  ok("ORPHAN_URL dihapus (deleted = 1)",       result.deleted === 1);
  ok("Cloudinary dipanggil untuk orphan",      cloudinaryDeletedIds.includes("test-orphan-pubid"));
  ok("Cloudinary TIDAK dipanggil untuk used",  !cloudinaryDeletedIds.includes("test-used-pubid"));

  // Setelah releaseUrls: ORPHAN_URL tidak ada di DB lagi
  const orphanRow = await prisma.uploadedFile.findFirst({ where: { publicId: "test-orphan-pubid" } });
  ok("ORPHAN_URL terhapus dari DB",            orphanRow === null);

  // USED_URL masih ada
  const usedRow = await prisma.uploadedFile.findFirst({ where: { publicId: "test-used-pubid" } });
  ok("USED_URL masih di DB",                   usedRow !== null);

  // purgeOrphanUploads: tidak menghapus USED_URL
  // Buat satu lagi orphan dengan createdAt lama
  await prisma.uploadedFile.create({
    data: {
      publicId: "test-old-orphan-pubid",
      resourceType: "image",
      url: "https://res.cloudinary.com/test/image/upload/old-orphan.jpg",
      mimetype: "image/jpeg",
      size: 1000,
      uploadedById: USER_ID,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 jam lalu
    },
  });
  cloudinaryDeletedIds = [];
  const purgeResult = await purgeOrphanUploads(24); // grace 24 jam
  ok("purge: old orphan dihapus (deleted >= 1)", purgeResult.deleted >= 1);
  ok("purge: USED_URL tidak dihapus",            !cloudinaryDeletedIds.includes("test-used-pubid"));

  // listMyUploads: buyer hanya lihat punyanya sendiri
  // Buat kembali satu file untuk list test
  await prisma.uploadedFile.create({
    data: {
      publicId: "test-list-pubid",
      resourceType: "image",
      url: LIST_URL,
      mimetype: "image/jpeg",
      size: 3000,
      uploadedById: USER_ID,
    },
  });
  const myUploads = await listMyUploads({ id: USER_ID, role: "buyer" });
  ok("listMyUploads buyer: file miliknya muncul di daftar", myUploads.some((u) => u.url === LIST_URL));
  ok("listMyUploads buyer: ada field inUse",     myUploads.length === 0 || "inUse" in myUploads[0]);

  // deleteMyUpload: file yang masih direferensikan → 409
  await throws(
    "deleteMyUpload: file in use → error",
    () => deleteMyUpload({ id: USER_ID, role: "buyer" }, USED_URL),
  );

  // deleteMyUpload: file milik user lain → 404
  await throws(
    "deleteMyUpload: bukan milik user → error",
    () => deleteMyUpload({ id: "other-user", role: "buyer" }, LIST_URL),
  );

  // deleteMyUpload: pemilik menghapus file yang belum terpasang → Cloudinary dipanggil dan baris terhapus
  cloudinaryDeletedIds = [];
  let deleteOwnError = "";
  try {
    await deleteMyUpload({ id: USER_ID, role: "buyer" }, LIST_URL);
  } catch (e) {
    deleteOwnError = e.message || String(e);
  }
  ok(
    "deleteMyUpload: file milik sendiri yang belum terpasang → Cloudinary dipanggil" +
      (deleteOwnError ? ` (error: ${deleteOwnError})` : ""),
    !deleteOwnError && cloudinaryDeletedIds.includes("test-list-pubid"),
  );
  const listRow = await prisma.uploadedFile.findFirst({ where: { publicId: "test-list-pubid" } });
  ok("deleteMyUpload: baris uploaded_files terhapus", listRow === null);
}

runDbTests().finally(() => cleanupFixtures()).then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES uploaded_files LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});