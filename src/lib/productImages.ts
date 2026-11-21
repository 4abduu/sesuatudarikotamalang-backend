/**
 * lib/productImages.ts
 * Fungsi murni untuk validasi dan normalisasi foto produk terkait varian.
 * Tidak memanggil database — mudah dites unit.
 */

export interface ImageVariantEntry {
  url: string;
  combination?: Array<{ option: string; value: string }>;
  /** Format lama, tetap diterima agar data/klien existing kompatibel. */
  option?: string;
  value?: string;
}

export interface VariantOption {
  name: string;
  values: unknown; // JSON array dari DB atau body
}

// ---------------------------------------------------------------------------
// Validasi imageVariants (aturan 2.5 nomor 1–4 + batas 10 foto)
// ---------------------------------------------------------------------------

export function validateImageVariants(
  imageVariants: unknown,
  images: string[],
  variantOptions: VariantOption[]
): ImageVariantEntry[] {
  if (imageVariants === undefined || imageVariants === null) return [];

  if (!Array.isArray(imageVariants)) {
    throw Object.assign(new Error("imageVariants harus berupa array"), { status: 400 });
  }
  if (imageVariants.length === 0) return [];

  // Aturan 3: produk tanpa varian tidak boleh punya tautan
  if (!variantOptions || variantOptions.length === 0) {
    throw Object.assign(new Error("Produk tanpa varian tidak boleh memiliki tautan foto ke varian"), { status: 400 });
  }

  // Bangun lookup opsi yang valid
  const optionMap = new Map<string, Set<string>>();
  for (const opt of variantOptions) {
    const vals = Array.isArray(opt.values) ? opt.values as string[] : [];
    optionMap.set(opt.name, new Set(vals));
  }

  const imageSet = new Set(images);
  const seenUrls = new Set<string>();
  const result: ImageVariantEntry[] = [];

  for (const item of imageVariants) {
    if (!item || typeof item !== "object") {
      throw Object.assign(new Error("Setiap entri imageVariants harus berupa objek foto dan kombinasi varian"), { status: 400 });
    }
    const { url, option, value, combination } = item as any;

    if (typeof url !== "string") {
      throw Object.assign(new Error("Setiap entri imageVariants harus memiliki url berupa string"), { status: 400 });
    }

    // Aturan 1: url unik
    if (seenUrls.has(url)) {
      throw Object.assign(new Error(`URL foto "${url}" muncul lebih dari satu kali di imageVariants`), { status: 400 });
    }
    seenUrls.add(url);

    // Aturan 1: url harus ada di images
    if (!imageSet.has(url)) {
      throw Object.assign(new Error(`URL foto "${url}" tidak ada di daftar images produk`), { status: 400 });
    }

    const isLegacyLink = !Array.isArray(combination);
    const rawCombination = Array.isArray(combination)
      ? combination
      : typeof option === "string" && typeof value === "string"
        ? [{ option, value }]
        : null;
    if (!rawCombination || rawCombination.length === 0) {
      throw Object.assign(new Error("Setiap foto tertaut harus memiliki kombinasi varian"), { status: 400 });
    }

    const seenOptions = new Set<string>();
    const cleanCombination: Array<{ option: string; value: string }> = [];
    for (const part of rawCombination) {
      if (!part || typeof part.option !== "string" || typeof part.value !== "string") {
        throw Object.assign(new Error("Kombinasi varian foto harus memiliki option dan value berupa string"), { status: 400 });
      }
      if (seenOptions.has(part.option)) {
        throw Object.assign(new Error(`Opsi varian "${part.option}" tidak boleh diulang pada satu foto`), { status: 400 });
      }
      seenOptions.add(part.option);
      const validValues = optionMap.get(part.option);
      if (!validValues) {
        throw Object.assign(new Error(`Opsi varian "${part.option}" tidak ditemukan pada produk ini`), { status: 400 });
      }
      if (!validValues.has(part.value)) {
        throw Object.assign(new Error(`Nilai "${part.value}" tidak valid untuk opsi varian "${part.option}"`), { status: 400 });
      }
      cleanCombination.push({ option: part.option, value: part.value });
    }

    result.push(isLegacyLink
      ? { url, option: cleanCombination[0].option, value: cleanCombination[0].value }
      : { url, combination: cleanCombination });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalisasi urutan galeri (aturan 2.5 nomor 7):
// foto tanpa tautan lebih dulu, foto bertautan di belakang.
// Bila SEMUA bertautan, urutan asli dipakai.
// ---------------------------------------------------------------------------

export function normalizeImageOrder(
  images: string[],
  imageVariants: ImageVariantEntry[],
  variantOptions: VariantOption[] = [],
): string[] {
  if (images.length === 0) return [];

  const linkedUrls = new Set(imageVariants.map((v) => v.url));

  const unlinked = images.filter((url) => !linkedUrls.has(url));
  const linked = images.filter((url) => linkedUrls.has(url));

  const originalIndex = new Map(images.map((url, index) => [url, index]));
  const byUrl = new Map(imageVariants.map((entry) => [entry.url, entry]));
  const optionOrder = variantOptions.map((option) => ({
    name: option.name,
    values: Array.isArray(option.values) ? option.values as string[] : [],
  }));
  const linkedSorted = [...linked].sort((a, b) => {
    const aEntry = byUrl.get(a);
    const bEntry = byUrl.get(b);
    if (!aEntry || !bEntry) return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    const parts = (entry: ImageVariantEntry) => Array.isArray(entry.combination)
      ? entry.combination
      : entry.option && entry.value ? [{ option: entry.option, value: entry.value }] : [];
    const aParts = parts(aEntry);
    const bParts = parts(bEntry);
    for (const option of optionOrder) {
      const aPart = aParts.find((part) => part.option === option.name);
      const bPart = bParts.find((part) => part.option === option.name);
      const aRank = aPart ? option.values.indexOf(aPart.value) : option.values.length + 1;
      const bRank = bPart ? option.values.indexOf(bPart.value) : option.values.length + 1;
      const normalizedA = aRank < 0 ? option.values.length : aRank;
      const normalizedB = bRank < 0 ? option.values.length : bRank;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    }
    return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  });

  return [...unlinked, ...linkedSorted];
}

// ---------------------------------------------------------------------------
// Pangkas tautan yang URL-nya tidak ada lagi di images
// ---------------------------------------------------------------------------

export function pruneImageVariants(
  imageVariants: ImageVariantEntry[],
  images: string[]
): ImageVariantEntry[] {
  const imageSet = new Set(images);
  return imageVariants.filter((v) => imageSet.has(v.url));
}
