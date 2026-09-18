/**
 * Middleware cek role user. Pasang SETELAH requireAuth.
 * Contoh: router.get('/admin-only', requireAuth, requireRole('admin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Tidak punya akses untuk resource ini" });
    }
    next();
  };
}

module.exports = { requireRole };
