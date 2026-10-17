/**
 * test_change_email_flow.js — Tes alur ganti email (Langkah 2)
 * Memakai database test; jalankan setelah npm run build:
 *   DATABASE_URL=mysql://root:@localhost:3306/sesuatu_darikota_malang_test node tests/test_change_email_flow.js
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const mailerMod = require("../dist/lib/mailer");
const { changeEmailRequest, changeEmailVerify } = require("../dist/controllers/authController");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const SUFFIX = Date.now();
const passed = [];
const failed = [];

function makeRes(resolve) {
  let status = 200;
  return {
    status(code) { status = code; return this; },
    json(data) { resolve({ status, data }); return this; },
  };
}

async function invokeRequest(user, body, captured) {
  // Spy sendOtpEmail sebelum panggil controller
  const original = mailerMod.sendOtpEmail;
  mailerMod.sendOtpEmail = async (to, code, purpose, options) => {
    if (captured) {
      captured.to = to;
      captured.code = code;
      captured.purpose = purpose;
      captured.options = options;
    }
    return { id: "spy" };
  };
  const result = await new Promise((resolve, reject) => {
    changeEmailRequest({ user, body }, makeRes(resolve), reject).catch(reject);
  });
  mailerMod.sendOtpEmail = original;
  return result;
}

async function invokeVerify(user, body) {
  return new Promise((resolve, reject) => {
    changeEmailVerify({ user, body }, makeRes(resolve), reject).catch(reject);
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`LULUS  ${name}`);
    passed.push(name);
  } catch (e) {
    console.log(`GAGAL  ${name}\n       ${e.message}`);
    failed.push(name);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion gagal");
}

(async () => {
  // Setup: buat dua user di DB test
  const hashPw = await bcrypt.hash("TestPw123!", 10);
  const userA = await prisma.user.create({
    data: { name: "EmailFlowA", email: `efa-${SUFFIX}@test.local`, passwordHash: hashPw, role: "buyer" },
  });
  const userB = await prisma.user.create({
    data: { name: "EmailFlowB", email: `efb-${SUFFIX}@test.local`, passwordHash: hashPw, role: "buyer" },
  });

  const authA = { id: userA.id, role: userA.role };

  // ── Request: format tidak valid ──────────────────────────────────────────────
  await test("format tidak valid (tanpa @) → 400", async () => {
    const r = await invokeRequest(authA, { newEmail: "bukan-email" });
    assert(r.status === 400, `status ${r.status}`);
    assert(r.data.error === "Format email baru tidak valid", r.data.error);
  });

  await test("newEmail kosong → 400", async () => {
    const r = await invokeRequest(authA, { newEmail: "" });
    assert(r.status === 400, `status ${r.status}`);
  });

  await test("newEmail berupa angka → 400", async () => {
    const r = await invokeRequest(authA, { newEmail: 12345 });
    assert(r.status === 400, `status ${r.status}`);
  });

  // ── Request: sama dengan email lama (beda huruf besar) ───────────────────────
  await test("sama dengan email lama (uppercase) → 400", async () => {
    const r = await invokeRequest(authA, { newEmail: userA.email.toUpperCase() });
    assert(r.status === 400, `status ${r.status}`);
    assert(r.data.error.includes("sama"), r.data.error);
  });

  // ── Request: email milik akun lain → 409 ─────────────────────────────────────
  await test("email milik akun lain → 409", async () => {
    const r = await invokeRequest(authA, { newEmail: userB.email });
    assert(r.status === 409, `status ${r.status}`);
  });

  // ── Request sukses: OTP ke email LAMA, options.newEmail terisi ───────────────
  const newEmail = `efa-new-${SUFFIX}@test.local`;
  const captured = {};
  await test("request sukses: OTP dikirim ke email LAMA", async () => {
    const r = await invokeRequest(authA, { newEmail }, captured);
    assert(r.status === 200, `status ${r.status}`);
    assert(captured.to === userA.email, `OTP ke ${captured.to}, bukan ${userA.email}`);
    assert(captured.options?.newEmail === newEmail, `options.newEmail = ${captured.options?.newEmail}`);
  });

  await test("pesan sukses tidak memuat kata 'baru' di awal konteks email", async () => {
    // Pesan baru: "Kode OTP telah dikirim ke email Anda saat ini"
    // (tidak memuat "email baru Anda")
    const r = await invokeRequest(authA, { newEmail: `efa-new2-${SUFFIX}@test.local` }, {});
    assert(r.status === 200, `status ${r.status}`);
    assert(!r.data.message.includes("email baru Anda"), `pesan masih: "${r.data.message}"`);
  });

  // ── Verify: OTP salah → 400 ───────────────────────────────────────────────────
  await test("OTP salah → 400", async () => {
    const r = await invokeVerify(authA, { code: "000000" });
    assert(r.status === 400, `status ${r.status}`);
  });

  // ── Verify: OTP benar mengganti email ─────────────────────────────────────────
  // Ambil kode OTP dari DB (yang dibuat di tes sukses sebelumnya)
  const otp = await prisma.otpCode.findFirst({
    where: { userId: userA.id, purpose: "ganti_email", isUsed: false },
    orderBy: { createdAt: "desc" },
  });

  await test("verify OTP benar mengganti email (200)", async () => {
    assert(otp, "OTP tidak ditemukan di DB");
    const r = await invokeVerify(authA, { code: otp.code });
    assert(r.status === 200, `status ${r.status}`);
    assert(r.data.email === otp.targetEmail, `email = ${r.data.email}`);
    // Cek DB
    const updated = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(updated.email === otp.targetEmail, `DB email = ${updated.email}`);
  });

  // ── Verify: race condition P2002 — email baru dipakai akun lain ──────────────
  // Buat request baru untuk userA (email sudah berubah)
  const refreshedA = await prisma.user.findUnique({ where: { id: userA.id } });
  const thirdEmail = `efa-race-${SUFFIX}@test.local`;
  const captured2 = {};
  await invokeRequest({ id: refreshedA.id, role: "buyer" }, { newEmail: thirdEmail }, captured2);

  await test("race condition: email baru dipakai akun lain saat verify → 409", async () => {
    // Ambil OTP yang baru dibuat
    const otp2 = await prisma.otpCode.findFirst({
      where: { userId: userA.id, purpose: "ganti_email", isUsed: false },
      orderBy: { createdAt: "desc" },
    });
    assert(otp2, "OTP race tidak ditemukan");
    // Paksa akun lain ambil email tersebut terlebih dulu
    await prisma.user.create({
      data: { name: "Racer", email: thirdEmail, role: "buyer" },
    });
    const r = await invokeVerify({ id: userA.id, role: "buyer" }, { code: otp2.code });
    assert(r.status === 409, `status ${r.status} (expected 409)`);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  await prisma.otpCode.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.user.deleteMany({ where: { email: thirdEmail } });

  const ok = failed.length === 0;
  console.log(`\n${ok ? "SEMUA TES GANTI EMAIL LULUS" : `${failed.length} tes GAGAL: ${failed.join(", ")}`}`);
  process.exit(ok ? 0 : 1);
})();
