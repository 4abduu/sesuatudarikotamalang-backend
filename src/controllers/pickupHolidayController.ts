import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { todayWibString, toWibDateString } from "../lib/dates";
import { affectedOrdersForDates, dateRange, holidayInfoFor, loadHolidayContext, parseDateRange } from "../lib/holidays";

function dateToDbDate(date: string): Date { return new Date(`${date}T00:00:00Z`); }

function validateWeekly(body: any): { enabled: boolean; days: number[] } | null {
  if (typeof body?.enabled !== "boolean" || !Array.isArray(body.days)) return null;
  const days: number[] = body.days.filter((day: unknown): day is number => Number.isInteger(day));
  if (body.enabled && (days.length < 1 || days.length > 3 || new Set(days).size !== days.length || days.some((day) => day < 1 || day > 7))) return null;
  return { enabled: body.enabled, days: body.enabled ? days : [] };
}

async function notifyAffected(orderDates: Array<{ date: string; count: number }>, client: any, reasonForDate: (date: string) => string) {
  if (orderDates.length === 0) return;
  const dateSet = new Set(orderDates.map((item) => item.date));
  const orders = await client.order.findMany({
    where: { status: { in: ["menunggu_bayar", "lunas"] }, pickupDate: { gte: dateToDbDate(todayWibString()) } },
    select: { id: true, userId: true, orderNumber: true, pickupDate: true },
  });
  for (const order of orders) {
    const date = order.pickupDate.toISOString().slice(0, 10);
    if (!dateSet.has(date)) continue;
    await client.notification.create({
      data: {
        userId: order.userId,
        type: "libur_terdampak",
        title: "Jadwal Pickup Terdampak Libur",
        body: `Pickup pesanan ${order.orderNumber} jatuh pada tanggal libur (${reasonForDate(date)}). Pesanan tetap dapat diambil kapan saja saat toko buka. Admin akan menghubungi lewat WhatsApp.`,
      },
    });
  }
}

export const getPublicHolidays = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ error: "from dan to harus berupa tanggal YYYY-MM-DD yang valid", code: "VALIDATION_ERROR" });
    const context = await loadHolidayContext(prisma, range.from, range.to);
    res.json({ weeklyOff: { enabled: context.weeklyEnabled, days: context.weeklyDays }, holidays: context.holidays });
  } catch (err) { next(err); }
};

export const listAdminHolidays = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const today = todayWibString();
    const holidays = await prisma.pickupHoliday.findMany({ where: { endDate: { gte: dateToDbDate(today) } }, orderBy: { startDate: "asc" } });
    const mapped = await Promise.all(holidays.map(async (holiday) => {
      const dates = dateRange(holiday.startDate.toISOString().slice(0, 10), holiday.endDate.toISOString().slice(0, 10));
      const affectedOrders = (await affectedOrdersForDates(dates)).reduce((sum, item) => sum + item.count, 0);
      return { id: holiday.id, startDate: holiday.startDate.toISOString().slice(0, 10), endDate: holiday.endDate.toISOString().slice(0, 10), reason: holiday.reason, affectedOrders, createdAt: holiday.createdAt };
    }));
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    res.json({ weeklyOff: { enabled: settings?.weeklyOffEnabled ?? false, days: Array.isArray(settings?.weeklyOffDays) ? settings?.weeklyOffDays : [] }, holidays: mapped });
  } catch (err) { next(err); }
};

export const updateWeeklyHolidays = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const weekly = validateWeekly(req.body);
    if (!weekly) return res.status(400).json({ error: "enabled harus boolean dan days berisi 1 sampai 3 hari ISO yang unik", code: "VALIDATION_ERROR" });
    const oldContext = await loadHolidayContext(prisma);
    const today = todayWibString();
    const dates = dateRange(today, (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 90); return d.toISOString().slice(0, 10); })());
    const newlyClosed = weekly.enabled ? dates.filter((date) => weekly.days.includes(Number(new Date(`${date}T00:00:00Z`).getUTCDay() || 7)) && !holidayInfoFor(date, oldContext)) : [];
    const impact = await affectedOrdersForDates(newlyClosed);
    if (impact.length > 0 && req.body.confirm !== true) return res.status(409).json({ error: "Perubahan libur mingguan berdampak pada pesanan aktif. Konfirmasi untuk melanjutkan.", code: "CONFIRMATION_REQUIRED", impact: { affectedOrders: impact.reduce((s, x) => s + x.count, 0), dates: impact } });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      const result = await tx.appSettings.update({ where: { id: 1 }, data: { weeklyOffEnabled: weekly.enabled, ...(weekly.enabled ? { weeklyOffDays: weekly.days } : {}) } });
      if (impact.length > 0) await notifyAffected(impact, tx, (date) => holidayInfoFor(date, { weeklyEnabled: weekly.enabled, weeklyDays: weekly.days, holidays: [] })?.reason || "Libur mingguan");
      return result;
    });
    res.json({ message: "Libur mingguan berhasil diperbarui", weeklyOff: { enabled: updated.weeklyOffEnabled, days: Array.isArray(updated.weeklyOffDays) ? updated.weeklyOffDays : [] } });
  } catch (err) { next(err); }
};

export const createHoliday = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = toWibDateString(req.body?.startDate);
    const endDate = req.body?.endDate === undefined || req.body?.endDate === null || req.body?.endDate === "" ? startDate : toWibDateString(req.body.endDate);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!startDate || !endDate || startDate < todayWibString() || endDate < startDate || endDate > (() => { const d = new Date(`${startDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })() || reason.length < 3 || reason.length > 120) return res.status(400).json({ error: "Tanggal libur atau alasan tidak valid", code: "VALIDATION_ERROR" });
    const overlap = await prisma.pickupHoliday.findFirst({ where: { startDate: { lte: dateToDbDate(endDate) }, endDate: { gte: dateToDbDate(startDate) } } });
    if (overlap) return res.status(409).json({ error: "Jadwal libur beririsan dengan jadwal lain", code: "HOLIDAY_OVERLAP" });
    const context = await loadHolidayContext(prisma, startDate, endDate);
    const dates = dateRange(startDate, endDate).filter((date) => !holidayInfoFor(date, context));
    const impact = await affectedOrdersForDates(dates);
    if (impact.length > 0 && req.body.confirm !== true) return res.status(409).json({ error: "Jadwal libur berdampak pada pesanan aktif. Konfirmasi untuk melanjutkan.", code: "CONFIRMATION_REQUIRED", impact: { affectedOrders: impact.reduce((s, x) => s + x.count, 0), dates: impact } });
    const holiday = await prisma.$transaction(async (tx) => {
      const created = await tx.pickupHoliday.create({ data: { startDate: dateToDbDate(startDate), endDate: dateToDbDate(endDate), reason, createdById: req.user?.id } });
      if (impact.length > 0) await notifyAffected(impact, tx, () => reason);
      return created;
    });
    res.status(201).json({ message: "Jadwal libur pickup berhasil ditambahkan", holiday: { ...holiday, startDate, endDate } });
  } catch (err) { next(err); }
};

export const deleteHoliday = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.pickupHoliday.deleteMany({ where: { id: req.params.id } });
    if (result.count === 0) throw new HttpError(404, "Jadwal libur tidak ditemukan", "NOT_FOUND");
    res.json({ message: "Jadwal libur pickup berhasil dihapus" });
  } catch (err) { next(err); }
};

export default { getPublicHolidays, listAdminHolidays, updateWeeklyHolidays, createHoliday, deleteHoliday };
