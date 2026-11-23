const assert = require("assert");
const { computeItemStatus, normalizeOrderItems, summarize } = require("../dist/lib/cart");

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("PASS  " + name); }
  catch (error) { failed++; console.error("FAIL  " + name + "\n      " + error.message); }
}

(async () => {
  const product = { isActive: true, approvalStatus: "disetujui", withdrawnAt: null, artisan: { status: "aktif", userId: "creator" } };
  await check("status keranjang ok membatasi maxQuantity ke 10", async () => {
    assert.deepStrictEqual(computeItemStatus({ product, userId: "buyer", quantity: 2, effectiveStock: 20 }), { status: "ok", maxQuantity: 10 });
  });
  await check("status keranjang memprioritaskan produk tidak tersedia", async () => {
    assert.strictEqual(computeItemStatus({ product: { ...product, isActive: false }, userId: "buyer", quantity: 1, effectiveStock: 20 }).status, "product_unavailable");
  });
  await check("status keranjang menolak produk milik sendiri", async () => {
    assert.strictEqual(computeItemStatus({ product, userId: "creator", quantity: 1, effectiveStock: 20 }).status, "own_product");
  });
  await check("normalisasi request lama dan validasi quantity", async () => {
    assert.deepStrictEqual(normalizeOrderItems({ productId: "p1", quantity: 2 }).items, [{ productId: "p1", variantId: null, quantity: 2 }]);
    assert.throws(() => normalizeOrderItems({ items: [{ productId: "p1", quantity: 1.5 }] }), (error) => error.code === "VALIDATION_ERROR");
    assert.deepStrictEqual(summarize([{ quantity: 2, status: "ok", lineTotal: 100 }, { quantity: 1, status: "out_of_stock", lineTotal: 0 }]), { lineCount: 2, totalQuantity: 3, subtotal: 100, hasUnavailable: true });
  });
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
