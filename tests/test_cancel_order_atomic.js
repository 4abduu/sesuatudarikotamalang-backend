require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { cancelOrder } = require("../dist/controllers/ordersController");

(async () => {
  const tag = Date.now();
  const user = await prisma.user.create({ data: { name: `Cancel ${tag}`, email: `cancel-${tag}@test.local`, passwordHash: "hash", role: "buyer" } });
  const order = await prisma.order.create({ data: { orderNumber: `SDK-CANCEL-${tag}`, userId: user.id, paymentMethod: "cod", status: "menunggu_bayar", totalAmount: 1000, pickupDate: new Date(), pickupSlot: "10:00" } });
  await prisma.order.update({ where: { id: order.id }, data: { status: "lunas" } });
  let statusCode = 200;
  let body;
  await cancelOrder(
    { user, params: { id: order.id } },
    { status(code) { statusCode = code; return this; }, json(data) { body = data; return this; } },
    (error) => { statusCode = error.status || 500; body = { error: error.message }; }
  );
  const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
  assert.strictEqual(statusCode, 403);
  assert.strictEqual(unchanged.status, "lunas");
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
  console.log("LULUS  pembatalan atomik tidak menimpa order yang sudah lunas");
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
