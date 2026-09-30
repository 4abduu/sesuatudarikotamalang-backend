const express = require("express");
const { requireAuth } = require("../middleware/auth");
const artisansController = require("../controllers/artisans.controller");

const router = express.Router();

// GET /api/artisans/applications/mine — Cek status pengajuan konsinyasi milik user yang login (Daftarkan sebelum /:id)
router.get("/applications/mine", requireAuth, artisansController.getMyApplications);

// PUT /api/artisans/mine — Update profil kreator (bio, avatarUrl, brandName) oleh kreator sendiri (Daftarkan sebelum /:id)
router.put("/mine", requireAuth, artisansController.updateMyProfile);

// GET /api/artisans — daftar kreator aktif
router.get("/", artisansController.listArtisans);

// GET /api/artisans/:id — profil + karya kreator (hanya jika aktif dan produk aktif)
router.get("/:id", artisansController.getArtisanById);

// POST /api/artisans/apply — ajukan pendaftaran konsinyasi (butuh login)
router.post("/apply", requireAuth, artisansController.applyConsignment);

module.exports = router;
