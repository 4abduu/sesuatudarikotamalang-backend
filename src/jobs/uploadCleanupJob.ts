import cron from "node-cron";
import { purgeOrphanUploads } from "../lib/uploadedFiles";

const DEFAULT_GRACE_HOURS = 24;
const MIN_GRACE_HOURS = 1;

function parseGraceHours(): number {
  const raw = process.env.UPLOAD_ORPHAN_GRACE_HOURS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed >= MIN_GRACE_HOURS ? parsed : DEFAULT_GRACE_HOURS;
}

/** Jalankan sekali — ekspor agar bisa dipanggil test dan demo. */
export async function runUploadCleanup(): Promise<{ deleted: number; kept: number; failed: number }> {
  const graceHours = parseGraceHours();
  return purgeOrphanUploads(graceHours);
}

/** Jadwalkan job harian pukul 04:00 untuk menyapu file yatim. */
export function startUploadCleanupJob(): void {
  cron.schedule("0 4 * * *", async () => {
    try {
      const result = await runUploadCleanup();
      console.log(`[JOB] Upload cleanup selesai: ${result.deleted} dihapus, ${result.kept} dipertahankan, ${result.failed} gagal`);
    } catch (error) {
      console.error("[JOB ERROR] Gagal menjalankan upload cleanup:", error);
    }
  });
  console.log("[JOB] Scheduled job pembersihan file yatim Cloudinary berhasil diaktifkan (setiap hari pukul 04:00)");
}
