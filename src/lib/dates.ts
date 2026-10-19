const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})T/;
const TIMEZONE_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/i;

const isRealCalendarDate = (dateString: string): boolean => {
  const parsed = new Date(`${dateString}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateString;
};

const formatWibDate = (date: Date): string => {
  const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);
  return `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, "0")}-${String(wibDate.getUTCDate()).padStart(2, "0")}`;
};

/** Mengubah input tanggal/datetime menjadi tanggal kalender WIB (YYYY-MM-DD). */
export const toWibDateString = (input: unknown): string | null => {
  if (typeof input !== "string") return null;

  const dateOnly = input.match(DATE_ONLY_RE)?.[1];
  if (dateOnly) return isRealCalendarDate(dateOnly) ? dateOnly : null;

  const datePrefix = input.match(DATE_PREFIX_RE)?.[1];
  if (!datePrefix || !isRealCalendarDate(datePrefix)) return null;

  if (TIMEZONE_SUFFIX_RE.test(input)) {
    const instant = new Date(input);
    return Number.isNaN(instant.getTime()) ? null : formatWibDate(instant);
  }

  // ISO datetime tanpa zona dianggap sudah menggunakan waktu WIB.
  const wibLocalDate = new Date(`${input}+07:00`);
  return Number.isNaN(wibLocalDate.getTime()) ? null : datePrefix;
};

export const todayWibString = (now = Date.now()): string => formatWibDate(new Date(now));
