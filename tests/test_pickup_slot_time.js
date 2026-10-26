require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { createOrder } = require("../dist/controllers/ordersController");
const { getSlots } = require("../dist/controllers/slotsController");
const { isSlotPassed, isSlotClosed, getPickupConfig } = require("../dist/lib/slots");
const { todayWibString } = require("../dist/lib/dates");

const mockReqRes = (body, user, query = {}) => {
  let statusCode = 200;
  let jsonResponse;
  return {
    req: { body, user, query },
    res: {
      status(code) { statusCode = code; return this; },
      json(payload) { jsonResponse = payload; return this; },
    },
    next(error) { throw error; },
    response() { return { statusCode, jsonResponse }; },
  };
};

const datePlusDays = (days) => {
  const date = new Date(`${todayWibString()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const isSunday = (dateString) => new Date(`${dateString}T00:00:00Z`).getUTCDay() === 0;
const at = (iso) => Date.parse(iso);

function testPureFunction() {
  assert.strictEqual(isSlotPassed("2026-10-24", "10:00", at("2026-10-24T09:59:00+07:00")), false);
  assert.strictEqual(isSlotPassed("2026-10-24", "10:00", at("2026-10-24T10:00:00+07:00")), true);
  assert.strictEqual(isSlotPassed("2026-10-24", "17:00", at("2026-10-24T10:30:00+07:00")), false);
  assert.strictEqual(isSlotPassed("2026-10-25", "10:00", at("2026-10-24T23:59:00+07:00")), false);
  assert.strictEqual(isSlotPassed("2026-10-23", "17:00", at("2026-10-24T00:01:00+07:00")), true);
  assert.strictEqual(isSlotPassed("2026-10-24", "10:00", at("2026-10-24T03:30:00Z")), true, "03:30 UTC = 10:30 WIB");
  assert.strictEqual(isSlotPassed("2026-10-24", "08:00-10:00", at("2026-10-24T08:30:00+07:00")), true, "rentang memakai jam mulai");
  assert.strictEqual(isSlotPassed("2026-10-24", "abc", at("2026-10-24T23:00:00+07:00")), false);
  assert.strictEqual(isSlotPassed("2026-10-24", "25:00", at("2026-10-24T23:00:00+07:00")), false);
  // Hari Minggu tidak diperlakukan khusus
  assert.strictEqual(isSlotPassed("2026-10-25", "10:00", at("2026-10-24T09:00:00+07:00")), false);

  // Jeda minimal 30 menit sebelum jam slot
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T09:29:59+07:00"), 30), false, "09:29:59 masih bisa");
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T09:30:00+07:00"), 30), true, "09:30:00 sudah ditutup");
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T09:45:00+07:00"), 30), true);
  assert.strictEqual(isSlotPassed("2026-10-24", "10:00", at("2026-10-24T09:45:00+07:00")), false, "ditutup belum berarti lewat");
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T10:00:00+07:00"), 30), true, "lewat selalu ditutup");
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T09:59:00+07:00"), 0), false, "jeda 0 = tanpa jeda");
  assert.strictEqual(isSlotClosed("2026-10-24", "10:00", at("2026-10-24T10:00:00+07:00"), 0), true);
  assert.strictEqual(isSlotClosed("2026-10-25", "10:00", at("2026-10-24T23:59:00+07:00"), 30), false, "besok tidak ditutup");
  assert.strictEqual(isSlotClosed("2026-10-24", "abc", at("2026-10-24T23:00:00+07:00"), 30), false, "format tak dikenal");
  assert.strictEqual(isSlotClosed("2026-10-25", "00:10", at("2026-10-24T23:50:00+07:00"), 30), true, "jeda melewati tengah malam");
}

async function testGetSlots() {
  const today = todayWibString();
  const yesterday = datePlusDays(-1);
  const tomorrow = datePlusDays(1);
  const config = await getPickupConfig();
  const slots = config.slots.filter((s) => s.isActive).map((s) => s.time);

  for (const [label, date, expectAllPast, expectNonePast] of [
    ["kemarin", yesterday, true, false],
    ["besok", tomorrow, false, true],
  ]) {
    const t = mockReqRes(null, null, { date });
    await getSlots(t.req, t.res, t.next);
    const r = t.response();
    assert.strictEqual(r.statusCode, 200, label);
    assert.strictEqual(r.jsonResponse.date, date, label);
    assert(!Number.isNaN(Date.parse(r.jsonResponse.serverNow)), `${label}: serverNow harus ISO`);
    assert.strictEqual(r.jsonResponse.slots.length, slots.length, label);
    assert.strictEqual(r.jsonResponse.leadMinutes, config.leadMinutes, `${label}: leadMinutes`);
    for (const s of r.jsonResponse.slots) {
      assert.strictEqual(typeof s.isPast, "boolean", label);
      assert.strictEqual(typeof s.isClosed, "boolean", label);
      assert.strictEqual(typeof s.bookable, "boolean", label);
      assert.strictEqual(s.bookable, !s.isClosed && s.available > 0, `${label}: bookable konsisten`);
      if (s.isPast) assert.strictEqual(s.isClosed, true, `${label}: lewat selalu ditutup`);
      if (expectAllPast) {
        assert.strictEqual(s.isPast, true, `${label}: semua slot lewat`);
        assert.strictEqual(s.isClosed, true, `${label}: semua slot ditutup`);
      }
      if (expectNonePast) {
        assert.strictEqual(s.isPast, false, `${label}: tidak ada slot lewat`);
        assert.strictEqual(s.isClosed, false, `${label}: tidak ada slot ditutup`);
      }
    }
  }

  const t = mockReqRes(null, null, { date: today });
  await getSlots(t.req, t.res, t.next);
  const r = t.response();
  assert.strictEqual(r.statusCode, 200);
  const serverNow = Date.parse(r.jsonResponse.serverNow);
  for (const s of r.jsonResponse.slots) {
    assert.strictEqual(s.isPast, isSlotPassed(today, s.time, serverNow), `hari ini ${s.time}`);
    assert.strictEqual(s.isClosed, isSlotClosed(today, s.time, serverNow, r.jsonResponse.leadMinutes), `hari ini ${s.time}: isClosed`);
    assert.strictEqual(s.bookable, !s.isClosed && s.available > 0);
  }
}

async function testCreateOrder() {
  const stamp = Date.now();
  const users = [];
  const createdOrderIds = [];
  const makeUser = async (label) => {
    const u = await prisma.user.create({
      data: { name: `Slot ${label} ${stamp}`, email: `slot-${label}-${stamp}@test.local`, passwordHash: "dummyhash", role: "buyer" },
    });
    users.push(u);
    return u;
  };
  const category = await prisma.category.create({ data: { name: `Slot Cat ${stamp}`, slug: `slot-cat-${stamp}` } });
  const artisan = await prisma.artisan.create({ data: { brandName: `Slot Artisan ${stamp}` } });
  const product = await prisma.product.create({
    data: {
      artisanId: artisan.id, categoryId: category.id, name: `Slot Product ${stamp}`, slug: `slot-product-${stamp}`,
      description: "Slot time test", price: 1000, images: ["https://example.com/slot-test.jpg"],
    },
  });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 20 } });

  const call = async (body, user) => {
    const t = mockReqRes(body, user);
    await createOrder(t.req, t.res, t.next);
    const r = t.response();
    if (r.statusCode === 201) createdOrderIds.push(r.jsonResponse.order.id);
    return r;
  };

  try {
    const today = todayWibString();
    const config = await getPickupConfig();
    const slots = config.slots.filter((s) => s.isActive).map((s) => s.time);
    const passedToday = slots.filter((s) => isSlotPassed(today, s));
    const futureToday = slots.filter((s) => !isSlotClosed(today, s, Date.now(), config.leadMinutes)); // masih terbuka (di luar jeda)
    const inLeadWindow = slots.filter((s) => !isSlotPassed(today, s) && isSlotClosed(today, s, Date.now(), config.leadMinutes)); // ditutup tapi belum mulai

    if (passedToday.length > 0) {
      const u = await makeUser("passed");
      const r = await call({ productId: product.id, pickupDate: today, pickupSlot: passedToday[0], paymentMethod: "cod" }, u);
      assert.strictEqual(r.statusCode, 400);
      assert.strictEqual(r.jsonResponse.code, "SLOT_PASSED");
    } else {
      console.log("  (lewati: belum ada slot yang lewat hari ini)");
    }

    if (inLeadWindow.length > 0) {
      const u = await makeUser("lead");
      const r = await call({ productId: product.id, pickupDate: today, pickupSlot: inLeadWindow[0], paymentMethod: "cod" }, u);
      assert.strictEqual(r.statusCode, 400);
      assert.strictEqual(r.jsonResponse.code, "SLOT_PASSED");
      assert(/ditutup/.test(r.jsonResponse.error), "pesan jeda harus menyebut 'ditutup'");
    } else {
      console.log("  (lewati: tidak ada slot yang sedang berada dalam jeda saat ini)");
    }

    if (futureToday.length > 0) {
      const u = await makeUser("future");
      const r = await call({ productId: product.id, pickupDate: today, pickupSlot: futureToday[futureToday.length - 1], paymentMethod: "cod" }, u);
      assert.strictEqual(r.statusCode, 201, JSON.stringify(r.jsonResponse));
    } else {
      console.log("  (lewati: semua slot hari ini sudah lewat)");
    }

    // Hari Minggu dalam jendela 14 hari harus bisa dipesan
    let sunday = null;
    for (let d = 1; d <= 14; d++) {
      if (isSunday(datePlusDays(d))) { sunday = datePlusDays(d); break; }
    }
    assert(sunday, "harus ada hari Minggu dalam 14 hari ke depan");
    const u = await makeUser("sunday");
    const r = await call({ productId: product.id, pickupDate: sunday, pickupSlot: slots[0], paymentMethod: "cod" }, u);
    assert.strictEqual(r.statusCode, 201, JSON.stringify(r.jsonResponse));
  } finally {
    if (createdOrderIds.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.artisan.delete({ where: { id: artisan.id } });
    await prisma.category.delete({ where: { id: category.id } });
    for (const u of users) await prisma.user.delete({ where: { id: u.id } });
  }
}

async function run() {
  testPureFunction();
  console.log("LULUS  isSlotPassed dan isSlotClosed: batas jam, jeda 30 menit, zona WIB, rentang, env, Minggu");
  await testGetSlots();
  console.log("LULUS  GET /slots: isPast, isClosed, bookable, leadMinutes untuk kemarin, hari ini, besok");
  await testCreateOrder();
  console.log("LULUS  POST /orders: slot lewat atau dalam jeda ditolak SLOT_PASSED, slot terbuka hari ini dan hari Minggu diterima");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
