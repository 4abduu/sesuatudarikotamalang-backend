import crypto from "crypto";

function otpKey(): string {
  return process.env.OTP_PEPPER || crypto.createHmac("sha256", process.env.JWT_SECRET || "").update("otp-v1").digest("hex");
}

export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", otpKey()).update(code).digest("hex");
}

export function verifyOtpHash(code: string, hash: string): boolean {
  const actual = Buffer.from(hashOtp(code), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
