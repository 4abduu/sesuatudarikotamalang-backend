export interface VariantOptionInput {
  name: string;
  values: string[];
}

/**
 * Helper Cartesian Product untuk membuat kombinasi varian otomatis
 */
export function cartesianProduct(variantOptions: VariantOptionInput[]): string[][] {
  if (!variantOptions || variantOptions.length === 0) return [[]];

  return variantOptions.reduce<string[][]>(
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
