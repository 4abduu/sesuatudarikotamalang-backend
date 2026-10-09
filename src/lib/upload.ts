import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

const uploadDir = path.join(__dirname, "../../uploads");

// Pastikan direktori uploads ada
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

// Storage engine diskStorage untuk simpan file lokal
const storage = multer.diskStorage({
  destination: function (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, uploadDir);
  },
  filename: function (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // F-05: Tentukan ekstensi berdasarkan MIME type yang teruji/tervalidasi, bukan dari originalname
    const ext = MIME_TO_EXT[file.mimetype] || ".bin";
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

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

