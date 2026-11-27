import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

const optionalTrimmedString = (maxLen: number) =>
  z.preprocess(
    (val) => {
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().max(maxLen).nullable().optional()
  );

const slugInputSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "string") return val;
    const trimmed = val.trim().toLowerCase();
    return trimmed === "" ? undefined : trimmed;
  },
  z
    .string()
    .min(2, "Slug must be at least 2 characters.")
    .max(220, "Slug must be at most 220 characters.")
    .regex(SLUG_REGEX, "Slug may only contain lowercase letters, numbers, and hyphens.")
    .optional()
);

const taxonomySlugInputSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "string") return val;
    const trimmed = val.trim().toLowerCase();
    return trimmed === "" ? undefined : trimmed;
  },
  z
    .string()
    .min(2, "Slug must be at least 2 characters.")
    .max(160, "Slug must be at most 160 characters.")
    .regex(SLUG_REGEX, "Slug may only contain lowercase letters, numbers, and hyphens.")
    .optional()
);

const priceNumberSchema = z.preprocess((val) => {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.trim() !== "") return Number(val);
  return val;
}, z.number({ error: "Price must be a valid number." }).finite().min(0, "Price cannot be negative.").max(1_000_000));

const optionalCompareAtPriceSchema = z.preprocess((val) => {
  if (val === undefined) return undefined;
  if (val === null || val === "") return null;
  if (typeof val === "number") return val;
  if (typeof val === "string") return Number(val);
  return val;
}, z.number({ error: "Compare-at price must be a valid number." }).finite().min(0, "Compare-at price cannot be negative.").max(1_000_000).nullable().optional());

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid identifier format."),
});

export const variantParamsSchema = z.object({
  id: z.string().uuid("Invalid product identifier."),
  variantId: z.string().uuid("Invalid variant identifier."),
});

export const imageParamsSchema = z.object({
  id: z.string().uuid("Invalid product identifier."),
  imageId: z.string().uuid("Invalid image identifier."),
});

export const stagedImageParamsSchema = z.object({
  uploadId: z.string().uuid("Invalid staged image identifier."),
});

export const stagedProductImageSchema = z.object({
  uploadId: z.string().uuid("Invalid staged image identifier."),
}).strict();

export const collectionProductParamsSchema = z.object({
  id: z.string().uuid("Invalid collection identifier."),
  productId: z.string().uuid("Invalid product identifier."),
});

export const adminProductsQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  categoryId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().uuid().optional()
  ),
  published: z.enum(["all", "published", "unpublished"]).default("all"),
  sort: z
    .enum(["newest", "oldest", "name_asc", "price_asc", "price_desc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const createAdminProductSchema = z
  .object({
    categoryId: z.string({ error: "Category is required." }).uuid("Invalid category ID."),
    nameEn: z
      .string({ error: "English name is required." })
      .trim()
      .min(2, "English name must be at least 2 characters.")
      .max(200),
    nameAr: z
      .string({ error: "Arabic name is required." })
      .trim()
      .min(2, "Arabic name must be at least 2 characters.")
      .max(200),
    slug: slugInputSchema,
    descriptionEn: optionalTrimmedString(5000),
    descriptionAr: optionalTrimmedString(5000),
    basePrice: priceNumberSchema,
    compareAtPrice: optionalCompareAtPriceSchema,
    imageUploadIds: z
      .array(z.string().uuid("Invalid staged image ID."))
      .min(1, "At least one product image is required.")
      .max(10, "A product can have at most 10 images.")
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate image uploads are not allowed.")
      .optional(),
    imageUrls: z
      .array(
        z.string().url("Image URL must be a valid URL.").max(2000).refine(
          (value) => {
            try {
              const url = new URL(value);
              return url.protocol === "http:" || url.protocol === "https:";
            } catch {
              return false;
            }
          },
          "Image URL must use HTTP or HTTPS."
        )
      )
      .min(1, "At least one product image is required.")
      .max(10, "A product can have at most 10 images.")
      .refine((urls) => new Set(urls).size === urls.length, "Duplicate image URLs are not allowed.")
      .optional(),
    isPublished: z.boolean().optional().default(false),
    isFeatured: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasUploads = Boolean(data.imageUploadIds?.length);
    const hasUrls = Boolean(data.imageUrls?.length);
    if (hasUploads === hasUrls) {
      ctx.addIssue({
        code: "custom",
        message: "Choose either uploaded images or image URLs, not both.",
        path: ["imageUrls"],
      });
    }
  })
  .refine(
    (data) =>
      data.compareAtPrice === undefined ||
      data.compareAtPrice === null ||
      data.compareAtPrice >= data.basePrice,
    {
      message: "Compare-at price must be greater than or equal to base price.",
      path: ["compareAtPrice"],
    }
  );

export const updateAdminProductSchema = z
  .object({
    categoryId: z.string().uuid("Invalid category ID.").optional(),
    nameEn: z.string().trim().min(2).max(200).optional(),
    nameAr: z.string().trim().min(2).max(200).optional(),
    slug: slugInputSchema,
    descriptionEn: optionalTrimmedString(5000),
    descriptionAr: optionalTrimmedString(5000),
    basePrice: priceNumberSchema.optional(),
    compareAtPrice: optionalCompareAtPriceSchema,
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one product field must be provided for update.",
  });

export const createVariantSchema = z.object({
  size: z.string({ error: "Size is required." }).trim().min(1).max(40),
  color: z.string({ error: "Color is required." }).trim().min(1).max(60),
  price: priceNumberSchema.optional(),
  isActive: z.boolean().optional().default(true),
}).strict();

export const updateVariantSchema = z
  .object({
    size: z.string().trim().min(1).max(40).optional(),
    color: z.string().trim().min(1).max(60).optional(),
    price: priceNumberSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one variant field must be provided for update.",
  });

export const updateProductImageSchema = z
  .object({
    altText: optionalTrimmedString(255),
    displayOrder: z.coerce.number().int().min(0).max(10000).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one image field must be provided for update.",
  });

export const reorderProductImagesSchema = z.object({
  imageIds: z
    .array(z.string().uuid("Invalid image ID."))
    .min(1, "At least one image ID is required."),
});

export const adminCategoriesQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export const createAdminCategorySchema = z.object({
  nameEn: z.string({ error: "English name is required." }).trim().min(2).max(150),
  nameAr: z.string({ error: "Arabic name is required." }).trim().min(2).max(150),
  slug: taxonomySlugInputSchema,
  descriptionEn: optionalTrimmedString(2000),
  descriptionAr: optionalTrimmedString(2000),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.coerce.number().int().min(0).max(10000).optional().default(0),
}).strict();

export const updateAdminCategorySchema = z
  .object({
    nameEn: z.string().trim().min(2).max(150).optional(),
    nameAr: z.string().trim().min(2).max(150).optional(),
    slug: taxonomySlugInputSchema,
    descriptionEn: optionalTrimmedString(2000),
    descriptionAr: optionalTrimmedString(2000),
    isActive: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one category field must be provided for update.",
  });

export const adminCollectionsQuerySchema = z.object({
  search: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : undefined),
    z.string().max(120).optional()
  ),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export const createAdminCollectionSchema = z.object({
  nameEn: z.string({ error: "English name is required." }).trim().min(2).max(150),
  nameAr: z.string({ error: "Arabic name is required." }).trim().min(2).max(150),
  slug: taxonomySlugInputSchema,
  descriptionEn: optionalTrimmedString(2000),
  descriptionAr: optionalTrimmedString(2000),
  isActive: z.boolean().optional().default(true),
}).strict();

export const updateAdminCollectionSchema = z
  .object({
    nameEn: z.string().trim().min(2).max(150).optional(),
    nameAr: z.string().trim().min(2).max(150).optional(),
    slug: taxonomySlugInputSchema,
    descriptionEn: optionalTrimmedString(2000),
    descriptionAr: optionalTrimmedString(2000),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one collection field must be provided for update.",
  });

export const addCollectionProductSchema = z.object({
  productId: z.string({ error: "Product ID is required." }).uuid("Invalid product ID."),
});

export type AdminProductsQuery = z.infer<typeof adminProductsQuerySchema>;
export type CreateAdminProductInput = z.infer<typeof createAdminProductSchema>;
export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;
export type AdminCategoriesQuery = z.infer<typeof adminCategoriesQuerySchema>;
export type CreateAdminCategoryInput = z.infer<typeof createAdminCategorySchema>;
export type UpdateAdminCategoryInput = z.infer<typeof updateAdminCategorySchema>;
export type AdminCollectionsQuery = z.infer<typeof adminCollectionsQuerySchema>;
export type CreateAdminCollectionInput = z.infer<typeof createAdminCollectionSchema>;
export type UpdateAdminCollectionInput = z.infer<typeof updateAdminCollectionSchema>;
