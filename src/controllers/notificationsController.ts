import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

// GET /api/notifications — List notifikasi in-app milik user yang sedang login
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read — Tandai 1 notifikasi sebagai sudah dibaca
export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

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
};

// PATCH /api/notifications/read-all — Tandai seluruh notifikasi user sebagai sudah dibaca
export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: "Seluruh notifikasi berhasil ditandai sudah dibaca" });
  } catch (err) {
    next(err);
  }
};

export default {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
