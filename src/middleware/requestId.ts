import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("x-request-id");
  const id = supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", id);
  res.locals.requestId = id;
  next();
}
