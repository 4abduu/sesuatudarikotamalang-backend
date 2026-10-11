import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

// GET /api/categories — Daftar kategori publik (diurutkan sortOrder, lalu name)
export const listCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        iconName: true,
        blurb: true,
      },
    });

    res.json({ categories });
  } catch (err) {
    next(err);
  }
};

export default {
  listCategories,
};
