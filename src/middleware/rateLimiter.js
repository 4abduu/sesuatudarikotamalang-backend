const rateLimit = require("express-rate-limit");

/**
 * Rate limiter untuk endpoint login.
 * Maksimal 10 percobaan per IP per 15 menit.
 */
const loginLimiter = rateLimit({
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
const otpRequestLimiter = rateLimit({
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
const otpVerifyLimiter = rateLimit({
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
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan registrasi. Silakan coba lagi nanti.",
  },
});

module.exports = { loginLimiter, otpRequestLimiter, otpVerifyLimiter, registerLimiter };
