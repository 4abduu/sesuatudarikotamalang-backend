/**
 * A8: Konfigurasi slot pickup dari environment variable.
 * Default: 10:00, 11:00, 13:00, 15:00, 17:00 — kapasitas 3 per slot.
 */

/**
 * Daftar slot waktu pickup dari env PICKUP_SLOTS (comma-separated).
 * Contoh env: PICKUP_SLOTS="10:00,11:00,13:00,15:00,17:00"
 */
export function getPickupSlots(): string[] {
  const raw = process.env.PICKUP_SLOTS;
  if (raw && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["10:00", "11:00", "13:00", "15:00", "17:00", "10:00-12:00", "13:00-15:00", "15:00-17:00"];
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
