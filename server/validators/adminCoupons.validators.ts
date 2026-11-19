import { z } from "zod";

const COUPON_CODE_REGEX = /^[A-Z0-9_-]{3,40}$/;

function parseNullableDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? (undefined as unknown as Date) : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? (undefined as unknown as Date) : parsed;
  }
  return undefined as unknown as Date;
}

const nullableDateSchema = z
  .unknown()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const parsed = parseNullableDate(val);
    if (parsed === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date/time value.",
      });
      return z.NEVER;
    }
    return parsed;
  });

const nullablePositiveMoneySchema = z
  .unknown()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0 || num > 1_000_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum discount must be greater than 0.",
      });
      return z.NEVER;
    }
    return Math.round(num * 100) / 100;
  });

const nullablePositiveIntSchema = z
  .unknown()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const num = Number(val);
    if (!Number.isInteger(num) || num < 1 || num > 1_000_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Usage limit must be a whole number of at least 1.",
      });
      return z.NEVER;
    }
    return num;
  });

export const adminCouponsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(["all", "active", "inactive", "scheduled", "expired"])
    .default("all"),
  discountType: z.enum(["all", "percentage", "fixed"]).default("all"),
  sort: z
    .enum([
      "code_asc",
      "code_desc",
      "value_desc",
      "value_asc",
      "used_desc",
      "expires_asc",
    ])
    .default("code_asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

export type AdminCouponsQuery = z.infer<typeof adminCouponsQuerySchema>;

export const createAdminCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => COUPON_CODE_REGEX.test(v), {
        message:
          "Coupon code must be 3–40 characters using letters, numbers, dashes, or underscores.",
      }),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce
      .number()
      .finite()
      .positive("Discount value must be greater than 0.")
      .max(1_000_000, "Discount value is out of range."),
    minimumOrderAmount: z.coerce
      .number()
      .finite()
      .min(0, "Minimum order amount cannot be negative.")
      .max(1_000_000)
      .default(0),
    maximumDiscount: nullablePositiveMoneySchema,
    usageLimit: nullablePositiveIntSchema,
    usagePerCustomer: z.coerce
      .number()
      .int("Per-customer limit must be a whole number.")
      .min(1, "Per-customer limit must be at least 1.")
      .max(100_000)
      .default(1),
    startsAt: nullableDateSchema,
    expiresAt: nullableDateSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percentage" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount cannot exceed 100%.",
      });
    }
    if (
      data.startsAt instanceof Date &&
      data.expiresAt instanceof Date &&
      data.expiresAt.getTime() <= data.startsAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "Expiration date must be after the start date.",
      });
    }
  });

export type CreateAdminCouponInput = z.infer<typeof createAdminCouponSchema>;

export const updateAdminCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => COUPON_CODE_REGEX.test(v), {
        message:
          "Coupon code must be 3–40 characters using letters, numbers, dashes, or underscores.",
      })
      .optional(),
    discountType: z.enum(["percentage", "fixed"]).optional(),
    discountValue: z.coerce
      .number()
      .finite()
      .positive("Discount value must be greater than 0.")
      .max(1_000_000, "Discount value is out of range.")
      .optional(),
    minimumOrderAmount: z.coerce
      .number()
      .finite()
      .min(0, "Minimum order amount cannot be negative.")
      .max(1_000_000)
      .optional(),
    maximumDiscount: nullablePositiveMoneySchema,
    usageLimit: nullablePositiveIntSchema,
    usagePerCustomer: z.coerce
      .number()
      .int("Per-customer limit must be a whole number.")
      .min(1, "Per-customer limit must be at least 1.")
      .max(100_000)
      .optional(),
    startsAt: nullableDateSchema,
    expiresAt: nullableDateSchema,
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Object.values(data).some((val) => val !== undefined),
    {
      message: "At least one coupon field must be provided for update.",
    }
  );

export type UpdateAdminCouponInput = z.infer<typeof updateAdminCouponSchema>;
