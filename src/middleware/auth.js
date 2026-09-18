const jwt = require("jsonwebtoken");

/**
 * Middleware verifikasi JWT. Pasang di route yang butuh login.
 * Set req.user = { id, role } kalau token valid.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, ... } — isi payload sesuai yang di-sign saat login
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau kadaluarsa" });
  }
}

module.exports = { requireAuth };
