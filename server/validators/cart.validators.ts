import { z } from "zod";

export const addCartItemSchema = z.object({
  variantId: z.string().uuid("Variant ID must be a valid UUID."),
  productId: z.string().uuid("Product ID must be a valid UUID.").optional(),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(99, "Quantity cannot exceed 99 per request.")
    .default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(99, "Quantity cannot exceed 99."),
});

export const cartItemIdParamSchema = z.object({
  itemId: z.string().uuid("Cart item ID must be a valid UUID."),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
