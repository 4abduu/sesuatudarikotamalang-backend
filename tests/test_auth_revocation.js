/**
 * test_auth_revocation.js — Tes pencabutan token via passwordChangedAt (Langkah 5)
 *
 * Token dicabut HANYA setelah peristiwa kredensial:
 *   changePassword, forgotPasswordVerify, changeEmailVerify, googleLogin (link)
 * Token TIDAK dicabut setelah: PUT /profile (nama/avatar), approve konsinyasi (role berubah).
 *
 * Jalankan setelah npm run build:
 *   DATABASE_URL=mysql://root:@localhost:3306/sesuatu_darikota_malang_test node tests/test_auth_revocation.js
 */
require("./helpers/requireTestDb")();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { requireAuth } = require("../dist/middleware/authMiddleware");
const {
  changePassword,
  forgotPasswordVerify,
  changeEmailVerify,
} = require("../dist/controllers/authController");
const mailerMod = require("../dist/lib/mailer");

const SECRET = process.env.JWT_SECRET || "secret-khusus-tes";
const TAG = Date.now();
let passed = 0;
let failed = 0;
const cleanupIds = [];

// ─── Helper ───────────────────────────────────────────────────────────────────
function runMiddleware(token) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, body: data }); return this; },
    };
    const req = { headers: { authorization: `Bearer ${token}` } };
    requireAuth(req, res, (err) => {
      if (err) reject(err);
      else resolve({ status: 200, next: true });
    });
  });
}

/** Token dengan iat eksplisit di masa lalu (2 detik lalu) */
function oldToken(userId, role) {
  const iat = Math.floor(Date.now() / 1000) - 2;
  return jwt.sign({ id: userId, role, iat }, SECRET);
}

function makeRes(resolve) {
  let status = 200;
  return {
    status(code) { status = code; return this; },
    json(data) { resolve({ status, data }); return this; },
  };
}

function invokeChangePassword(userId, role, oldPw, newPw) {
  return new Promise((resolve, reject) => {
    changePassword(
      { user: { id: userId, role }, body: { oldPassword: oldPw, newPassword: newPw } },
      makeRes(resolve), reject
    ).catch(reject);
  });
}

function invokeForgotPasswordVerify(email, code, newPw) {
  return new Promise((resolve, reject) => {
    forgotPasswordVerify(
      { body: { email, code, newPassword: newPw } },
      makeRes(resolve), reject
    ).catch(reject);
  });
}

function invokeChangeEmailVerify(userId, role, code) {
  return new Promise((resolve, reject) => {
    const orig = mailerMod.sendOtpEmail;
    mailerMod.sendOtpEmail = async () => ({ id: "spy" });
    changeEmailVerify(
      { user: { id: userId, role }, body: { code } },
      makeRes(resolve),
      (err) => { mailerMod.sendOtpEmail = orig; reject(err); }
    ).catch((e) => { mailerMod.sendOtpEmail = orig; reject(e); });
    // restore sendOtpEmail after call (done inline via finally in promise chain won't work easily)
  }).finally(() => { /* cleanup handled per-test */ });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`LULUS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`GAGAL  ${name}\n       ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion gagal"); }

// ─── Tes ──────────────────────────────────────────────────────────────────────
(async () => {
  const hash = await bcrypt.hash("OldPw@123", 10);

  // User A: untuk changePassword
  const userA = await prisma.user.create({
    data: { name: "RevocA", email: `reva-${TAG}@test.local`, passwordHash: hash, role: "buyer" },
  });
  cleanupIds.push(userA.id);

  // User B: untuk forgotPasswordVerify
  const userB = await prisma.user.create({
    data: { name: "RevocB", email: `revb-${TAG}@test.local`, passwordHash: hash, role: "buyer" },
  });
  cleanupIds.push(userB.id);

  // User C: untuk changeEmailVerify
  const userC = await prisma.user.create({
    data: { name: "RevocC", email: `revc-${TAG}@test.local`, passwordHash: hash, role: "buyer" },
  });
  cleanupIds.push(userC.id);

  // User D: untuk tes TIDAK dicabut (PUT /profile, approve konsinyasi)
  const userD = await prisma.user.create({
    data: { name: "RevocD", email: `revd-${TAG}@test.local`, passwordHash: hash, role: "buyer" },
  });
  cleanupIds.push(userD.id);

  // ── 1. passwordChangedAt null → token tetap valid ──────────────────────────
  await test("token valid: passwordChangedAt null (belum pernah ubah kredensial)", async () => {
    const tok = oldToken(userD.id, "buyer");
    const r = await runMiddleware(tok);
    assert(r.next === true, `expected next, got ${JSON.stringify(r)}`);
  });

  // ── 2. changePassword mencabut token lama, mengembalikan token baru ─────────
  await test("changePassword: token lama dicabut, token baru dikembalikan", async () => {
    const tok = oldToken(userA.id, "buyer");
    // Pastikan token masih valid sebelum ubah
    const before = await runMiddleware(tok);
    assert(before.next === true, "token sebelum harusnya valid");

    const r = await invokeChangePassword(userA.id, "buyer", "OldPw@123", "NewPw@456!");
    assert(r.status === 200 && r.data.token, `changePassword response: ${JSON.stringify(r)}`);

    // Token lama harus dicabut
    const after = await runMiddleware(tok);
    assert(after.status === 401, `token lama harusnya 401, dapat ${after.status}`);

    // Token baru harus lolos
    const newTok = r.data.token;
    const withNew = await runMiddleware(newTok);
    assert(withNew.next === true, `token baru harusnya valid`);
  });

  // ── 3. forgotPasswordVerify mencabut token lama (tidak kembalikan token baru) ─
  await test("forgotPasswordVerify: token lama dicabut", async () => {
    // Buat OTP lupa_password untuk userB
    const code = "123456";
    await prisma.otpCode.create({
      data: {
        userId: userB.id, code, purpose: "lupa_password", isUsed: false,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const tok = oldToken(userB.id, "buyer");
    const before = await runMiddleware(tok);
    assert(before.next === true, "token sebelum harusnya valid");

    const r = await invokeForgotPasswordVerify(`revb-${TAG}@test.local`, code, "NewPw@789!");
    assert(r.status === 200, `forgotPwVerify: ${JSON.stringify(r)}`);
    assert(!r.data.token, "forgotPasswordVerify tidak boleh mengembalikan token");

    const after = await runMiddleware(tok);
    assert(after.status === 401, `token lama harusnya 401`);
  });

  // ── 4. changeEmailVerify mencabut token lama, kembalikan token baru ─────────
  await test("changeEmailVerify: token lama dicabut, token baru dikembalikan", async () => {
    const code = "654321";
    const newEmail = `revc-new-${TAG}@test.local`;
    await prisma.otpCode.create({
      data: {
        userId: userC.id, code, purpose: "ganti_email", isUsed: false,
        targetEmail: newEmail, expiresAt: new Date(Date.now() + 600000),
      },
    });
    const tok = oldToken(userC.id, "buyer");
    const before = await runMiddleware(tok);
    assert(before.next === true, "token sebelum harusnya valid");

    const r = await invokeChangeEmailVerify(userC.id, "buyer", code);
    assert(r.status === 200 && r.data.token, `changeEmailVerify: ${JSON.stringify(r)}`);

    const after = await runMiddleware(tok);
    assert(after.status === 401, `token lama harusnya 401`);

    const withNew = await runMiddleware(r.data.token);
    assert(withNew.next === true, "token baru harusnya valid");
  });

  // ── 5. PUT /profile (update nama) TIDAK mencabut token ─────────────────────
  await test("PUT /profile (update nama): token lama TETAP valid", async () => {
    const tok = oldToken(userD.id, "buyer");
    // Simulasi update nama (updatedAt berubah, passwordChangedAt tetap null)
    await prisma.user.update({
      where: { id: userD.id },
      data: { name: "RevocD Updated" },
    });
    const after = await runMiddleware(tok);
    assert(after.next === true, `token harusnya tetap valid setelah update nama, dapat ${JSON.stringify(after)}`);
  });

  // ── 6. Update avatar TIDAK mencabut token ───────────────────────────────────
  await test("PUT /profile (update avatar): token lama TETAP valid", async () => {
    const tok = oldToken(userD.id, "buyer");
    await prisma.user.update({
      where: { id: userD.id },
      data: { avatarUrl: "/uploads/test.jpg" },
    });
    const after = await runMiddleware(tok);
    assert(after.next === true, `token harusnya tetap valid setelah update avatar`);
  });

  // ── 7. Approve konsinyasi (role berubah ke creator) TIDAK mencabut token ────
  await test("approve konsinyasi (role → creator): token lama TETAP valid", async () => {
    const tok = oldToken(userD.id, "buyer");
    await prisma.user.update({
      where: { id: userD.id },
      data: { role: "creator" },
    });
    const after = await runMiddleware(tok);
    // Middleware baca role dari DB per-request, jadi role sudah terbaru meski token lama
    assert(after.next === true, `token harusnya tetap valid setelah role berubah`);
    // kembalikan role
    await prisma.user.update({ where: { id: userD.id }, data: { role: "buyer" } });
  });

  // ── 8. googleLogin (link Google ke akun email) mencabut token lama ───────────
  // googleLogin membutuhkan idToken Google asli → tidak bisa di-invoke di unit test.
  // Yang diuji di sini adalah bahwa middleware benar-benar menggunakan passwordChangedAt
  // dengan menyimulasikan efek yang persis sama dengan cabang googleLogin:
  //   { authProvider: "both", passwordHash: null, passwordChangedAt: new Date() }
  await test("googleLogin link Google → token lama dicabut (simulasi efek controller)", async () => {
    const userG = await prisma.user.create({
      data: {
        name: "RevocG",
        email: `revg-${TAG}@test.local`,
        passwordHash: await bcrypt.hash("pw", 10),
        role: "buyer",
        authProvider: "email",
      },
    });
    cleanupIds.push(userG.id);

    const tok = oldToken(userG.id, "buyer");
    const before = await runMiddleware(tok);
    assert(before.next === true, "token sebelum harusnya valid");

    // Simulasi persis efek googleLogin cabang authProvider === "email"
    await prisma.user.update({
      where: { id: userG.id },
      data: { authProvider: "both", passwordHash: null, passwordChangedAt: new Date() },
    });

    const after = await runMiddleware(tok);
    assert(after.status === 401, `token lama harusnya 401 setelah link Google, dapat ${after.status}`);
  });

  // ─── Cleanup ─────────────────────────────────────────────────────────────────
  await prisma.otpCode.deleteMany({ where: { userId: { in: cleanupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupIds } } });
  await prisma.user.deleteMany({ where: { email: `revc-new-${TAG}@test.local` } });
  await prisma.$disconnect();

  const ok = failed === 0;
  console.log(`\n${ok ? "SEMUA TES PENCABUTAN TOKEN LULUS" : `${failed} tes GAGAL`}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
