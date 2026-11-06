import prisma from "./prisma";
import { Prisma } from "@prisma/client";
import { HttpError } from "./httpError";

export async function applyStockChange(
  tx: Prisma.TransactionClient,
  input: { productId: string; variantId?: string | null; delta: number; reason: "barang_masuk" | "opname" | "terjual_kasir" | "rusak_hilang" | "koreksi" | "pesanan"; note?: string | null; actorId?: string | null; orderId?: string | null },
) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new HttpError(400, "delta harus bilangan bulat dan tidak boleh 0", "VALIDATION_ERROR");
  const variant = input.variantId
    ? await tx.productVariant.findFirst({ where: { id: input.variantId, productId: input.productId } })
    : await tx.productVariant.findFirst({ where: { productId: input.productId }, orderBy: { id: "asc" } });
  if (!variant) throw new HttpError(404, "Varian produk tidak ditemukan", "NOT_FOUND");
  await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variant.id} FOR UPDATE`;
  const current = await tx.productVariant.findUnique({ where: { id: variant.id } });
  const stockAfter = (current?.stock ?? 0) + input.delta;
  if (stockAfter < 0) throw new HttpError(400, `Stok saat ini ${current?.stock ?? 0} tidak cukup`, "INSUFFICIENT_STOCK");
  await tx.productVariant.update({ where: { id: variant.id }, data: { stock: stockAfter } });
  const movement = await tx.stockMovement.create({ data: { productId: input.productId, variantId: variant.id, delta: input.delta, stockAfter, reason: input.reason, note: input.note ?? null, actorId: input.actorId ?? null, orderId: input.orderId ?? null } });
  const aggregate = await tx.productVariant.aggregate({ where: { productId: input.productId }, _sum: { stock: true } });
  const product = await tx.product.findUnique({ where: { id: input.productId }, include: { artisan: true } });
  if (product) {
    const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
    const threshold = settings?.lowStockThreshold ?? 5;
    if ((aggregate._sum.stock ?? 0) > threshold && product.lowStockNotifiedAt) {
      await tx.product.update({ where: { id: product.id }, data: { lowStockNotifiedAt: null } });
    } else if ((aggregate._sum.stock ?? 0) <= threshold && !product.lowStockNotifiedAt && product.artisan.userId) {
      await tx.product.update({ where: { id: product.id }, data: { lowStockNotifiedAt: new Date() } });
      await tx.notification.create({ data: { userId: product.artisan.userId, type: "stok_menipis", title: "Stok menipis", body: `Stok produk ${product.name} menipis (${aggregate._sum.stock ?? 0}).` } });
    }
  }
  return { movement, stock: stockAfter };
}

/**
 * Hitung stok efektif satu variant:
 * Stok mentah dikurangi jumlah unit yang terikat pada order aktif:
 * - lunas
 * - selesai
 * - menunggu_bayar yang belum kedaluwarsa (holdExpiresAt > now)
 */
export async function effectiveStock(
  variantId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
  });
  if (!variant) return 0;

  const now = new Date();

  // Ambil pengaturan sistem autoCancelEnabled
  const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
  const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

  const activeOrderConditions: any[] = [
    { status: "lunas" },
    { status: "selesai" },
    { status: "lewat_batas_pengambilan" },
    {
      status: "menunggu_bayar",
      paymentMethod: "midtrans",
      holdExpiresAt: { gt: now },
    },
  ];

  if (autoCancelEnabled) {
    activeOrderConditions.push({
      status: "menunggu_bayar",
      paymentMethod: "cod",
      holdExpiresAt: { gt: now },
    });
  } else {
    activeOrderConditions.push({
      status: "menunggu_bayar",
      paymentMethod: "cod",
    });
  }

  const activeOrdersAggregate = await tx.orderItem.aggregate({
    _sum: {
      quantity: true,
    },
    where: {
      variantId,
      order: {
        OR: activeOrderConditions,
      },
    },
  });

  const activeCount = activeOrdersAggregate._sum.quantity ?? 0;
  return Math.max(0, variant.stock - activeCount);
}

/**
 * Tempelkan informasi stok efektif ke array variant produk
 */
export async function attachEffectiveStockToVariants<T extends { id: string }>(
  variants: T[]
): Promise<(T & { effectiveStock: number })[]> {
  if (!variants || variants.length === 0) return [];

  const variantIds = variants.map((variant) => variant.id);
  const [storedVariants, settings] = await Promise.all([
    prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, stock: true },
    }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
  ]);

  const now = new Date();
  const autoCancelEnabled = settings?.autoCancelEnabled ?? true;
  const activeOrderConditions: any[] = [
    { status: "lunas" },
    { status: "selesai" },
    { status: "lewat_batas_pengambilan" },
    {
      status: "menunggu_bayar",
      paymentMethod: "midtrans",
      holdExpiresAt: { gt: now },
    },
  ];
  activeOrderConditions.push(autoCancelEnabled
    ? { status: "menunggu_bayar", paymentMethod: "cod", holdExpiresAt: { gt: now } }
    : { status: "menunggu_bayar", paymentMethod: "cod" });

  const reservedByVariant = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      order: { OR: activeOrderConditions },
    },
    _sum: { quantity: true },
  });

  const stockMap = new Map(storedVariants.map((variant) => [variant.id, variant.stock]));
  const reservedMap = new Map(
    reservedByVariant
      .filter((row) => row.variantId !== null)
      .map((row) => [row.variantId as string, row._sum.quantity ?? 0])
  );

  return variants.map((variant) => ({
    ...variant,
    effectiveStock: Math.max(0, (stockMap.get(variant.id) ?? 0) - (reservedMap.get(variant.id) ?? 0)),
  }));
}
