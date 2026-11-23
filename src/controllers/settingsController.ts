import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { MAX_ORDER_LINES, MAX_QTY_PER_LINE } from "../lib/orderLimits";

const MOBILE_SUPPORT_EMAIL = "help.sesuatudarikotamalang@gmail.com";

const mobileUpdateConfig = () => ({
  latestVersion: process.env.MOBILE_LATEST_VERSION?.trim() || "1.1.0",
  minimumVersion: process.env.MOBILE_MIN_VERSION?.trim() || "1.0.0",
  updateUrl: process.env.MOBILE_UPDATE_URL?.trim() || null,
  supportEmail: MOBILE_SUPPORT_EMAIL,
});

// GET /api/settings/public — A6: Pengaturan publik (nomor WA, kontak, Tentang Kami, link toko olshop, durasi hold, batas pickup; tanpa email internal)
export const getPublicSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: 1 } });
    }

    res.json({
      settings: {
        whatsappAdminNumber: settings.whatsappAdminNumber,
        contactEmail: settings.contactEmail,
        aboutDescription: settings.aboutDescription,
        olshopStores: {
          shopee: settings.shopeeStoreUrl,
          tokopedia: settings.tokopediaStoreUrl,
          tiktokshop: settings.tiktokshopStoreUrl,
        },
        holdDurationMinutes: settings.holdDurationMinutes,
        pickupDeadlineDays: settings.pickupDeadlineDays,
        refundWindowDays: settings.refundWindowDays,
        maxOrderLines: MAX_ORDER_LINES,
        maxQuantityPerLine: MAX_QTY_PER_LINE,
        appUpdate: mobileUpdateConfig(),
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getPublicSettings,
};
