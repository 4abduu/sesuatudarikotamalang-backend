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

      // 1. Cash/QRIS yang hold-nya habis tanpa aksi -> kedaluwarsa
      const expiredHoldOrders = await prisma.order.updateMany({
        where: {
          status: "menunggu_bayar",
          holdExpiresAt: { lt: now },
        },
        data: { status: "kedaluwarsa" },
      });

      if (expiredHoldOrders.count > 0) {
        console.log(`[CRON] ${expiredHoldOrders.count} pesanan diubah ke status 'kedaluwarsa' (hold habis)`);
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
