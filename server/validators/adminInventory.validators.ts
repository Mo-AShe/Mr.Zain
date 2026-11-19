import { z } from "zod";

export const inventoryVariantParamSchema = z.object({
  variantId: z.string().uuid("Invalid variant identifier."),
});

export const adminInventoryQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  stockStatus: z
    .enum(["all", "in_stock", "low_stock", "out_of_stock", "reserved"])
    .default("all"),
  activeOnly: z.enum(["all", "active", "inactive"]).default("all"),
  sort: z
    .enum([
      "available_asc",
      "available_desc",
      "updated_desc",
      "sku_asc",
      "product_asc",
    ])
    .default("updated_desc"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

export const adminInventoryMovementsQuerySchema = z.object({
  variantId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().uuid("Invalid variant ID.").optional()
  ),
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  movementType: z
    .enum([
      "all",
      "addition",
      "reduction",
      "reservation",
      "cancellation",
      "return",
      "adjustment",
    ])
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
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createStockAdjustmentSchema = z
  .object({
    mode: z.enum(["increase", "decrease", "set"]),
    amount: z.coerce
      .number({ error: "Adjustment quantity must be a whole number." })
      .int("Adjustment quantity must be a whole number.")
      .min(0, "Quantity cannot be negative.")
      .max(1_000_000, "Quantity is too large."),
    reason: z
      .string({ error: "Adjustment reason is required." })
      .trim()
      .min(3, "Reason must be at least 3 characters.")
      .max(500, "Reason must be at most 500 characters."),
    idempotencyKey: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
      z.string().min(8).max(128).optional()
    ),
  })
  .refine(
    (data) => data.mode === "set" || data.amount >= 1,
    {
      message: "Adjustment amount must be at least 1 for increase or decrease.",
      path: ["amount"],
    }
  );

export const updateLowStockThresholdSchema = z.object({
  lowStockThreshold: z.coerce
    .number({ error: "Threshold must be a whole number." })
    .int("Threshold must be a whole number.")
    .min(0, "Threshold cannot be negative.")
    .max(100_000, "Threshold is too large."),
});

export type AdminInventoryQueryInput = z.infer<typeof adminInventoryQuerySchema>;
export type AdminInventoryMovementsQueryInput = z.infer<
  typeof adminInventoryMovementsQuerySchema
>;
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type UpdateLowStockThresholdInput = z.infer<typeof updateLowStockThresholdSchema>;
