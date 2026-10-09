import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

export interface JwtPayload {
  id: string;
  role?: string;
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
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "") as JwtPayload;

    // Ambil data user & role terbaru langsung dari DB untuk mencegah klaim JWT basi (misal baru diapprove jadi creator)
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

export default requireAuth;
