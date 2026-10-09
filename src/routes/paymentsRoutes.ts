import express from "express";
import paymentsController from "../controllers/paymentsController";

const router = express.Router();

// POST /api/payments/webhook — Terima Notifikasi Webhook dari Server Midtrans (TANPA requireAuth)
router.post("/webhook", paymentsController.handleWebhook);

export default router;
