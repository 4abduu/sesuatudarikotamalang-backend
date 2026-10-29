/**
 * lib/productImages.ts
 * Fungsi murni untuk validasi dan normalisasi foto produk terkait varian.
 * Tidak memanggil database — mudah dites unit.
 */

export interface ImageVariantEntry {
  url: string;
  option: string;
  value: string;
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
      throw Object.assign(new Error("Setiap entri imageVariants harus berupa objek { url, option, value }"), { status: 400 });
    }
    const { url, option, value } = item as any;

    // Aturan 1: tipe string
    if (typeof url !== "string" || typeof option !== "string" || typeof value !== "string") {
      throw Object.assign(new Error("Setiap entri imageVariants harus memiliki url, option, dan value berupa string"), { status: 400 });
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

    // Aturan 2: option harus nama opsi varian yang valid
    const validValues = optionMap.get(option);
    if (!validValues) {
      throw Object.assign(new Error(`Opsi varian "${option}" tidak ditemukan pada produk ini`), { status: 400 });
    }

    // Aturan 2: value harus salah satu nilai opsi tersebut
    if (!validValues.has(value)) {
      throw Object.assign(new Error(`Nilai "${value}" tidak valid untuk opsi varian "${option}"`), { status: 400 });
    }

    result.push({ url, option, value });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalisasi urutan galeri (aturan 2.5 nomor 7):
// foto tanpa tautan lebih dulu, foto bertautan di belakang.
// Bila SEMUA bertautan, urutan asli dipakai.
// ---------------------------------------------------------------------------

export function normalizeImageOrder(images: string[], imageVariants: ImageVariantEntry[]): string[] {
  if (images.length === 0) return [];

  const linkedUrls = new Set(imageVariants.map((v) => v.url));

  const unlinked = images.filter((url) => !linkedUrls.has(url));
  const linked = images.filter((url) => linkedUrls.has(url));

  // Bila semua bertautan → urutan asli
  if (unlinked.length === 0) return images;

  return [...unlinked, ...linked];
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
