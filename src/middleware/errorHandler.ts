import { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError";
import { logger } from "../logger";

export const errorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = Number.isInteger(err?.status) ? err.status : 500;
  const requestId = res.locals?.requestId;
  logger.error({
    err,
    requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
  }, "request error");

  const knownMessage = err instanceof HttpError || statusCode < 500;
  const response: { error: string; code?: string; requestId?: string; rejectedIndexes?: number[] } = {
    error: statusCode >= 500 ? "Terjadi kesalahan pada server." : (knownMessage ? err.message : "Terjadi kesalahan pada server."),
    ...(statusCode >= 500 ? { code: "INTERNAL_ERROR" } : err instanceof HttpError && err.code ? { code: err.code } : {}),
  };
  if (statusCode === 422 && Array.isArray(err?.rejectedIndexes)) response.rejectedIndexes = err.rejectedIndexes;
  if (requestId) response.requestId = requestId;
  res.status(statusCode).json(response);
};
