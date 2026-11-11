require("./helpers/requireTestDb")();
const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const notifications = require("../dist/dal/notifications");

(async () => {
  const stamp = Date.now();
  const a = await prisma.user.create({ data: { name: `Notif A ${stamp}`, email: `notif-a-${stamp}@test.local`, passwordHash: "test" } });
  const b = await prisma.user.create({ data: { name: `Notif B ${stamp}`, email: `notif-b-${stamp}@test.local`, passwordHash: "test" } });
  try {
    await prisma.notification.createMany({ data: [{ userId: a.id, type: "umum", title: "A1", body: "satu" }, { userId: a.id, type: "umum", title: "A2", body: "dua" }, { userId: b.id, type: "umum", title: "B1", body: "tiga" }] });
    const page = await notifications.listMyNotifications({ id: a.id, role: "buyer" }, { page: 2, limit: 1 });
    assert.strictEqual(page.total, 2);
    assert.strictEqual(page.unreadCount, 2);
    const other = await prisma.notification.findFirst({ where: { userId: b.id } });
    await assert.rejects(() => notifications.deleteMyNotification({ id: a.id, role: "buyer" }, other.id), (error) => error.code === "NOT_FOUND");
    const deleted = await notifications.deleteAllMyNotifications({ id: a.id, role: "buyer" });
    assert.strictEqual(deleted.count, 2);
    assert.strictEqual(await prisma.notification.count({ where: { userId: b.id } }), 1);
    console.log("LULUS isolasi hapus dan pagination notifikasi");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
})().catch((error) => { console.error("GAGAL", error); process.exit(1); });
