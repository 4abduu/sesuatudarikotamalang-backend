import { isPaymentSuccess } from "./paymentStatus";

export type RefundState =
  | "tidak_berlaku"
  | "dalam_batas_waktu"
  | "lewat_batas_waktu"
  | "lewat_batas_pengambilan"
  | "sudah_diambil"
  | "menunggu_refund"
  | "sudah_direfund";

export type RefundDisabledReason =
  | "NOT_PAID_ONLINE"
  | "OUTSIDE_TIME_LIMIT"
  | "PICKUP_DEADLINE_PASSED"
  | "ALREADY_COMPLETED"
  | "ALREADY_CANCELLED"
  | "ALREADY_REFUNDED"
  | null;

export type RefundInfo = {
  state: RefundState;
  paid: boolean;
  paidAt: string | null;
  eligibleUntil: string | null;
  refundWindowDays: number;
  refundStatus: "tidak_ada" | "menunggu" | "selesai";
  refundedAt: string | null;
  canCancelByBuyerRequest: boolean;
  canCancelByStoreFault: boolean;
  canMarkRefunded: boolean;
  disabledReason: RefundDisabledReason;
};

type RefundOrder = {
  status: string;
  paymentMethod: string;
  pickupDate: Date;
  pickupSlot: string | null;
  updatedAt: Date;
  refundStatus?: "tidak_ada" | "menunggu" | "selesai" | null;
  refundedAt?: Date | null;
};

type RefundPayment = {
  status: string;
  paidAt: Date | null;
} | null | undefined;

function pickupScheduleStart(order: Pick<RefundOrder, "pickupDate" | "pickupSlot">): Date {
  const date = order.pickupDate.toISOString().slice(0, 10);
  const match = typeof order.pickupSlot === "string" ? /^(\d{2}):(\d{2})$/.exec(order.pickupSlot) : null;
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;
  if (!match || hour > 23 || minute > 59) {
    return new Date(`${date}T00:00:00+07:00`);
  }
  return new Date(`${date}T${match[1]}:${match[2]}:00+07:00`);
}

export { pickupScheduleStart };

export function computeRefund(input: {
  order: RefundOrder;
  payment: RefundPayment;
  settings?: { refundWindowDays?: number | null } | null;
  now?: Date;
}): RefundInfo {
  const { order, payment } = input;
  const now = input.now || new Date();
  const refundStatus = order.refundStatus || "tidak_ada";
  const refundWindowDays = [1, 3, 7].includes(input.settings?.refundWindowDays || 0)
    ? input.settings!.refundWindowDays!
    : 3;
  const paid = order.paymentMethod === "midtrans" && Boolean(payment) && isPaymentSuccess(payment?.status);
  const paidAtDate = paid ? (payment?.paidAt || order.updatedAt) : null;
  const paidAt = paidAtDate?.toISOString() || null;
  const refundedAt = order.refundedAt?.toISOString() || null;

  const base: RefundInfo = {
    state: "tidak_berlaku",
    paid,
    paidAt,
    eligibleUntil: null,
    refundWindowDays,
    refundStatus,
    refundedAt,
    canCancelByBuyerRequest: false,
    canCancelByStoreFault: false,
    canMarkRefunded: false,
    disabledReason: null,
  };

  if (refundStatus === "selesai") {
    return { ...base, state: "sudah_direfund", disabledReason: "ALREADY_REFUNDED" };
  }
  if (refundStatus === "menunggu") {
    return { ...base, state: "menunggu_refund", canMarkRefunded: true };
  }
  if (!paid || !paidAtDate) {
    return { ...base, disabledReason: "NOT_PAID_ONLINE" };
  }

  const windowUntil = new Date(paidAtDate.getTime() + refundWindowDays * 86400000);
  const pickupUntil = pickupScheduleStart(order);
  const eligibleUntilDate = windowUntil < pickupUntil ? windowUntil : pickupUntil;
  const eligibleUntil = eligibleUntilDate.toISOString();

  if (order.status === "lunas" && now.getTime() <= eligibleUntilDate.getTime()) {
    return {
      ...base,
      state: "dalam_batas_waktu",
      eligibleUntil,
      canCancelByBuyerRequest: true,
      canCancelByStoreFault: true,
    };
  }
  if (order.status === "lunas") {
    return {
      ...base,
      state: "lewat_batas_waktu",
      eligibleUntil,
      canCancelByStoreFault: true,
      disabledReason: "OUTSIDE_TIME_LIMIT",
    };
  }
  if (order.status === "lewat_batas_pengambilan") {
    return {
      ...base,
      state: "lewat_batas_pengambilan",
      canCancelByStoreFault: true,
      disabledReason: "PICKUP_DEADLINE_PASSED",
    };
  }
  if (order.status === "selesai") {
    return { ...base, state: "sudah_diambil", disabledReason: "ALREADY_COMPLETED" };
  }
  return { ...base, disabledReason: "ALREADY_CANCELLED" };
}
