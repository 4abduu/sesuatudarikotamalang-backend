import express from "express";
import settingsController from "../controllers/settingsController";

const router = express.Router();

// GET /api/settings/public — A6: Publik
router.get("/public", settingsController.getPublicSettings);

export default router;
