import type { PrismaClient } from "@prisma/client";
import prisma from "./prisma";

export const OFFICIAL_STORE_NAME = "Sesuatu DariKota Malang";

const OFFICIAL_STORE_BIO =
  "Toko oleh-oleh artisan dan creative market di Kayutangan Heritage, Malang. " +
  "Produk lini toko sendiri dijual atas nama Official Store.";

// Cukup butuh delegate `artisan`, jadi bisa dipakai dengan PrismaClient biasa maupun client transaksi.
type ArtisanClient = Pick<PrismaClient, "artisan">;

// Mengembalikan baris Official Store, atau null bila belum dibuat.
export async function getOfficialArtisan(client: ArtisanClient = prisma) {
  return client.artisan.findFirst({
    where: { isOfficial: true },
    orderBy: { createdAt: "asc" }, // deterministik bila (tidak seharusnya) ada lebih dari satu
  });
}

// Idempoten: membuat Official Store hanya bila belum ada. Tidak menyentuh data lain.
export async function ensureOfficialStore(client: ArtisanClient = prisma) {
  const existing = await getOfficialArtisan(client);
  if (existing) return { artisan: existing, created: false };

  const artisan = await client.artisan.create({
    data: {
      brandName: OFFICIAL_STORE_NAME,
      bio: OFFICIAL_STORE_BIO,
      status: "aktif",
      isOfficial: true,
      userId: null,
    },
  });
  return { artisan, created: true };
}