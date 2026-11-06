import prisma from "./prisma";

export function validMonth(month: unknown): month is string { return typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month); }
function bounds(month: string) { const [year, mon] = month.split("-").map(Number); return { start: new Date(Date.UTC(year, mon - 1, 1) - 7 * 3600000), end: new Date(Date.UTC(year, mon, 1) - 7 * 3600000) }; }

export async function calculateMonthlyReport(month: string, client: any = prisma) {
  const { start, end } = bounds(month);
  const settings = await client.appSettings.findUnique({ where: { id: 1 } });
  const defaultShare = Number(settings?.defaultCreatorSharePercent ?? 70);
  const artisans = await client.artisan.findMany({ where: { status: "aktif", isOfficial: false }, include: { products: { include: { variants: true } } }, orderBy: { createdAt: "asc" } });
  const items = await client.orderItem.findMany({ where: { order: { status: "selesai", completedAt: { gte: start, lt: end } }, product: { artisan: { isOfficial: false } } }, include: { order: true, product: true, variant: true } });
  const creators = artisans.map((artisan: any) => {
    const salesMap = new Map<string, any>();
    for (const item of items.filter((row: any) => row.product.artisanId === artisan.id)) {
      const key = `${item.productId}:${item.variantId || ""}:${item.priceSnapshot}`;
      const existing = salesMap.get(key) || { productId: item.productId, productName: item.product.name, variantLabel: Array.isArray(item.variant?.combination) ? (item.variant.combination as string[]).join(" / ") || null : null, quantity: 0, price: item.priceSnapshot, revenue: 0 };
      existing.quantity += item.quantity; existing.revenue += item.quantity * item.priceSnapshot; salesMap.set(key, existing);
    }
    const sales = [...salesMap.values()]; const revenue = sales.reduce((sum, sale) => sum + sale.revenue, 0); const itemsSold = sales.reduce((sum, sale) => sum + sale.quantity, 0); const sharePercent = Number(artisan.creatorSharePercent ?? defaultShare); const creatorShare = Math.round(revenue * sharePercent / 100);
    return { artisanId: artisan.id, brandName: artisan.brandName, itemsSold, revenue, sharePercent, creatorShare, storeShare: revenue - creatorShare, sales, stock: artisan.products.flatMap((product: any) => product.variants.map((variant: any) => ({ productId: product.id, productName: product.name, variantLabel: Array.isArray(variant.combination) ? variant.combination.join(" / ") || null : null, stock: variant.stock }))) };
  });
  return { month, status: "draf", finalizedAt: null, salesSource: "aplikasi", totals: { itemsSold: creators.reduce((s: number, c: any) => s + c.itemsSold, 0), revenue: creators.reduce((s: number, c: any) => s + c.revenue, 0), creatorShare: creators.reduce((s: number, c: any) => s + c.creatorShare, 0), storeShare: creators.reduce((s: number, c: any) => s + c.storeShare, 0) }, creators };
}
