import { Prisma } from "@prisma/client";
import { HttpError } from "./httpError";
import { CartItemStatus, MAX_QTY_PER_LINE } from "./orderLimits";

export type ProductForVariant = {
  id: string;
  variantOptions: Array<unknown>;
};

export async function resolveVariantForProduct(
  tx: Prisma.TransactionClient,
  product: ProductForVariant,
  variantId?: string | null,
) {
  if (product.variantOptions.length > 0) {
    if (!variantId) throw new HttpError(400, "Produk ini memiliki varian. Pilih varian terlebih dahulu");
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || variant.productId !== product.id) throw new HttpError(400, "Varian tidak valid untuk produk ini");
    return variant;
  }
  const variant = await tx.productVariant.findFirst({ where: { productId: product.id }, orderBy: { id: "asc" } });
  if (!variant) throw new HttpError(400, "Varian produk tidak ditemukan");
  return variant;
}

export function computeItemStatus(input: {
  product: { isActive: boolean; approvalStatus: string; withdrawnAt: Date | null; artisan?: { status: string; userId: string | null } | null } | null;
  userId: string;
  quantity: number;
  effectiveStock: number;
}): { status: CartItemStatus; maxQuantity: number } {
  const maxQuantity = Math.max(0, Math.min(input.effectiveStock, MAX_QTY_PER_LINE));
  if (!input.product || !input.product.isActive || input.product.approvalStatus !== "disetujui" || input.product.withdrawnAt) return { status: "product_unavailable", maxQuantity };
  if (input.product.artisan?.status !== "aktif") return { status: "creator_inactive", maxQuantity };
  if (input.product.artisan?.userId === input.userId) return { status: "own_product", maxQuantity };
  if (input.effectiveStock <= 0) return { status: "out_of_stock", maxQuantity };
  if (input.quantity > input.effectiveStock) return { status: "insufficient_stock", maxQuantity };
  return { status: "ok", maxQuantity };
}

export function variantLabel(combination: unknown): string {
  return Array.isArray(combination) && combination.length > 0 ? combination.map(String).join(" / ") : "Varian default";
}

export function presentCartItem(item: any, effectiveStock: number, userId: string) {
  const { status, maxQuantity } = computeItemStatus({ product: item.product, userId, quantity: item.quantity, effectiveStock });
  const images = Array.isArray(item.product?.images) ? item.product.images : [];
  const unitPrice = item.product?.price ?? 0;
  return {
    id: item.id, productId: item.productId, variantId: item.variantId, quantity: item.quantity,
    status, maxQuantity, effectiveStock,
    unitPrice, lineTotal: status === "ok" ? unitPrice * item.quantity : 0,
    product: { id: item.product?.id, name: item.product?.name, image: typeof images[0] === "string" ? images[0] : null, artisan: item.product?.artisan ? { id: item.product.artisan.id, brandName: item.product.artisan.brandName, isOfficial: item.product.artisan.isOfficial } : null },
    variant: { id: item.variant?.id, combination: Array.isArray(item.variant?.combination) ? item.variant.combination : [] },
    addedAt: item.createdAt, updatedAt: item.updatedAt,
  };
}

export function summarize(items: any[]) {
  return {
    lineCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + (item.status === "ok" ? item.lineTotal : 0), 0),
    hasUnavailable: items.some((item) => item.status !== "ok"),
  };
}

export function normalizeOrderItems(body: any) {
  const raw = Array.isArray(body?.items) ? body.items : body?.productId !== undefined ? [{ productId: body.productId, variantId: body.variantId, quantity: body.quantity }] : null;
  if (!raw || raw.length < 1 || raw.length > 10) throw new HttpError(400, "items harus berisi 1 sampai 10 item", "VALIDATION_ERROR");
  const items = raw.map((item: any, index: number) => {
    const quantity = item?.quantity === undefined ? 1 : item.quantity;
    if (typeof item?.productId !== "string" || !item.productId || (item.variantId !== undefined && item.variantId !== null && typeof item.variantId !== "string") || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) {
      throw new HttpError(400, `Item ke-${index + 1} tidak valid`, "VALIDATION_ERROR");
    }
    return { productId: item.productId, variantId: item.variantId ?? null, quantity };
  });
  const source = body?.source === undefined ? "direct" : body.source;
  if (source !== "direct" && source !== "cart") throw new HttpError(400, "source harus 'cart' atau 'direct'", "VALIDATION_ERROR");
  return { items, source } as const;
}
