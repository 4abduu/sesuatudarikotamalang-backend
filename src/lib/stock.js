const prisma = require("./prisma");

/**
 * Hitung stok efektif satu variant:
 * Stok mentah dikurangi jumlah unit yang terikat pada order aktif:
 * - lunas
 * - selesai
 * - menunggu_bayar yang belum kedaluwarsa (holdExpiresAt > now)
 *
 * @param {string} variantId
 * @returns {Promise<number>}
 */
async function effectiveStock(variantId) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
  });
  if (!variant) return 0;

  const now = new Date();

  const activeOrdersCount = await prisma.orderItem.count({
    where: {
      variantId,
      order: {
        OR: [
          { status: "lunas" },
          { status: "selesai" },
          {
            status: "menunggu_bayar",
            holdExpiresAt: { gt: now },
          },
        ],
      },
    },
  });

  return Math.max(0, variant.stock - activeOrdersCount);
}

/**
 * Tempelkan informasi stok efektif ke array variant produk
 * @param {Array} variants
 * @returns {Promise<Array>}
 */
async function attachEffectiveStockToVariants(variants) {
  if (!variants || variants.length === 0) return [];
  return Promise.all(
    variants.map(async (v) => {
      const effStock = await effectiveStock(v.id);
      return {
        ...v,
        effectiveStock: effStock,
      };
    })
  );
}

module.exports = { effectiveStock, attachEffectiveStockToVariants };
