/**
 * lib/uploadedFiles.ts
 * Pustaka inti penghapusan aman file Cloudinary.
 * Semua kolom foto yang ada di schema harus dicatat di collectReferencedUrls().
 */
import prisma from "./prisma";
import { deleteFromCloudinary } from "./cloudinary";

// ---------------------------------------------------------------------------
// Kumpulkan semua URL foto yang masih direferensikan record mana pun (R2)
// ---------------------------------------------------------------------------

export async function collectReferencedUrls(): Promise<Set<string>> {
  const set = new Set<string>();

  const addUrl = (v: unknown) => {
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  };
  const addUrls = (v: unknown) => {
    if (Array.isArray(v)) v.forEach((u) => addUrl(u));
  };
  const addImageVariants = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach((item: any) => { if (item?.url) addUrl(item.url); });
    }
  };

  // users.avatarUrl
  const users = await prisma.user.findMany({ select: { avatarUrl: true } });
  users.forEach((u) => addUrl(u.avatarUrl));

  // artisans.avatarUrl
  const artisans = await prisma.artisan.findMany({ select: { avatarUrl: true } });
  artisans.forEach((a) => addUrl(a.avatarUrl));

  // products.images (Json array) + products.imageVariants (Json array of {url})
  const products = await prisma.product.findMany({ select: { images: true, imageVariants: true } });
  products.forEach((p) => {
    addUrls(p.images);
    addImageVariants(p.imageVariants);
  });

  // product_stories.coverImageUrl + processImages (Json array)
  const stories = await prisma.productStory.findMany({ select: { coverImageUrl: true, processImages: true } });
  stories.forEach((s) => {
    addUrl(s.coverImageUrl);
    addUrls(s.processImages);
  });

  // artisan_applications.sampleFileUrl + samplePhotos (Json array)
  const applications = await prisma.artisanApplication.findMany({ select: { sampleFileUrl: true, samplePhotos: true } });
  applications.forEach((a) => {
    addUrl(a.sampleFileUrl);
    addUrls(a.samplePhotos);
  });

  return set;
}

// ---------------------------------------------------------------------------
// Hitung URL yang hilang antara nilai lama dan baru
// (menerima string, null, atau array)
// ---------------------------------------------------------------------------

export function removedUrls(before: unknown, after: unknown): string[] {
  const toSet = (v: unknown): Set<string> => {
    const s = new Set<string>();
    if (typeof v === "string" && v.trim()) s.add(v.trim());
    if (Array.isArray(v)) v.forEach((u: unknown) => { if (typeof u === "string" && u.trim()) s.add(u.trim()); });
    return s;
  };
  const beforeSet = toSet(before);
  const afterSet = toSet(after);
  return [...beforeSet].filter((url) => !afterSet.has(url));
}

// ---------------------------------------------------------------------------
// Hapus file secara aman (R1–R3): tidak pernah melempar error
// ---------------------------------------------------------------------------

export async function releaseUrls(
  urls: string[]
): Promise<{ deleted: number; kept: number; failed: number }> {
  if (urls.length === 0) return { deleted: 0, kept: 0, failed: 0 };

  let deleted = 0;
  let kept = 0;
  let failed = 0;

  // Satu kali query referensi global untuk semua URL sekaligus
  const referenced = await collectReferencedUrls().catch(() => null);
  if (!referenced) {
    // Gagal kumpulkan referensi → amankan semua (kept semuanya)
    return { deleted: 0, kept: urls.length, failed: 0 };
  }

  for (const url of urls) {
    const trimmed = url.trim();

    // R1: hanya file yang tercatat di uploaded_files
    const row = await prisma.uploadedFile.findFirst({ where: { url: trimmed } }).catch(() => null);
    if (!row) { kept++; continue; }

    // R2: jangan hapus bila masih direferensikan record lain
    if (referenced.has(trimmed)) { kept++; continue; }

    // Hapus dari Cloudinary lalu dari DB
    try {
      await deleteFromCloudinary(row.publicId, row.resourceType);
    } catch (err) {
      console.error(`[releaseUrls] Cloudinary gagal menghapus ${row.publicId}:`, err);
      failed++;
      continue; // biarkan baris agar job bisa coba lagi (R3)
    }
    try {
      await prisma.uploadedFile.delete({ where: { id: row.id } });
      deleted++;
    } catch (err) {
      console.error(`[releaseUrls] Gagal hapus baris uploaded_files ${row.id}:`, err);
      failed++;
    }
  }

  return { deleted, kept, failed };
}

// ---------------------------------------------------------------------------
// Sapu file yatim (belum terpasang lebih dari graceHours) — R5
// ---------------------------------------------------------------------------

export async function purgeOrphanUploads(
  graceHours: number
): Promise<{ deleted: number; kept: number; failed: number }> {
  const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000);
  const rows = await prisma.uploadedFile.findMany({ where: { createdAt: { lt: cutoff } } });
  if (rows.length === 0) return { deleted: 0, kept: 0, failed: 0 };

  const referenced = await collectReferencedUrls().catch(() => null);
  if (!referenced) return { deleted: 0, kept: rows.length, failed: 0 };

  let deleted = 0;
  let kept = 0;
  let failed = 0;

  for (const row of rows) {
    if (referenced.has(row.url.trim())) { kept++; continue; }

    try {
      await deleteFromCloudinary(row.publicId, row.resourceType);
    } catch (err) {
      console.error(`[purgeOrphanUploads] Cloudinary gagal ${row.publicId}:`, err);
      failed++;
      continue;
    }
    try {
      await prisma.uploadedFile.delete({ where: { id: row.id } });
      deleted++;
    } catch (err) {
      console.error(`[purgeOrphanUploads] Gagal hapus baris ${row.id}:`, err);
      failed++;
    }
  }

  return { deleted, kept, failed };
}
