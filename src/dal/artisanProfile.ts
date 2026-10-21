import prisma from "../lib/prisma";
import { badRequest, forbidden, notFound } from "./errors";
import { AuthUser } from "./types";
import { isAllowedAvatarUrl } from "../lib/avatar";
import { isHttpsUrl, isString } from "../lib/validate";

export function getMyApplications(user: AuthUser) {
  return prisma.artisanApplication.findMany({ where: { userId: user.id }, orderBy: { submittedAt: "desc" }, include: { category: true } });
}

export async function getMyArtisanProfile(user: AuthUser) {
  const artisan = await prisma.artisan.findUnique({
    where: { userId: user.id },
    include: { products: { include: { category: true, variants: true, story: true } } },
  });
  if (!artisan) throw notFound("Profil kreator tidak ditemukan");
  const reviews = await prisma.review.findMany({ where: { status: "tampil", product: { artisanId: artisan.id } }, select: { rating: true } });
  const avgRating = reviews.length > 0 ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)) : 0;
  return { ...artisan, productCount: artisan.products.length, avgRating };
}

export async function updateMyArtisanProfile(user: AuthUser, input: { brandName?: unknown; bio?: unknown; avatarUrl?: unknown }) {
  const artisan = await prisma.artisan.findUnique({ where: { userId: user.id } });
  if (!artisan) throw notFound("Profil kreator tidak ditemukan");
  if (artisan.status !== "aktif") throw forbidden("Akun kreator nonaktif");
  const { brandName, bio, avatarUrl } = input;
  if (brandName !== undefined && !isString(brandName, { min: 2, max: 191 })) {
    throw badRequest("brandName harus berupa string 2 sampai 191 karakter");
  }
  if (bio !== undefined && !isString(bio, { max: 2000 })) {
    throw badRequest("bio harus berupa string maksimal 2000 karakter");
  }
  // 1d: avatarUrl nullable di schema — null menghapus nilai, string divalidasi, undefined tidak mengubah
  if (avatarUrl !== undefined && avatarUrl !== null && (typeof avatarUrl !== "string" || avatarUrl.length > 191 || !isAllowedAvatarUrl(avatarUrl))) {
    throw badRequest("avatarUrl harus merupakan URL hasil upload");
  }
  return prisma.artisan.update({
    where: { id: artisan.id },
    data: {
      ...(brandName !== undefined ? { brandName: brandName as string } : {}),
      ...(bio !== undefined ? { bio: bio as string } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl as string } : {}),
    },
  });
}

export async function createApplicationForUser(user: AuthUser, input: {
  applicantName: unknown;
  contact: unknown;
  brandName: unknown;
  categoryId?: string;
  description: unknown;
  sampleFileUrl?: unknown;
  samplePhotos?: unknown;
}) {
  if (user.role !== "buyer") throw forbidden("Hanya pengguna dengan role buyer yang dapat mengajukan konsinyasi");
  if (!isString(input.applicantName, { max: 191 }) || !isString(input.contact, { max: 191 }) || !isString(input.brandName, { max: 191 }) || !isString(input.description, { max: 5000 })) {
    throw badRequest("Data pengajuan konsinyasi tidak valid");
  }
  if (input.categoryId !== undefined && (typeof input.categoryId !== "string" || !(await prisma.category.findUnique({ where: { id: input.categoryId } }))) ) {
    throw notFound("Kategori tidak ditemukan");
  }
  if (input.samplePhotos !== undefined && (!Array.isArray(input.samplePhotos) || input.samplePhotos.length > 5 || input.samplePhotos.some((photo) => !isHttpsUrl(photo)))) {
    throw badRequest("samplePhotos harus berupa maksimal 5 URL HTTPS");
  }
  if (input.sampleFileUrl !== undefined && input.sampleFileUrl !== null && !isHttpsUrl(input.sampleFileUrl)) {
    throw badRequest("sampleFileUrl harus berupa URL HTTPS");
  }
  const existingPending = await prisma.artisanApplication.findFirst({ where: { userId: user.id, status: "pending" } });
  if (existingPending) throw badRequest("Kamu masih memiliki pengajuan konsinyasi yang sedang diproses (pending)");
  return prisma.artisanApplication.create({
    data: {
      userId: user.id,
      applicantName: input.applicantName,
      contact: input.contact,
      brandName: input.brandName,
      categoryId: input.categoryId,
      description: input.description,
      sampleFileUrl: Array.isArray(input.samplePhotos) ? (input.samplePhotos[0] as string | undefined) || (input.sampleFileUrl as string | undefined) : input.sampleFileUrl as string | undefined,
      samplePhotos: input.samplePhotos as string[] | undefined,
      status: "pending",
    },
  });
}
