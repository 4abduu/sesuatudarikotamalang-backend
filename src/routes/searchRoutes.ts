import express from "express";
import searchController from "../controllers/searchController";

const router = express.Router();

// GET /api/search — Search produk & kreator
router.get("/", searchController.search);

export default router;
