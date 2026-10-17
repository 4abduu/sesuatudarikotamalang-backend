/**
 * txRetry.ts — Helper untuk menentukan apakah error transaksi Prisma layak di-retry.
 *
 * Dua kategori yang di-retry:
 *  - P2034: write conflict / deadlock pada query Prisma biasa (non-raw).
 *  - P2010: raw query error, hanya bila error-nya benar-benar deadlock atau lock wait timeout
 *           (kode MySQL 1213 / 1205, atau pesan memuat kata kunci tersebut).
 */

export function isRetryableTransactionError(error: any): boolean {
  if (!error || typeof error !== "object") return false;

  // P2034 — write conflict / deadlock pada query Prisma non-raw
  if (error.code === "P2034") return true;

  // P2010 — raw query error; hanya di-retry bila benar-benar deadlock / lock wait
  if (error.code === "P2010") {
    const metaCode = error.meta?.code;
    if (metaCode === "1213" || metaCode === "1205") return true;

    const message: string = (error.message || error.meta?.message || "").toLowerCase();
    if (message.includes("deadlock") || message.includes("lock wait timeout")) return true;

    return false;
  }

  return false;
}

export default { isRetryableTransactionError };
