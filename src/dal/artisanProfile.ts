import prisma from "../lib/prisma";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { AuthUser } from "./types";
import { isAllowedAvatarUrl } from "../lib/avatar";
import { isHttpsUrl, isString } from "../lib/validate";
import { normalizeBrandName, normalizeBrandKey, BRAND_KEY_MIN } from "../lib/brandKey";

export function getMyApplications(user: AuthUser) {
  return prisma.artisanApplication.findMany({ where: { userId: user.id }, orderBy: { submittedAt: "desc" }, include: { category: true } });
}

export async function getMyArtisanProfile(user: AuthUser) {
  const artisan = await prisma.artisan.findUnique({
    where: { userId: user.id },
    include: {
      products: { include: { category: true, variants: true, story: true } },
      user: { select: { avatarUrl: true } },
    },
  });
  if (!artisan) throw notFound("Profil kreator tidak ditemukan");
  const reviews = await prisma.review.findMany({ where: { status: "tampil", product: { artisanId: artisan.id } }, select: { rating: true } });
  const avgRating = reviews.length > 0 ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)) : 0;
  return { ...artisan, productCount: artisan.products.length, avgRating };
}

// ---------------------------------------------------------------------------
// Helper: cek keunikan brandKey untuk update (kecualikan toko sendiri)
// ---------------------------------------------------------------------------
async function assertBrandKeyUnique(newKey: string, excludeArtisanId: string) {
  // Cek artisan lain yang sudah punya brandKey ini
  const existing = await prisma.artisan.findFirst({
    where: { brandKey: newKey, id: { not: excludeArtisanId } },
    select: { id: true },
  });
  if (existing) {
    throw conflict("Nama brand sudah dipakai kreator lain atau sedang diajukan. Gunakan nama lain.", "BRAND_NAME_TAKEN");
  }
  // Cek pengajuan pending milik user lain dengan brandKey yang sama
  const pendingApps = await prisma.artisanApplication.findMany({
    where: { status: "pending" },
    select: { brandName: true, userId: true },
  });
  const artisan = await prisma.artisan.findUnique({ where: { id: excludeArtisanId }, select: { userId: true } });
  const myUserId = artisan?.userId;
  for (const app of pendingApps) {
    if (myUserId && app.userId === myUserId) continue; // pengajuan sendiri, lewati
    if (normalizeBrandKey(app.brandName) === newKey) {
      throw conflict("Nama brand sudah dipakai kreator lain atau sedang diajukan. Gunakan nama lain.", "BRAND_NAME_TAKEN");
    }
  }
}

export async function updateMyArtisanProfile(user: AuthUser, input: { brandName?: unknown; bio?: unknown; avatarUrl?: unknown }) {
  // Urutan wajib: profil ada → status aktif → validasi field (agar test_dal_isolation.ts tetap lulus)
  const artisan = await prisma.artisan.findUnique({
    where: { userId: user.id },
    select: { id: true, brandKey: true, brandName: true, avatarUrl: true, status: true, userId: true },
  });
  if (!artisan) throw notFound("Profil kreator tidak ditemukan");
  if (artisan.status !== "aktif") throw forbidden("Akun kreator nonaktif");

  const { brandName, bio, avatarUrl } = input;

  // ── brandName (2.1 dan 2.2) ──────────────────────────────────────────────
  let finalBrandName: string | undefined;
  let finalBrandKey: string | undefined;
  if (brandName !== undefined) {
    let rawName: string;
    if (brandName === null || (typeof brandName === "string" && !brandName.trim())) {
      // 2.2: kosong/null → kembalikan ke nama akun saat ini
      const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
      rawName = userRecord?.name ?? "";
    } else {
      if (!isString(brandName, { max: 191 })) {
        throw badRequest("brandName harus berupa string maksimal 191 karakter");
      }
      rawName = brandName as string;
    }
    finalBrandName = normalizeBrandName(rawName);
    finalBrandKey = normalizeBrandKey(finalBrandName);
    if (finalBrandKey.length < BRAND_KEY_MIN) {
      throw badRequest("Nama brand harus mengandung minimal 2 huruf atau angka", "BRAND_NAME_INVALID");
    }
    if (finalBrandKey.length > 191) {
      throw badRequest("Nama brand terlalu panjang", "BRAND_NAME_INVALID");
    }
    // Jika kunci sama persis dengan yang sudah tersimpan → cukup perbarui teks, skip cek bentrok
    if (finalBrandKey !== artisan.brandKey) {
      await assertBrandKeyUnique(finalBrandKey, artisan.id);
    }
  }

  // ── bio (2.4) ─────────────────────────────────────────────────────────────
  let finalBio: string | null | undefined;
  if (bio !== undefined) {
    if (bio === null || (typeof bio === "string" && !bio.trim())) {
      finalBio = null;
    } else if (isString(bio, { max: 2000 })) {
      finalBio = (bio as string).trim();
    } else {
      throw badRequest("bio harus berupa string maksimal 2000 karakter");
    }
  }

  // ── avatarUrl ─────────────────────────────────────────────────────────────
  if (avatarUrl !== undefined && avatarUrl !== null && (typeof avatarUrl !== "string" || avatarUrl.length > 191 || !isAllowedAvatarUrl(avatarUrl))) {
    throw badRequest("avatarUrl harus merupakan URL hasil upload");
  }

  const oldAvatarUrl = avatarUrl !== undefined ? artisan.avatarUrl : undefined;

  let updated;
  try {
    updated = await prisma.artisan.update({
      where: { id: artisan.id },
      data: {
        ...(finalBrandName !== undefined ? { brandName: finalBrandName, brandKey: finalBrandKey } : {}),
        ...(finalBio !== undefined ? { bio: finalBio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl as string | null } : {}),
      },
      include: { user: { select: { avatarUrl: true } } },
    });
  } catch (err: any) {
    // Tangkap balapan unique constraint (P2002)
    if (err?.code === "P2002" && err?.meta?.target?.includes("brandKey")) {
      throw conflict("Nama brand sudah dipakai kreator lain atau sedang diajukan. Gunakan nama lain.", "BRAND_NAME_TAKEN");
    }
    throw err;
  }

  // R3: hapus file lama bila URL-nya berubah (di luar transaksi, best effort)
  if (oldAvatarUrl !== undefined) {
    const { releaseUrls, removedUrls } = await import("../lib/uploadedFiles");
    const toRelease = removedUrls(oldAvatarUrl, updated.avatarUrl);
    if (toRelease.length > 0) releaseUrls(toRelease).catch(() => {});
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Helper: cek keunikan brandKey untuk pengajuan baru
// ---------------------------------------------------------------------------
async function assertBrandKeyUniqueForApply(newKey: string, applicantUserId: string) {
  // Cek artisan yang sudah ada (termasuk Official Store)
  const existingArtisan = await prisma.artisan.findFirst({
    where: { brandKey: newKey },
    select: { id: true },
  });
  if (existingArtisan) {
    throw conflict("Nama brand sudah dipakai kreator lain atau sedang diajukan. Gunakan nama lain.", "BRAND_NAME_TAKEN");
  }
  // Cek pengajuan pending milik user lain
  const pendingApps = await prisma.artisanApplication.findMany({
    where: { status: "pending", userId: { not: applicantUserId } },
    select: { brandName: true },
  });
  for (const app of pendingApps) {
    if (normalizeBrandKey(app.brandName) === newKey) {
      throw conflict("Nama brand sudah dipakai kreator lain atau sedang diajukan. Gunakan nama lain.", "BRAND_NAME_TAKEN");
    }
  }
}

export async function createApplicationForUser(user: AuthUser, input: {
  applicantName: unknown;
  contact: unknown;
  brandName?: unknown;
  categoryId?: string;
  description: unknown;
  sampleFileUrl?: unknown;
  samplePhotos?: unknown;
}) {
  // Urutan cek yang sudah ada tidak berubah: role → pending sendiri → samplePhotos → baru nama brand
  if (user.role !== "buyer") throw forbidden("Hanya pengguna dengan role buyer yang dapat mengajukan konsinyasi");
  if (!isString(input.applicantName, { max: 191 }) || !isString(input.contact, { max: 191 }) || !isString(input.description, { max: 5000 })) {
    throw badRequest("Data pengajuan konsinyasi tidak valid");
  }
  if (input.categoryId !== undefined && (typeof input.categoryId !== "string" || !(await prisma.category.findUnique({ where: { id: input.categoryId } })))) {
    throw notFound("Kategori tidak ditemukan");
  }
  if (input.samplePhotos !== undefined && (!Array.isArray(input.samplePhotos) || input.samplePhotos.length > 10 || input.samplePhotos.some((photo) => !isHttpsUrl(photo)))) {
    throw badRequest("samplePhotos harus berupa maksimal 10 URL HTTPS");
  }
  if (input.sampleFileUrl !== undefined && input.sampleFileUrl !== null && !isHttpsUrl(input.sampleFileUrl)) {
    throw badRequest("sampleFileUrl harus berupa URL HTTPS");
  }
  const existingPending = await prisma.artisanApplication.findFirst({ where: { userId: user.id, status: "pending" } });
  if (existingPending) throw badRequest("Kamu masih memiliki pengajuan konsinyasi yang sedang diproses (pending)");

  // ── brandName: opsional → default ke users.name ───────────────────────────
  let rawBrandName: string;
  if (input.brandName === undefined || input.brandName === null || (typeof input.brandName === "string" && !input.brandName.trim())) {
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    rawBrandName = userRecord?.name ?? "";
  } else {
    if (!isString(input.brandName, { max: 191 })) {
      throw badRequest("brandName harus berupa string maksimal 191 karakter");
    }
    rawBrandName = input.brandName as string;
  }
  const finalBrandName = normalizeBrandName(rawBrandName);
  const finalBrandKey = normalizeBrandKey(finalBrandName);
  if (finalBrandKey.length < BRAND_KEY_MIN) {
    throw badRequest("Nama brand harus mengandung minimal 2 huruf atau angka", "BRAND_NAME_INVALID");
  }
  if (finalBrandKey.length > 191) {
    throw badRequest("Nama brand terlalu panjang", "BRAND_NAME_INVALID");
  }
  await assertBrandKeyUniqueForApply(finalBrandKey, user.id);

  return prisma.artisanApplication.create({
    data: {
      userId: user.id,
      applicantName: input.applicantName as string,
      contact: input.contact as string,
      brandName: finalBrandName,
      categoryId: input.categoryId,
      description: input.description as string,
      sampleFileUrl: Array.isArray(input.samplePhotos) ? (input.samplePhotos[0] as string | undefined) || (input.sampleFileUrl as string | undefined) : input.sampleFileUrl as string | undefined,
      samplePhotos: input.samplePhotos as string[] | undefined,
      status: "pending",
    },
  });
}
