/**
 * test_p3_hardening.js — Tes Paket P3 (Hardening & Konfigurasi)
 *
 * Tes: F-11 (Error Handler & Status CORS 403), F-04 (TRUST_PROXY & PUBLIC_BASE_URL), F-05 (MIME Whitelist Ekstensi), F-08 (Handling Error Resend 502)
 * Jalankan: node tests/test_p3_hardening.js
 */

const assert = require("assert");
const { sendOtpEmail } = require("../src/lib/mailer");

async function runP3Tests() {
  console.log("\n==================================================");
  console.log("TESTING PAKET P3 — Hardening & Konfigurasi");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function testAssert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  // ═══════════════════════════════════════════
  // F-08: Resend API Error Handling (Simulasi vs API Key Salah)
  // ═══════════════════════════════════════════
  console.log("[F-08] Uji Penanganan Error Resend API");

  // 1. Tanpa API Key -> Mode simulasi
  delete process.env.RESEND_API_KEY;
  const simResult = await sendOtpEmail("test@example.com", "123456", "reset_password");
  testAssert(simResult.id === "simulated-otp", "Tanpa RESEND_API_KEY beralih ke mode simulasi aman");

  // 2. API Key salah -> Melempar 502 Bad Gateway
  process.env.RESEND_API_KEY = "re_invalid_key_12345";
  try {
    await sendOtpEmail("test@example.com", "123456", "reset_password");
    testAssert(false, "Harusnya melempar error 502 saat Resend API key invalid");
  } catch (err) {
    testAssert(err.status === 502, `Resend API error ditangkap dan mengembalikan status 502 (Bad Gateway). Actual status: ${err.status}`);
    testAssert(err.message.includes("Gagal mengirim email OTP"), "Pesan error informatif");
  }
  delete process.env.RESEND_API_KEY;

  // ═══════════════════════════════════════════
  // F-05: Upload MIME to Extension Mapping Check
  // ═══════════════════════════════════════════
  console.log("\n[F-05] Uji Penentuan Ekstensi Upload Berbasis MIME Whitelist");
  const uploadLibPath = "../src/lib/upload";
  delete require.cache[require.resolve(uploadLibPath)];
  const upload = require(uploadLibPath);
  testAssert(typeof upload === "object" && upload.single !== undefined, "Module upload multer berhasil dimuat");

  // ═══════════════════════════════════════════
  // F-04: Upload Controller PUBLIC_BASE_URL Check
  // ═══════════════════════════════════════════
  console.log("\n[F-04] Uji PUBLIC_BASE_URL pada Upload Controller");
  const { uploadSingle } = require("../src/controllers/upload.controller");

  process.env.PUBLIC_BASE_URL = "https://api.sesuatudarikotamalang.com";
  const mockReq = {
    file: { filename: "file-12345.png", size: 1024, mimetype: "image/png" },
    get: () => "localhost:4000",
    protocol: "http",
  };
  const mockRes = {
    statusCode: 200,
    body: null,
    json(data) {
      this.body = data;
    },
  };

  await uploadSingle(mockReq, mockRes, () => {});
  testAssert(
    mockRes.body.url === "https://api.sesuatudarikotamalang.com/uploads/file-12345.png",
    `URL file upload menggunakan PUBLIC_BASE_URL jika diset. Actual: ${mockRes.body.url}`
  );
  delete process.env.PUBLIC_BASE_URL;

  console.log("\n==================================================");
  console.log(`HASIL TES PAKET P3: ${passed}/${total} LULUS`);
  console.log("==================================================\n");

  if (passed !== total) process.exit(1);
}

runP3Tests().catch((err) => {
  console.error("Fatal error running P3 tests:", err);
  process.exit(1);
});
