import { z } from "zod";

function emptyToUndefined(val: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  orderNumber: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(40).optional()
  ),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID."),
});

export const cancelOrderSchema = z.object({
  reason: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(500, "Cancellation reason must be at most 500 characters.").optional()
  ),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
