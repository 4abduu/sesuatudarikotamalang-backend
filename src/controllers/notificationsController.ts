import { Request, Response, NextFunction } from "express";
import { deleteAllMyNotifications, deleteMyNotification, listMyNotifications, markAllRead, markNotificationRead } from "../dal/notifications";
import { parsePagination, buildPagination } from "../lib/pagination";

// GET /api/notifications — List notifikasi in-app milik user yang sedang login
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Belum login" });
    }

    const pagination = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
    const result = await listMyNotifications(req.user, pagination);
    if (!pagination && Array.isArray(result)) {
      const unreadCount = result.filter((n) => !n.isRead).length;
      return res.json({ notifications: result, unreadCount });
    }
    if (!pagination || Array.isArray(result)) return res.json({ notifications: [], unreadCount: 0 });
    return res.json({ notifications: result.notifications, unreadCount: result.unreadCount, pagination: buildPagination(pagination.page, pagination.limit, result.total) });
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Belum login" });
    await deleteMyNotification(req.user, req.params.id);
    res.json({ message: "Notifikasi berhasil dihapus" });
  } catch (err) { next(err); }
};

export const deleteNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Belum login" });
    const result = await deleteAllMyNotifications(req.user);
    res.json({ message: "Seluruh notifikasi berhasil dihapus", deleted: result.count });
  } catch (err) { next(err); }
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
  deleteNotification,
  deleteNotifications,
};
