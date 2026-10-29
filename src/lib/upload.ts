import multer from "multer";
import { Request } from "express";

// Whitelist MIME type — hanya gambar JPG, PNG, WebP
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Simpan sementara di memory; file langsung diteruskan ke Cloudinary.
const storage = multer.memoryStorage();

// Filter jenis file yang diizinkan (hanya gambar)
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (MIME_TO_EXT[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Format file tidak didukung. Hanya gambar JPG, PNG, atau WebP yang diizinkan."));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // Maksimal 2 MB per file
  },
});

// @ts-ignore - Support legacy require(upload.ts) in CommonJS
upload.upload = upload;
export default upload;
module.exports = upload;

