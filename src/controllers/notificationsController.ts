import { Request, Response, NextFunction } from "express";
import { listMyNotifications, markAllRead, markNotificationRead } from "../dal/notifications";

// GET /api/notifications — List notifikasi in-app milik user yang sedang login
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const notifications = await listMyNotifications(req.user);

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

    const updated = await markNotificationRead(req.user, id);

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

    await markAllRead(req.user);

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
