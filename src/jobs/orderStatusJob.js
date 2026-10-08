const cron = require("node-cron");
const prisma = require("../lib/prisma");

/**
 * Scheduled job untuk memperbarui status order terkomputasi secara berkala:
 * 1. Menunggu bayar (cod) yang melewati holdExpiresAt -> kedaluwarsa
 * 2. Lunas (midtrans) yang melewati pickupDeadline -> lewat_batas_pengambilan
 */
function startOrderStatusJob() {
  // Berjalan setiap 5 menit
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();

      const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
      const autoCancelEnabled = settings?.autoCancelEnabled ?? true;

      // 1a. Midtrans yang hold-nya (60 menit) habis -> SELALU diubah ke kedaluwarsa (tanpa tergantung autoCancelEnabled)
      const expiredMidtrans = await prisma.order.updateMany({
        where: {
          paymentMethod: "midtrans",
          status: "menunggu_bayar",
          holdExpiresAt: { lt: now },
        },
        data: { status: "kedaluwarsa" },
      });

      if (expiredMidtrans.count > 0) {
        console.log(`[CRON] ${expiredMidtrans.count} pesanan Midtrans diubah ke status 'kedaluwarsa' (hold 60m habis)`);
      }

      // 1b. Cash/QRIS (COD) yang hold-nya habis -> kedaluwarsa HANYA jika autoCancelEnabled aktif
      if (autoCancelEnabled) {
        const expiredCod = await prisma.order.updateMany({
          where: {
            paymentMethod: "cod",
            status: "menunggu_bayar",
            holdExpiresAt: { lt: now },
          },
          data: { status: "kedaluwarsa" },
        });

        if (expiredCod.count > 0) {
          console.log(`[CRON] ${expiredCod.count} pesanan Cash/QRIS diubah ke status 'kedaluwarsa' (auto-cancel aktif)`);
        }
      }

      // 2. Midtrans lunas yang lewat batas pengambilan -> lewat_batas_pengambilan
      const passedDeadlineOrders = await prisma.order.updateMany({
        where: {
          status: "lunas",
          pickupDeadline: { lt: now },
        },
        data: { status: "lewat_batas_pengambilan" },
      });

      if (passedDeadlineOrders.count > 0) {
        console.log(`[CRON] ${passedDeadlineOrders.count} pesanan diubah ke status 'lewat_batas_pengambilan'`);
      }
    } catch (err) {
      console.error("[CRON ERROR] Gagal meng-update status pesanan berkala:", err);
    }
  });

  console.log("[JOB] Scheduled job status pesanan (orderStatusJob) berhasil diaktifkan");
}

module.exports = { startOrderStatusJob };
