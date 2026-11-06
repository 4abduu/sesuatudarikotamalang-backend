import cron from "node-cron";
import prisma from "../lib/prisma";
import { getSlowMovers } from "../lib/slowMovers";

export function startSlowMoverJob(): void {
  cron.schedule("0 7 * * *", async () => {
    try {
      const movers = await getSlowMovers(prisma);
      for (const mover of movers.filter((item: any) => item.level === "peringatan")) {
        const product = await prisma.product.findUnique({ where: { id: mover.id }, include: { artisan: true } });
        if (!product || product.slowWarnedAt || !product.artisan.userId) continue;
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: product.id }, data: { slowWarnedAt: new Date() } });
          await tx.notification.create({ data: { userId: product.artisan.userId!, type: "produk_mendekati_batas", title: "Produk mendekati batas evaluasi", body: `Produk ${product.name} tidak terjual selama ${mover.daysIdle} hari.` } });
        });
      }
    } catch (error) { console.error("[JOB ERROR] slow mover:", error); }
  });
  console.log("[JOB] Scheduled job slow mover berhasil diaktifkan");
}

export default { startSlowMoverJob };
