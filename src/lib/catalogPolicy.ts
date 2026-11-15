import { HttpError } from "./httpError";

// Kebijakan katalog toko: istilah berkeyakinan tinggi yang jelas tidak sesuai
// dengan toko oleh-oleh seni. Ini bukan pengganti review admin atau moderasi foto.
const blockedTerms = [
  // Senjata, amunisi, dan bahan peledak
  "senjata", "senjata api", "pistol", "revolver", "handgun", "rifle", "shotgun",
  "amunisi", "peluru", "granat", "bom", "bahan peledak", "detonator", "explosive",
  // Narkotika dan alat konsumsi narkoba
  "narkoba", "narkotika", "ganja", "marijuana", "kokain", "heroin", "sabu", "meth",
  "ekstasi", "pil koplo", "bong", "alat hisap narkoba",
  // Pornografi dan produk seksual
  "pornografi", "porn", "bokep", "bugil", "telanjang", "nude", "nsfw", "dildo",
  "vibrator", "sex toy", "alat kelamin",
  // Ekstremisme, perjudian, dan barang hasil kejahatan
  "terorisme", "teroris", "propaganda teroris", "judi", "togel", "taruhan", "kasino",
  "barang curian", "uang palsu", "ktp palsu", "dokumen palsu", "bajakan", "bootleg", "counterfeit",
  // Satwa/benda yang dilindungi
  "gading", "cula", "kulit harimau", "kulit buaya", "satwa dilindungi", "bagian tubuh satwa",
  "tulang manusia",
  // Obat dan klaim kesehatan berisiko
  "obat keras", "obat terlarang", "obat tanpa izin", "obat palsu", "steroid ilegal",
];

function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function assertAllowedCatalogText(fieldLabel: string, value: unknown): void {
  if (typeof value !== "string" || !value.trim()) return;
  const normalized = ` ${normalizeCatalogText(value)} `;
  const matched = blockedTerms.some((term) => normalized.includes(` ${normalizeCatalogText(term)} `));
  if (matched) {
    throw new HttpError(400, `${fieldLabel} tidak memenuhi kebijakan produk toko`, "PRODUCT_POLICY_VIOLATION");
  }
}

export function assertAllowedCatalogFields(fields: Record<string, unknown>): void {
  for (const [label, value] of Object.entries(fields)) {
    assertAllowedCatalogText(label, value);
  }
}
