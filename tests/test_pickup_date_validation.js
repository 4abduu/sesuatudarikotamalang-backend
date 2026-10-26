require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { createOrder } = require("../dist/controllers/ordersController");
const { getSlots } = require("../dist/controllers/slotsController");
const { toWibDateString, todayWibString } = require("../dist/lib/dates");
const { snapshotSlots, restoreSlots, setAllCapacity } = require("./helpers/pickupSlots");

const mockReqRes = (body, user) => {
  let statusCode = 200;
  let jsonResponse;
  return {
    req: { body, user, query: {} },
    res: {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
        return this;
      },
    },
    next(error) {
      throw error;
    },
    response() {
      return { statusCode, jsonResponse };
    },
  };
};

const dateOnlyPlusDays = (days) => {
  const date = new Date(`${todayWibString()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function run() {
  assert.strictEqual(toWibDateString("2026-10-18T18:00:00.000Z"), "2026-10-19");
  assert.strictEqual(toWibDateString("2026-10-20T23:00:00Z"), "2026-10-21");
  assert.strictEqual(toWibDateString("2026-10-20T23:30:00-05:00"), "2026-10-21");
  assert.strictEqual(toWibDateString("2026-10-20T10:00:00.000"), "2026-10-20");
  assert.strictEqual(toWibDateString("2026-02-30"), null);
  assert.strictEqual(toWibDateString(123), null);
  assert.strictEqual(toWibDateString({}), null);

  const beforeMorning = Date.parse("2026-10-18T18:00:00.000Z");
  assert.strictEqual(todayWibString(beforeMorning), "2026-10-19");

  const invalidSlots = mockReqRes(null, null);
  invalidSlots.req.query = { date: "2026-99-99" };
  await getSlots(invalidSlots.req, invalidSlots.res, invalidSlots.next);
  assert.strictEqual(invalidSlots.response().statusCode, 400);

  const snapshot = await snapshotSlots(prisma);
  await setAllCapacity(prisma, 1);

  const timestamp = Date.now();
  const user = await prisma.user.create({
    data: { name: `Date Test ${timestamp}`, email: `date-${timestamp}@test.local`, passwordHash: "dummyhash", role: "buyer" },
  });
  const category = await prisma.category.create({ data: { name: `Date Category ${timestamp}`, slug: `date-category-${timestamp}` } });
  const artisan = await prisma.artisan.create({ data: { brandName: `Date Artisan ${timestamp}` } });
  const product = await prisma.product.create({
    data: {
      artisanId: artisan.id,
      categoryId: category.id,
      name: `Date Product ${timestamp}`,
      slug: `date-product-${timestamp}`,
      description: "Date validation test",
      price: 1000,
      images: ["https://example.com/date-test.jpg"],
    },
  });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 1 } });
  const pickupDate = dateOnlyPlusDays(2);
  const isoWithZone = `${pickupDate}T23:00:00Z`;
  const expectedStoredDate = toWibDateString(isoWithZone);
  const createdOrderIds = [];

  try {
    const first = mockReqRes({ productId: product.id, pickupDate: isoWithZone, pickupSlot: "10:00", paymentMethod: "cod" }, user);
    await createOrder(first.req, first.res, first.next);
    assert.strictEqual(first.response().statusCode, 201);
    createdOrderIds.push(first.response().jsonResponse.order.id);

    const stored = await prisma.order.findUnique({ where: { id: first.response().jsonResponse.order.id } });
    assert.strictEqual(stored.pickupDate.getTime(), new Date(expectedStoredDate).getTime());

    const second = mockReqRes({ productId: product.id, pickupDate: expectedStoredDate, pickupSlot: "10:00", paymentMethod: "cod" }, { ...user, id: `different-${timestamp}` });
    await createOrder(second.req, second.res, second.next);
    assert.strictEqual(second.response().statusCode, 409);
    assert.strictEqual(second.response().jsonResponse.code, "SLOT_FULL");

    for (const body of [
      { productId: product.id, pickupDate: "2026-02-30", pickupSlot: "10:00", paymentMethod: "cod" },
      { productId: product.id, pickupDate: "abc", pickupSlot: "10:00", paymentMethod: "cod" },
      { productId: product.id, pickupDate: 123, pickupSlot: "10:00", paymentMethod: "cod" },
      { productId: product.id, pickupDate: {}, pickupSlot: "10:00", paymentMethod: "cod" },
    ]) {
      const invalid = mockReqRes(body, user);
      await createOrder(invalid.req, invalid.res, invalid.next);
      assert.strictEqual(invalid.response().statusCode, 400);
    }
  } finally {
    if (createdOrderIds.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.artisan.delete({ where: { id: artisan.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await restoreSlots(prisma, snapshot);
  }

  console.log("LULUS  validasi tanggal pickup WIB, tanggal tersimpan, dan slot penuh");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
