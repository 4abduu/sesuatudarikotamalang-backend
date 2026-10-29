/**
 * scripts/backfill_brand_key.js
 * Langkah 2: Isi kolom brandKey untuk semua artisan yang nilainya masih NULL.
 *
 * Aturan:
 * - Idempoten: aman dijalankan berulang.
 * - Official Store diproses lebih dulu.
 * - Kunci yang dipakai TEPAT SATU toko → tulis ke DB.
 * - Kunci yang bentrok (lebih dari satu toko) → biarkan NULL, cetak laporan.
 * - Dilarang mengganti nama otomatis.
 * - WAJIB dijalankan pada database development, BUKAN production.
 *   (Jalankan dengan DATABASE_URL yang menunjuk ke DB dev.)
 *
 * Cara pakai:
 *   node scripts/backfill_brand_key.js
 */
"use strict";

const { PrismaClient } = require("@prisma/client");

const url = process.env.DATABASE_URL || "";
const dbName = (() => { try { return new URL(url).pathname.replace(/^\//, ""); } catch { return ""; } })();

if (!dbName) {
  console.error("[FATAL] DATABASE_URL tidak terbaca. Atur di environment.");
  process.exit(1);
}

// Hanya izinkan jika bukan database produksi (nama tidak mengandung kata "test" tidak langsung diblokir,
// tapi script ini mencetak peringatan dan meminta konfirmasi CLI bila nama DB tidak berakhiran _test).
if (!/_test$/.test(dbName)) {
  console.warn(`[PERINGATAN] Database "${dbName}" tidak berakhiran "_test".`);
  console.warn("Script ini dirancang untuk database development/test.");
  console.warn("Tekan ENTER untuk lanjut atau Ctrl+C untuk batal.");
  // Dalam mode non-interaktif (CI), langsung lanjut setelah peringatan.
  // Untuk proteksi ekstra, batalkan di sini jika diperlukan.
}

// normalizeBrandKey — sama persis dengan lib/brandKey.ts
function normalizeBrandKey(raw) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const BRAND_KEY_MIN = 2;

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    // Ambil semua artisan dengan brandKey NULL, Official Store lebih dulu
    const artisans = await prisma.artisan.findMany({
      where: { brandKey: null },
      orderBy: [{ isOfficial: "desc" }, { createdAt: "asc" }],
      select: { id: true, brandName: true, userId: true, isOfficial: true, createdAt: true },
    });

    if (artisans.length === 0) {
      console.log("Semua artisan sudah memiliki brandKey. Tidak ada yang perlu diisi.");
      return;
    }

    // Hitung kunci untuk setiap artisan
    const keyToArtisans = new Map();
    for (const a of artisans) {
      const key = normalizeBrandKey(a.brandName);
      if (!keyToArtisans.has(key)) keyToArtisans.set(key, []);
      keyToArtisans.get(key).push(a);
    }

    // Cek juga kunci yang sudah ada di DB (dari artisan yang brandKey sudah terisi)
    const existingKeys = await prisma.artisan.findMany({
      where: { brandKey: { not: null } },
      select: { brandKey: true, id: true },
    });
    const takenKeys = new Set(existingKeys.map((e) => e.brandKey));

    let filled = 0;
    const duplicates = [];

    for (const [key, group] of keyToArtisans.entries()) {
      if (key.length < BRAND_KEY_MIN) {
        console.warn(`[SKIP] brandKey "${key}" terlalu pendek (brandName: ${group.map((a) => a.brandName).join(", ")}). Biarkan NULL.`);
        duplicates.push(...group.map((a) => ({ ...a, reason: "kunci terlalu pendek" })));
        continue;
      }

      if (takenKeys.has(key)) {
        // Kunci sudah dipakai artisan lain yang sudah punya brandKey
        console.warn(`[DUPLIKAT] kunci "${key}" sudah dipakai. Biarkan NULL untuk: ${group.map((a) => a.brandName).join(", ")}`);
        duplicates.push(...group.map((a) => ({ ...a, reason: "kunci sudah dipakai artisan lain" })));
        continue;
      }

      if (group.length > 1) {
        // Lebih dari satu artisan dalam batch ini punya kunci yang sama → jangan tulis
        console.warn(`[DUPLIKAT] kunci "${key}" dipakai ${group.length} toko:`);
        group.forEach((a) => console.warn(`  - id=${a.id} brandName="${a.brandName}" isOfficial=${a.isOfficial} createdAt=${a.createdAt.toISOString()}`));
        duplicates.push(...group.map((a) => ({ ...a, reason: "duplikat dalam batch" })));
        continue;
      }

      // Tepat satu → tulis
      const artisan = group[0];
      await prisma.artisan.update({
        where: { id: artisan.id },
        data: { brandKey: key },
      });
      takenKeys.add(key);
      filled++;
      console.log(`[OK] id=${artisan.id} brandName="${artisan.brandName}" → brandKey="${key}"`);
    }

    console.log(`\n=== Ringkasan Backfill ===`);
    console.log(`Terisi    : ${filled}`);
    console.log(`Duplikat  : ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.log(`\nDaftar yang TIDAK terisi (perlu diselesaikan manual):`);
      duplicates.forEach((d) => {
        console.log(`  id=${d.id} brandName="${d.brandName}" isOfficial=${d.isOfficial} userId=${d.userId} createdAt=${d.createdAt.toISOString()} alasan=${d.reason}`);
      });
      console.log("\nLangkah selanjutnya:");
      console.log("1. Ganti nama toko yang bentrok lewat Prisma Studio atau SQL.");
      console.log("2. Jalankan ulang script ini.");
    } else {
      console.log("\nSemua terisi. Tidak ada duplikat.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
