import { z } from "zod";

const nullableMaxDaysSchema = z
  .unknown()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const num = Number(val);
    if (!Number.isInteger(num) || num < 1 || num > 90) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum delivery days must be an integer between 1 and 90.",
      });
      return z.NEVER;
    }
    return num;
  });

export const adminShippingQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sort: z
    .enum([
      "governorate_asc",
      "governorate_desc",
      "fee_asc",
      "fee_desc",
      "days_asc",
    ])
    .default("governorate_asc"),
});

export type AdminShippingQuery = z.infer<typeof adminShippingQuerySchema>;

export const createShippingZoneSchema = z
  .object({
    governorate: z
      .string()
      .trim()
      .min(2, "Governorate name must be at least 2 characters.")
      .max(100, "Governorate name must not exceed 100 characters."),
    shippingFee: z.coerce
      .number()
      .finite()
      .min(0, "Shipping fee cannot be negative.")
      .max(100_000, "Shipping fee is out of range.")
      .transform((v) => Math.round(v * 100) / 100),
    estimatedDeliveryDays: z.coerce
      .number()
      .int("Delivery days must be a whole number.")
      .min(1, "Estimated delivery days must be at least 1.")
      .max(60, "Estimated delivery days cannot exceed 60."),
    estimatedDeliveryMaxDays: nullableMaxDaysSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (
      typeof data.estimatedDeliveryMaxDays === "number" &&
      data.estimatedDeliveryMaxDays < data.estimatedDeliveryDays
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedDeliveryMaxDays"],
        message: "Maximum delivery days cannot be less than minimum delivery days.",
      });
    }
  });

export type CreateShippingZoneInput = z.infer<typeof createShippingZoneSchema>;

export const updateShippingZoneSchema = z
  .object({
    governorate: z
      .string()
      .trim()
      .min(2, "Governorate name must be at least 2 characters.")
      .max(100, "Governorate name must not exceed 100 characters.")
      .optional(),
    shippingFee: z.coerce
      .number()
      .finite()
      .min(0, "Shipping fee cannot be negative.")
      .max(100_000, "Shipping fee is out of range.")
      .transform((v) => Math.round(v * 100) / 100)
      .optional(),
    estimatedDeliveryDays: z.coerce
      .number()
      .int("Delivery days must be a whole number.")
      .min(1, "Estimated delivery days must be at least 1.")
      .max(60, "Estimated delivery days cannot exceed 60.")
      .optional(),
    estimatedDeliveryMaxDays: nullableMaxDaysSchema,
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one shipping zone field must be provided.",
  });

export type UpdateShippingZoneInput = z.infer<typeof updateShippingZoneSchema>;

export const updateShippingSettingsSchema = z
  .object({
    freeShippingThreshold: z.coerce
      .number()
      .finite()
      .min(0, "Free shipping threshold cannot be negative.")
      .max(1_000_000, "Free shipping threshold is out of range.")
      .transform((v) => Math.round(v * 100) / 100)
      .optional(),
    isFreeShippingEnabled: z.boolean().optional(),
    isCodEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one shipping rule field must be provided.",
  });

export type UpdateShippingSettingsInput = z.infer<typeof updateShippingSettingsSchema>;
