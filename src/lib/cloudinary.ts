import crypto from "crypto";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { hasValidSignature } from "./fileSignature";

/**
 * true bila `url` adalah URL gambar Cloudinary milik cloud aplikasi ini sendiri.
 * Tidak memanggil ensureConfigured() sehingga aman dipanggil kapan saja.
 * Syarat: CLOUDINARY_CLOUD_NAME terisi; URL berawalan
 *   https://res.cloudinary.com/<cloud>/image/upload/
 * dan berakhiran ekstensi gambar yang diizinkan (.jpg/.jpeg/.png/.webp/.gif, case-insensitive).
 */
export function isOwnCloudinaryImageUrl(url: string): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(prefix)) return false;
  // strip query string sebelum cek ekstensi
  const pathOnly = url.split("?")[0];
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(pathOnly);
}

const folder = process.env.CLOUDINARY_FOLDER || "sesuatu-darikota-malang";

function ensureConfigured() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error: any = new Error("Cloudinary belum dikonfigurasi");
    error.status = 503;
    throw error;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export function uploadBuffer(
  buffer: Buffer,
  options: { filename: string; mimetype: string }
): Promise<UploadApiResponse> {
  ensureConfigured();

  // Isi berkas harus cocok dengan tipe yang diklaim (MIME dari klien mudah dipalsukan).
  if (!hasValidSignature(buffer, options.mimetype)) {
    const signatureError: any = new Error("Isi berkas tidak sesuai dengan tipenya");
    signatureError.status = 400;
    throw signatureError;
  }

  // public_id dibuat server (acak) dan tidak pernah memakai nama berkas dari klien:
  // nama dari klien bisa bentrok/menimpa berkas pengguna lain. overwrite dimatikan sebagai pengaman tambahan.
  const publicId = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          const uploadError: any = new Error(error?.message || "Upload Cloudinary gagal");
          uploadError.status = 502;
          reject(uploadError);
          return;
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

export default { uploadBuffer, isOwnCloudinaryImageUrl };
