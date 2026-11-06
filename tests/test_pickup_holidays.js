require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { getPublicHolidays, createHoliday, deleteHoliday } = require("../dist/controllers/pickupHolidayController");
const { getSlots } = require("../dist/controllers/slotsController");
const { todayWibString } = require("../dist/lib/dates");

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function mock(body = {}, params = {}, query = {}) {
  let statusCode = 200;
  let response = null;
  return {
    req: { body, params, query, user: { id: "test-admin", role: "admin" } },
    res: {
      status(code) { statusCode = code; return this; },
      json(payload) { response = payload; return this; },
    },
    next(error) { if (error) throw error; },
    result() { return { statusCode, response }; },
  };
}

(async () => {
  const startDate = addDays(todayWibString(), 3);
  const endDate = addDays(startDate, 1);
  let holidayId;
  try {
    const create = mock({ startDate, endDate, reason: "Tes libur operasional" });
    await createHoliday(create.req, create.res, create.next);
    assert.strictEqual(create.result().statusCode, 201);
    holidayId = create.result().response.holiday.id;

    const publicList = mock({}, {}, { from: startDate, to: endDate });
    await getPublicHolidays(publicList.req, publicList.res, publicList.next);
    assert.strictEqual(publicList.result().statusCode, 200);
    assert.ok(publicList.result().response.holidays.some((holiday) => holiday.startDate === startDate));

    const slots = mock({}, {}, { date: startDate });
    await getSlots(slots.req, slots.res, slots.next);
    assert.strictEqual(slots.result().statusCode, 200);
    assert.strictEqual(slots.result().response.slots.length, 0);
    assert.strictEqual(slots.result().response.holiday.reason, "Tes libur operasional");

    const remove = mock({}, { id: holidayId });
    await deleteHoliday(remove.req, remove.res, remove.next);
    assert.strictEqual(remove.result().statusCode, 200);
    console.log("LULUS pickup holidays: CRUD publik dan slot kosong pada hari libur");
  } finally {
    if (holidayId) await prisma.pickupHoliday.deleteMany({ where: { id: holidayId } });
  }
})().catch((error) => {
  console.error("GAGAL", error);
  process.exit(1);
});
