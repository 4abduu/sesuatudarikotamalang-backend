import express from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/requireRole";
import productsController from "../controllers/productsController";

const router = express.Router();

// GET /api/products — list semua produk aktif (dukung filter categoryId, search, sort)
router.get("/", productsController.listProducts);

// GET /api/products/mine — A4: list produk milik kreator yang sedang login (sebelum /:id)
router.get("/mine", requireAuth, requireRole("creator"), productsController.listMyProducts);

// GET /api/products/:id — detail satu produk (increment viewCount)
router.get("/:id", productsController.getProductById);

// POST /api/products — Tambah produk (Creator / Admin)
router.post("/", requireAuth, requireRole("creator", "admin"), productsController.createProduct);

// PUT /api/products/:id — Edit produk (Creator pemilik produk / Admin)
router.put("/:id", requireAuth, requireRole("creator", "admin"), productsController.updateProduct);

// DELETE /api/products/:id — Soft Delete produk (Admin only)
router.delete("/:id", requireAuth, requireRole("admin"), productsController.deleteProduct);

// POST /api/products/:id/story — Tambah / Update cerita Behind the Design (Creator pemilik / Admin)
router.post("/:id/story", requireAuth, requireRole("creator", "admin"), productsController.upsertStory);

export default router;
