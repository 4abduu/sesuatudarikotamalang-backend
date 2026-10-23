require("./helpers/requireTestDb")();

const assert = require("assert");
const { computeRefund, pickupScheduleStart } = require("../dist/lib/refund");

const paid = (overrides = {}) => ({
  status: "settlement",
  paidAt: new Date("2026-10-20T03:00:00.000Z"),
  ...overrides,
});

const order = (overrides = {}) => ({
  status: "lunas",
  paymentMethod: "midtrans",
  pickupDate: new Date("2026-10-23T00:00:00.000Z"),
  pickupSlot: "17:00",
  updatedAt: new Date("2026-10-20T03:00:00.000Z"),
  refundStatus: "tidak_ada",
  refundedAt: null,
  ...overrides,
});

const settings = { refundWindowDays: 3 };

assert.strictEqual(computeRefund({ order: order({ refundStatus: "selesai" }), payment: paid(), settings }).state, "sudah_direfund");
assert.strictEqual(computeRefund({ order: order({ refundStatus: "menunggu" }), payment: paid(), settings }).canMarkRefunded, true);
assert.strictEqual(computeRefund({ order: order({ paymentMethod: "cod" }), payment: null, settings }).disabledReason, "NOT_PAID_ONLINE");

const eligible = computeRefund({
  order: order(),
  payment: paid(),
  settings,
  now: new Date("2026-10-20T03:00:00.000Z"),
});
assert.strictEqual(eligible.state, "dalam_batas_waktu");
assert.strictEqual(eligible.canCancelByBuyerRequest, true);

const atBoundary = computeRefund({
  order: order(),
  payment: paid(),
  settings,
  now: new Date("2026-10-23T03:00:00.000Z"),
});
assert.strictEqual(atBoundary.state, "dalam_batas_waktu");

const outside = computeRefund({
  order: order(),
  payment: paid(),
  settings,
  now: new Date("2026-10-23T03:00:00.001Z"),
});
assert.strictEqual(outside.state, "lewat_batas_waktu");
assert.strictEqual(outside.canCancelByStoreFault, true);

const pickupPassed = computeRefund({
  order: order({ status: "lewat_batas_pengambilan" }),
  payment: paid(),
  settings,
});
assert.strictEqual(pickupPassed.state, "lewat_batas_pengambilan");
assert.strictEqual(pickupPassed.disabledReason, "PICKUP_DEADLINE_PASSED");

assert.strictEqual(computeRefund({ order: order({ status: "selesai" }), payment: paid(), settings }).state, "sudah_diambil");
assert.strictEqual(computeRefund({ order: order({ status: "dibatalkan" }), payment: paid(), settings }).disabledReason, "ALREADY_CANCELLED");

const pickup = pickupScheduleStart(order({ pickupDate: new Date("2026-10-23T00:00:00.000Z"), pickupSlot: "10:00" }));
assert.strictEqual(pickup.toISOString(), "2026-10-23T03:00:00.000Z");
const malformedSlot = pickupScheduleStart(order({ pickupSlot: "invalid" }));
assert.strictEqual(malformedSlot.toISOString(), "2026-10-22T17:00:00.000Z");

const earlyPickup = computeRefund({
  order: order({ pickupDate: new Date("2026-10-20T00:00:00.000Z"), pickupSlot: "10:00" }),
  payment: paid(),
  settings,
  now: new Date("2026-10-20T02:59:59.999Z"),
});
assert.strictEqual(earlyPickup.eligibleUntil, "2026-10-20T03:00:00.000Z");

const fallbackPaidAt = computeRefund({
  order: order({ updatedAt: new Date("2026-10-21T00:00:00.000Z") }),
  payment: paid({ paidAt: null }),
  settings,
});
assert.strictEqual(fallbackPaidAt.paidAt, "2026-10-21T00:00:00.000Z");

for (const days of [1, 3, 7]) {
  const result = computeRefund({ order: order(), payment: paid(), settings: { refundWindowDays: days } });
  assert.strictEqual(result.refundWindowDays, days);
}

assert.strictEqual(computeRefund({ order: order(), payment: paid({ status: "pending" }), settings }).paid, false);
console.log("LULUS  kebijakan refund murni: 8 state, batas waktu, slot WIB, fallback, dan status pembayaran");
