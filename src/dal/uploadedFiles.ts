/**
 * dal/uploadedFiles.ts
 * Akses data upload milik user — mengikuti pola DAL proyek (R8).
 */
import prisma from "../lib/prisma";
import { collectReferencedUrls, releaseUrls } from "../lib/uploadedFiles";
import { notFound } from "./errors";
import { HttpError } from "../lib/httpError";

type UserPayload = { id: string; role: string };

// ---------------------------------------------------------------------------
// GET /api/upload/mine — daftar unggahan milik user (maks 100 terbaru)
// ---------------------------------------------------------------------------

export async function listMyUploads(user: UserPayload) {
  const rows = await prisma.uploadedFile.findMany({
    where: user.role === "admin" ? {} : { uploadedById: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, url: true, size: true, mimetype: true, createdAt: true },
  });

  const referenced = await collectReferencedUrls();
  return rows.map((r) => ({ ...r, inUse: referenced.has(r.url.trim()) }));
}

// ---------------------------------------------------------------------------
// DELETE /api/upload — hapus unggahan yang belum terpasang (R7, R8)
// ---------------------------------------------------------------------------

export async function deleteMyUpload(user: UserPayload, url: string) {
  const row = await prisma.uploadedFile.findFirst({ where: { url } });

  // R8: tidak ditemukan atau bukan milik user (dan bukan admin) → 404
  if (!row || (row.uploadedById !== user.id && user.role !== "admin")) {
    throw notFound("Berkas tidak ditemukan atau bukan milik Anda");
  }

  // R7: bila masih direferensikan → 409
  const referenced = await collectReferencedUrls();
  if (referenced.has(url.trim())) {
    const err = new HttpError(409, "Berkas masih digunakan dan tidak dapat dihapus", "FILE_IN_USE");
    throw err;
  }

  // Hapus dari Cloudinary
  try {
    const { deleteFromCloudinary } = await import("../lib/cloudinary");
    await deleteFromCloudinary(row.publicId, row.resourceType);
  } catch (err) {
    // Cloudinary gagal: laporkan 502, biarkan baris (job akan coba lagi)
    const e: any = new Error("Gagal menghapus berkas di penyimpanan. Coba lagi.");
    e.status = 502;
    throw e;
  }

  await prisma.uploadedFile.delete({ where: { id: row.id } });
}
