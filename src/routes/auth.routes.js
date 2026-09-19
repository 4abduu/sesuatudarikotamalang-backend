const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { validatePassword } = require("../lib/validatePassword");
const { sendOtpEmail } = require("../lib/mailer");

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
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

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
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

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google — Login / Register via Google Sign-In Mobile
router.post("/google", async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "idToken wajib dikirim" });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID || undefined,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({ error: "Token Google tidak valid atau kedaluwarsa" });
    }

    const { email, name, picture } = payload;
    if (!email) {
      return res.status(400).json({ error: "Email dari Google tidak ditemukan" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Buat password acak yang aman untuk akun Google
      const randomPassword = Math.random().toString(36).slice(-10) + "Aa1!";
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      user = await prisma.user.create({
        data: {
          name: name || "Pengguna Google",
          email,
          passwordHash,
          avatarUrl: picture,
          role: "buyer",
          authProvider: "google",
        },
      });
    } else if (user.authProvider === "email") {
      // Jika sebelumnya daftar via email biasa, update authProvider jadi "both"
      user = await prisma.user.update({
        where: { id: user.id },
        data: { authProvider: "both" },
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password/request — Minta OTP Reset Password
router.post("/forgot-password/request", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Email tidak ditemukan" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

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
});

// POST /api/auth/forgot-password/verify — Verifikasi OTP & Reset Password
router.post("/forgot-password/verify", async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "email, code, dan newPassword wajib diisi" });
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
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, authProvider: "both" },
    });

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    res.json({ message: "Password berhasil diperbarui. Silakan login kembali." });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-email/request (butuh requireAuth) — Minta OTP Ganti Email
router.post("/change-email/request", requireAuth, async (req, res, next) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) {
      return res.status(400).json({ error: "newEmail wajib diisi" });
    }

    if (newEmail === req.user.email) {
      return res.status(400).json({ error: "Email baru tidak boleh sama dengan email lama" });
    }

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) {
      return res.status(409).json({ error: "Email baru sudah digunakan oleh akun lain" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.otpCode.create({
      data: {
        userId: req.user.id,
        code,
        purpose: "ganti_email",
        targetEmail: newEmail,
        expiresAt,
      },
    });

    await sendOtpEmail(newEmail, code, "ganti_email");

    res.json({ message: "Kode OTP telah dikirim ke email baru Anda" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-email/verify (butuh requireAuth) — Verifikasi OTP Ganti Email
router.post("/change-email/verify", requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "code wajib diisi" });
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

    await prisma.user.update({
      where: { id: req.user.id },
      data: { email: otpRecord.targetEmail },
    });

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    res.json({
      message: "Email berhasil diperbarui",
      email: otpRecord.targetEmail,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password (butuh requireAuth) — Ganti Password dari Pengaturan
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "oldPassword dan newPassword wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: "User tidak ditemukan" });
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
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ message: "Password berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — Cek profil user yang sedang login
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
