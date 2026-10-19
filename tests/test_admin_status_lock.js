require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { updateOrderStatus } = require("../dist/controllers/adminController");

const invoke = (orderId) => new Promise((resolve, reject) => {
  let statusCode = 200;
  let body;
  updateOrderStatus(
    { params: { id: orderId }, body: { status: "selesai" }, user: { id: "admin-lock", role: "admin" } },
    {
      status(code) { statusCode = code; return this; },
      json(data) { body = data; return this; },
    },
    (error) => error ? reject(error) : resolve({ statusCode, body })
  ).catch(reject);
});

(async () => {
  const tag = Date.now();
  const user = await prisma.user.create({ data: { name: `Lock ${tag}`, email: `lock-${tag}@test.local`, passwordHash: "hash", role: "buyer" } });
  const category = await prisma.category.create({ data: { name: `Lock Category ${tag}`, slug: `lock-category-${tag}` } });
  const artisan = await prisma.artisan.create({ data: { brandName: `Lock Artisan ${tag}` } });
  const product = await prisma.product.create({
    data: {
      name: `Lock Product ${tag}`,
      slug: `lock-product-${tag}`,
      artisanId: artisan.id,
      categoryId: category.id,
      description: "lock test",
      price: 1000,
      images: [],
      variants: { create: [{ combination: [], stock: 1 }] },
    },
  });
  const variant = await prisma.productVariant.findFirst({ where: { productId: product.id } });
  const order = await prisma.order.create({
    data: {
      orderNumber: `SDK-LOCK-${tag}`,
      userId: user.id,
      paymentMethod: "cod",
      status: "lunas",
      totalAmount: 1000,
      pickupDate: new Date(),
      pickupSlot: "10:00",
      items: { create: [{ productId: product.id, variantId: variant.id, quantity: 1, priceSnapshot: 1000 }] },
    },
  });

  try {
    const results = await Promise.all([invoke(order.id), invoke(order.id)]);
    const successCount = results.filter((result) => result.statusCode === 200).length;
    const rejectedCount = results.filter((result) => result.statusCode === 400).length;
    const freshProduct = await prisma.product.findUnique({ where: { id: product.id } });
    const freshOrder = await prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(successCount, 1);
    assert.strictEqual(rejectedCount, 1);
    assert.strictEqual(freshProduct.soldCount, 1);
    assert.strictEqual(freshOrder.status, "selesai");
    console.log("LULUS  dua update status bersamaan menaikkan soldCount tepat sekali");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.artisan.delete({ where: { id: artisan.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
