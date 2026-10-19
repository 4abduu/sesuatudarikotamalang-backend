import prisma from "../lib/prisma";
import { forbidden, notFound } from "./errors";
import { AuthUser } from "./types";

export async function getEditableProduct(user: AuthUser, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { artisan: true } });
  if (!product) throw notFound("Produk tidak ditemukan");
  if (user.role === "admin") return product;
  if (product.artisan.userId !== user.id) throw forbidden("Kamu tidak memiliki akses untuk mengubah produk ini");
  if (product.artisan.status !== "aktif") throw forbidden("Akun kreator nonaktif");
  return product;
}
