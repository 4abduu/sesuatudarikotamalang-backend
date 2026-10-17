import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

export interface JwtPayload {
  id: string;
  role?: string;
  iat?: number;
  [key: string]: any;
}

/**
 * Middleware verifikasi JWT. Pasang di route yang butuh login.
 * Set req.user = { id, role } kalau token valid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  const token = header.split(" ")[1];
  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || "") as JwtPayload;
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau kadaluarsa" });
  }

  try {
    // Ambil data user & role terbaru langsung dari DB untuk mencegah klaim JWT basi
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, passwordChangedAt: true },
    });

    if (!dbUser) {
      return res.status(401).json({ error: "User sudah tidak terdaftar di sistem" });
    }

    // F-26: pencabutan token hanya bila kredensial berubah (ganti/reset password, ganti email, link Google).
    // Perbandingan memakai detik karena JWT iat tidak menyimpan milidetik.
    // null berarti belum pernah ada perubahan kredensial → token tetap valid.
    if (
      payload.iat &&
      dbUser.passwordChangedAt &&
      Math.floor(dbUser.passwordChangedAt.getTime() / 1000) > payload.iat
    ) {
      return res.status(401).json({ error: "Sesi kedaluwarsa setelah perubahan akun" });
    }

    const { passwordChangedAt: _pca, ...user } = dbUser;
    req.user = user;
    next();
  } catch (dbErr) {
    // F-26: Pisahkan error DB dari error JWT agar tidak membingungkan klien (misal kirim 500 jika DB bermasalah)
    next(dbErr);
  }
}

export default requireAuth;
