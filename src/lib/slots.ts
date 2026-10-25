/**
 * A8: Konfigurasi slot pickup dari environment variable.
 * Default: 10:00, 11:00, 13:00, 15:00, 17:00 — kapasitas 3 per slot.
 * Jeda minimal pemesanan sebelum jam slot: env PICKUP_LEAD_MINUTES (default 30 menit).
 */

const WIB_OFFSET = "+07:00";

/**
 * Daftar slot waktu pickup dari env PICKUP_SLOTS (comma-separated).
 * Contoh env: PICKUP_SLOTS="10:00,11:00,13:00,15:00,17:00"
 */
export function getPickupSlots(): string[] {
  const raw = process.env.PICKUP_SLOTS;
  if (raw && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["10:00", "11:00", "13:00", "15:00", "17:00"];
}

/**
 * Kapasitas per slot dari env SLOT_CAPACITY (angka bulat).
 */
export function getSlotCapacity(): number {
  const raw = process.env.SLOT_CAPACITY;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 3;
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
 * Jeda minimal (menit) antara waktu pemesanan dan jam mulai slot, dari env PICKUP_LEAD_MINUTES.
 * Default 30. Nilai bukan bilangan bulat 0 sampai 1440 memakai default; 0 berarti tanpa jeda.
 */
export function getPickupLeadMinutes(): number {
  const raw = process.env.PICKUP_LEAD_MINUTES;
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 1440) return n;
  }
  return 30;
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
 * slot (atau jam mulai sudah terlewati). Contoh jeda 30 menit: slot 10:00 bisa dipesan sampai 09:29:59.
 * `isSlotPassed` (jam mulai sudah lewat) selalu implikasi `isSlotClosed`.
 * Slot berformat tidak dikenali dianggap belum ditutup.
 */
export function isSlotClosed(
  dateString: string,
  slot: string,
  now: number | Date = Date.now(),
  leadMinutes: number = getPickupLeadMinutes()
): boolean {
  const start = slotStartTime(dateString, slot);
  if (!start) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs >= start.getTime() - leadMinutes * 60000;
}