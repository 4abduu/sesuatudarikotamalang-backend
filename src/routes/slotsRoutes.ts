import express from "express";
import slotsController from "../controllers/slotsController";
import pickupHolidayController from "../controllers/pickupHolidayController";

const router = express.Router();

// GET /api/slots?date=YYYY-MM-DD — Publik: ketersediaan slot pickup
router.get("/", slotsController.getSlots);
router.get("/holidays", pickupHolidayController.getPublicHolidays);

export default router;
