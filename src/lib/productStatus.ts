import { ProductApprovalStatus } from "@prisma/client";

export type DisplayStatus = "menunggu" | "ditolak" | "ditarik" | "disembunyikan" | "aktif";

export function displayStatus(product: {
  approvalStatus: ProductApprovalStatus | string;
  withdrawnAt?: Date | string | null;
  isActive: boolean;
}): DisplayStatus {
  if (product.approvalStatus === "menunggu") return "menunggu";
  if (product.approvalStatus === "ditolak") return "ditolak";
  if (product.withdrawnAt) return "ditarik";
  if (!product.isActive) return "disembunyikan";
  return "aktif";
}

export function serializeProductStatus<T extends Record<string, any>>(product: T): T & { displayStatus: DisplayStatus } {
  return { ...product, displayStatus: displayStatus(product as any) };
}
