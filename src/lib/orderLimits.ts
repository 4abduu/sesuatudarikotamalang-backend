export const MAX_ORDER_LINES = 10;
export const MAX_QTY_PER_LINE = 10;
export const MAX_ORDER_TOTAL = 2_000_000_000;

export type CartItemStatus =
  | "ok"
  | "out_of_stock"
  | "insufficient_stock"
  | "product_unavailable"
  | "creator_inactive"
  | "own_product";
