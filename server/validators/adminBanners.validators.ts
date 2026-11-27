import { z } from "zod";

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().max(maxLength).nullable().optional()
  );

const targetUrlSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    return value.trim() || null;
  },
  z
    .string()
    .max(500)
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//"),
      "Banner links must use a safe internal path."
    )
    .nullable()
    .optional()
);

const titleEnSchema = z.string().trim().min(2).max(200);
const titleArSchema = z.string().trim().min(2).max(200);
const bannerImageUrlSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    return value.trim() || null;
  },
  z
    .string()
    .url("Banner image URL must be a valid URL.")
    .max(2000)
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      "Banner image URL must use HTTP or HTTPS."
    )
    .nullable()
    .optional()
);

export const createAdminBannerSchema = z
  .object({
    titleEn: titleEnSchema,
    titleAr: titleArSchema,
    subtitleEn: optionalText(300),
    subtitleAr: optionalText(300),
    targetUrl: targetUrlSchema,
    displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    isActive: z.boolean().default(true),
    imageUploadId: z.string().uuid("Invalid staged image identifier.").optional(),
    imageUrl: bannerImageUrlSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasUpload = Boolean(value.imageUploadId);
    const hasUrl = Boolean(value.imageUrl);
    if (hasUpload === hasUrl) {
      ctx.addIssue({
        code: "custom",
        message: "Choose either an uploaded image or an image URL.",
        path: ["imageUrl"],
      });
    }
  });

export const updateAdminBannerSchema = z
  .object({
    titleEn: titleEnSchema.optional(),
    titleAr: titleArSchema.optional(),
    subtitleEn: optionalText(300),
    subtitleAr: optionalText(300),
    targetUrl: targetUrlSchema,
    displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
    imageUploadId: z.string().uuid("Invalid staged image identifier.").optional(),
    imageUrl: bannerImageUrlSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.imageUploadId && value.imageUrl) {
      ctx.addIssue({
        code: "custom",
        message: "Choose either an uploaded image or an image URL.",
        path: ["imageUrl"],
      });
    }
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one banner field must be provided for update.",
  });

export type CreateAdminBannerInput = z.infer<typeof createAdminBannerSchema>;
export type UpdateAdminBannerInput = z.infer<typeof updateAdminBannerSchema>;
