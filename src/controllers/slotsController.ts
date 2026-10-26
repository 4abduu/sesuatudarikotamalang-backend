import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getPickupConfig, slotBookingWhere, isSlotPassed, isSlotClosed } from "../lib/slots";
import { toWibDateString } from "../lib/dates";

/**
 * GET /api/slots?date=YYYY-MM-DD
 * Publik: mengembalikan ketersediaan slot pickup untuk tanggal tertentu.
 * Response: { date, serverNow, leadMinutes, slots: [{ time, capacity, booked, available, isPast, isClosed, bookable }] }
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

    const config = await getPickupConfig();
    const activeSlots = config.slots.filter((s) => s.isActive);

    const now = new Date();

    // Bila tidak ada slot aktif: slots: [] (200, bukan error)
    if (activeSlots.length === 0) {
      return res.json({
        date: dateString,
        serverNow: now.toISOString(),
        leadMinutes: config.leadMinutes,
        slots: [],
      });
    }

    // Ambil setting autoCancelEnabled
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

    const slotCounts = await prisma.order.groupBy({
      by: ["pickupSlot"],
      where: {
        pickupDate: { gte: dayStart, lte: dayEnd },
        OR: slotBookingWhere(autoCancelEnabled, now),
      },
      _count: { _all: true },
    });

    const countMap: Record<string, number> = {};
    for (const row of slotCounts) {
      countMap[row.pickupSlot] = row._count._all;
    }

    const slots = activeSlots.map((s) => {
      const booked = countMap[s.time] || 0;
      const available = Math.max(0, s.capacity - booked);
      const isPast = isSlotPassed(dateString, s.time, now);
      const isClosed = isSlotClosed(dateString, s.time, now, config.leadMinutes);
      return {
        time: s.time,
        capacity: s.capacity,
        booked,
        available,
        isPast,
        isClosed,
        bookable: !isClosed && available > 0,
      };
    });

    res.json({
      date: dateString,
      serverNow: now.toISOString(),
      leadMinutes: config.leadMinutes,
      slots,
    });
  } catch (err) {
    next(err);
  }
};

export default { getSlots };