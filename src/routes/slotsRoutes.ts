import express from "express";
import slotsController from "../controllers/slotsController";

const router = express.Router();

// GET /api/slots?date=YYYY-MM-DD — Publik: ketersediaan slot pickup
router.get("/", slotsController.getSlots);

export default router;
