export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const CANCELLABLE_BY_CUSTOMER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
];

export function isAllowedOrderTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): boolean {
  return ALLOWED_ORDER_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}
