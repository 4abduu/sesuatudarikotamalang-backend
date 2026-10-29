import { HttpError } from "../lib/httpError";

export const unauthorized = (message = "Belum login") => new HttpError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Tidak punya akses untuk resource ini") => new HttpError(403, message, "FORBIDDEN");
export const notFound = (message: string) => new HttpError(404, message, "NOT_FOUND");
export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);
