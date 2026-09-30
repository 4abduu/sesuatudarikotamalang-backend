const express = require("express");
const { requireAuth } = require("../middleware/auth");
const notificationsController = require("../controllers/notifications.controller");

const router = express.Router();

// GET /api/notifications — List notifikasi in-app milik user yang sedang login
router.get("/", requireAuth, notificationsController.getNotifications);

// PATCH /api/notifications/:id/read — Tandai 1 notifikasi sebagai sudah dibaca
router.patch("/:id/read", requireAuth, notificationsController.markAsRead);

// PATCH /api/notifications/read-all — Tandai seluruh notifikasi user sebagai sudah dibaca
router.patch("/read-all", requireAuth, notificationsController.markAllAsRead);

module.exports = router;
