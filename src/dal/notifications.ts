import prisma from "../lib/prisma";
import { Prisma, NotificationType } from "@prisma/client";
import { notFound } from "./errors";
import { AuthUser } from "./types";

type NotificationClient = Prisma.TransactionClient | typeof prisma;
type NotificationInput = { userId: string; type: NotificationType; title: string; body: string };

export function createNotification(client: NotificationClient, item: NotificationInput) {
  return client.notification.create({ data: item });
}

export function createNotifications(client: NotificationClient, items: NotificationInput[]) {
  if (items.length === 0) return Promise.resolve({ count: 0 });
  return client.notification.createMany({ data: items });
}

export async function createOrderSoldNotifications(client: NotificationClient, orderNumber: string, items: Array<{ productId: string; quantity: number }>) {
  const products = await client.product.findMany({ where: { id: { in: items.map((item) => item.productId) } }, select: { id: true, name: true, artisan: { select: { userId: true } } } });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product?.artisan.userId) continue;
    const entries = grouped.get(product.artisan.userId) ?? [];
    entries.push(`${product.name} × ${item.quantity}`);
    grouped.set(product.artisan.userId, entries);
  }
  return createNotifications(client, [...grouped.entries()].map(([userId, names]) => ({
    userId,
    type: NotificationType.pesanan_update,
    title: "Produk terjual",
    body: `Produkmu terjual pada pesanan ${orderNumber}: ${names.join(", ")}.`,
  })));
}

export async function listMyNotifications(user: AuthUser, options?: { page: number; limit: number }) {
  const where = { userId: user.id };
  if (!options) return prisma.notification.findMany({ where, orderBy: { createdAt: "desc" } });
  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (options.page - 1) * options.limit, take: options.limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return { notifications, total, unreadCount };
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

export async function deleteMyNotification(user: AuthUser, id: string) {
  const result = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) throw notFound("Notifikasi tidak ditemukan");
  return result;
}

export function deleteAllMyNotifications(user: AuthUser) {
  return prisma.notification.deleteMany({ where: { userId: user.id } });
}
