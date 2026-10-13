/**
 * Pengaman database untuk semua tes.
 *
 * Panggil di BARIS PERTAMA setiap tes yang menyentuh database:
 *   require("./helpers/requireTestDb")();
 *
 * Perilaku:
 * - Memakai TEST_DATABASE_URL, lalu DATABASE_URL, lalu bawaan lokal (sesuatu_darikota_malang_test).
 * - Mengurai NAMA database dari URL. Bila nama TIDAK berakhiran "_test", proses langsung keluar
 *   (exit 1) dan tidak ada query yang dijalankan. Ini melindungi database utama bila DATABASE_URL
 *   di shell atau .env menunjuk ke database asli.
 * - Bila lolos, mengatur process.env.DATABASE_URL ke URL tersebut agar Prisma memakainya.
 */
function requireTestDb() {
  const url =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "mysql://root:@localhost:3306/sesuatu_darikota_malang_test";

  let dbName = "";
  try {
    dbName = new URL(url).pathname.replace(/^\//, "");
  } catch (e) {
    dbName = "";
  }

  if (!/_test$/.test(dbName)) {
    console.error(
      `[FATAL] Nama database "${dbName || "(tidak terbaca)"}" tidak berakhiran "_test". ` +
        "Tes ditolak untuk melindungi database utama.\n" +
        "Atur TEST_DATABASE_URL, mis.: mysql://root:@localhost:3306/sesuatu_darikota_malang_test"
    );
    process.exit(1);
  }

  process.env.DATABASE_URL = url;
  return dbName;
}

module.exports = requireTestDb;
