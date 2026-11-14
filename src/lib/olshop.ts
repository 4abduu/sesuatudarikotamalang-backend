import dns from "dns/promises";
import net from "net";
import prisma from "./prisma";
import { HttpError } from "./httpError";

/**
 * Link marketplace (olshop) — validasi keamanan + penyusunan link akhir.
 *
 * Aturan keamanan (dijalankan di backend; form admin/mobile hanya UX):
 *  1. Hanya HTTPS, tanpa user:pass@, tanpa port, bukan alamat IP, bukan IDN/punycode.
 *  2. Hostname harus COCOK PERSIS dengan domain resmi platform atau subdomainnya
 *     (shopee.co.id.evil.com dan evilshopee.co.id ditolak).
 *  3. Link pendek (shp.ee, vt.tiktok.com, dst) diikuti redirect-nya di server,
 *     maksimal 5 lompatan; SETIAP lompatan dicek ulang ke daftar domain yang sama
 *     dan DNS-nya tidak boleh mengarah ke alamat privat/internal (anti-SSRF).
 *     Kalau tidak bisa diverifikasi, ditolak (fail closed).
 *
 * Mengubah daftar domain resmi cukup di ALLOWED_ROOTS / SHORT_HOSTS di bawah.
 */

export const OLSHOP_PLATFORMS = ["shopee", "tokopedia", "tiktokshop"] as const;
export type OlshopPlatform = (typeof OLSHOP_PLATFORMS)[number];
export const OLSHOP_MODES = ["tidak", "toko", "khusus"] as const;
export type OlshopMode = (typeof OLSHOP_MODES)[number];
export type StoreOlshopUrls = Record<OlshopPlatform, string | null>;

export const OLSHOP_LABEL: Record<OlshopPlatform, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktokshop: "TikTok Shop",
};

const ALLOWED_ROOTS: Record<OlshopPlatform, string[]> = {
  shopee: ["shopee.co.id", "shp.ee"],
  tokopedia: ["tokopedia.com", "tokopedia.link"],
  tiktokshop: ["tiktok.com"],
};

/** Host link pendek yang wajib diikuti redirect-nya sebelum diterima. */
const SHORT_HOSTS = ["shp.ee", "s.shopee.co.id", "tokopedia.link", "vt.tiktok.com", "vm.tiktok.com"];

/** Nama kolom Prisma per platform. */
export const OLSHOP_FIELDS: Record<OlshopPlatform, { mode: string; url: string; store: string }> = {
  shopee: { mode: "shopeeMode", url: "shopeeUrl", store: "shopeeStoreUrl" },
  tokopedia: { mode: "tokopediaMode", url: "tokopediaUrl", store: "tokopediaStoreUrl" },
  tiktokshop: { mode: "tiktokshopMode", url: "tiktokshopUrl", store: "tiktokshopStoreUrl" },
};

const MAX_URL_LENGTH = 500;
const MAX_REDIRECTS = 5;

function invalid(platform: OlshopPlatform, reason: string): HttpError {
  return new HttpError(400, `Link ${OLSHOP_LABEL[platform]} tidak valid: ${reason}`, "INVALID_OLSHOP_URL");
}

function hostMatches(host: string, roots: string[]): boolean {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function isShortHost(host: string): boolean {
  return SHORT_HOSTS.some((h) => host === h);
}

/** Cek bentuk URL (sinkron). Mengembalikan URL ter-parse atau melempar HttpError. */
function checkUrlShape(platform: OlshopPlatform, raw: unknown): URL {
  if (typeof raw !== "string") throw invalid(platform, "harus berupa teks");
  const value = raw.trim();
  if (!value) throw invalid(platform, "tidak boleh kosong");
  if (value.length > MAX_URL_LENGTH) throw invalid(platform, `maksimal ${MAX_URL_LENGTH} karakter`);
  if (/[\s\u0000-\u001f\u007f]/.test(value)) throw invalid(platform, "tidak boleh mengandung spasi atau karakter kontrol");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid(platform, "format URL salah");
  }
  if (url.protocol !== "https:") throw invalid(platform, "harus diawali https://");
  if (url.username || url.password) throw invalid(platform, "tidak boleh mengandung nama pengguna/kata sandi");
  if (url.port) throw invalid(platform, "tidak boleh memakai port khusus");

  const host = url.hostname.toLowerCase();
  if (net.isIP(host) || host.startsWith("[")) throw invalid(platform, "tidak boleh berupa alamat IP");
  if (host.includes("xn--")) throw invalid(platform, "domain tidak dikenali");
  if (!hostMatches(host, ALLOWED_ROOTS[platform])) {
    throw invalid(platform, `domain harus milik ${OLSHOP_LABEL[platform]} (${ALLOWED_ROOTS[platform].join(", ")})`);
  }
  return url;
}

/** Versi sinkron untuk pemeriksaan ulang saat menyusun respons (data lama/legacy). */
export function isAllowedOlshopUrl(platform: OlshopPlatform, raw: unknown): boolean {
  try {
    checkUrlShape(platform, raw);
    return true;
  } catch {
    return false;
  }
}

function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (net.isIPv4(mapped)) {
    const [a, b] = mapped.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return true;
}

async function assertPublicHost(platform: OlshopPlatform, host: string): Promise<void> {
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0 || records.some((r) => isPrivateAddress(r.address))) {
      throw invalid(platform, "link pendek mengarah ke alamat yang tidak diizinkan");
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw invalid(platform, "link pendek tidak dapat diverifikasi, gunakan link lengkap dari halaman produk");
  }
}

/**
 * Validasi penuh satu URL olshop. Mengembalikan URL yang aman disimpan.
 * Link pendek diganti dengan URL tujuan akhirnya (jika masih muat), supaya
 * tujuan link tidak bisa diam-diam dialihkan di kemudian hari.
 */
export async function validateOlshopUrl(platform: OlshopPlatform, raw: unknown): Promise<string> {
  let current: string = typeof raw === "string" ? raw : "";
  let url = checkUrlShape(platform, raw);
  const original = url.toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isShortHost(url.hostname.toLowerCase())) {
      const finalUrl = url.toString();
      return finalUrl.length <= MAX_URL_LENGTH ? finalUrl : original;
    }
    await assertPublicHost(platform, url.hostname);
    let location: string | null = null;
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; SDKM-LinkCheck/1.0)" },
      });
      res.body?.cancel().catch(() => undefined);
      if (res.status >= 300 && res.status < 400) location = res.headers.get("location");
    } catch {
      throw invalid(platform, "link pendek tidak dapat diverifikasi, gunakan link lengkap dari halaman produk");
    }
    if (!location) {
      throw invalid(platform, "link pendek tidak mengarah ke halaman marketplace, gunakan link lengkap");
    }
    try {
      current = new URL(location, url).toString();
    } catch {
      throw invalid(platform, "tujuan link pendek tidak valid");
    }
    url = checkUrlShape(platform, current);
  }
  throw invalid(platform, "terlalu banyak pengalihan");
}

/* ------------------------------------------------------------------ */
/* URL toko (AppSettings) dengan cache pendek                          */
/* ------------------------------------------------------------------ */

let storeCache: { at: number; value: StoreOlshopUrls } | null = null;
const STORE_CACHE_MS = 30_000;

export function clearStoreOlshopCache(): void {
  storeCache = null;
}

export async function getStoreOlshopUrls(): Promise<StoreOlshopUrls> {
  if (storeCache && Date.now() - storeCache.at < STORE_CACHE_MS) return storeCache.value;
  const settings: any = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const value: StoreOlshopUrls = {
    shopee: settings?.shopeeStoreUrl ?? null,
    tokopedia: settings?.tokopediaStoreUrl ?? null,
    tiktokshop: settings?.tiktokshopStoreUrl ?? null,
  };
  storeCache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */
/* Input (create/update produk) dan output (respons)                   */
/* ------------------------------------------------------------------ */

/**
 * Baca body request menjadi data Prisma. Bentuk input:
 *   olshop: { shopee: { mode: "khusus", url: "https://..." }, tokopedia: { mode: "toko" }, tiktokshop: { mode: "tidak" } }
 * Platform yang tidak dikirim tidak diubah. Kompatibilitas lama: `shopeeUrl`
 * (string = khusus, null/"" = tidak) dipakai bila `olshop.shopee` tidak ada.
 */
export async function buildOlshopData(body: any, store: StoreOlshopUrls): Promise<Record<string, any>> {
  const data: Record<string, any> = {};
  const input = body?.olshop;
  if (input !== undefined && input !== null && (typeof input !== "object" || Array.isArray(input))) {
    throw new HttpError(400, "olshop harus berupa objek", "INVALID_OLSHOP_URL");
  }

  for (const platform of OLSHOP_PLATFORMS) {
    let cfg: any = input?.[platform];
    if (cfg === undefined && platform === "shopee" && body?.shopeeUrl !== undefined) {
      cfg = body.shopeeUrl === null || body.shopeeUrl === "" ? { mode: "tidak" } : { mode: "khusus", url: body.shopeeUrl };
    }
    if (cfg === undefined) continue;
    if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
      throw new HttpError(400, `olshop.${platform} harus berupa objek`, "INVALID_OLSHOP_URL");
    }
    if (!OLSHOP_MODES.includes(cfg.mode)) {
      throw new HttpError(400, `olshop.${platform}.mode harus salah satu dari: ${OLSHOP_MODES.join(", ")}`, "INVALID_OLSHOP_URL");
    }
    const fields = OLSHOP_FIELDS[platform];
    data[fields.mode] = cfg.mode;
    if (cfg.mode === "khusus") {
      data[fields.url] = await validateOlshopUrl(platform, cfg.url);
    } else {
      if (cfg.mode === "toko" && !store[platform]) {
        throw new HttpError(
          400,
          `Admin belum mengisi link toko ${OLSHOP_LABEL[platform]} di Pengaturan, jadi opsi "pakai link toko" belum bisa dipilih`,
          "OLSHOP_STORE_URL_MISSING",
        );
      }
      data[fields.url] = null;
    }
  }
  return data;
}

export type OlshopLink = { platform: OlshopPlatform; label: string; url: string; isStoreFallback: boolean };

/** Tambahkan `olshop` (mentah, untuk form edit) dan `olshopLinks` (siap tampil) ke objek produk. */
export function presentOlshop(product: any, store?: StoreOlshopUrls): { olshop: Record<string, { mode: OlshopMode; url: string | null }>; olshopLinks: OlshopLink[] } {
  const olshop: Record<string, { mode: OlshopMode; url: string | null }> = {};
  const links: OlshopLink[] = [];
  for (const platform of OLSHOP_PLATFORMS) {
    const fields = OLSHOP_FIELDS[platform];
    const mode: OlshopMode = (product?.[fields.mode] as OlshopMode) ?? "tidak";
    const url: string | null = product?.[fields.url] ?? null;
    olshop[platform] = { mode, url };
    if (mode === "khusus" && url && isAllowedOlshopUrl(platform, url)) {
      links.push({ platform, label: OLSHOP_LABEL[platform], url, isStoreFallback: false });
    } else if (mode === "toko" && store?.[platform] && isAllowedOlshopUrl(platform, store[platform])) {
      links.push({ platform, label: OLSHOP_LABEL[platform], url: store[platform] as string, isStoreFallback: true });
    }
  }
  return { olshop, olshopLinks: links };
}
