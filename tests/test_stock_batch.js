const assert = require("assert");
const prisma = require("../dist/lib/prisma").default;
const { attachEffectiveStockToVariants } = require("../dist/lib/stock");

(async () => {
  const original = {
    variants: prisma.productVariant.findMany,
    settings: prisma.appSettings.findUnique,
    orders: prisma.orderItem.groupBy,
  };
  let calls = 0;
  try {
    prisma.productVariant.findMany = async () => {
      calls += 1;
      return [{ id: "v1", stock: 10 }, { id: "v2", stock: 4 }];
    };
    prisma.appSettings.findUnique = async () => ({ autoCancelEnabled: true });
    prisma.orderItem.groupBy = async () => [{ variantId: "v1", _sum: { quantity: 3 } }];
    const result = await attachEffectiveStockToVariants([
      { id: "v1", productId: "p1" },
      { id: "v2", productId: "p2" },
    ]);
    assert.strictEqual(calls, 1, "stok batch membaca varian satu kali");
    assert.deepStrictEqual(result.map((variant) => variant.effectiveStock), [7, 4]);
    console.log("LULUS  effectiveStock dihitung batch untuk seluruh varian");
  } finally {
    prisma.productVariant.findMany = original.variants;
    prisma.appSettings.findUnique = original.settings;
    prisma.orderItem.groupBy = original.orders;
  }
})().catch((error) => {
  console.error("GAGAL", error);
  process.exitCode = 1;
});
