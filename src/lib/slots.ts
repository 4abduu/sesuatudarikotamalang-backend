import { PrismaClient, Prisma } from "@prisma/client";
import prisma from "./prisma";

export const SLOT_STEP_MINUTES = 30;
export const MAX_ACTIVE_SLOTS = 15;
export const MIN_SLOT_CAPACITY = 1;
export const MAX_SLOT_CAPACITY = 50;
export const MAX_LEAD_MINUTES = 240;

const WIB_OFFSET = "+07:00";

export type SlotConfig = {
  id: string | null;
  time: string;
  capacity: number;
  isActive: boolean;
};

export type PickupConfig = {
  source: "database" | "fallback";
  openTime: string;
  closeTime: string;
  leadMinutes: number;
  slots: SlotConfig[]; // terurut naik menurut time
};

/**
 * Validasi format jam "HH:MM", dua digit, menit 00 atau 30.
 */
export function isValidSlotTime(time: unknown): time is string {
  if (typeof time !== "string") return false;
  return /^([01]\d|2[0-3]):(00|30)$/.test(time.trim());
}

/**
 * Memeriksa apakah time berada di rentang [openTime, closeTime)
 * openTime <= time < closeTime
 */
export function isWithinHours(time: string, openTime: string, closeTime: string): boolean {
  return time >= openTime && time < closeTime;
}

/**
 * Cadangan: PICKUP_SLOTS dan SLOT_CAPACITY dari .env;
 * bila kosong, 10 slot bawaan (10:00..19:00) kapasitas 3
 */
export function fallbackSlots(): SlotConfig[] {
  const envSlots = process.env.PICKUP_SLOTS;
  const envCap = process.env.SLOT_CAPACITY;

  let capacity = 3;
  if (envCap) {
    const n = parseInt(envCap, 10);
    if (!isNaN(n) && n >= MIN_SLOT_CAPACITY && n <= MAX_SLOT_CAPACITY) {
      capacity = n;
    }
  }

  let times: string[] = [];
  if (envSlots && envSlots.trim()) {
    times = envSlots
      .split(",")
      .map((s) => s.trim())
      .filter((s) => isValidSlotTime(s));
  }

  if (times.length === 0) {
    times = [
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
  }

  // Hilangkan duplikat dan urutkan
  const uniqueTimes = Array.from(new Set(times)).sort();
  return uniqueTimes.map((time) => ({
    id: null,
    time,
    capacity,
    isActive: true,
  }));
}

/**
 * Mengambil konfigurasi jadwal pickup dari database.
 * Bila tabel pickup_slots memiliki 0 baris, source = "fallback".
 * Bila tabel memiliki baris (walau semua nonaktif), source = "database".
 */
export async function getPickupConfig(client: any = prisma): Promise<PickupConfig> {
  const settings = await client.appSettings.findUnique({ where: { id: 1 } });
  const openTime = settings?.pickupOpenTime || "09:00";
  const closeTime = settings?.pickupCloseTime || "23:00";
  const leadMinutes = settings?.pickupLeadMinutes ?? 30;

  const dbSlots = await client.pickupSlot.findMany({
    orderBy: { time: "asc" },
  });

  if (dbSlots.length === 0) {
    return {
      source: "fallback",
      openTime,
      closeTime,
      leadMinutes,
      slots: fallbackSlots(),
    };
  }

  return {
    source: "database",
    openTime,
    closeTime,
    leadMinutes,
    slots: dbSlots.map((s: any) => ({
      id: s.id,
      time: s.time,
      capacity: s.capacity,
      isActive: s.isActive,
    })),
  };
}

/**
 * Kondisi Prisma untuk pesanan yang MENGHITUNG kapasitas slot (satu sumber untuk semua pemakai).
 */
export function slotBookingWhere(autoCancelEnabled: boolean, now: Date): Prisma.OrderWhereInput[] {
  const conditions: Prisma.OrderWhereInput[] = [
    { status: "lunas" },
    { status: "selesai" },
    {
      status: "menunggu_bayar",
      paymentMethod: "midtrans",
      holdExpiresAt: { gt: now },
    },
  ];

  if (autoCancelEnabled) {
    conditions.push({
      status: "menunggu_bayar",
      paymentMethod: "cod",
      holdExpiresAt: { gt: now },
    });
  } else {
    conditions.push({
      status: "menunggu_bayar",
      paymentMethod: "cod",
    });
  }

  return conditions;
}

/**
 * Waktu mulai slot pada tanggal tertentu (zona WIB).
 * `dateString` berformat YYYY-MM-DD (tanggal kalender WIB). `slot` berformat "HH:MM"
 * (slot berbentuk rentang seperti "10:00-12:00" memakai jam mulainya).
 * Mengembalikan null bila format slot tidak dikenali.
 */
export function slotStartTime(dateString: string, slot: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const start = new Date(`${dateString}T${String(hour).padStart(2, "0")}:${match[2]}:00${WIB_OFFSET}`);
  return Number.isNaN(start.getTime()) ? null : start;
}

/**
 * True bila waktu sekarang sudah mencapai atau melewati jam mulai slot pada tanggal itu.
 * Slot pada tanggal yang sudah lewat selalu dianggap lewat; tanggal mendatang tidak pernah.
 * Slot berformat tidak dikenali dianggap belum lewat (tidak memblokir pemesanan).
 */
export function isSlotPassed(dateString: string, slot: string, now: number | Date = Date.now()): boolean {
  const start = slotStartTime(dateString, slot);
  if (!start) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs >= start.getTime();
}

/**
 * True bila pemesanan slot sudah DITUTUP: waktu sekarang sudah masuk jeda minimal sebelum jam mulai
 * slot (atau jam mulai sudah terlewati).
 * `leadMinutes` adalah parameter wajib tanpa fallback env.
 */
export function isSlotClosed(
  dateString: string,
  slot: string,
  now: number | Date,
  leadMinutes: number,
): boolean {
  const start = slotStartTime(dateString, slot);
  if (!start) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs >= start.getTime() - leadMinutes * 60000;
}