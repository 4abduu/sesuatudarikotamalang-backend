require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { repayOrder } = require("../dist/controllers/ordersController");

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        resolve(this);
        return this;
      },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

(async () => {
  const tag = Date.now();
  let userId;
  let orderId;
  let paymentId;
  try {
    const user = await prisma.user.create({
      data: {
        name: "Payment Idempotency Test",
        email: `payment-idempotency-${tag}@test.local`,
        passwordHash: "hash",
        role: "buyer",
      },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `SDK-${String(tag).slice(-6)}`,
        userId: user.id,
        paymentMethod: "midtrans",
        status: "menunggu_bayar",
        totalAmount: 10000,
        pickupDate: new Date(Date.now() + 86400000),
        pickupSlot: "10:00",
        holdExpiresAt: new Date(Date.now() + 3600000),
      },
    });
    orderId = order.id;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        midtransTransactionId: "existing-snap-token",
        status: "pending",
      },
    });
    paymentId = payment.id;

    const response = await invoke(repayOrder, {
      user: { id: user.id, role: "buyer" },
      params: { id: order.id },
    });

    if (response.statusCode !== 409 || response.body.code !== "PAYMENT_ALREADY_CREATED") {
      throw new Error(`harapan 409 PAYMENT_ALREADY_CREATED, aktual ${response.statusCode} ${JSON.stringify(response.body)}`);
    }

    console.log("LULUS  request bayar ulang tidak memanggil Midtrans bila payment sudah tercatat");
  } finally {
    if (paymentId) await prisma.payment.delete({ where: { id: paymentId } });
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error("GAGAL", error.message);
  process.exit(1);
});
