import express from "express";
import searchController from "../controllers/searchController";
import { searchLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// GET /api/search — Search produk & kreator
router.get("/", searchLimiter, searchController.search);

export default router;
