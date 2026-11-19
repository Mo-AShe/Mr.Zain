import { z } from "zod";

export const adminCustomersQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sort: z
    .enum(["newest", "oldest", "spend_desc", "orders_desc", "name_asc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export const updateCustomerStatusSchema = z.object({
  isActive: z.boolean({ error: "isActive boolean is required." }),
  reason: z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "string") return v;
      const trimmed = v.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().max(300).optional()
  ),
});

export type AdminCustomersQueryInput = z.infer<typeof adminCustomersQuerySchema>;
export type UpdateCustomerStatusInput = z.infer<typeof updateCustomerStatusSchema>;
