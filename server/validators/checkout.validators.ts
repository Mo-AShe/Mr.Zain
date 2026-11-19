import { z } from "zod";

function emptyToUndefined(val: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const shippingQuoteSchema = z
  .object({
    addressId: z.preprocess(
      emptyToUndefined,
      z.string().uuid("Invalid address ID.").optional()
    ),
    governorate: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(2).max(100).optional()
    ),
    couponCode: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(1).max(60).optional()
    ),
  })
  .refine((data) => Boolean(data.addressId || data.governorate), {
    message: "Either addressId or governorate is required to calculate shipping.",
    path: ["governorate"],
  });

export const checkoutPreviewQuerySchema = z.object({
  addressId: z.preprocess(
    emptyToUndefined,
    z.string().uuid("Invalid address ID.").optional()
  ),
  governorate: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(2).max(100).optional()
  ),
  couponCode: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(60).optional()
  ),
});

export const placeOrderSchema = z.object({
  addressId: z.string({ error: "Delivery address is required." }).uuid("Invalid delivery address ID."),
  paymentMethod: z.literal("cod", {
    error: "Cash on Delivery (COD) is the only supported payment method.",
  }),
  couponCode: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(60).optional()
  ),
  customerNotes: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(500, "Order notes must be at most 500 characters.").optional()
  ),
  idempotencyKey: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(8, "Idempotency key must be at least 8 characters.")
      .max(128, "Idempotency key must be at most 128 characters.")
      .optional()
  ),
});

export type ShippingQuoteInput = z.infer<typeof shippingQuoteSchema>;
export type CheckoutPreviewQuery = z.infer<typeof checkoutPreviewQuerySchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
