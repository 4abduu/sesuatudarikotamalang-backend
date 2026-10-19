import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getPickupSlots, getSlotCapacity } from "../lib/slots";
import { toWibDateString } from "../lib/dates";

/**
 * GET /api/slots?date=YYYY-MM-DD
 * Publik: mengembalikan ketersediaan slot pickup untuk tanggal tertentu.
 * Response: { slots: [{ time, capacity, booked, available }] }
 */
export const getSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Parameter date wajib berformat YYYY-MM-DD" });
    }

    const dateString = toWibDateString(date);
    if (!dateString) {
      return res.status(400).json({ error: "Parameter date wajib berformat YYYY-MM-DD" });
    }

    // Parse tanggal sebagai WIB (UTC+7)
    const dayStart = new Date(dateString + "T00:00:00+07:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);

    // Ambil setting autoCancelEnabled
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

    // Hitung order yang menempati slot pada tanggal tersebut
    // Termasuk: lunas, selesai, dan menunggu_bayar
    const now = new Date();
    const activeConditions: any[] = [
      { status: "lunas" },
      { status: "selesai" },
      {
        status: "menunggu_bayar",
        paymentMethod: "midtrans",
        holdExpiresAt: { gt: now },
      },
    ];

    if (autoCancelEnabled) {
      activeConditions.push({
        status: "menunggu_bayar",
        paymentMethod: "cod",
        holdExpiresAt: { gt: now },
      });
    } else {
      activeConditions.push({
        status: "menunggu_bayar",
        paymentMethod: "cod",
      });
    }

    const slotCounts = await prisma.order.groupBy({
      by: ["pickupSlot"],
      where: {
        pickupDate: { gte: dayStart, lte: dayEnd },
        OR: activeConditions,
      },
      _count: { _all: true },
    });

    const countMap: Record<string, number> = {};
    for (const row of slotCounts) {
      countMap[row.pickupSlot] = row._count._all;
    }

    const allSlots = getPickupSlots();
    const capacity = getSlotCapacity();

    const slots = allSlots.map((time) => {
      const booked = countMap[time] || 0;
      return {
        time,
        capacity,
        booked,
        available: Math.max(0, capacity - booked),
      };
    });

    res.json({ date: dateString, slots });
  } catch (err) {
    next(err);
  }
};

export default { getSlots };
