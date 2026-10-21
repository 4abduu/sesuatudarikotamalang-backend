import prisma from "../lib/prisma";
import { badRequest, forbidden, notFound } from "./errors";
import { AuthUser } from "./types";

export function listMyReviews(user: AuthUser) {
  return prisma.review.findMany({
    where: { userId: user.id },
    include: { product: { select: { id: true, name: true, images: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createReviewForUser(
  user: AuthUser,
  input: { orderItemId?: unknown; rating?: unknown; comment?: unknown }
) {
  const { orderItemId, rating, comment } = input;
  const numericRating = parseInt(String(rating), 10);
  if (!rating || Number.isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    throw badRequest("rating wajib diisi (angka 1-5)");
  }
  if (!comment || typeof comment !== "string" || !comment.trim()) {
    throw badRequest("comment ulasan wajib diisi");
  }
  if (comment.length > 1000) throw badRequest("comment ulasan maksimal 1000 karakter");
  if (orderItemId !== undefined && orderItemId !== null && typeof orderItemId !== "string") {
    throw badRequest("orderItemId harus berupa string");
  }

  let productId: string | null = null;
  if (typeof orderItemId === "string" && orderItemId) {
    const orderItem = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
    if (!orderItem || orderItem.order.userId !== user.id) throw notFound("Item pesanan tidak ditemukan");
    if (orderItem.order.status !== "selesai") throw badRequest("Ulasan hanya dapat diberikan untuk pesanan yang sudah selesai");
    const existingReview = await prisma.review.findUnique({ where: { orderItemId } });
    if (existingReview) throw badRequest("Kamu sudah memberikan ulasan untuk item pesanan ini");
    productId = orderItem.productId;
  } else {
    const completedOrder = await prisma.order.findFirst({ where: { userId: user.id, status: "selesai" } });
    if (!completedOrder) {
      throw forbidden("Kamu harus pernah menyelesaikan minimal 1 pesanan di toko ini sebelum memberikan ulasan toko.");
    }
    const existingStoreReview = await prisma.review.findFirst({ where: { userId: user.id, productId: null, orderItemId: null } });
    if (existingStoreReview) throw badRequest("Kamu sudah pernah memberikan ulasan umum untuk toko ini.");
  }

  const trimmedComment = comment.trim();
  let review;
  try {
    review = await prisma.review.create({
      data: {
        userId: user.id,
        productId,
        orderItemId: typeof orderItemId === "string" && orderItemId ? orderItemId : null,
        rating: numericRating,
        comment: trimmedComment,
        status: "tampil",
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } }, product: { include: { artisan: true } } },
    });
  } catch (createErr: any) {
    // 1b: P2002 dapat terjadi saat dua request paralel membuat ulasan untuk item yang sama
    if (createErr?.code === "P2002") {
      throw badRequest("Kamu sudah memberikan ulasan untuk item pesanan ini");
    }
    throw createErr;
  }

  if (review.product?.artisan?.userId && review.product.artisan.userId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: review.product.artisan.userId,
        type: "ulasan_baru",
        title: "Ulasan Baru Produk",
        body: `${user.name} memberikan ulasan bintang ${numericRating} untuk produk "${review.product.name}": "${trimmedComment}"`,
      },
    }).catch(() => {});
  }
  return review;
}
