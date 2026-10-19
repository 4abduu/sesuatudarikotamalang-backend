import { Request } from "express";
import { isOwnCloudinaryImageUrl } from "./cloudinary";

export function isAllowedAvatarUrl(url: string, request?: Pick<Request, "protocol" | "get">): boolean {
  const publicBase = process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/+$/, "") : "";
  const requestBase = request ? `${request.protocol}://${request.get("host")}` : "";
  return (
    (publicBase.length > 0 && url.startsWith(`${publicBase}/uploads/`)) ||
    (requestBase.length > 0 && url.startsWith(`${requestBase}/uploads/`)) ||
    url.startsWith("/uploads/") ||
    isOwnCloudinaryImageUrl(url)
  );
}
