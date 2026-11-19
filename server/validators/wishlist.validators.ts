import { z } from "zod";

export const addWishlistItemSchema = z.object({
  productId: z.string().uuid("Product ID must be a valid UUID."),
});

export const wishlistProductParamSchema = z.object({
  productId: z.string().uuid("Product ID must be a valid UUID."),
});

export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
