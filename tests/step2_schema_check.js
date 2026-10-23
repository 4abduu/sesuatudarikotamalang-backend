require("./helpers/requireTestDb")();

const assert = require("assert");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TAG = "STEP2-TEST";
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log("PASS  " + name);
  } catch (err) {
    failed++;
    console.error("FAIL  " + name + "\n      " + err.message);
  }
}

async function main() {
  assert(
    /_test(\?.*)?$/.test(process.env.DATABASE_URL || ""),
    "DATABASE_URL harus berakhiran _test"
  );

  // Bersihkan sisa dari run yang gagal sebelumnya
  await prisma.appSettings.deleteMany({ where: { id: 9999 } });
  await prisma.artisan.deleteMany({ where: { brandName: { startsWith: TAG } } });

  await check("AppSettings baru: hold 1440 menit dan refundWindowDays 3", async () => {
    const row = await prisma.appSettings.create({ data: { id: 9999 } });
    try {
      assert.strictEqual(row.holdDurationMinutes, 1440);
      assert.strictEqual(row.refundWindowDays, 3);
    } finally {
      await prisma.appSettings.delete({ where: { id: 9999 } });
    }
  });

  await check("Artisan: isOfficial default false, official tanpa userId diperbolehkan", async () => {
    const official = await prisma.artisan.create({
      data: { brandName: TAG + " Official", isOfficial: true },
    });
    const biasa = await prisma.artisan.create({ data: { brandName: TAG + " Biasa" } });
    try {
      assert.strictEqual(official.isOfficial, true);
      assert.strictEqual(official.userId, null);
      assert.strictEqual(biasa.isOfficial, false);
      const found = await prisma.artisan.findMany({
        where: { isOfficial: true, brandName: { startsWith: TAG } },
      });
      assert.strictEqual(found.length, 1);
    } finally {
      await prisma.artisan.deleteMany({ where: { brandName: { startsWith: TAG } } });
    }
  });

  await check("Order: refundStatus default tidak_ada, refundedAt dan cancelReason null, enum ditolak bila salah", async () => {
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: { name: TAG, email: "step2-test-" + stamp + "@example.test" },
    });
    let orderId = null;
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: "T2-" + String(stamp).slice(-8),
          userId: user.id,
          paymentMethod: "midtrans",
          totalAmount: 1000,
          pickupDate: new Date(),
          pickupSlot: "10:00",
        },
      });
      orderId = order.id;
      assert.strictEqual(order.refundStatus, "tidak_ada");
      assert.strictEqual(order.refundedAt, null);
      assert.strictEqual(order.cancelReason, null);

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { refundStatus: "menunggu", cancelReason: "kesalahan_toko" },
      });
      assert.strictEqual(updated.refundStatus, "menunggu");
      assert.strictEqual(updated.cancelReason, "kesalahan_toko");

      const waiting = await prisma.order.findMany({
        where: { refundStatus: "menunggu", userId: user.id },
      });
      assert.strictEqual(waiting.length, 1);

      const done = await prisma.order.update({
        where: { id: orderId },
        data: { refundStatus: "selesai", refundedAt: new Date() },
      });
      assert.strictEqual(done.refundStatus, "selesai");
      assert(done.refundedAt instanceof Date);

      await assert.rejects(
        () => prisma.order.update({ where: { id: orderId }, data: { cancelReason: "bebas" } }),
        "nilai cancelReason di luar enum harus ditolak"
      );
    } finally {
      if (orderId) await prisma.order.delete({ where: { id: orderId } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  console.log(failed === 0 ? "\nSEMUA LULUS" : "\n" + failed + " TES GAGAL");
}

main()
  .catch((err) => {
    failed++;
    console.error(err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });