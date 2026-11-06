import prisma from "./prisma";
import { todayWibString } from "./dates";

export async function getSlowMovers(client: any = prisma) {
  const today = new Date(`${todayWibString()}T00:00:00Z`);
  const products = await client.product.findMany({
    where: { approvalStatus: "disetujui", isActive: true, withdrawnAt: null, artisan: { isOfficial: false, status: "aktif" } },
    include: { artisan: { select: { id: true, brandName: true } }, variants: { select: { stock: true } }, orderItems: { where: { order: { status: "selesai" } }, select: { order: { select: { createdAt: true, completedAt: true } } } } },
  });
  return products.map((product: any) => {
    const soldDates = product.orderItems.map((item: any) => item.order.completedAt || item.order.createdAt).filter(Boolean).sort((a: Date, b: Date) => b.getTime() - a.getTime());
    const referenceDate = soldDates[0] || product.createdAt;
    const daysIdle = Math.max(0, Math.floor((today.getTime() - new Date(referenceDate).getTime()) / 86400000));
    return { id: product.id, name: product.name, price: product.price, totalStock: product.variants.reduce((sum: number, v: any) => sum + v.stock, 0), artisan: product.artisan, referenceDate, referenceType: soldDates.length ? "terjual_terakhir" : "ditambahkan", monthsIdle: Math.floor(daysIdle / 30), daysIdle, level: daysIdle >= 180 ? "tarik" : "peringatan" };
  }).filter((product: any) => product.daysIdle >= 150).sort((a: any, b: any) => b.daysIdle - a.daysIdle);
}
