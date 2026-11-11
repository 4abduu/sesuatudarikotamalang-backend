import { HttpError } from "./httpError";

export function parsePagination(query: Record<string, unknown>, options: { defaultLimit: number; maxLimit: number }) {
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  if (!hasPagination) return undefined;
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1) {
      throw new HttpError(400, "page dan limit harus berupa bilangan bulat positif", "VALIDATION_ERROR");
    }
    return Number(value);
  };
  const page = parse(query.page, 1);
  const limit = Math.min(parse(query.limit, options.defaultLimit), options.maxLimit);
  return { page, limit };
}

export function buildPagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
