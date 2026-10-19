import { HttpError } from "../lib/httpError";

export const unauthorized = (message = "Belum login") => new HttpError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Tidak punya akses untuk resource ini") => new HttpError(403, message, "FORBIDDEN");
export const notFound = (message: string) => new HttpError(404, message, "NOT_FOUND");
export const badRequest = (message: string) => new HttpError(400, message);
