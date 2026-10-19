import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  registerLimiter,
  googleLoginLimiter,
  changePasswordLimiter,
} from "../middleware/rateLimiter";
import authController from "../controllers/authController";

const router = express.Router();

// POST /api/auth/register
router.post("/register", registerLimiter, authController.register);

// POST /api/auth/login
router.post("/login", loginLimiter, authController.login);

// POST /api/auth/google — Login/Register via Google Sign-In
router.post("/google", googleLoginLimiter, authController.googleLogin);

// POST /api/auth/forgot-password/request
router.post("/forgot-password/request", otpRequestLimiter, authController.forgotPasswordRequest);

// POST /api/auth/forgot-password/verify
router.post("/forgot-password/verify", otpVerifyLimiter, authController.forgotPasswordVerify);

// POST /api/auth/change-email/request
router.post("/change-email/request", otpRequestLimiter, requireAuth, authController.changeEmailRequest);

// POST /api/auth/change-email/verify
router.post("/change-email/verify", otpVerifyLimiter, requireAuth, authController.changeEmailVerify);

// POST /api/auth/change-password — Ganti password user yang sedang login
router.post("/change-password", requireAuth, changePasswordLimiter, authController.changePassword);

// POST /api/auth/logout — Cabut token perangkat ini
router.post("/logout", requireAuth, authController.logout);

// GET /api/auth/me — Cek profil user yang sedang login
router.get("/me", requireAuth, authController.getMe);

// PUT /api/auth/profile — Update profil (nama, avatarUrl) user yang sedang login
router.put("/profile", requireAuth, authController.updateProfile);

export default router;

