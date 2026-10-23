require("./helpers/requireTestDb")();

const assert = require("assert");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { handleWebhook } = require("../dist/controllers/paymentsController");

const prisma = new PrismaClient();
const stamp = Date.now();

function response() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

(async () => {
  const oldKey = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = "refund-test-server-key";
  const created = { userId: null, artisanId: null, productId: null, variantId: null, orderIds: [] };
  try {
    const user = await prisma.user.create({ data: { name: "Webhook Refund Buyer", email: `refund-webhook-${stamp}@test.local`, role: "buyer" } });
    created.userId = user.id;
    const creator = await prisma.user.create({ data: { name: "Webhook Creator", email: `refund-webhook-creator-${stamp}@test.local`, role: "creator" } });
    const artisan = await prisma.artisan.create({ data: { userId: creator.id, brandName: `Webhook Artisan ${stamp}`, status: "aktif" } });
    created.artisanId = artisan.id;
    const category = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `Webhook Cat ${stamp}`, slug: `webhook-cat-${stamp}` } });
    const product = await prisma.product.create({ data: { name: `Webhook Product ${stamp}`, slug: `webhook-product-${stamp}`, description: "Webhook test", price: 25000, images: [], categoryId: category.id, artisanId: artisan.id } });
    created.productId = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 0 } });
    created.variantId = variant.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `RF-WEB-${stamp}`,
        userId: user.id,
        paymentMethod: "midtrans",
        status: "dibatalkan",
        totalAmount: 25000,
        pickupDate: new Date(),
        pickupSlot: "10:00",
        items: { create: [{ productId: product.id, variantId: variant.id, quantity: 1, priceSnapshot: 25000 }] },
      },
    });
    created.orderIds.push(order.id);

    const statusCode = "200";
    const grossAmount = "25000.00";
    const signature = crypto.createHash("sha512").update(`${order.orderNumber}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`).digest("hex");
    const body = { order_id: order.orderNumber, status_code: statusCode, gross_amount: grossAmount, signature_key: signature, transaction_status: "settlement", fraud_status: "accept", transaction_id: `mid-${stamp}` };
    const first = response();
    await handleWebhook({ body }, first, (error) => { throw error; });
    assert.strictEqual(first.statusCode, 200);
    let saved = await prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(saved.refundStatus, "menunggu");
    assert.strictEqual(await prisma.notification.count({ where: { userId: user.id, title: "Pembayaran Diterima untuk Pesanan Batal" } }), 1);

    const second = response();
    await handleWebhook({ body }, second, (error) => { throw error; });
    saved = await prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(saved.refundStatus, "menunggu");
    assert.strictEqual(await prisma.notification.count({ where: { userId: user.id, title: "Pembayaran Diterima untuk Pesanan Batal" } }), 1);
    console.log("LULUS  webhook late settlement menunggu refund dan idempoten");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: created.userId || undefined } });
    await prisma.payment.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
    if (created.variantId) await prisma.productVariant.delete({ where: { id: created.variantId } }).catch(() => {});
    if (created.productId) await prisma.product.delete({ where: { id: created.productId } }).catch(() => {});
    if (created.artisanId) await prisma.artisan.delete({ where: { id: created.artisanId } }).catch(() => {});
    if (created.userId) await prisma.user.delete({ where: { id: created.userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: `refund-webhook-creator-${stamp}@test.local` } });
    if (oldKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = oldKey;
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error("GAGAL  webhook refund:", error);
  process.exitCode = 1;
});
