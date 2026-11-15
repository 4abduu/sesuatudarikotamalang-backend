const assert = require("assert");
const { assertAllowedCatalogText } = require("../dist/lib/catalogPolicy");

assert.doesNotThrow(() => assertAllowedCatalogText("Nama produk", "Postcard Kayutangan"));
assert.throws(
  () => assertAllowedCatalogText("Nama produk", "Miniatur senjata api"),
  (error) => error.status === 400 && error.code === "PRODUCT_POLICY_VIOLATION"
);
assert.throws(
  () => assertAllowedCatalogText("Deskripsi produk", "Poster pornografi"),
  (error) => error.status === 400 && error.code === "PRODUCT_POLICY_VIOLATION"
);
console.log("LULUS catalog policy");
