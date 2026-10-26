import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/requireRole";
import adminController from "../controllers/adminController";
import pickupScheduleController from "../controllers/pickupScheduleController";

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

// PATCH /api/admin/orders/:id/refunded — Tandai refund manual selesai
router.patch("/orders/:id/refunded", adminController.markOrderRefunded);

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

// GET /api/admin/artisans — A5: Daftar seluruh kreator (status, productCount, avgRating)
router.get("/artisans", adminController.listAdminArtisans);

// GET /api/admin/products — A5: Daftar seluruh produk (termasuk nonaktif)
router.get("/products", adminController.listAdminProducts);

// PATCH /api/admin/products/:id/active — A5: Toggle status aktif/nonaktif produk
router.patch("/products/:id/active", adminController.toggleProductActive);

// GET /api/admin/reviews — A5: Daftar seluruh ulasan untuk admin
router.get("/reviews", adminController.listAdminReviews);

// Jadwal Pickup Admin
router.get("/pickup-schedule", pickupScheduleController.getAdminPickupSchedule);
router.patch("/pickup-schedule/settings", pickupScheduleController.updateAdminPickupScheduleSettings);
router.post("/pickup-slots", pickupScheduleController.createAdminPickupSlot);
router.patch("/pickup-slots/:id", pickupScheduleController.updateAdminPickupSlot);
router.delete("/pickup-slots/:id", pickupScheduleController.deleteAdminPickupSlot);

export default router;
