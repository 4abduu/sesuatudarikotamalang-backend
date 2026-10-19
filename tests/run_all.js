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
