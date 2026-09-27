const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/notifications — List notifikasi in-app milik user yang sedang login
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read — Tandai 1 notifikasi sebagai sudah dibaca
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      return res.status(404).json({ error: "Notifikasi tidak ditemukan" });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: "Kamu tidak memiliki akses ke notifikasi ini" });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ notification: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all — Tandai seluruh notifikasi user sebagai sudah dibaca
router.patch("/read-all", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: "Seluruh notifikasi berhasil ditandai sudah dibaca" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
