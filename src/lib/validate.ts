export function isString(value: unknown, options: { min?: number; max?: number } = {}): value is string {
  if (typeof value !== "string") return false;
  if (options.min !== undefined && value.length < options.min) return false;
  if (options.max !== undefined && value.length > options.max) return false;
  return true;
}

export function isEmail(value: unknown): value is string {
  return isString(value, { max: 191 }) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isPasswordWithinBcryptLimit(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= 72;
}
