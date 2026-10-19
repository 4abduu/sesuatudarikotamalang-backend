import crypto from "crypto";
import { Request } from "express";

const WINDOW_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 10_000;
const seen = new Map<string, number>();

export function shouldCountView(productId: string, req: Pick<Request, "ip"> & { get?: Request["get"]; headers?: Request["headers"] }): boolean {
  const userAgent = typeof req.get === "function" ? req.get("user-agent") : req.headers?.["user-agent"];
  const visitor = `${req.ip || ""}|${userAgent || ""}`;
  const key = `${productId}:${crypto.createHash("sha256").update(visitor).digest("hex")}`;
  const now = Date.now();
  const previous = seen.get(key);

  if (previous !== undefined && now - previous < WINDOW_MS) return false;

  if (seen.size >= MAX_ENTRIES) {
    const oldestKey = seen.keys().next().value;
    if (oldestKey) seen.delete(oldestKey);
  }
  seen.delete(key);
  seen.set(key, now);
  return true;
}

export function clearViewDedupeForTests(): void {
  seen.clear();
}
