const express = require("express");
const { requireAuth } = require("../middleware/auth");
const ordersController = require("../controllers/orders.controller");

const router = express.Router();

// GET /api/orders — Riwayat pesanan milik user yang sedang login
router.get("/", requireAuth, ordersController.listOrders);

// GET /api/orders/:id — Detail 1 pesanan (hanya pemilik order atau admin)
router.get("/:id", requireAuth, ordersController.getOrderById);

// POST /api/orders — Buat order/reservasi baru (Atomic Transaction & Atomic Stock Check)
router.post("/", requireAuth, ordersController.createOrder);

// PATCH /api/orders/:id/cancel — Pembatalan manual (Buyer hanya bisa batalkan order milik sendiri yang belum lunas)
router.patch("/:id/cancel", requireAuth, ordersController.cancelOrder);

module.exports = router;
