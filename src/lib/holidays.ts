import { PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { todayWibString, toWibDateString } from "./dates";

const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export type HolidayInfo = { weekly: boolean; reason: string };
export type HolidayContext = {
  weeklyEnabled: boolean;
  weeklyDays: number[];
  holidays: Array<{ startDate: string; endDate: string; reason: string }>;
};

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoWeekday(dateString: string): number {
  const day = new Date(`${dateString}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weeklyHolidayReason(day: number): string {
  return `Libur mingguan (${DAY_NAMES[day - 1] || "Tidak diketahui"})`;
}

export function holidayInfoFor(dateString: string, context: HolidayContext): HolidayInfo | null {
  const special = context.holidays.find((holiday) => holiday.startDate <= dateString && holiday.endDate >= dateString);
  if (special) return { weekly: false, reason: special.reason };
  const weekday = isoWeekday(dateString);
  if (context.weeklyEnabled && context.weeklyDays.includes(weekday)) {
    return { weekly: true, reason: weeklyHolidayReason(weekday) };
  }
  return null;
}

export async function loadHolidayContext(
  client: PrismaClient | any = prisma,
  from = todayWibString(),
  to = addDays(from, 90),
): Promise<HolidayContext> {
  const settings = await client.appSettings.findUnique({ where: { id: 1 } });
  const rows = await client.pickupHoliday.findMany({
    where: {
      startDate: { lte: new Date(`${to}T00:00:00Z`) },
      endDate: { gte: new Date(`${from}T00:00:00Z`) },
    },
    orderBy: { startDate: "asc" },
  });
  return {
    weeklyEnabled: settings?.weeklyOffEnabled ?? false,
    weeklyDays: Array.isArray(settings?.weeklyOffDays)
      ? (settings.weeklyOffDays as unknown[]).filter((day): day is number => Number.isInteger(day))
      : [],
    holidays: rows.map((row: any) => ({
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      reason: row.reason,
    })),
  };
}

export function dateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  for (let current = startDate; current <= endDate; current = addDays(current, 1)) result.push(current);
  return result;
}

export async function affectedOrdersForDates(
  dates: string[],
  client: PrismaClient | any = prisma,
): Promise<Array<{ date: string; count: number }>> {
  if (dates.length === 0) return [];
  const today = todayWibString();
  const rows = await client.order.findMany({
    where: {
      status: { in: ["menunggu_bayar", "lunas"] },
      pickupDate: { gte: new Date(`${today}T00:00:00Z`) },
    },
    select: { pickupDate: true },
  });
  const allowed = new Set(dates);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.pickupDate.toISOString().slice(0, 10);
    if (allowed.has(date)) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

export async function addHolidayFields<T extends { pickupDate: Date; status: string }>(orders: T[], client: PrismaClient | any = prisma): Promise<Array<T & { affectedByHoliday: boolean; holidayInfo: HolidayInfo | null }>> {
  if (orders.length === 0) return [];
  const dates = orders.map((order) => order.pickupDate.toISOString().slice(0, 10));
  const context = await loadHolidayContext(client, todayWibString(), dates.sort().at(-1) || todayWibString());
  return orders.map((order) => {
    const info = holidayInfoFor(order.pickupDate.toISOString().slice(0, 10), context);
    return {
      ...order,
      affectedByHoliday: (order.status === "menunggu_bayar" || order.status === "lunas") && info !== null,
      holidayInfo: info,
    };
  });
}

export function parseDateRange(from: unknown, to: unknown): { from: string; to: string } | null {
  const start = from === undefined ? todayWibString() : toWibDateString(from);
  const end = to === undefined ? addDays(start || todayWibString(), 90) : toWibDateString(to);
  if (!start || !end || start > end) return null;
  return { from: start, to: end };
}

