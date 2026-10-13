import multer from "multer";
import { Request } from "express";

// Whitelist MIME type -> ekstensi aman
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

// Simpan sementara di memory; file langsung diteruskan ke Cloudinary.
const storage = multer.memoryStorage();

// Filter jenis file yang diizinkan (Gambar & Dokumen PDF/Zip)
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (MIME_TO_EXT[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Format file tidak didukung. Hanya gambar (JPG, PNG, WEBP, GIF) dan dokumen (PDF, ZIP) yang diizinkan."));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Maksimal 10MB per file
  },
});

// @ts-ignore - Support legacy require(upload.ts) in CommonJS
upload.upload = upload;
export default upload;
module.exports = upload;

