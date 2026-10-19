require("./helpers/requireTestDb")();
const assert = require("assert");
const bcrypt = require("bcrypt");
const prisma = require("../dist/lib/prisma").default;
const mailer = require("../dist/lib/mailer");
const { forgotPasswordRequest, forgotPasswordVerify, changeEmailRequest, changeEmailVerify } = require("../dist/controllers/authController");

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

async function main() {
  const tag = Date.now();
  const user = await prisma.user.create({ data: { name: "OTP Test", email: `otp-${tag}@test.local`, passwordHash: await bcrypt.hash("OldPw@123", 10), role: "buyer" } });
  const originalMailer = mailer.sendOtpEmail;
  let lastCode = "";
  mailer.sendOtpEmail = async (_to, code) => { lastCode = code; return { id: "test" }; };
  const authUser = { id: user.id, email: user.email, role: "buyer" };
  try {
    let response = await invoke(forgotPasswordRequest, { body: { email: user.email } });
    assert.strictEqual(response.status, 200);
    let otp = await prisma.otpCode.findFirst({ where: { userId: user.id, purpose: "lupa_password" }, orderBy: { createdAt: "desc" } });
    assert(otp && /^[0-9a-f]{64}$/.test(otp.code) && otp.code !== lastCode);
    for (let i = 0; i < 5; i++) {
      response = await invoke(forgotPasswordVerify, { body: { email: user.email, code: "000000", newPassword: "NewPw@456" } });
      assert.strictEqual(response.status, 400);
    }
    otp = await prisma.otpCode.findUnique({ where: { id: otp.id } });
    assert(otp.isUsed && otp.attempts >= 5);

    await invoke(forgotPasswordRequest, { body: { email: user.email } });
    response = await invoke(forgotPasswordVerify, { body: { email: user.email, code: lastCode, newPassword: "NewPw@456" } });
    assert.strictEqual(response.status, 200);

    const newEmail = `otp-new-${tag}@test.local`;
    response = await invoke(changeEmailRequest, { user: authUser, body: { newEmail } });
    assert.strictEqual(response.status, 200);
    otp = await prisma.otpCode.findFirst({ where: { userId: user.id, purpose: "ganti_email" }, orderBy: { createdAt: "desc" } });
    assert(otp && /^[0-9a-f]{64}$/.test(otp.code) && otp.code !== lastCode);
    for (let i = 0; i < 5; i++) {
      response = await invoke(changeEmailVerify, { user: authUser, body: { code: "000000" } });
      assert.strictEqual(response.status, 400);
    }
    otp = await prisma.otpCode.findUnique({ where: { id: otp.id } });
    assert(otp.isUsed && otp.attempts >= 5);
    console.log("LULUS  OTP tersimpan HMAC, benar berhasil, dan 5 percobaan salah menghanguskan kode");
  } finally {
    mailer.sendOtpEmail = originalMailer;
    await prisma.otpCode.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main().catch((error) => { console.error("GAGAL", error); process.exitCode = 1; });
