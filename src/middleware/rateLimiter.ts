import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const configuredApiLimit = Number.parseInt(process.env.API_RATE_LIMIT_MAX || "600", 10);
const apiLimit = Number.isInteger(configuredApiLimit) && configuredApiLimit > 0 ? configuredApiLimit : 600;

/** Semua endpoint API, kecuali webhook server-to-server Midtrans. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiLimit,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/payments/webhook",
  message: { error: "Terlalu banyak permintaan. Silakan coba lagi nanti." },
});

/**
 * Rate limiter untuk endpoint login.
 * Maksimal 10 percobaan per IP per 15 menit.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan login. Silakan coba lagi setelah 15 menit.",
  },
});

/**
 * Rate limiter untuk endpoint OTP request (forgot-password, change-email).
 * Maksimal 5 request per IP per 15 menit.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak permintaan OTP. Silakan coba lagi setelah 15 menit.",
  },
});

/**
 * Rate limiter untuk endpoint OTP verify (forgot-password/verify, change-email/verify).
 * Maksimal 5 percobaan verifikasi per IP per 10 menit (mencegah brute-force OTP 6 digit).
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan verifikasi OTP. Silakan minta kode baru.",
  },
});

/**
 * Rate limiter untuk endpoint register.
 * Maksimal 5 registrasi per IP per jam.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan registrasi. Silakan coba lagi nanti.",
  },
});

/** Login Google: maksimal 20 percobaan per IP per 15 menit. */
export const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan Google login. Silakan coba lagi nanti." },
});

/** Pencarian publik: maksimal 60 request per IP per menit. */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan pencarian. Silakan coba lagi nanti." },
});

/** Ganti password: maksimal 5 request per user per 15 menit. */
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || "")}`,
  message: { error: "Terlalu banyak percobaan ganti password. Silakan coba lagi nanti." },
});

/** Upload: maksimal 30 request per user per jam. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || "")}`,
  message: { error: "Terlalu banyak upload. Silakan coba lagi nanti." },
});

export default {
  apiLimiter,
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  registerLimiter,
  googleLoginLimiter,
  searchLimiter,
  changePasswordLimiter,
  uploadLimiter,
};
