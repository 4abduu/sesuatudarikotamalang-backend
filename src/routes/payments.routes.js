const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// POST /api/payments/webhook — Terima Notifikasi Webhook dari Server Midtrans (TANPA requireAuth)
router.post("/webhook", async (req, res, next) => {
  try {
    const { order_id, transaction_status, fraud_status, transaction_id } = req.body;

    if (!order_id || !transaction_status) {
      return res.status(400).json({ error: "Payload webhook tidak valid" });
    }

    // Cari pesanan berdasarkan orderNumber (contoh: SDK-XXXX)
    const order = await prisma.order.findUnique({
      where: { orderNumber: order_id },
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    let isPaid = false;
    let newOrderStatus = order.status;

    // Tentukan status pesanan berdasarkan notifikasi Midtrans
    if (transaction_status === "settlement" || (transaction_status === "capture" && fraud_status === "accept")) {
      isPaid = true;
      newOrderStatus = "lunas";
    } else if (["deny", "cancel", "expire"].includes(transaction_status)) {
      newOrderStatus = "dibatalkan";
    } else if (transaction_status === "pending") {
      newOrderStatus = "menunggu_bayar";
    }

    // Update status order dalam database transaction
    await prisma.$transaction(async (tx) => {
      // Update status order
      await tx.order.update({
        where: { id: order.id },
        data: { status: newOrderStatus },
      });

      // Update / Upsert record Payment
      await tx.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          midtransTransactionId: transaction_id || null,
          status: transaction_status,
          paidAt: isPaid ? new Date() : null,
        },
        update: {
          midtransTransactionId: transaction_id || undefined,
          status: transaction_status,
          paidAt: isPaid ? new Date() : undefined,
        },
      });

      // Jika berhasil LUNAS, akumulasi soldCount pada setiap produk yang dibeli
      if (isPaid && order.status !== "lunas") {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          });
        }
      }
    });

    res.status(200).json({ received: true, status: newOrderStatus });
  } catch (err) {
    console.error("[MIDTRANS WEBHOOK ERROR]", err);
    next(err);
  }
});

module.exports = router;
