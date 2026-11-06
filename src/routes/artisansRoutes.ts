import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/requireRole";
import artisansController from "../controllers/artisansController";
import reportController from "../controllers/reportController";

const router = express.Router();

// GET /api/artisans/applications/mine — Cek status pengajuan konsinyasi milik user yang login (Daftarkan sebelum /:id)
router.get("/applications/mine", requireAuth, artisansController.getMyApplications);

// PUT /api/artisans/mine — Update profil kreator (bio, avatarUrl, brandName) oleh kreator sendiri (Daftarkan sebelum /:id)
router.put("/mine", requireAuth, artisansController.updateMyProfile);

// GET /api/artisans/mine — A4: Profil kreator milik user yang sedang login (sebelum /:id)
router.get("/mine", requireAuth, artisansController.getMyArtisanProfile);
router.get("/mine/reports", requireAuth, requireRole("creator"), reportController.listMyReports);
router.get("/mine/reports/:month", requireAuth, requireRole("creator"), reportController.getMyReport);

// GET /api/artisans — daftar kreator aktif
router.get("/", artisansController.listArtisans);

// GET /api/artisans/:id — profil + karya kreator (hanya jika aktif dan produk aktif)
router.get("/:id", artisansController.getArtisanById);

// POST /api/artisans/apply — ajukan pendaftaran konsinyasi (butuh login)
router.post("/apply", requireAuth, artisansController.applyConsignment);

export default router;
