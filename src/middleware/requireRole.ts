import { Request, Response, NextFunction } from "express";

/**
 * Middleware cek role user. Pasang SETELAH requireAuth.
 * Contoh: router.get('/admin-only', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Tidak punya akses untuk resource ini" });
    }
    next();
  };
}

export default requireRole;
