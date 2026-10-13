require("./helpers/requireTestDb")();

const jwt = require("jsonwebtoken");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { requireAuth } = require("../dist/middleware/authMiddleware");

function runMiddleware(token) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        resolve({ status: this.statusCode, body: data });
        return this;
      },
    };
    const req = { headers: { authorization: `Bearer ${token}` } };
    requireAuth(req, res, (error) => {
      if (error) reject(error);
      else resolve({ status: 200, next: true });
    });
  });
}

(async () => {
  const tag = Date.now();
  let userId;
  try {
    const user = await prisma.user.create({
      data: {
        name: "Auth Revocation Test",
        email: `auth-revocation-${tag}@test.local`,
        passwordHash: "hash",
        role: "buyer",
      },
    });
    userId = user.id;

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "secret-khusus-tes", {
      expiresIn: "7d",
    });
    const beforeUpdate = await runMiddleware(token);
    if (!beforeUpdate.next) throw new Error(`token baru ditolak: ${JSON.stringify(beforeUpdate)}`);

    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date(Date.now() + 2000) },
    });
    const afterUpdate = await runMiddleware(token);
    if (afterUpdate.status !== 401) throw new Error(`token lama tidak dicabut: ${JSON.stringify(afterUpdate)}`);

    console.log("LULUS  token lama ditolak setelah perubahan akun");
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error("GAGAL", error.message);
  process.exit(1);
});
