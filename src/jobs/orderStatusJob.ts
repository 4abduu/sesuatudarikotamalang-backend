import cron from "node-cron";
import prisma from "../lib/prisma";
import { createNotifications } from "../dal/notifications";
import { logger } from "../logger";

/**
 * Scheduled job untuk memperbarui status order terkomputasi secara berkala:
 * 1. Menunggu bayar (cod) yang melewati holdExpiresAt -> kedaluwarsa
 * 2. Lunas (midtrans) yang melewati pickupDeadline -> lewat_batas_pengambilan
 */
export function startOrderStatusJob(): void {
  // Berjalan setiap 5 menit
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();

      const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
      const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

      // 1a. Midtrans yang hold-nya (60 menit) habis -> SELALU diubah ke kedaluwarsa (tanpa tergantung autoCancelEnabled)
      const expireOrders = async (where: any, status: "kedaluwarsa" | "lewat_batas_pengambilan") => prisma.$transaction(async (tx) => {
        const rows = await tx.order.findMany({ where, select: { id: true, userId: true, orderNumber: true } });
        if (rows.length === 0) return 0;
        await tx.order.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status } });
        await createNotifications(tx, rows.map((row) => ({
          userId: row.userId,
          type: "pesanan_update" as const,
          title: status === "kedaluwarsa" ? "Pesanan kedaluwarsa" : "Batas pengambilan terlewati",
          body: status === "kedaluwarsa" ? `Pesanan ${row.orderNumber} kedaluwarsa karena batas pembayaran/hold telah lewat.` : `Pesanan ${row.orderNumber} melewati batas pengambilan.`,
        })));
        return rows.length;
      });

      const expiredMidtrans = await expireOrders({ paymentMethod: "midtrans", status: "menunggu_bayar", holdExpiresAt: { lt: now } }, "kedaluwarsa");
      if (expiredMidtrans > 0) logger.info({ count: expiredMidtrans }, "pesanan Midtrans kedaluwarsa");

      // 1b. Cash/QRIS (COD) yang hold-nya habis -> kedaluwarsa HANYA jika autoCancelEnabled aktif
      if (autoCancelEnabled) {
        const expiredCod = await expireOrders({ paymentMethod: "cod", status: "menunggu_bayar", holdExpiresAt: { lt: now } }, "kedaluwarsa");
        if (expiredCod > 0) logger.info({ count: expiredCod }, "pesanan COD kedaluwarsa");
      }

      // 2. Midtrans lunas yang lewat batas pengambilan -> lewat_batas_pengambilan
      const passedDeadlineOrders = await expireOrders({ status: "lunas", pickupDeadline: { lt: now } }, "lewat_batas_pengambilan");
      if (passedDeadlineOrders > 0) logger.info({ count: passedDeadlineOrders }, "pesanan melewati batas pengambilan");
    } catch (err) {
      logger.error({ err }, "gagal meng-update status pesanan berkala");
    }
  });

  logger.info("scheduled job status pesanan berhasil diaktifkan");
}

export default { startOrderStatusJob };
