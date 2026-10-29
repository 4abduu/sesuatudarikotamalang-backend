/**
 * lib/brandKey.ts
 * Normalisasi nama toko untuk deteksi duplikat (@handle).
 * Diekspor: normalizeBrandName, normalizeBrandKey, BRAND_KEY_MIN.
 */

/** Panjang minimum karakter alfanumerik pada brandKey. */
export const BRAND_KEY_MIN = 2;

/**
 * Normalisasi teks nama brand yang ditampilkan:
 * trim luar + padatkan spasi beruntun menjadi satu spasi.
 */
export function normalizeBrandName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Kunci ternormalisasi untuk deteksi duplikat:
 * NFKC → lowercase → buang semua yang bukan huruf atau angka Unicode.
 * Contoh: "Dini Draws" → "dinidraws"; "dini.draws" → "dinidraws"; "DINI  DRAWS" → "dinidraws".
 */
export function normalizeBrandKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
