import prisma from "../lib/prisma";
import { notFound } from "./errors";
import { AuthUser } from "./types";

export function listMyNotifications(user: AuthUser) {
  return prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
}

export async function markNotificationRead(user: AuthUser, id: string) {
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true },
  });
  if (result.count === 0) throw notFound("Notifikasi tidak ditemukan");
  return prisma.notification.findFirst({ where: { id, userId: user.id } });
}

export function markAllRead(user: AuthUser) {
  return prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
}
