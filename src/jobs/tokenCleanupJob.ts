import cron from "node-cron";
import prisma from "../lib/prisma";
import { logger } from "../logger";

export async function purgeExpiredRevokedTokens(): Promise<number> {
  const result = await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

export function startTokenCleanupJob(): void {
  cron.schedule("0 3 * * *", async () => {
    try {
      const count = await purgeExpiredRevokedTokens();
      if (count > 0) logger.info({ count }, "revoked token kedaluwarsa dihapus");
    } catch (error) {
      logger.error({ err: error }, "gagal membersihkan revoked token");
    }
  });
  logger.info("scheduled job pembersihan revoked token berhasil diaktifkan");
}
