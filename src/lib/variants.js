/**
 * Helper Cartesian Product untuk membuat kombinasi varian otomatis
 * Contoh input:
 * [
 *   { name: "Motif", values: ["Ubin", "Sulur"] },
 *   { name: "Ukuran", values: ["S", "M"] }
 * ]
 * Output:
 * [
 *   ["Ubin", "S"],
 *   ["Ubin", "M"],
 *   ["Sulur", "S"],
 *   ["Sulur", "M"]
 * ]
 */
function cartesianProduct(variantOptions) {
  if (!variantOptions || variantOptions.length === 0) return [[]];

  return variantOptions.reduce(
    (acc, option) => {
      const values = Array.isArray(option.values) ? option.values : [];
      if (values.length === 0) return acc;
      return acc.flatMap((combination) =>
        values.map((val) => [...combination, val])
      );
    },
    [[]]
  );
}

module.exports = { cartesianProduct };
