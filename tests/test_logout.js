require("./helpers/requireTestDb")();
const assert = require("assert");
const jwt = require("jsonwebtoken");
const prisma = require("../dist/lib/prisma").default;
const { logout } = require("../dist/controllers/authController");
const { requireAuth } = require("../dist/middleware/authMiddleware");
const { purgeExpiredRevokedTokens } = require("../dist/jobs/tokenCleanupJob");

function invokeLogout(token, user) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    logout({ user, headers: { authorization: `Bearer ${token}` } }, res, reject).catch(reject);
  });
}

function checkToken(token) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    requireAuth({ headers: { authorization: `Bearer ${token}` } }, res, (error) => error ? reject(error) : resolve({ status: 200 }));
  });
}

(async () => {
  const tag = Date.now();
  const user = await prisma.user.create({ data: { name: "Logout Test", email: `logout-${tag}@test.local`, passwordHash: "dummy", role: "buyer" } });
  const base = { id: user.id, role: "buyer" };
  const tokenA = jwt.sign({ id: user.id, role: "buyer", jti: `a-${tag}` }, process.env.JWT_SECRET, { expiresIn: "7d" });
  const tokenB = jwt.sign({ id: user.id, role: "buyer", jti: `b-${tag}` }, process.env.JWT_SECRET, { expiresIn: "7d" });
  try {
    assert.strictEqual((await checkToken(tokenA)).status, 200);
    assert.strictEqual((await invokeLogout(tokenA, base)).status, 200);
    assert.strictEqual((await checkToken(tokenA)).status, 401);
    assert.strictEqual((await checkToken(tokenB)).status, 200);
    assert.strictEqual((await invokeLogout(tokenA, base)).status, 200, "logout idempoten");

    await prisma.revokedToken.create({ data: { tokenHash: `expired-${tag}`, userId: user.id, expiresAt: new Date(Date.now() - 1000) } });
    const deleted = await purgeExpiredRevokedTokens();
    assert(deleted >= 1, "token kedaluwarsa terhapus");
    console.log("LULUS  logout mencabut satu perangkat, idempoten, dan cleanup token");
  } finally {
    await prisma.revokedToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
})().catch((error) => { console.error("GAGAL", error); process.exitCode = 1; });
