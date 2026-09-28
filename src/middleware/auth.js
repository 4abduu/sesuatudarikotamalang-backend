const jwt = require("jsonwebtoken");

/**
 * Middleware verifikasi JWT. Pasang di route yang butuh login.
 * Set req.user = { id, role } kalau token valid.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ambil data user & role terbaru langsung dari DB untuk mencegah klaim JWT basi (misal baru diapprove jadi creator)
    const prisma = require("../lib/prisma");
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    });

    if (!dbUser) {
      return res.status(401).json({ error: "User sudah tidak terdaftar di sistem" });
    }

    req.user = dbUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau kadaluarsa" });
  }
}

module.exports = { requireAuth };
