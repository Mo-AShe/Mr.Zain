import { z } from "zod";

const optionalTrimmedString = (maxLen: number) =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim() || undefined : undefined),
    z.string().max(maxLen).optional()
  );

const optionalPositiveNumber = z.preprocess((val) => {
  if (val === undefined || val === null || val === "") return undefined;
  const num = Number(val);
  return Number.isNaN(num) ? val : num;
}, z.number().min(0).max(1_000_000).optional());

const optionalBooleanFlag = z.preprocess((val) => {
  if (val === undefined || val === null || val === "") return undefined;
  if (val === true || val === "true" || val === "1") return true;
  if (val === false || val === "false" || val === "0") return false;
  return val;
}, z.boolean().optional());

export const productsQuerySchema = z
  .object({
    search: optionalTrimmedString(120),
    q: optionalTrimmedString(120),
    category: optionalTrimmedString(160),
    collection: optionalTrimmedString(160),
    minPrice: optionalPositiveNumber,
    maxPrice: optionalPositiveNumber,
    size: optionalTrimmedString(40),
    color: optionalTrimmedString(60),
    inStock: optionalBooleanFlag,
    inStockOnly: optionalBooleanFlag,
    sort: z
      .enum(["newest", "price_asc", "price_desc", "popularity"])
      .default("newest"),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    {
      message: "minPrice cannot be greater than maxPrice.",
      path: ["minPrice"],
    }
  );

export const productSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(220)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid product slug format."),
});

export type ProductsQueryInput = z.infer<typeof productsQuerySchema>;
