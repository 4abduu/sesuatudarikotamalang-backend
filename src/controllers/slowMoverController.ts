import { Request, Response, NextFunction } from "express";
import { getSlowMovers } from "../lib/slowMovers";

export const listSlowMovers = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ warnMonths: 5, withdrawMonths: 6, salesSource: "aplikasi", products: await getSlowMovers() }); } catch (err) { next(err); }
};

export default { listSlowMovers };
