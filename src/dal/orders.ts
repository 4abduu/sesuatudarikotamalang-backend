import prisma from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { badRequest, forbidden, notFound } from "./errors";
import { AuthUser } from "./types";
import { isPaymentSuccess } from "../lib/paymentStatus";

const orderInclude = {
  items: {
    include: {
      product: { include: { artisan: { select: { id: true, brandName: true, isOfficial: true } } } },
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

  return prisma.$transaction(async (tx) => {
    const lockedRows: Array<{ id: string }> = await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    if (lockedRows.length === 0) throw notFound("Pesanan tidak ditemukan");

    const fresh = await tx.order.findUnique({
      where: { id },
      include: { payment: true, items: true },
    });
    if (!fresh || (user.role !== "admin" && fresh.userId !== user.id)) {
      throw notFound("Pesanan tidak ditemukan");
    }
    if (finalStatuses.includes(fresh.status)) {
      throw badRequest(`Pesanan yang sudah berstatus ${fresh.status} tidak dapat dibatalkan`);
    }
    if (user.role !== "admin" && (fresh.status === "lunas" || fresh.status === "lewat_batas_pengambilan")) {
      throw forbidden("Pesanan yang sudah lunas atau lewat batas pengambilan hanya bisa dibatalkan oleh Admin.");
    }
    if (user.role !== "admin" && fresh.status !== "menunggu_bayar") {
      throw badRequest("Pesanan tidak dapat dibatalkan");
    }

    return cancelOrderInTx(tx, fresh, {});
  });
}

export async function cancelOrderInTx(
  tx: Prisma.TransactionClient,
  order: any,
  options: { reason?: "permintaan_pembeli" | "kesalahan_toko" } = {},
) {
  const paid = order.paymentMethod === "midtrans" && isPaymentSuccess(order.payment?.status);
  const cancelReason = paid ? (options.reason || "kesalahan_toko") : options.reason;
  const updated = await tx.order.update({
    where: { id: order.id },
    data: {
      status: "dibatalkan",
      ...(cancelReason ? { cancelReason } : {}),
      ...(paid ? { refundStatus: "menunggu" } : {}),
    },
  });

  if (paid) {
    await tx.notification.create({
      data: {
        userId: order.userId,
        type: "pesanan_update",
        title: "Pesanan Dibatalkan",
        body: `Pesanan ${order.orderNumber} dibatalkan. Pembayaranmu sudah kami terima. Hubungi admin lewat WhatsApp untuk proses pengembalian dana.`,
      },
    });
  } else {
    await tx.notification.create({
      data: {
        userId: order.userId,
        type: "pesanan_update",
        title: "Update Status Pesanan",
        body: `Pesanan kamu (${order.orderNumber}) telah diperbarui menjadi: dibatalkan.`,
      },
    });
  }

  return updated;
}
