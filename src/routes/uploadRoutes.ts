import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/authMiddleware";
import upload from "../lib/upload";
import uploadController from "../controllers/uploadController";
import { uploadLimiter } from "../middleware/rateLimiter";

const router = express.Router();

/** Petakan MulterError ke pesan Indonesia sesuai kontrak 2.6. */
function handleMulterError(err: any, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({ error: "Ukuran berkas maksimal 2 MB" });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          error: "Nama field upload salah. Gunakan \"file\" untuk satu berkas atau \"files\" (maksimal 10) untuk banyak berkas",
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({ error: "Maksimal 10 berkas per unggahan" });
      default:
        return res.status(400).json({ error: err.message });
    }
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
}

// POST /api/upload/single — Upload 1 file (membutuhkan login)
router.post(
  "/single",
  requireAuth,
  uploadLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err: any) => handleMulterError(err, res, next));
  },
  uploadController.uploadSingle
);

// POST /api/upload/multiple — Upload hingga 10 file sekaligus (membutuhkan login)
router.post(
  "/multiple",
  requireAuth,
  uploadLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array("files", 10)(req, res, (err: any) => handleMulterError(err, res, next));
  },
  uploadController.uploadMultiple
);

// GET /api/upload/mine — Daftar unggahan milik user (requireAuth, limiter umum)
router.get("/mine", requireAuth, uploadController.listMyUploads);

// DELETE /api/upload — Hapus unggahan yang belum terpasang (requireAuth, limiter umum)
router.delete("/", requireAuth, uploadController.deleteMyUpload);

export default router;
