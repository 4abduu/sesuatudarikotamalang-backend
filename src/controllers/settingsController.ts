import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

// GET /api/settings/public — A6: Pengaturan publik (nomor WA, durasi hold, batas pickup; tanpa email internal)
export const getPublicSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: 1 } });
    }

    res.json({
      settings: {
        whatsappAdminNumber: settings.whatsappAdminNumber,
        holdDurationMinutes: settings.holdDurationMinutes,
        pickupDeadlineDays: settings.pickupDeadlineDays,
        refundWindowDays: settings.refundWindowDays,
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getPublicSettings,
};
