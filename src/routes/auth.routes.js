const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  registerLimiter,
} = require("../middleware/rateLimiter");
const authController = require("../controllers/auth.controller");

const router = express.Router();

// POST /api/auth/register
router.post("/register", registerLimiter, authController.register);

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// POST /api/auth/google — Login/Register via Google Sign-In
router.post("/google", authController.googleLogin);

// POST /api/auth/forgot-password/request
router.post("/forgot-password/request", otpRequestLimiter, authController.forgotPasswordRequest);

// POST /api/auth/forgot-password/verify
router.post("/forgot-password/verify", otpVerifyLimiter, authController.forgotPasswordVerify);

// POST /api/auth/change-email/request
router.post("/change-email/request", otpRequestLimiter, requireAuth, authController.changeEmailRequest);

// POST /api/auth/change-email/verify
router.post("/change-email/verify", otpVerifyLimiter, requireAuth, authController.changeEmailVerify);

// POST /api/auth/change-password — Ganti password user yang sedang login
router.post("/change-password", requireAuth, authController.changePassword);

// GET /api/auth/me — Cek profil user yang sedang login
router.get("/me", requireAuth, authController.getMe);

module.exports = router;
