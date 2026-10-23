// Seed khusus Official Store. Aman dijalankan di database utama:
// idempoten, tidak butuh variabel SEED_*, dan tidak menyentuh data lain.
import { PrismaClient } from "@prisma/client";
import { ensureOfficialStore } from "../src/lib/officialStore";

const prisma = new PrismaClient();

async function main() {
  const { artisan, created } = await ensureOfficialStore(prisma);
  if (created) {
    console.log(`Official Store dibuat: "${artisan.brandName}" (id: ${artisan.id})`);
  } else {
    console.log(`Official Store sudah ada: "${artisan.brandName}" (id: ${artisan.id}). Tidak ada perubahan.`);
  }
}

main()
  .catch((err) => {
    console.error("Gagal menjalankan seed Official Store:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });