import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getPickupSlots, getSlotCapacity } from "../lib/slots";

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

    // Parse tanggal sebagai WIB (UTC+7)
    const dayStart = new Date(date + "T00:00:00+07:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);

    // Hitung order yang menempati slot pada tanggal tersebut
    // Termasuk: menunggu_bayar (yang hold masih hidup), lunas, selesai
    const now = new Date();
    const slotCounts = await prisma.order.groupBy({
      by: ["pickupSlot"],
      where: {
        pickupDate: { gte: dayStart, lte: dayEnd },
        OR: [
          { status: "lunas" },
          { status: "selesai" },
          {
            status: "menunggu_bayar",
            holdExpiresAt: { gt: now },
          },
        ],
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

    res.json({ slots });
  } catch (err) {
    next(err);
  }
};

export default { getSlots };
