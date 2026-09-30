const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/requireRole");
const adminController = require("../controllers/admin.controller");

const router = express.Router();

// Semua route di bawah ini WAJIB login sebagai admin
router.use(requireAuth, requireRole("admin"));

// GET /api/admin/dashboard — ringkasan statcard + data grafik dashboard admin
router.get("/dashboard", adminController.getDashboard);

// GET /api/admin/applications — Daftar pengajuan konsinyasi (filter status: pending/diterima/ditolak)
router.get("/applications", adminController.listApplications);

// POST /api/admin/applications/:id/approve — Setujui pengajuan konsinyasi (Transaction)
router.post("/applications/:id/approve", adminController.approveApplication);

// POST /api/admin/applications/:id/reject — Tolak pengajuan konsinyasi
router.post("/applications/:id/reject", adminController.rejectApplication);

// GET /api/admin/orders — Daftar seluruh pesanan untuk admin
router.get("/orders", adminController.listOrders);

// PATCH /api/admin/orders/:id/status — Admin ubah status order secara manual
router.patch("/orders/:id/status", adminController.updateOrderStatus);

// PATCH /api/admin/orders/:id/extend-hold — Admin perpanjang waktu hold pesanan Cash/QRIS
router.patch("/orders/:id/extend-hold", adminController.extendOrderHold);

// POST /api/admin/scan-qr/verify — Verifikasi pickup via Scan QR Kamera Browser / Input Manual Kode Order (SDK-XXXX)
router.post("/scan-qr/verify", adminController.verifyScanQr);

// GET /api/admin/settings — Ambil pengaturan sistem (AppSettings singleton id: 1)
router.get("/settings", adminController.getSettings);

// PUT /api/admin/settings — Update pengaturan sistem (AppSettings)
router.put("/settings", adminController.updateSettings);

// PATCH /api/admin/reviews/:id/hide — Sembunyikan / Tampilkan ulasan
router.patch("/reviews/:id/hide", adminController.toggleReviewHide);

// DELETE /api/admin/reviews/:id — Hapus ulasan tidak pantas
router.delete("/reviews/:id", adminController.deleteReview);

// PATCH /api/admin/artisans/:id/toggle-status — Ubah status aktif/nonaktif kreator
router.patch("/artisans/:id/toggle-status", adminController.toggleArtisanStatus);

module.exports = router;
