import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma";
import { validatePassword } from "../lib/validatePassword";
import { sendOtpEmail } from "../lib/mailer";
import { isOwnCloudinaryImageUrl } from "../lib/cloudinary";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/** Terbitkan JWT dengan payload dan masa berlaku sama persis seperti login. */
function issueToken(userId: string, role: string): string {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET || "", { expiresIn: "7d" });
}

// POST /api/auth/register
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, password wajib diisi" });
    }

    // Validasi kekuatan password
    const { valid, checks } = validatePassword(password);
    if (!valid) {
      return res.status(400).json({
        error: "Password tidak memenuhi kriteria keamanan",
        checks,
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email sudah terdaftar" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "buyer" },
    });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "", {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email dan password wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    if (user.authProvider === "google") {
      return res.status(400).json({
        error: "Akun ini terdaftar menggunakan Google. Silakan masuk menggunakan tombol Masuk dengan Google.",
        code: "GOOGLE_ACCOUNT",
      });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "", {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/google — Login / Register via Google Sign-In Mobile
export const googleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "idToken wajib dikirim" });
    }

    // F-10: Jangan terima token Google jika GOOGLE_CLIENT_ID belum diset
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: "Google login belum dikonfigurasi" });
    }

    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({ error: "Token Google tidak valid atau kedaluwarsa" });
    }

    // F-10: Tolak jika email belum diverifikasi oleh Google
    if (!payload || payload.email_verified !== true) {
      return res.status(403).json({ error: "Email Google belum diverifikasi" });
    }

    const { email, name, picture } = payload;
    if (!email) {
      return res.status(400).json({ error: "Email dari Google tidak ditemukan" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // User Google baru: passwordHash = null (tidak punya password)
      user = await prisma.user.create({
        data: {
          name: name || "Pengguna Google",
          email,
          passwordHash: null,
          avatarUrl: picture,
          role: "buyer",
          authProvider: "google",
        },
      });
    } else if (user.authProvider === "email") {
      // F-09: Jika sebelumnya daftar via email biasa dan login via Google, set passwordHash = null
      // agar penyerang yang sempat mendaftarkan email korban tidak bisa mengakses akun setelah korban login Google.
      // passwordChangedAt diisi agar token lama (sebelum link Google) dicabut.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { authProvider: "both", passwordHash: null, passwordChangedAt: new Date() },
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "", {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password/request — Minta OTP Reset Password
export const forgotPasswordRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Email tidak ditemukan" });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

    // Invalidasi OTP lama dengan purpose yang sama
    await prisma.otpCode.updateMany({
      where: { userId: user.id, purpose: "lupa_password", isUsed: false },
      data: { isUsed: true },
    });

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        purpose: "lupa_password",
        expiresAt,
      },
    });

    await sendOtpEmail(email, code, "lupa_password");

    res.json({ message: "Kode OTP reset password telah dikirim ke email Anda" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password/verify — Verifikasi OTP & Reset Password
export const forgotPasswordVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code, newPassword } = req.body;
    // F-01: Validasi tipe ketat — cegah injeksi operator Prisma
    if (
      typeof email !== "string" ||
      typeof code !== "string" ||
      typeof newPassword !== "string" ||
      !email || !code || !newPassword
    ) {
      return res.status(400).json({ error: "email, code, dan newPassword wajib diisi (string)" });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Kode OTP harus berupa 6 digit angka" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Email tidak ditemukan" });
    }

    const { valid, checks } = validatePassword(newPassword);
    if (!valid) {
      return res.status(400).json({
        error: "Password baru tidak memenuhi kriteria keamanan",
        checks,
      });
    }

    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        code,
        purpose: "lupa_password",
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: "Kode OTP tidak valid atau sudah kedaluwarsa" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    // passwordChangedAt diisi agar semua token lama dicabut
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        authProvider: user.authProvider === "google" ? "both" : user.authProvider,
      },
    });

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // forgotPasswordVerify tidak mengembalikan token — user harus login ulang (D1)
    res.json({ message: "Password berhasil diperbarui. Silakan login kembali." });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-email/request (butuh requireAuth) — Minta OTP Ganti Email
export const changeEmailRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const rawEmail = req.body.newEmail;
    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Format email baru tidak valid" });
    }
    const newEmail = rawEmail.trim();

    // Validasi format email sederhana
    if (newEmail.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: "Format email baru tidak valid" });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!currentUser) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    // Perbandingan tidak peka huruf besar-kecil
    if (newEmail.toLowerCase() === currentUser.email.toLowerCase()) {
      return res.status(400).json({ error: "Email baru tidak boleh sama dengan email lama" });
    }

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) {
      return res.status(409).json({ error: "Email baru sudah digunakan oleh akun lain" });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidasi OTP lama dengan purpose yang sama
    await prisma.otpCode.updateMany({
      where: { userId: req.user.id, purpose: "ganti_email", isUsed: false },
      data: { isUsed: true },
    });

    await prisma.otpCode.create({
      data: {
        userId: req.user.id,
        code,
        purpose: "ganti_email",
        targetEmail: newEmail,
        expiresAt,
      },
    });

    // OTP dikirim ke email LAMA; newEmail disebutkan di isi email
    await sendOtpEmail(currentUser.email, code, "ganti_email", { newEmail });

    res.json({ message: "Kode OTP telah dikirim ke email Anda saat ini" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-email/verify (butuh requireAuth) — Verifikasi OTP Ganti Email
export const changeEmailVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { code } = req.body;
    // F-01: Validasi tipe ketat — cegah injeksi operator Prisma
    if (typeof code !== "string" || !code) {
      return res.status(400).json({ error: "code wajib diisi (string)" });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Kode OTP harus berupa 6 digit angka" });
    }

    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        userId: req.user.id,
        code,
        purpose: "ganti_email",
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord || !otpRecord.targetEmail) {
      return res.status(400).json({ error: "Kode OTP tidak valid atau sudah kedaluwarsa" });
    }

    const existingEmailUser = await prisma.user.findUnique({ where: { email: otpRecord.targetEmail } });
    if (existingEmailUser) {
      return res.status(409).json({ error: "Email baru sudah digunakan oleh akun lain" });
    }

    try {
      // passwordChangedAt diisi agar token lama dicabut; ditulis sebelum token baru diterbitkan
      await prisma.user.update({
        where: { id: req.user.id },
        data: { email: otpRecord.targetEmail, passwordChangedAt: new Date() },
      });
    } catch (updateErr: any) {
      // P2002: unique constraint — race condition, email baru diambil akun lain tepat bersamaan
      if (updateErr?.code === "P2002") {
        return res.status(409).json({ error: "Email baru sudah digunakan oleh akun lain" });
      }
      throw updateErr;
    }

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // D1: kembalikan token baru agar sesi yang sedang berjalan tidak terputus
    const newToken = issueToken(req.user.id, req.user.role);
    res.json({
      message: "Email berhasil diperbarui",
      email: otpRecord.targetEmail,
      token: newToken,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password (butuh requireAuth) — Ganti Password dari Pengaturan
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "oldPassword dan newPassword wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        error: "Akun ini terdaftar via Google dan belum memiliki password. Gunakan Lupa Password untuk membuat password.",
      });
    }

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Password lama salah" });
    }

    const { valid, checks } = validatePassword(newPassword);
    if (!valid) {
      return res.status(400).json({
        error: "Password baru tidak memenuhi kriteria keamanan",
        checks,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    // passwordChangedAt ditulis sebelum token baru diterbitkan agar iat >= detik passwordChangedAt
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    // D1: kembalikan token baru agar sesi yang sedang berjalan tidak terputus
    const newToken = issueToken(user.id, user.role);
    res.json({ message: "Password berhasil diperbarui", token: newToken });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me — Cek profil user yang sedang login
export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/profile — Update nama dan avatarUrl pengguna yang login
export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const { name, avatarUrl } = req.body;

    // Minimal satu field harus disediakan
    if (name === undefined && avatarUrl === undefined) {
      return res.status(400).json({ error: "Minimal salah satu dari name atau avatarUrl harus diisi" });
    }

    const updateData: { name?: string; avatarUrl?: string | null } = {};

    // Validasi name jika disediakan
    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({ error: "Format nama harus berupa string" });
      }
      const trimmedName = name.trim();
      // Panjang 2-80 karakter, tidak mengandung karakter kontrol ASCII (\x00-\x1F, \x7F)
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        return res.status(400).json({ error: "Nama harus berukuran 2 sampai 80 karakter" });
      }
      // Karakter kontrol check
      if (/[\x00-\x1F\x7F]/.test(trimmedName)) {
        return res.status(400).json({ error: "Nama tidak boleh memuat karakter kontrol" });
      }
      updateData.name = trimmedName;
    }

    // Validasi avatarUrl jika disediakan
    if (avatarUrl !== undefined) {
      if (avatarUrl === null) {
        updateData.avatarUrl = null;
      } else if (typeof avatarUrl === "string") {
        const trimmedAvatar = avatarUrl.trim();
        if (trimmedAvatar.length > 191) {
          return res.status(400).json({ error: "avatarUrl maksimal 191 karakter" });
        }

        // Tentukan base URL upload yang valid
        const publicBase = process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/+$/, "") : "";
        const reqBase = `${req.protocol}://${req.get("host")}`;

        const isValidLocal =
          (publicBase && trimmedAvatar.startsWith(`${publicBase}/uploads/`)) ||
          trimmedAvatar.startsWith(`${reqBase}/uploads/`) ||
          trimmedAvatar.startsWith("/uploads/");

        if (!isValidLocal && !isOwnCloudinaryImageUrl(trimmedAvatar)) {
          return res.status(400).json({ error: "avatarUrl harus merupakan URL hasil upload" });
        }

        updateData.avatarUrl = trimmedAvatar;
      } else {
        return res.status(400).json({ error: "Format avatarUrl harus berupa string atau null" });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
      },
    });

    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
};

export default {
  register,
  login,
  googleLogin,
  forgotPasswordRequest,
  forgotPasswordVerify,
  changeEmailRequest,
  changeEmailVerify,
  changePassword,
  getMe,
  updateProfile,
};

