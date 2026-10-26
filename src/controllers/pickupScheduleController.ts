import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import {
  isValidSlotTime,
  isWithinHours,
  SLOT_STEP_MINUTES,
  MAX_ACTIVE_SLOTS,
  MIN_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  MAX_LEAD_MINUTES,
  fallbackSlots,
  slotBookingWhere,
} from "../lib/slots";
import { todayWibString } from "../lib/dates";

/**
 * 1) GET /api/admin/pickup-schedule
 */
export const getAdminPickupSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const openTime = settings?.pickupOpenTime || "09:00";
    const closeTime = settings?.pickupCloseTime || "23:00";
    const leadMinutes = settings?.pickupLeadMinutes ?? 30;

    const dbSlots = await prisma.pickupSlot.findMany({
      orderBy: { time: "asc" },
    });

    const limits = {
      stepMinutes: SLOT_STEP_MINUTES,
      maxActiveSlots: MAX_ACTIVE_SLOTS,
      minCapacity: MIN_SLOT_CAPACITY,
      maxCapacity: MAX_SLOT_CAPACITY,
      maxLeadMinutes: MAX_LEAD_MINUTES,
    };

    if (dbSlots.length === 0) {
      const fb = fallbackSlots();
      const slots = fb.map((s) => ({
        id: null,
        time: s.time,
        capacity: s.capacity,
        isActive: s.isActive,
        usage: {
          totalOrders: 0,
          upcomingActiveOrders: 0,
        },
      }));

      return res.json({
        source: "fallback",
        settings: { openTime, closeTime, leadMinutes },
        limits,
        slots,
      });
    }

    const autoCancelEnabled = settings?.autoCancelEnabled ?? true;
    const now = new Date();
    const todayWIBStr = todayWibString();
    const todayStartWIB = new Date(`${todayWIBStr}T00:00:00+07:00`);

    // GroupBy total orders
    const totalOrderGroups = await prisma.order.groupBy({
      by: ["pickupSlot"],
      _count: { _all: true },
    });
    const totalMap: Record<string, number> = {};
    for (const g of totalOrderGroups) {
      totalMap[g.pickupSlot] = g._count._all;
    }

    // GroupBy upcoming active orders
    const upcomingGroups = await prisma.order.groupBy({
      by: ["pickupSlot"],
      where: {
        pickupDate: { gte: todayStartWIB },
        OR: slotBookingWhere(autoCancelEnabled, now),
      },
      _count: { _all: true },
    });
    const upcomingMap: Record<string, number> = {};
    for (const g of upcomingGroups) {
      upcomingMap[g.pickupSlot] = g._count._all;
    }

    const slots = dbSlots.map((s) => ({
      id: s.id,
      time: s.time,
      capacity: s.capacity,
      isActive: s.isActive,
      usage: {
        totalOrders: totalMap[s.time] || 0,
        upcomingActiveOrders: upcomingMap[s.time] || 0,
      },
    }));

    return res.json({
      source: "database",
      settings: { openTime, closeTime, leadMinutes },
      limits,
      slots,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2) PATCH /api/admin/pickup-schedule/settings
 */
export const updateAdminPickupScheduleSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const { openTime, closeTime, leadMinutes } = body;

    if (openTime === undefined && closeTime === undefined && leadMinutes === undefined) {
      return res.status(400).json({ error: "Minimal kirim salah satu: openTime, closeTime, atau leadMinutes" });
    }

    if (openTime !== undefined && !isValidSlotTime(openTime)) {
      return res.status(400).json({ error: "openTime harus berformat HH:MM kelipatan 30 menit (00 atau 30)" });
    }
    if (closeTime !== undefined && !isValidSlotTime(closeTime)) {
      return res.status(400).json({ error: "closeTime harus berformat HH:MM kelipatan 30 menit (00 atau 30)" });
    }
    if (leadMinutes !== undefined) {
      if (typeof leadMinutes !== "number" || !Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > MAX_LEAD_MINUTES) {
        return res.status(400).json({ error: `leadMinutes harus berupa bilangan bulat antara 0 sampai ${MAX_LEAD_MINUTES}` });
      }
    }

    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app_settings WHERE id = 1 FOR UPDATE`;

      const current = await tx.appSettings.findUnique({ where: { id: 1 } });
      const newOpen = openTime !== undefined ? openTime : (current?.pickupOpenTime || "09:00");
      const newClose = closeTime !== undefined ? closeTime : (current?.pickupCloseTime || "23:00");
      const newLead = leadMinutes !== undefined ? leadMinutes : (current?.pickupLeadMinutes ?? 30);

      if (newOpen >= newClose) {
        throw { status: 400, message: "openTime harus lebih awal dari closeTime" };
      }

      // Periksa apakah ada slot AKTIF yang berada di luar rentang baru [newOpen, newClose)
      const activeSlots = await tx.pickupSlot.findMany({
        where: { isActive: true },
        orderBy: { time: "asc" },
      });

      const outside = activeSlots.filter((s) => !isWithinHours(s.time, newOpen, newClose)).map((s) => s.time);
      if (outside.length > 0) {
        return {
          conflict: true,
          status: 409,
          data: {
            error: "Terdapat slot aktif di luar rentang jam operasional baru",
            code: "SLOTS_OUTSIDE_HOURS",
            slots: outside,
          },
        };
      }

      const updated = await tx.appSettings.update({
        where: { id: 1 },
        data: {
          pickupOpenTime: newOpen,
          pickupCloseTime: newClose,
          pickupLeadMinutes: newLead,
        },
      });

      return {
        conflict: false,
        status: 200,
        data: {
          message: "Pengaturan jadwal pickup berhasil diperbarui",
          settings: {
            openTime: updated.pickupOpenTime,
            closeTime: updated.pickupCloseTime,
            leadMinutes: updated.pickupLeadMinutes,
          },
        },
      };
    });

    return res.status(result.status).json(result.data);
  } catch (err: any) {
    if (err.status && err.message) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * 3) POST /api/admin/pickup-slots
 */
export const createAdminPickupSlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { time, capacity } = req.body || {};

    if (!isValidSlotTime(time)) {
      return res.status(400).json({ error: "time harus berformat HH:MM dengan menit 00 atau 30" });
    }

    if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < MIN_SLOT_CAPACITY || capacity > MAX_SLOT_CAPACITY) {
      return res.status(400).json({ error: `capacity harus berupa bilangan bulat antara ${MIN_SLOT_CAPACITY} sampai ${MAX_SLOT_CAPACITY}` });
    }

    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app_settings WHERE id = 1 FOR UPDATE`;

      const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
      const openTime = settings?.pickupOpenTime || "09:00";
      const closeTime = settings?.pickupCloseTime || "23:00";

      if (!isWithinHours(time, openTime, closeTime)) {
        return {
          status: 400,
          data: {
            error: `Jam slot harus berada di dalam jam operasional (${openTime} sampai ${closeTime})`,
            code: "SLOT_OUTSIDE_HOURS",
          },
        };
      }

      // Bila tabel kosong, seed fallback dulu (D9)
      const totalCount = await tx.pickupSlot.count();
      if (totalCount === 0) {
        const fb = fallbackSlots();
        for (const s of fb) {
          await tx.pickupSlot.create({
            data: {
              time: s.time,
              capacity: s.capacity,
              isActive: s.isActive,
            },
          });
        }
      }

      // Cek apakah time sudah ada
      const existing = await tx.pickupSlot.findUnique({ where: { time } });
      if (existing) {
        return {
          status: 409,
          data: {
            error: existing.isActive
              ? `Slot jam ${time} sudah ada.`
              : `Slot jam ${time} sudah ada tetapi nonaktif. Aktifkan kembali lewat edit slot.`,
            code: "SLOT_EXISTS",
            slot: existing,
          },
        };
      }

      // Cek batas maksimal 15 slot aktif
      const activeCount = await tx.pickupSlot.count({ where: { isActive: true } });
      if (activeCount >= MAX_ACTIVE_SLOTS) {
        return {
          status: 409,
          data: {
            error: `Maksimal slot aktif adalah ${MAX_ACTIVE_SLOTS}`,
            code: "SLOT_LIMIT_REACHED",
          },
        };
      }

      const created = await tx.pickupSlot.create({
        data: {
          time,
          capacity,
          isActive: true,
        },
      });

      return {
        status: 201,
        data: {
          message: "Slot pickup berhasil ditambahkan",
          slot: created,
        },
      };
    });

    return res.status(result.status).json(result.data);
  } catch (err: any) {
    if (err.status && err.message) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * 4) PATCH /api/admin/pickup-slots/:id
 */
export const updateAdminPickupSlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { time, capacity, isActive, confirm } = body;

    if (time === undefined && capacity === undefined && isActive === undefined) {
      return res.status(400).json({ error: "Minimal kirim salah satu: time, capacity, atau isActive" });
    }

    if (time !== undefined && !isValidSlotTime(time)) {
      return res.status(400).json({ error: "time harus berformat HH:MM dengan menit 00 atau 30" });
    }
    if (capacity !== undefined) {
      if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < MIN_SLOT_CAPACITY || capacity > MAX_SLOT_CAPACITY) {
        return res.status(400).json({ error: `capacity harus berupa bilangan bulat antara ${MIN_SLOT_CAPACITY} sampai ${MAX_SLOT_CAPACITY}` });
      }
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive harus berupa boolean" });
    }

    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app_settings WHERE id = 1 FOR UPDATE`;

      const slot = await tx.pickupSlot.findUnique({ where: { id } });
      if (!slot) {
        return { status: 404, data: { error: "Slot pickup tidak ditemukan" } };
      }

      const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
      const openTime = settings?.pickupOpenTime || "09:00";
      const closeTime = settings?.pickupCloseTime || "23:00";
      const autoCancelEnabled = settings?.autoCancelEnabled ?? true;
      const now = new Date();
      const todayWIBStr = todayWibString();
      const todayStartWIB = new Date(`${todayWIBStr}T00:00:00+07:00`);

      // 1. Ubah time
      if (time !== undefined && time !== slot.time) {
        // Cek apakah slot pernah dipakai oleh pesanan apa pun
        const totalOrders = await tx.order.count({ where: { pickupSlot: slot.time } });
        if (totalOrders > 0) {
          return {
            status: 409,
            data: {
              error: "Jam ini pernah dipakai pesanan. Nonaktifkan saja lalu tambahkan jam baru.",
              code: "SLOT_TIME_LOCKED",
            },
          };
        }

        if (!isWithinHours(time, openTime, closeTime)) {
          return {
            status: 400,
            data: {
              error: `Jam slot harus berada di dalam jam operasional (${openTime} sampai ${closeTime})`,
              code: "SLOT_OUTSIDE_HOURS",
            },
          };
        }

        const duplicate = await tx.pickupSlot.findUnique({ where: { time } });
        if (duplicate && duplicate.id !== id) {
          return {
            status: 409,
            data: {
              error: `Slot jam ${time} sudah ada.`,
              code: "SLOT_EXISTS",
              slot: duplicate,
            },
          };
        }
      }

      // 2. Ubah capacity
      if (capacity !== undefined && capacity < slot.capacity) {
        // Hitung booked per tanggal mendatang
        const bookedPerDate = await tx.order.groupBy({
          by: ["pickupDate"],
          where: {
            pickupSlot: slot.time,
            pickupDate: { gte: todayStartWIB },
            OR: slotBookingWhere(autoCancelEnabled, now),
          },
          _count: { _all: true },
        });

        const exceedingDates = bookedPerDate
          .filter((b) => b._count._all > capacity)
          .map((b) => ({
            date: b.pickupDate.toISOString().slice(0, 10),
            booked: b._count._all,
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 10);

        if (exceedingDates.length > 0 && confirm !== true) {
          return {
            status: 409,
            data: {
              error: `Terdapat pesanan mendatang yang melebihi kapasitas baru ${capacity}. Konfirmasi untuk melanjutkan.`,
              code: "CONFIRMATION_REQUIRED",
              impact: {
                type: "CAPACITY_BELOW_BOOKED",
                upcomingActiveOrders: exceedingDates.reduce((s, d) => s + d.booked, 0),
                dates: exceedingDates,
                newCapacity: capacity,
                lastActiveSlot: false,
              },
            },
          };
        }
      }

      // 3. Ubah isActive
      if (isActive !== undefined && isActive !== slot.isActive) {
        if (isActive === false) {
          // Cek upcomingActiveOrders
          const upcomingOrders = await tx.order.findMany({
            where: {
              pickupSlot: slot.time,
              pickupDate: { gte: todayStartWIB },
              OR: slotBookingWhere(autoCancelEnabled, now),
            },
            select: { pickupDate: true },
          });

          // Cek apakah ini slot aktif terakhir
          const activeCount = await tx.pickupSlot.count({ where: { isActive: true } });
          const isLastActive = activeCount <= 1;

          if ((upcomingOrders.length > 0 || isLastActive) && confirm !== true) {
            // Group tanggal
            const dateCountMap: Record<string, number> = {};
            for (const o of upcomingOrders) {
              const d = o.pickupDate.toISOString().slice(0, 10);
              dateCountMap[d] = (dateCountMap[d] || 0) + 1;
            }
            const dates = Object.keys(dateCountMap)
              .sort()
              .slice(0, 10)
              .map((d) => ({ date: d, booked: dateCountMap[d] }));

            return {
              status: 409,
              data: {
                error: isLastActive
                  ? "Ini adalah slot aktif terakhir. Menonaktifkannya akan menutup pemesanan pickup."
                  : `Slot ${slot.time} masih punya ${upcomingOrders.length} pesanan aktif. Konfirmasi untuk melanjutkan.`,
                code: "CONFIRMATION_REQUIRED",
                impact: {
                  type: "DEACTIVATE",
                  upcomingActiveOrders: upcomingOrders.length,
                  dates,
                  newCapacity: null,
                  lastActiveSlot: isLastActive,
                },
              },
            };
          }
        } else {
          // Mengaktifkan kembali
          const targetTime = time !== undefined ? time : slot.time;
          if (!isWithinHours(targetTime, openTime, closeTime)) {
            return {
              status: 400,
              data: {
                error: `Jam slot harus berada di dalam jam operasional (${openTime} sampai ${closeTime})`,
                code: "SLOT_OUTSIDE_HOURS",
              },
            };
          }

          const activeCount = await tx.pickupSlot.count({ where: { isActive: true } });
          if (activeCount >= MAX_ACTIVE_SLOTS) {
            return {
              status: 409,
              data: {
                error: `Maksimal slot aktif adalah ${MAX_ACTIVE_SLOTS}`,
                code: "SLOT_LIMIT_REACHED",
              },
            };
          }
        }
      }

      const updateData: any = {};
      if (time !== undefined) updateData.time = time;
      if (capacity !== undefined) updateData.capacity = capacity;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await tx.pickupSlot.update({
        where: { id },
        data: updateData,
      });

      return {
        status: 200,
        data: {
          message: "Slot pickup berhasil diperbarui",
          slot: updated,
        },
      };
    });

    return res.status(result.status).json(result.data);
  } catch (err: any) {
    if (err.status && err.message) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * 5) DELETE /api/admin/pickup-slots/:id
 */
export const deleteAdminPickupSlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const confirm = req.query.confirm === "true";

    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app_settings WHERE id = 1 FOR UPDATE`;

      const slot = await tx.pickupSlot.findUnique({ where: { id } });
      if (!slot) {
        return { status: 404, data: { error: "Slot pickup tidak ditemukan" } };
      }

      const totalOrders = await tx.order.count({ where: { pickupSlot: slot.time } });
      if (totalOrders > 0) {
        return {
          status: 409,
          data: {
            error: "Jam ini pernah dipakai pesanan. Nonaktifkan saja.",
            code: "SLOT_IN_USE",
          },
        };
      }

      // Slot belum pernah dipakai, cek apakah slot aktif terakhir
      if (slot.isActive) {
        const activeCount = await tx.pickupSlot.count({ where: { isActive: true } });
        if (activeCount <= 1 && !confirm) {
          return {
            status: 409,
            data: {
              error: "Ini adalah slot aktif terakhir. Menghapusnya akan menutup pemesanan pickup.",
              code: "CONFIRMATION_REQUIRED",
              impact: {
                type: "DELETE",
                upcomingActiveOrders: 0,
                dates: [],
                newCapacity: null,
                lastActiveSlot: true,
              },
            },
          };
        }
      }

      await tx.pickupSlot.delete({ where: { id } });

      return {
        status: 200,
        data: { message: "Slot pickup berhasil dihapus" },
      };
    });

    return res.status(result.status).json(result.data);
  } catch (err: any) {
    if (err.status && err.message) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

export default {
  getAdminPickupSchedule,
  updateAdminPickupScheduleSettings,
  createAdminPickupSlot,
  updateAdminPickupSlot,
  deleteAdminPickupSlot,
};
