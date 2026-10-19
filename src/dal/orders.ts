import prisma from "../lib/prisma";
import { badRequest, forbidden, notFound } from "./errors";
import { AuthUser } from "./types";

const orderInclude = {
  items: {
    include: {
      product: { include: { artisan: { select: { id: true, brandName: true } } } },
      variant: true,
    },
  },
  payment: true,
} as const;

export async function listMyOrders(user: AuthUser) {
  return prisma.order.findMany({
    where: { userId: user.id },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderForUser(user: AuthUser, id: string, include?: Record<string, unknown>) {
  const queryInclude = include || {
    user: { select: { id: true, name: true, email: true } },
    ...orderInclude,
  };
  const order = user.role === "admin"
    ? await prisma.order.findUnique({ where: { id }, include: queryInclude as any })
    : await prisma.order.findFirst({ where: { id, userId: user.id }, include: queryInclude as any });

  if (!order) throw notFound("Pesanan tidak ditemukan");
  return order;
}

export async function cancelOrderForUser(user: AuthUser, id: string) {
  const current = await getOrderForUser(user, id, {});
  const finalStatuses = ["selesai", "dibatalkan", "kedaluwarsa"];

  if (finalStatuses.includes(current.status)) {
    throw badRequest(`Pesanan yang sudah berstatus ${current.status} tidak dapat dibatalkan`);
  }

  if (user.role !== "admin" && (current.status === "lunas" || current.status === "lewat_batas_pengambilan")) {
    throw forbidden("Pesanan yang sudah lunas atau lewat batas pengambilan hanya bisa dibatalkan oleh Admin.");
  }

  const where = user.role === "admin"
    ? { id, status: { notIn: finalStatuses as any } }
    : { id, userId: user.id, status: "menunggu_bayar" as const };
  const result = await prisma.order.updateMany({ where: where as any, data: { status: "dibatalkan" } });

  if (result.count === 0) {
    const fresh = await getOrderForUser(user, id, {});
    if (user.role !== "admin" && (fresh.status === "lunas" || fresh.status === "lewat_batas_pengambilan")) {
      throw forbidden("Pesanan yang sudah lunas atau lewat batas pengambilan hanya bisa dibatalkan oleh Admin.");
    }
    if (finalStatuses.includes(fresh.status)) {
      throw badRequest(`Pesanan yang sudah berstatus ${fresh.status} tidak dapat dibatalkan`);
    }
    throw badRequest("Pesanan tidak dapat dibatalkan");
  }

  return prisma.order.findUnique({ where: { id } });
}
