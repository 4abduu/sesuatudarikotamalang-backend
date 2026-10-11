import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import reviewsController from "../controllers/reviewsController";

const router = express.Router();

// GET /api/reviews/mine — A4: Ulasan milik pengguna yang login (sebelum param)
router.get("/mine", requireAuth, reviewsController.listMyReviews);

// GET /api/reviews — List ulasan publik (dukung filter productId)
router.get("/", reviewsController.listReviews);

// POST /api/reviews — Tambah ulasan baru (butuh login, wajib terikat pesanan yang sudah selesai)
router.post("/", requireAuth, reviewsController.createReview);

export default router;
