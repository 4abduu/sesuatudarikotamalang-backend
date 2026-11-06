import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { applyStockChange } from "../lib/stock";
import { HttpError } from "../lib/httpError";

const reasons = ["barang_masuk", "opname", "terjual_kasir", "rusak_hilang", "koreksi"];

export const adjustStock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, variantId, delta, reason, note } = req.body;
    if (typeof productId !== "string" || (variantId !== undefined && variantId !== null && typeof variantId !== "string") || !Number.isInteger(delta) || delta === 0 || !reasons.includes(reason) || (note !== undefined && note !== null && (typeof note !== "string" || note.length > 200))) throw new HttpError(400, "Data penyesuaian stok tidak valid", "VALIDATION_ERROR");
    const result = await prisma.$transaction((tx) => applyStockChange(tx, { productId, variantId, delta, reason, note, actorId: req.user?.id }));
    res.json({ message: "Stok berhasil disesuaikan", movement: result.movement, stock: result.stock });
  } catch (err) { next(err); }
};

export const listStockMovements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, q, reason, from, to, page, limit } = req.query;
    const parsedPage = typeof page === "string" && /^\d+$/.test(page) && Number(page) > 0 ? Number(page) : 1;
    const parsedLimit = typeof limit === "string" && /^\d+$/.test(limit) && Number(limit) > 0 ? Math.min(Number(limit), 100) : 20;
    const where: any = {};
    if (typeof productId === "string" && productId) where.productId = productId;
    if (typeof reason === "string" && reasons.concat("pesanan").includes(reason)) where.reason = reason;
    if (typeof q === "string" && q.trim()) where.product = { name: { contains: q.trim() } };
    if (typeof from === "string" || typeof to === "string") where.createdAt = { ...(typeof from === "string" ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}), ...(typeof to === "string" ? { lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000) } : {}) };
    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (parsedPage - 1) * parsedLimit, take: parsedLimit, include: { product: { select: { name: true } }, variant: true, order: { select: { orderNumber: true } } } }),
    ]);
    const actorIds = [...new Set(movements.map((movement) => movement.actorId).filter(Boolean))] as string[];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
    res.json({ movements: movements.map((m) => ({ id: m.id, productId: m.productId, productName: m.product.name, variantId: m.variantId, variantLabel: Array.isArray(m.variant?.combination) ? (m.variant?.combination as string[]).join(" / ") || null : null, delta: m.delta, stockAfter: m.stockAfter, reason: m.reason, note: m.note, actorName: m.actorId ? actorNames.get(m.actorId) ?? null : null, orderNumber: m.order?.orderNumber ?? null, createdAt: m.createdAt })), page: parsedPage, limit: parsedLimit, total });
  } catch (err) { next(err); }
};

export default { adjustStock, listStockMovements };
