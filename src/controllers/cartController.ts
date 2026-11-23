import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { effectiveStock, attachEffectiveStockToVariants } from "../lib/stock";
import { HttpError } from "../lib/httpError";
import { MAX_ORDER_LINES, MAX_QTY_PER_LINE } from "../lib/orderLimits";
import { presentCartItem, resolveVariantForProduct, summarize, computeItemStatus } from "../lib/cart";

const include = {
  product: { include: { artisan: { select: { id: true, brandName: true, isOfficial: true, status: true, userId: true } } } },
  variant: true,
} as const;

async function readCart(userId: string) {
  const rows = await prisma.cartItem.findMany({ where: { userId }, include, orderBy: { updatedAt: "desc" } });
  const stockRows = await attachEffectiveStockToVariants(rows.map((row) => row.variant));
  const stockMap = new Map(stockRows.map((row) => [row.id, row.effectiveStock]));
  const items = rows.map((row) => presentCartItem(row, stockMap.get(row.variantId) ?? 0, userId));
  return { items, summary: summarize(items) };
}

function requireUser(req: Request) {
  if (!req.user) throw new HttpError(401, "Belum login");
  return req.user.id;
}

export async function listCart(req: Request, res: Response, next: NextFunction) {
  try { res.json(await readCart(requireUser(req))); } catch (error) { next(error); }
}

export async function addCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const { productId, variantId, quantity = 1 } = req.body ?? {};
    if (typeof productId !== "string" || !productId || (variantId !== undefined && variantId !== null && typeof variantId !== "string") || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) throw new HttpError(400, "productId dan quantity harus valid", "VALIDATION_ERROR");
    let created = false;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id: productId }, include: { artisan: true, variantOptions: true } });
      if (!product || !product.isActive || product.approvalStatus !== "disetujui" || product.withdrawnAt) throw new HttpError(409, "Produk tidak tersedia untuk dipesan", "PRODUCT_UNAVAILABLE");
      if (product.artisan.status !== "aktif") throw new HttpError(409, "Produk ini tidak tersedia karena kreator sedang nonaktif", "CREATOR_INACTIVE");
      if (product.artisan.userId === userId) throw new HttpError(403, "Kamu tidak bisa membeli produkmu sendiri", "OWN_PRODUCT");
      const variant = await resolveVariantForProduct(tx, product, variantId);
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variant.id} FOR UPDATE`;
      const stock = await effectiveStock(variant.id, tx);
      if (stock <= 0) throw new HttpError(409, "Maaf, stok produk ini baru saja habis", "OUT_OF_STOCK");
      const existing = await tx.cartItem.findUnique({ where: { userId_variantId: { userId, variantId: variant.id } } });
      if (!existing) {
        const count = await tx.cartItem.count({ where: { userId } });
        if (count >= MAX_ORDER_LINES) throw new HttpError(409, "Keranjang penuh (maksimal 10 produk berbeda)", "CART_FULL");
        if (quantity > Math.min(stock, MAX_QTY_PER_LINE)) throw new HttpError(409, "Jumlah melebihi stok yang tersedia", "QUANTITY_LIMIT");
        await tx.cartItem.create({ data: { userId, productId, variantId: variant.id, quantity } });
        created = true;
      } else {
        const nextQuantity = existing.quantity + quantity;
        if (nextQuantity > Math.min(stock, MAX_QTY_PER_LINE)) throw Object.assign(new HttpError(409, "Jumlah melebihi stok yang tersedia", "QUANTITY_LIMIT"), { maxQuantity: Math.min(stock, MAX_QTY_PER_LINE), inCart: existing.quantity });
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
      }
    });
    const cart = await readCart(userId);
    const item = cart.items.find((row) => row.productId === productId && (variantId ? row.variantId === variantId : true));
    res.status(created ? 201 : 200).json({ item, summary: cart.summary });
  } catch (error) { next(error); }
}

export async function updateCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const { quantity } = req.body ?? {};
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) throw new HttpError(400, "quantity harus bilangan bulat 1 sampai 10", "VALIDATION_ERROR");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const row = await tx.cartItem.findFirst({ where: { id: req.params.id, userId }, include: { product: { include: { artisan: true } }, variant: true } });
      if (!row) throw new HttpError(404, "Item keranjang tidak ditemukan", "NOT_FOUND");
      const stock = await effectiveStock(row.variantId, tx);
      const maxQuantity = Math.min(stock, MAX_QTY_PER_LINE);
      if (maxQuantity <= 0) throw new HttpError(409, "Stok produk ini habis", "OUT_OF_STOCK");
      if (quantity > maxQuantity) throw Object.assign(new HttpError(409, "Jumlah melebihi stok yang tersedia", "QUANTITY_LIMIT"), { maxQuantity });
      await tx.cartItem.update({ where: { id: row.id }, data: { quantity } });
    });
    const cart = await readCart(userId);
    const item = cart.items.find((row) => row.id === req.params.id);
    res.json({ item, summary: cart.summary });
  } catch (error) { next(error); }
}

export async function deleteCartItem(req: Request, res: Response, next: NextFunction) {
  try { const userId = requireUser(req); const result = await prisma.cartItem.deleteMany({ where: { id: req.params.id, userId } }); if (result.count === 0) throw new HttpError(404, "Item keranjang tidak ditemukan", "NOT_FOUND"); res.json({ summary: (await readCart(userId)).summary }); } catch (error) { next(error); }
}

export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try { const userId = requireUser(req); await prisma.cartItem.deleteMany({ where: { userId } }); res.json({ summary: (await readCart(userId)).summary }); } catch (error) { next(error); }
}

export default { listCart, addCartItem, updateCartItem, deleteCartItem, clearCart };
