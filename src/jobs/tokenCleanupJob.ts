import cron from "node-cron";
import prisma from "../lib/prisma";

export async function purgeExpiredRevokedTokens(): Promise<number> {
  const result = await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

export function startTokenCleanupJob(): void {
  cron.schedule("0 3 * * *", async () => {
    try {
      const count = await purgeExpiredRevokedTokens();
      if (count > 0) console.log(`[JOB] ${count} revoked token kedaluwarsa dihapus`);
    } catch (error) {
      console.error("[JOB ERROR] Gagal membersihkan revoked token:", error);
    }
  });
  console.log("[JOB] Scheduled job pembersihan revoked token berhasil diaktifkan");
}
