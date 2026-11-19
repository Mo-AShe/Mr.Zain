import { z } from "zod";

function sanitizePlainText(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

const cleanText = (minLen: number, maxLen: number, label: string) =>
  z
    .string()
    .transform(sanitizePlainText)
    .refine((v) => v.length >= minLen, {
      message: `${label} must be at least ${minLen} character(s).`,
    })
    .refine((v) => v.length <= maxLen, {
      message: `${label} must not exceed ${maxLen} characters.`,
    });

export const POLICY_CONTENT_KEYS = [
  "about",
  "contact",
  "shipping_policy",
  "return_policy",
  "privacy_policy",
  "terms_conditions",
] as const;

export type PolicyContentKey = (typeof POLICY_CONTENT_KEYS)[number];

export const storeInfoUpdateSchema = z.object({
  storeName: cleanText(2, 120, "Store name").optional(),
  storeDescriptionEn: cleanText(0, 1000, "English store description").optional(),
  storeDescriptionAr: cleanText(0, 1000, "Arabic store description").optional(),
  contactEmail: z
    .string()
    .trim()
    .email("Please enter a valid contact email address.")
    .max(180)
    .optional(),
  contactPhone: cleanText(5, 40, "Contact phone").optional(),
  whatsappNumber: cleanText(5, 40, "WhatsApp number").optional(),
  storeAddressEn: cleanText(0, 300, "English store address").optional(),
  storeAddressAr: cleanText(0, 300, "Arabic store address").optional(),
  supportHoursEn: cleanText(0, 200, "English support hours").optional(),
  supportHoursAr: cleanText(0, 200, "Arabic support hours").optional(),
});

const policyUpdateItemSchema = z.object({
  titleEn: cleanText(1, 200, "English policy title").optional(),
  titleAr: cleanText(1, 200, "Arabic policy title").optional(),
  bodyEn: cleanText(0, 8000, "English policy content").optional(),
  bodyAr: cleanText(0, 8000, "Arabic policy content").optional(),
});

export const updateGeneralSettingsSchema = z
  .object({
    storeInfo: storeInfoUpdateSchema.optional(),
    policies: z
      .object({
        about: policyUpdateItemSchema.optional(),
        contact: policyUpdateItemSchema.optional(),
        shipping_policy: policyUpdateItemSchema.optional(),
        return_policy: policyUpdateItemSchema.optional(),
        privacy_policy: policyUpdateItemSchema.optional(),
        terms_conditions: policyUpdateItemSchema.optional(),
      })
      .optional(),
  })
  .refine(
    (data) => data.storeInfo !== undefined || data.policies !== undefined,
    { message: "No settings updates were provided." }
  );

export type UpdateGeneralSettingsInput = z.infer<typeof updateGeneralSettingsSchema>;

export const updateAvailabilitySchema = z.object({
  isMaintenanceMode: z.boolean(),
  maintenanceMessageEn: cleanText(0, 600, "English maintenance message").default(""),
  maintenanceMessageAr: cleanText(0, 600, "Arabic maintenance message").default(""),
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const updateHomepageSettingsSchema = z.object({
  announcementEnabled: z.boolean(),
  announcementBadgeEn: cleanText(0, 80, "English announcement badge").default(""),
  announcementBadgeAr: cleanText(0, 80, "Arabic announcement badge").default(""),
  announcementTextEn: cleanText(0, 300, "English announcement text").default(""),
  announcementTextAr: cleanText(0, 300, "Arabic announcement text").default(""),
  promoBannerEnabled: z.boolean(),
  promoBannerTitleEn: cleanText(0, 200, "English promo banner title").optional(),
  promoBannerTitleAr: cleanText(0, 200, "Arabic promo banner title").optional(),
  promoBannerSubtitleEn: cleanText(0, 300, "English promo banner subtitle").optional(),
  promoBannerSubtitleAr: cleanText(0, 300, "Arabic promo banner subtitle").optional(),
  featuredCollectionIds: z
    .array(z.string().uuid("Each selected collection must be a valid ID."))
    .max(3, "You can select up to 3 featured collections.")
    .transform((arr) => [...new Set(arr)])
    .optional(),
  featuredProductIds: z
    .array(z.string().uuid("Each selected product must be a valid ID."))
    .max(8, "You can select up to 8 featured products.")
    .transform((arr) => [...new Set(arr)])
    .optional(),
});

export type UpdateHomepageSettingsInput = z.infer<typeof updateHomepageSettingsSchema>;
