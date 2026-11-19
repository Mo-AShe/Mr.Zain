import { z } from "zod";

export const adminOrdersQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  orderStatus: z
    .enum([
      "all",
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ])
    .default("all"),
  paymentStatus: z
    .enum(["all", "pending", "paid", "failed", "cancelled", "refunded"])
    .default("all"),
  startDate: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD.")
      .optional()
  ),
  endDate: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD.")
      .optional()
  ),
  sort: z
    .enum(["newest", "oldest", "total_desc", "total_asc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

const optionalTrimmedText = (maxLen: number) =>
  z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v !== "string") return v;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().max(maxLen).nullable().optional()
  );

export const updateAdminOrderStatusSchema = z.object({
  status: z.enum([
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
  note: optionalTrimmedText(500),
  shippingCarrier: optionalTrimmedText(100),
  trackingNumber: optionalTrimmedText(120),
});

export const updateAdminOrderPaymentSchema = z.object({
  paymentStatus: z.enum(["paid", "failed", "refunded"]),
  transactionReference: optionalTrimmedText(255),
  note: optionalTrimmedText(500),
});

export const updateAdminOrderShipmentSchema = z.object({
  shippingCarrier: z
    .string({ error: "Shipping carrier is required." })
    .trim()
    .min(2, "Shipping carrier must be at least 2 characters.")
    .max(100, "Shipping carrier must be at most 100 characters."),
  trackingNumber: z
    .string({ error: "Tracking number is required." })
    .trim()
    .min(2, "Tracking number must be at least 2 characters.")
    .max(120, "Tracking number must be at most 120 characters."),
});

export type AdminOrdersQueryInput = z.infer<typeof adminOrdersQuerySchema>;
export type UpdateAdminOrderStatusInput = z.infer<typeof updateAdminOrderStatusSchema>;
export type UpdateAdminOrderPaymentInput = z.infer<typeof updateAdminOrderPaymentSchema>;
export type UpdateAdminOrderShipmentInput = z.infer<typeof updateAdminOrderShipmentSchema>;
