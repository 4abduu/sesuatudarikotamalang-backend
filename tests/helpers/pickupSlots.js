/**
 * Helper untuk tes yang membutuhkan pengaturan pickup_slots & AppSettings jam operasional.
 */
async function snapshotSlots(prisma) {
  const slots = await prisma.pickupSlot.findMany({ orderBy: { time: "asc" } });
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  return {
    slots,
    settings: {
      pickupOpenTime: settings?.pickupOpenTime || "09:00",
      pickupCloseTime: settings?.pickupCloseTime || "23:00",
      pickupLeadMinutes: settings?.pickupLeadMinutes ?? 30,
    },
  };
}

async function restoreSlots(prisma, snapshot) {
  if (!snapshot) return;

  // Hapus semua slot saat ini
  await prisma.pickupSlot.deleteMany();

  // Kembalikan slot dari snapshot
  if (snapshot.slots && snapshot.slots.length > 0) {
    for (const s of snapshot.slots) {
      await prisma.pickupSlot.create({
        data: {
          id: s.id,
          time: s.time,
          capacity: s.capacity,
          isActive: s.isActive,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        },
      });
    }
  }

  // Kembalikan settings
  if (snapshot.settings) {
    await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        pickupOpenTime: snapshot.settings.pickupOpenTime,
        pickupCloseTime: snapshot.settings.pickupCloseTime,
        pickupLeadMinutes: snapshot.settings.pickupLeadMinutes,
      },
      update: {
        pickupOpenTime: snapshot.settings.pickupOpenTime,
        pickupCloseTime: snapshot.settings.pickupCloseTime,
        pickupLeadMinutes: snapshot.settings.pickupLeadMinutes,
      },
    });
  }
}

async function setAllCapacity(prisma, n) {
  await ensureDefaultSlots(prisma);
  await prisma.pickupSlot.updateMany({
    data: { capacity: n },
  });
}

async function ensureDefaultSlots(prisma) {
  const count = await prisma.pickupSlot.count();
  if (count === 0) {
    const defaultTimes = [
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
    ];
    for (const time of defaultTimes) {
      await prisma.pickupSlot.create({
        data: {
          time,
          capacity: 3,
          isActive: true,
        },
      });
    }
  }
}

module.exports = {
  snapshotSlots,
  restoreSlots,
  setAllCapacity,
  ensureDefaultSlots,
};
