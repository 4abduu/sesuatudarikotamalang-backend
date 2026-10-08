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
async function effectiveStock(variantId, tx = prisma) {
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
  });
  if (!variant) return 0;

  const now = new Date();

  // Ambil pengaturan sistem autoCancelEnabled
  const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
  const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

  const activeOrderConditions = [
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
