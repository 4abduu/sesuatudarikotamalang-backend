import express from "express";
import categoriesController from "../controllers/categoriesController";

const router = express.Router();

// GET /api/categories — Publik
router.get("/", categoriesController.listCategories);

export default router;
