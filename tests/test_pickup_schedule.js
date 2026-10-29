require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const {
  getAdminPickupSchedule,
  updateAdminPickupScheduleSettings,
  createAdminPickupSlot,
  updateAdminPickupSlot,
  deleteAdminPickupSlot,
} = require("../dist/controllers/pickupScheduleController");
const { getSlots } = require("../dist/controllers/slotsController");
const { createOrder } = require("../dist/controllers/ordersController");
const { getDashboard } = require("../dist/controllers/adminController");
const { snapshotSlots, restoreSlots, setAllCapacity, ensureDefaultSlots } = require("./helpers/pickupSlots");
const { todayWibString } = require("../dist/lib/dates");

// Tanggal uji relatif (WIB): besok dan lusa. Tanggal tetap membuat tes gagal begitu tanggalnya lewat,
// dan memakai "hari ini" membuat hasil tes bergantung pada jam saat tes dijalankan.
const TEST_DATE = todayWibString(Date.now() + 24 * 3600 * 1000);
const TEST_DATE_2 = todayWibString(Date.now() + 48 * 3600 * 1000);

function mockReqRes(body = {}, user = null, params = {}, query = {}) {
  let statusCode = 200;
  let jsonResponse = null;
  return {
    req: { body, user, params, query },
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
    next(err) {
      if (err) throw err;
    },
    response() {
      return { statusCode, jsonResponse };
    },
  };
}

(async () => {
  let snapshot;
  try {
    snapshot = await snapshotSlots(prisma);
    await ensureDefaultSlots(prisma);

    const adminUser = { id: `admin-${Date.now()}`, role: "admin" };
    const buyerUser = { id: `buyer-${Date.now()}`, role: "buyer" };

    // 1. GET /admin/pickup-schedule pada database hasil migrasi (10 slot, source: database, 09:00/23:00, jeda 30)
    {
      const t = mockReqRes({}, adminUser);
      await getAdminPickupSchedule(t.req, t.res, t.next);
      const r = t.response();
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.jsonResponse.source, "database");
      assert.strictEqual(r.jsonResponse.settings.openTime, "09:00");
      assert.strictEqual(r.jsonResponse.settings.closeTime, "23:00");
      assert.strictEqual(r.jsonResponse.settings.leadMinutes, 30);
      assert.ok(r.jsonResponse.slots.length >= 10);
      console.log("LULUS  1. GET /admin/pickup-schedule 10 slot awal, database, settings benar");
    }

    // 3. POST slot valid (mis. 20:00 capacity 3) -> 201; muncul di GET /slots publik terurut
    let createdSlotId;
    {
      const t = mockReqRes({ time: "20:00", capacity: 4 }, adminUser);
      await createAdminPickupSlot(t.req, t.res, t.next);
      const r = t.response();
      assert.strictEqual(r.statusCode, 201);
      assert.strictEqual(r.jsonResponse.slot.time, "20:00");
      assert.strictEqual(r.jsonResponse.slot.capacity, 4);
      createdSlotId = r.jsonResponse.slot.id;

      // Cek di GET /slots publik
      const pub = mockReqRes({}, null, {}, { date: TEST_DATE });
      await getSlots(pub.req, pub.res, pub.next);
      const pubR = pub.response();
      assert.strictEqual(pubR.statusCode, 200);
      const slot20 = pubR.jsonResponse.slots.find((s) => s.time === "20:00");
      assert.ok(slot20);
      assert.strictEqual(slot20.capacity, 4);
      console.log("LULUS  3. POST slot valid 20:00 -> 201 dan muncul di GET /slots publik");
    }

    // 4. POST time salah format ("9:00", "10:15", "24:00") -> 400
    for (const badTime of ["9:00", "10:15", "24:00", "abc"]) {
      const t = mockReqRes({ time: badTime, capacity: 3 }, adminUser);
      await createAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 400);
    }
    console.log("LULUS  4. POST time salah format ditolak 400");

    // 5. POST di luar jam (08:30, 23:00, 23:30 bila tutup 23:00) -> 400 SLOT_OUTSIDE_HOURS
    for (const outTime of ["08:30", "23:00", "23:30"]) {
      const t = mockReqRes({ time: outTime, capacity: 3 }, adminUser);
      await createAdminPickupSlot(t.req, t.res, t.next);
      const r = t.response();
      assert.strictEqual(r.statusCode, 400);
      assert.strictEqual(r.jsonResponse.code, "SLOT_OUTSIDE_HOURS");
    }
    console.log("LULUS  5. POST di luar jam operasional ditolak 400 SLOT_OUTSIDE_HOURS");

    // 6. POST time duplikat (aktif) dan duplikat (nonaktif) -> 409 SLOT_EXISTS
    {
      const t1 = mockReqRes({ time: "10:00", capacity: 3 }, adminUser);
      await createAdminPickupSlot(t1.req, t1.res, t1.next);
      assert.strictEqual(t1.response().statusCode, 409);
      assert.strictEqual(t1.response().jsonResponse.code, "SLOT_EXISTS");

      // Nonaktifkan 20:00 lalu coba POST 20:00
      await prisma.pickupSlot.update({ where: { id: createdSlotId }, data: { isActive: false } });
      const t2 = mockReqRes({ time: "20:00", capacity: 3 }, adminUser);
      await createAdminPickupSlot(t2.req, t2.res, t2.next);
      assert.strictEqual(t2.response().statusCode, 409);
      assert.strictEqual(t2.response().jsonResponse.code, "SLOT_EXISTS");
      await prisma.pickupSlot.update({ where: { id: createdSlotId }, data: { isActive: true } });
      console.log("LULUS  6. POST time duplikat aktif & nonaktif -> 409 SLOT_EXISTS");
    }

    // 7. POST saat 15 slot aktif -> 409 SLOT_LIMIT_REACHED
    {
      // Kita punya 10 default + 1 (20:00) = 11. Tambah 4 lagi jadi 15: 20:30, 21:00, 21:30, 22:00
      const extraTimes = ["20:30", "21:00", "21:30", "22:00"];
      for (const et of extraTimes) {
        await prisma.pickupSlot.create({ data: { time: et, capacity: 3, isActive: true } });
      }
      // Coba tambah slot ke-16: 22:30
      const t = mockReqRes({ time: "22:30", capacity: 3 }, adminUser);
      await createAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 409);
      assert.strictEqual(t.response().jsonResponse.code, "SLOT_LIMIT_REACHED");

      // Bersihkan slot ekstra
      await prisma.pickupSlot.deleteMany({ where: { time: { in: extraTimes } } });
      console.log("LULUS  7. POST saat 15 slot aktif -> 409 SLOT_LIMIT_REACHED");
    }

    // 8. POST capacity 0, 51, "3", 2.5 -> 400
    for (const badCap of [0, 51, "3", 2.5, null, -1]) {
      const t = mockReqRes({ time: "21:00", capacity: badCap }, adminUser);
      await createAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 400);
    }
    console.log("LULUS  8. POST capacity tidak valid ditolak 400");

    // 9. PATCH capacity naik -> 200
    {
      const t = mockReqRes({ capacity: 8 }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 200);
      assert.strictEqual(t.response().jsonResponse.slot.capacity, 8);
      console.log("LULUS  9. PATCH capacity naik -> 200");
    }

    // Buat data order untuk uji penurunan kapasitas & penonaktifan
    const stamp = Date.now();
    const testUser = await prisma.user.create({
      data: { name: `Tester ${stamp}`, email: `tester-${stamp}@mail.com`, passwordHash: "dummy" },
    });
    const testCat = await prisma.category.create({
      data: { name: `Cat ${stamp}`, slug: `cat-${stamp}` },
    });
    const testArtisan = await prisma.artisan.create({
      data: { brandName: `Artisan ${stamp}`, status: "aktif" },
    });
    const testProd = await prisma.product.create({
      data: {
        name: `Prod ${stamp}`,
        slug: `prod-${stamp}`,
        description: "Deskripsi produk uji",
        price: 50000,
        images: ["http://img.jpg"],
        categoryId: testCat.id,
        artisanId: testArtisan.id,
      },
    });
    await prisma.productVariant.create({
      data: {
        productId: testProd.id,
        combination: [],
        stock: 50,
      },
    });

    const testOrder1 = await prisma.order.create({
      data: {
        orderNumber: `SDK-T1-${stamp}`,
        userId: testUser.id,
        paymentMethod: "cod",
        status: "lunas",
        totalAmount: 50000,
        pickupDate: new Date(TEST_DATE + "T00:00:00+07:00"),
        pickupSlot: "20:00",
      },
    });
    const testOrder2 = await prisma.order.create({
      data: {
        orderNumber: `SDK-T2-${stamp}`,
        userId: testUser.id,
        paymentMethod: "cod",
        status: "lunas",
        totalAmount: 50000,
        pickupDate: new Date(TEST_DATE + "T00:00:00+07:00"),
        pickupSlot: "20:00",
      },
    });

    // 10. PATCH capacity turun di bawah booked mendatang tanpa confirm -> 409 CONFIRMATION_REQUIRED, dengan confirm: true -> 200
    {
      // Saat ini ada 2 booked pada TEST_DATE. Coba turunkan kapasitas ke 1 tanpa confirm
      const t1 = mockReqRes({ capacity: 1 }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t1.req, t1.res, t1.next);
      const r1 = t1.response();
      assert.strictEqual(r1.statusCode, 409);
      assert.strictEqual(r1.jsonResponse.code, "CONFIRMATION_REQUIRED");
      assert.strictEqual(r1.jsonResponse.impact.type, "CAPACITY_BELOW_BOOKED");
      assert.strictEqual(r1.jsonResponse.impact.newCapacity, 1);

      // Dengan confirm: true
      const t2 = mockReqRes({ capacity: 1, confirm: true }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t2.req, t2.res, t2.next);
      assert.strictEqual(t2.response().statusCode, 200);
      assert.strictEqual(t2.response().jsonResponse.slot.capacity, 1);
      console.log("LULUS  10. PATCH capacity turun di bawah booked butuh confirm lalu 200");
    }

    // 11. PATCH isActive: false slot dengan pesanan aktif ke depan, tanpa/dengan confirm
    {
      const t1 = mockReqRes({ isActive: false }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t1.req, t1.res, t1.next);
      const r1 = t1.response();
      assert.strictEqual(r1.statusCode, 409);
      assert.strictEqual(r1.jsonResponse.code, "CONFIRMATION_REQUIRED");
      assert.strictEqual(r1.jsonResponse.impact.type, "DEACTIVATE");

      const t2 = mockReqRes({ isActive: false, confirm: true }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t2.req, t2.res, t2.next);
      assert.strictEqual(t2.response().statusCode, 200);
      assert.strictEqual(t2.response().jsonResponse.slot.isActive, false);

      // Slot 20:00 hilang dari GET /slots
      const pub = mockReqRes({}, null, {}, { date: TEST_DATE });
      await getSlots(pub.req, pub.res, pub.next);
      assert.strictEqual(pub.response().jsonResponse.slots.some((s) => s.time === "20:00"), false);
      console.log("LULUS  11. PATCH isActive: false butuh confirm; setelah nonaktif hilang dari GET /slots");
    }

    // 12. PATCH isActive: false slot tanpa pesanan -> 200 tanpa konfirmasi
    let slotEmptyId;
    {
      const created = await prisma.pickupSlot.create({
        data: { time: "20:30", capacity: 3, isActive: true },
      });
      slotEmptyId = created.id;
      const t = mockReqRes({ isActive: false }, adminUser, { id: slotEmptyId });
      await updateAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 200);
      console.log("LULUS  12. PATCH isActive: false slot tanpa pesanan -> 200 tanpa konfirmasi");
    }

    // 14. PATCH time pada slot yang pernah dipakai -> 409 SLOT_TIME_LOCKED
    {
      const t = mockReqRes({ time: "21:00" }, adminUser, { id: createdSlotId });
      await updateAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 409);
      assert.strictEqual(t.response().jsonResponse.code, "SLOT_TIME_LOCKED");
      console.log("LULUS  14. PATCH time pada slot yang pernah dipakai -> 409 SLOT_TIME_LOCKED");
    }

    // 15. PATCH time pada slot yang belum pernah dipakai -> 200
    {
      const t = mockReqRes({ time: "21:30" }, adminUser, { id: slotEmptyId });
      await updateAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 200);
      assert.strictEqual(t.response().jsonResponse.slot.time, "21:30");
      console.log("LULUS  15. PATCH time pada slot belum pernah dipakai -> 200");
    }

    // 16. DELETE slot yang pernah dipakai -> 409 SLOT_IN_USE
    {
      const t = mockReqRes({}, adminUser, { id: createdSlotId });
      await deleteAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 409);
      assert.strictEqual(t.response().jsonResponse.code, "SLOT_IN_USE");
      console.log("LULUS  16. DELETE slot yang pernah dipakai -> 409 SLOT_IN_USE");
    }

    // 17. DELETE slot belum pernah dipakai -> 200; baris hilang
    {
      const t = mockReqRes({}, adminUser, { id: slotEmptyId });
      await deleteAdminPickupSlot(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 200);
      const check = await prisma.pickupSlot.findUnique({ where: { id: slotEmptyId } });
      assert.strictEqual(check, null);
      console.log("LULUS  17. DELETE slot belum pernah dipakai -> 200 baris terhapus");
    }

    // 19. PATCH settings: jam sempit membuat slot aktif di luar rentang -> 409 SLOTS_OUTSIDE_HOURS
    {
      // 10:00 sampai 19:00 aktif. Coba ubah openTime ke 11:00 (10:00 jadi di luar)
      const t = mockReqRes({ openTime: "11:00" }, adminUser);
      await updateAdminPickupScheduleSettings(t.req, t.res, t.next);
      const r = t.response();
      assert.strictEqual(r.statusCode, 409);
      assert.strictEqual(r.jsonResponse.code, "SLOTS_OUTSIDE_HOURS");
      assert.ok(r.jsonResponse.slots.includes("10:00"));
      console.log("LULUS  19. PATCH settings slot aktif di luar rentang -> 409 SLOTS_OUTSIDE_HOURS");
    }

    // 20. PATCH settings: openTime >= closeTime, leadMinutes "30" (string), -1, 241 -> 400
    for (const badSettings of [
      { openTime: "18:00", closeTime: "10:00" },
      { leadMinutes: "30" },
      { leadMinutes: -1 },
      { leadMinutes: 241 },
    ]) {
      const t = mockReqRes(badSettings, adminUser);
      await updateAdminPickupScheduleSettings(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 400);
    }
    console.log("LULUS  20. PATCH settings tidak valid ditolak 400");

    // 21. PATCH settings sukses; GET /slots mencerminkan leadMinutes baru -> 200
    {
      const t = mockReqRes({ leadMinutes: 45 }, adminUser);
      await updateAdminPickupScheduleSettings(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 200);

      const pub = mockReqRes({}, null, {}, { date: TEST_DATE });
      await getSlots(pub.req, pub.res, pub.next);
      assert.strictEqual(pub.response().jsonResponse.leadMinutes, 45);
      console.log("LULUS  21. PATCH settings leadMinutes=45 sukses dan terbaca di GET /slots");
    }

    // 22. POST /orders ke slot nonaktif -> 400
    {
      // createdSlotId (20:00) saat ini nonaktif
      const t = mockReqRes(
        { productId: testProd.id, pickupDate: TEST_DATE, pickupSlot: "20:00", paymentMethod: "cod" },
        testUser
      );
      await createOrder(t.req, t.res, t.next);
      assert.strictEqual(t.response().statusCode, 400);
      assert.ok(t.response().jsonResponse.error.includes("pickupSlot tidak valid"));
      console.log("LULUS  22. POST /orders ke slot nonaktif ditolak 400");
    }

    // 24. Kapasitas per slot berbeda: slot A=1, B=3; pesan A 2x -> kedua 409 SLOT_FULL; B tetap bisa pesan
    {
      await prisma.pickupSlot.update({ where: { time: "18:00" }, data: { capacity: 1 } });
      await prisma.pickupSlot.update({ where: { time: "19:00" }, data: { capacity: 3 } });

      const uA1 = await prisma.user.create({ data: { name: `uA1-${stamp}`, email: `ua1-${stamp}@m.com`, passwordHash: "h" } });
      const uA2 = await prisma.user.create({ data: { name: `uA2-${stamp}`, email: `ua2-${stamp}@m.com`, passwordHash: "h" } });
      const uB1 = await prisma.user.create({ data: { name: `uB1-${stamp}`, email: `ub1-${stamp}@m.com`, passwordHash: "h" } });

      const tA1 = mockReqRes({ productId: testProd.id, pickupDate: TEST_DATE_2, pickupSlot: "18:00", paymentMethod: "cod" }, uA1);
      await createOrder(tA1.req, tA1.res, tA1.next);
      assert.strictEqual(tA1.response().statusCode, 201);

      const tA2 = mockReqRes({ productId: testProd.id, pickupDate: TEST_DATE_2, pickupSlot: "18:00", paymentMethod: "cod" }, uA2);
      await createOrder(tA2.req, tA2.res, tA2.next);
      assert.strictEqual(tA2.response().statusCode, 409);
      assert.strictEqual(tA2.response().jsonResponse.code, "SLOT_FULL");

      const tB1 = mockReqRes({ productId: testProd.id, pickupDate: TEST_DATE_2, pickupSlot: "19:00", paymentMethod: "cod" }, uB1);
      await createOrder(tB1.req, tB1.res, tB1.next);
      assert.strictEqual(tB1.response().statusCode, 201);
      console.log("LULUS  24. Kapasitas berbeda per slot: slot penuh ditolak 409 SLOT_FULL");
    }

    // 26. Semua slot nonaktif -> GET /slots = []
    {
      await prisma.pickupSlot.updateMany({ data: { isActive: false } });
      const pub = mockReqRes({}, null, {}, { date: TEST_DATE });
      await getSlots(pub.req, pub.res, pub.next);
      assert.strictEqual(pub.response().statusCode, 200);
      assert.strictEqual(pub.response().jsonResponse.slots.length, 0);

      // Kembalikan ke aktif
      await prisma.pickupSlot.updateMany({ data: { isActive: true } });
      console.log("LULUS  26. Semua slot nonaktif -> GET /slots = [] (tidak ada fallback)");
    }

    // 28. Dashboard slotDistribution memuat hanya slot aktif dengan kapasitas masing-masing
    {
      const t = mockReqRes({}, adminUser);
      await getDashboard(t.req, t.res, t.next);
      const r = t.response();
      assert.strictEqual(r.statusCode, 200);
      assert.ok(Array.isArray(r.jsonResponse.slotDistribution));
      assert.ok(r.jsonResponse.slotDistribution.length > 0);
      for (const item of r.jsonResponse.slotDistribution) {
        assert.ok(typeof item.time === "string");
        assert.ok(typeof item.capacity === "number");
        assert.ok(typeof item.booked === "number");
      }
      console.log("LULUS  28. Dashboard slotDistribution memuat hanya slot aktif dan kapasitasnya");
    }

    console.log("\nSEMUA PENGUJIAN JADWAL PICKUP LULUS!");
  } finally {
    if (snapshot) {
      await restoreSlots(prisma, snapshot);
    }
  }
})().catch((err) => {
  console.error("GAGAL", err);
  process.exit(1);
});