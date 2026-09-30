const express = require("express");
const paymentsController = require("../controllers/payments.controller");

const router = express.Router();

// POST /api/payments/webhook — Terima Notifikasi Webhook dari Server Midtrans (TANPA requireAuth)
router.post("/webhook", paymentsController.handleWebhook);

module.exports = router;
