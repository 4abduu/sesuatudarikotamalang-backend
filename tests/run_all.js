/**
 * run_all.js — Menjalankan semua suite tes berurutan di database TEST dan menampilkan ringkasan.
 *
 * Prasyarat:
 *   1. npm run build                       (tes memakai hasil kompilasi di dist/)
 *   2. Database test sudah dimigrasi:       prisma migrate deploy dengan URL database _test
 *
 * Jalankan (Git Bash, dari folder backend):
 *   TEST_DATABASE_URL="mysql://root:@localhost:3306/sesuatu_darikota_malang_test" node tests/run_all.js
 *
 * Pengaman: proses langsung berhenti bila nama database tidak berakhiran "_test".
 * smoke_flow.js TIDAK ikut di sini karena butuh server yang berjalan (lihat catatan di bawah).
 */
const { spawnSync } = require("child_process");
const path = require("path");

const dbName = require("./helpers/requireTestDb")();
console.log(`Database tes: ${dbName}\n`);

const suites = [
  // Paket keamanan & integritas
  "test_p1_security.js",
  "test_p2_integrity.js",
  "test_p3_hardening.js",
  "test_routes_mounted.js",
  "test_pickup_date_validation.js",
  "test_typed_errors.js",
  "test_policies.js",
  "test_dal_isolation.js",
  "test_cancel_order_atomic.js",
  "test_dal_boundary.js",
  // Fase fitur
  "test_fase13.js",
  "test_paketa_features.js",
  "test_concurrency_orders.js",
  "test_todo3_features.js",
  "test_payment_idempotency.js",
  // Auth & token
  "test_auth_revocation.js",       // diperbarui Langkah 5: passwordChangedAt
  // Upload & file
  "test_file_signature.js",        // Langkah 0: magic bytes
  // AI
  "test_ai_story_draft.js",
  "test_ai_story_draft_v2.js",     // versi lengkap dengan alias & retry
  "test_ai_story_draft_v3.js",     // AI cerita 3 bagian
  // Fitur baru Langkah 1–4
  "test_profile_cloudinary.js",    // Langkah 1: avatar Cloudinary
  "test_change_email_flow.js",     // Langkah 2: alur ganti email
  "test_tx_retry.js",              // Langkah 3: retry deadlock
  "test_admin_status_transitions.js", // Langkah 4: transisi status admin
  "test_admin_status_lock.js",        // Langkah 4a: kunci baris update status
  "test_input_validation.js",         // Langkah 4b: tipe dan batas input
  "test_result_caps.js",               // Langkah 4c: batas hasil
  "test_rate_limiters.js",              // Langkah 4d: pemasangan limiter
  "test_reviews_pagination.js",         // Langkah 4g: paginasi ulasan
  "test_view_dedupe.js",                 // Langkah 4g: dedupe viewCount
  "test_stock_batch.js",                 // Langkah 4g: stok batch
  "test_logout.js",                      // Langkah 5: logout dan denylist
  "test_otp_hardening.js",               // Langkah 5: pengerasan OTP
  "test_langkah1_fixes.js",              // Langkah 1: OTP atomik, P2002 review, token ekstraksi, null field, RATE_LIMITED
  "test_settings_refund.js",             // Langkah 4: refundWindowDays validasi & hold default 1 hari
  "test_official_store.js",              // Langkah 3: official store
  "test_refund_policy.js",                // Langkah 5a: kebijakan refund murni
  "test_refund_flow.js",                  // Langkah 5c-5g: alur refund admin
  "test_refund_webhook.js",               // Langkah 5f: late settlement
  "test_pickup_slot_time.js",             // Slot pickup: hari yang sama, slot lewat, hari Minggu
  "test_pickup_schedule.js",              // Fase B: jadwal pickup database & endpoint admin
  "step2_schema_check.js",
  "test_upload_errors.js",               // Langkah 10: whitelist MIME, ukuran, batas laju, batas foto
  "test_product_image_variants.js",      // Langkah 10: validateImageVariants, normalizeImageOrder, pruneImageVariants
  "test_uploaded_files.js",              // Langkah 10: releaseUrls R2, purgeOrphanUploads R5, dal uploadedFiles
  "test_admin_avatar_moderation.js",     // Langkah 10: listAdminUsers, resetUserAvatar, resetArtisanAvatar
  "test_creator_application_flow.js",    // Langkah 10: samplePhotos batas 10, approve, reject, proteksi admin
  "test_brand_name_unique.js",           // Profil Toko Langkah 7: normalisasi brandKey, 409 bentrok, 400 invalid, approve aman
  "test_artisan_effective_avatar.js",    // Profil Toko Langkah 7: avatarUrl efektif, ownAvatarUrl hanya owner/admin
  "test_artisan_bio.js",                 // Profil Toko Langkah 7: bio '' null spasi→null, 2000 OK, 2001 400, undefined tidak berubah
  // TIDAK dimasukkan: test_ai_integration.js (butuh server live + Gemini sungguhan)
  // TIDAK dimasukkan: test-cloudinary.js (butuh jaringan + kredensial Cloudinary)
];

const rows = [];
for (const file of suites) {
  console.log(`\n>>>>>>>>>> ${file}`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit", env: process.env });
  rows.push({ file, ok: r.status === 0, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log("\n==================== RINGKASAN ====================");
rows.forEach((r) => console.log(`${r.ok ? "LULUS" : "GAGAL"}  ${r.file.padEnd(32)} ${r.seconds}s`));
const allOk = rows.every((r) => r.ok);
console.log(allOk ? "\nSemua suite lulus." : "\nAda suite yang gagal. Lihat output di atas.");
console.log(
  "\nCatatan smoke_flow: jalankan server dengan database test (DATABASE_URL=...test, PORT=4001), lalu\n" +
    "  node tests/smoke_flow.js --check\n" +
    "Golden harus direkam (--record) pada database test yang sama setelah seed, bukan pada database utama."
);
process.exit(allOk ? 0 : 1);