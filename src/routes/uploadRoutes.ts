import express, { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import upload from "../lib/upload";
import uploadController from "../controllers/uploadController";
import { uploadLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// POST /api/upload/single — Upload 1 file (membutuhkan login)
router.post(
  "/single",
  requireAuth,
  uploadLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  uploadController.uploadSingle
);

// POST /api/upload/multiple — Upload hingga 5 file sekaligus (membutuhkan login)
router.post(
  "/multiple",
  requireAuth,
  uploadLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array("files", 5)(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  uploadController.uploadMultiple
);

export default router;
