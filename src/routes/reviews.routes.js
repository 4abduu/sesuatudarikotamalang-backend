const express = require("express");
const { requireAuth } = require("../middleware/auth");
const reviewsController = require("../controllers/reviews.controller");

const router = express.Router();

// GET /api/reviews — List ulasan publik (dukung filter productId)
router.get("/", reviewsController.listReviews);

// POST /api/reviews — Tambah ulasan baru (butuh login, wajib terikat pesanan yang sudah selesai)
router.post("/", requireAuth, reviewsController.createReview);

module.exports = router;
