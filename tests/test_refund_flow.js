require("./helpers/requireTestDb")();

const assert = require("assert");
const { PrismaClient } = require("@prisma/client");
const { errorHandler } = require("../dist/app");
const adminController = require("../dist/controllers/adminController").default;

const prisma = new PrismaClient();
const stamp = Date.now();
const admin = { id: `refund-admin-${stamp}`, role: "admin" };
const created = { orderIds: [], userIds: [], productIds: [], variantIds: [], artisanIds: [], categoryId: null };

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function call(handler, body, params = {}) {
  const req = { body, params, query: {}, user: admin, method: "TEST", path: "/test" };
  const res = mockRes();
  let nextError = null;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) {
    const oldError = console.error;
    console.error = () => {};
    try { errorHandler(nextError, req, res, () => {}); } finally { console.error = oldError; }
  }
  return res;
}

async function makeOrder({ paymentMethod = "midtrans", paidAt = new Date(), pickupDate = new Date(Date.now() + 86400000), status = "lunas" } = {}) {
  const order = await prisma.order.create({
    data: {
      orderNumber: `RF-${stamp}-${created.orderIds.length}`,
      userId: created.userIds[0],
      paymentMethod,
      status,
      totalAmount: 25000,
      pickupDate,
      pickupSlot: "17:00",
      items: { create: [{ productId: created.productIds[0], variantId: created.variantIds[0], quantity: 1, priceSnapshot: 25000 }] },
      ...(paymentMethod === "midtrans" ? {
        payment: { create: { midtransTransactionId: `tx-${stamp}-${created.orderIds.length}`, status: "settlement", paidAt } },
      } : {}),
    },
  });
  created.orderIds.push(order.id);
  return order;
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: created.orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: created.variantIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.artisan.deleteMany({ where: { id: { in: created.artisanIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  if (created.categoryId) await prisma.category.deleteMany({ where: { id: created.categoryId } });
}

(async () => {
  try {
    const buyer = await prisma.user.create({ data: { name: "Refund Buyer", email: `refund-buyer-${stamp}@test.local`, role: "buyer" } });
    created.userIds.push(buyer.id);
    const creatorUser = await prisma.user.create({ data: { name: "Refund Creator", email: `refund-creator-${stamp}@test.local`, role: "creator" } });
    created.userIds.push(creatorUser.id);
    const artisan = await prisma.artisan.create({ data: { userId: creatorUser.id, brandName: `Refund Artisan ${stamp}`, status: "aktif" } });
    created.artisanIds.push(artisan.id);
    const category = await prisma.category.create({ data: { name: `Refund Category ${stamp}`, slug: `refund-category-${stamp}` } });
    created.categoryId = category.id;
    const product = await prisma.product.create({ data: { name: `Refund Product ${stamp}`, slug: `refund-product-${stamp}`, description: "Refund test", price: 25000, images: [], categoryId: category.id, artisanId: artisan.id } });
    created.productIds.push(product.id);
    const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 20 } });
    created.variantIds.push(variant.id);

    const inside = await makeOrder();
    let response = await call(adminController.updateOrderStatus, { status: "dibatalkan", cancelReason: "permintaan_pembeli" }, { id: inside.id });
    assert.strictEqual(response.statusCode, 200);
    let saved = await prisma.order.findUnique({ where: { id: inside.id } });
    assert.strictEqual(saved.refundStatus, "menunggu");
    assert.strictEqual(saved.cancelReason, "permintaan_pembeli");
    assert.strictEqual(await prisma.notification.count({ where: { userId: created.userIds[0], title: "Pesanan Dibatalkan" } }), 1);

    response = await call(adminController.markOrderRefunded, {}, { id: inside.id });
    assert.strictEqual(response.statusCode, 200);
    saved = await prisma.order.findUnique({ where: { id: inside.id } });
    assert.strictEqual(saved.refundStatus, "selesai");
    assert(saved.refundedAt);
    response = await call(adminController.markOrderRefunded, {}, { id: inside.id });
    assert.strictEqual(response.statusCode, 409);
    assert.strictEqual(response.body.code, "REFUND_NOT_PENDING");

    const outside = await makeOrder({ paidAt: new Date(Date.now() - 5 * 86400000) });
    response = await call(adminController.updateOrderStatus, { status: "dibatalkan", cancelReason: "permintaan_pembeli" }, { id: outside.id });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(response.body.code, "REFUND_WINDOW_PASSED");
    assert.strictEqual((await prisma.order.findUnique({ where: { id: outside.id } })).status, "lunas");
    response = await call(adminController.updateOrderStatus, { status: "dibatalkan", cancelReason: "kesalahan_toko" }, { id: outside.id });
    assert.strictEqual(response.statusCode, 200);

    const late = await makeOrder({ pickupDate: new Date(Date.now() - 86400000), paidAt: new Date() });
    await prisma.order.update({ where: { id: late.id }, data: { status: "lewat_batas_pengambilan" } });
    response = await call(adminController.updateOrderStatus, { status: "dibatalkan", cancelReason: "permintaan_pembeli" }, { id: late.id });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(response.body.code, "PICKUP_DEADLINE_PASSED");
    response = await call(adminController.updateOrderStatus, { status: "dibatalkan", cancelReason: "kesalahan_toko" }, { id: late.id });
    assert.strictEqual(response.statusCode, 200);

    const cash = await makeOrder({ paymentMethod: "cod", status: "menunggu_bayar" });
    response = await call(adminController.updateOrderStatus, { status: "dibatalkan" }, { id: cash.id });
    assert.strictEqual(response.statusCode, 200);
    saved = await prisma.order.findUnique({ where: { id: cash.id } });
    assert.strictEqual(saved.refundStatus, "tidak_ada");
    assert.strictEqual(saved.cancelReason, null);

    const dashboard = await call(adminController.getDashboard, {});
    assert.strictEqual(dashboard.statusCode, 200);
    assert(dashboard.body.pendingRefundCount >= 0);
    assert(Array.isArray(dashboard.body.pendingRefunds));

    const filteredRes = mockRes();
    await adminController.listOrders({ query: { refundStatus: "menunggu" }, user: admin }, filteredRes, (error) => { throw error; });
    assert(Array.isArray(filteredRes.body.orders));
    console.log("LULUS  alur refund admin: cancelReason, notifikasi tunggal, mark refunded, batas waktu, cash, dan dashboard");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error("GAGAL  alur refund:", error);
  process.exitCode = 1;
});
