import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  banners,
  categories,
  collections,
  products,
  websiteContent,
  websiteSettings,
} from "../db/schema.js";
import { getShippingSettings } from "./shipping.service.js";
import {
  POLICY_CONTENT_KEYS,
  type PolicyContentKey,
  type UpdateAvailabilityInput,
  type UpdateGeneralSettingsInput,
  type UpdateHomepageSettingsInput,
} from "../validators/adminSettings.validators.js";

export interface StoreInfoDTO {
  storeName: string;
  storeDescriptionEn: string;
  storeDescriptionAr: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  storeAddressEn: string;
  storeAddressAr: string;
  supportHoursEn: string;
  supportHoursAr: string;
  currency: "EGP";
}

export interface StoreAvailabilityDTO {
  isMaintenanceMode: boolean;
  maintenanceMessageEn: string;
  maintenanceMessageAr: string;
}

export interface PolicyContentDTO {
  contentKey: PolicyContentKey;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  updatedAt: string | null;
}

export interface HomepageConfigDTO {
  announcementEnabled: boolean;
  announcementBadgeEn: string;
  announcementBadgeAr: string;
  announcementTextEn: string;
  announcementTextAr: string;
  promoBannerEnabled: boolean;
  promoBannerTitleEn: string;
  promoBannerTitleAr: string;
  promoBannerSubtitleEn: string;
  promoBannerSubtitleAr: string;
  featuredCollectionIds: string[];
  featuredProductIds: string[];
}

const DEFAULT_STORE_INFO: StoreInfoDTO = {
  storeName: "MR. ZAIN",
  storeDescriptionEn:
    "Minimalist heavyweight hoodies, brushed fleece sweatshirts, and structured winter outerwear designed in Cairo.",
  storeDescriptionAr:
    "تصاميم شتوية عصرية بسيطة بجودة عالية، مصممة لتناسب إطلالتك اليومية في مصر.",
  contactEmail: "care@mrzain.eg",
  contactPhone: "+20 100 000 0000",
  whatsappNumber: "+20 100 000 0000",
  storeAddressEn: "Cairo, Egypt",
  storeAddressAr: "القاهرة، مصر",
  supportHoursEn: "Saturday – Thursday, 10:00 AM – 8:00 PM (Cairo Time)",
  supportHoursAr: "السبت – الخميس، 10:00 صباحاً – 8:00 مساءً (بتوقيت القاهرة)",
  currency: "EGP",
};

const DEFAULT_AVAILABILITY: StoreAvailabilityDTO = {
  isMaintenanceMode: false,
  maintenanceMessageEn:
    "MR. ZAIN checkout is temporarily paused for scheduled studio updates. Please check back shortly.",
  maintenanceMessageAr:
    "تم إيقاف إتمام الطلبات مؤقتاً لإجراء تحديثات مجدولة على المتجر. يرجى المحاولة مرة أخرى قريباً.",
};

const DEFAULT_POLICIES: Record<
  PolicyContentKey,
  { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string }
> = {
  about: {
    titleEn: "Built in Cairo. Cut with quiet permanence.",
    titleAr: "صُمم في القاهرة. بقصّة هادئة تدوم طويلاً.",
    bodyEn:
      "MR. ZAIN began with a straightforward goal: heavyweight Egyptian cotton streetwear crafted with restraint, structured proportions, and durable stitching designed for Egyptian winters.",
    bodyAr:
      "بدأت علامة MR. ZAIN بهدف واضح: تقديم أزياء ستريت وير شتوية من القطن المصري الثقيل بتصاميم متزنة وقصّات متقنة تمنحك راحة وأناقة تدوم.",
  },
  contact: {
    titleEn: "Cairo Studio & Client Care",
    titleAr: "استوديو القاهرة وخدمة العملاء",
    bodyEn:
      "Reach out to our Cairo client care team for sizing advice, governorate delivery estimates, or Cash on Delivery order support.",
    bodyAr:
      "تواصل مع فريق خدمة العملاء في القاهرة لأي استفسار حول المقاسات أو مواعيد التوصيل للمحافظات أو طلبات الدفع عند الاستلام.",
  },
  shipping_policy: {
    titleEn: "Shipping & Delivery Policy",
    titleAr: "سياسة الشحن والتوصيل",
    bodyEn:
      "We deliver across all 27 Egyptian governorates with Cash on Delivery (COD). Standard delivery takes 2–5 business days depending on your governorate, and orders above the free-shipping threshold qualify automatically for complimentary delivery.",
    bodyAr:
      "نوصل لجميع المحافظات المصرية البالغ عددها 27 محافظة مع خيار الدفع عند الاستلام. يستغرق التوصيل عادةً من 2 إلى 5 أيام عمل حسب المحافظة، وتستفيد الطلبات التي تتجاوز حد الشحن المجاني من توصيل مجاني تلقائياً.",
  },
  return_policy: {
    titleEn: "Returns & Exchanges Policy",
    titleAr: "سياسة الاستبدال والاسترجاع",
    bodyEn:
      "Unworn garments in original condition with tags attached may be exchanged or returned within 14 days of delivery. Contact our client care team with your order number to arrange courier pickup.",
    bodyAr:
      "يمكن استبدال أو استرجاع القطع غير المستخدمة وبحالتها الأصلية مع كامل البطاقات خلال 14 يوماً من تاريخ الاستلام. تواصل مع فريق خدمة العملاء برقم الطلب لترتيب استلام المندوب.",
  },
  privacy_policy: {
    titleEn: "Privacy Policy",
    titleAr: "سياسة الخصوصية",
    bodyEn:
      "MR. ZAIN collects only the account, shipping address, and order details required to fulfill your purchases and support your account. We never sell customer personal information to third parties.",
    bodyAr:
      "تجمع MR. ZAIN فقط بيانات الحساب وعنوان التوصيل والطلبات اللازمة لتنفيذ مشترياتك ودعم حسابك. نحن لا نبيع بيانات العملاء الشخصية لأي طرف ثالث.",
  },
  terms_conditions: {
    titleEn: "Terms & Conditions",
    titleAr: "الشروط والأحكام",
    bodyEn:
      "All orders are priced in Egyptian Pounds (EGP) and confirmed subject to stock availability. Cash on Delivery orders are collected upon courier handoff in Egyptian Pounds.",
    bodyAr:
      "تُسعّر جميع الطلبات بالجنيه المصري وتُؤكد حسب توفر المخزون الفعلي. تُحصّل طلبات الدفع عند الاستلام نقداً بالجنيه المصري عند تسليم المندوب.",
  },
};

const DEFAULT_HOMEPAGE: HomepageConfigDTO = {
  announcementEnabled: true,
  announcementBadgeEn: "Egypt Delivery",
  announcementBadgeAr: "التوصيل في مصر",
  announcementTextEn: "Free delivery on orders above 2,500 EGP across governorates.",
  announcementTextAr: "توصيل مجاني للطلبات فوق 2,500 جنيه مصري لجميع المحافظات.",
  promoBannerEnabled: true,
  promoBannerTitleEn: "Engineered for cold Cairo nights.",
  promoBannerTitleAr: "مصممة لليالي القاهرة الباردة.",
  promoBannerSubtitleEn:
    "Structured wool-blend overshirts and quilted winter jackets available across limited seasonal runs.",
  promoBannerSubtitleAr:
    "أوفرشيرت صوفي منظم وجواكت شتوية مبطنة متوفرة بإصدارات موسمية محدودة.",
  featuredCollectionIds: [],
  featuredProductIds: [],
};

function parseJsonUuidArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return [
      ...new Set(
        parsed.filter((item): item is string => typeof item === "string" && uuidRegex.test(item))
      ),
    ];
  } catch {
    return [];
  }
}

async function readSettingsMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      settingKey: websiteSettings.settingKey,
      settingValue: websiteSettings.settingValue,
    })
    .from(websiteSettings);
  return new Map(rows.map((r) => [r.settingKey, r.settingValue]));
}

async function upsertSettingsPairs(entries: Array<[string, string]>) {
  if (entries.length === 0) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(websiteSettings)
        .values({
          settingKey: key,
          settingValue: value,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: websiteSettings.settingKey,
          set: {
            settingValue: value,
            updatedAt: now,
          },
        });
    }
  });
}

function buildStoreInfoFromMap(map: Map<string, string>): StoreInfoDTO {
  return {
    storeName: map.get("store.name") ?? DEFAULT_STORE_INFO.storeName,
    storeDescriptionEn:
      map.get("store.description_en") ?? DEFAULT_STORE_INFO.storeDescriptionEn,
    storeDescriptionAr:
      map.get("store.description_ar") ?? DEFAULT_STORE_INFO.storeDescriptionAr,
    contactEmail: map.get("store.contact_email") ?? DEFAULT_STORE_INFO.contactEmail,
    contactPhone: map.get("store.contact_phone") ?? DEFAULT_STORE_INFO.contactPhone,
    whatsappNumber:
      map.get("store.whatsapp_number") ?? DEFAULT_STORE_INFO.whatsappNumber,
    storeAddressEn:
      map.get("store.address_en") ?? DEFAULT_STORE_INFO.storeAddressEn,
    storeAddressAr:
      map.get("store.address_ar") ?? DEFAULT_STORE_INFO.storeAddressAr,
    supportHoursEn:
      map.get("store.support_hours_en") ?? DEFAULT_STORE_INFO.supportHoursEn,
    supportHoursAr:
      map.get("store.support_hours_ar") ?? DEFAULT_STORE_INFO.supportHoursAr,
    currency: "EGP",
  };
}

function buildAvailabilityFromMap(map: Map<string, string>): StoreAvailabilityDTO {
  return {
    isMaintenanceMode: map.get("availability.maintenance_enabled") === "true",
    maintenanceMessageEn:
      map.get("availability.maintenance_message_en") ??
      DEFAULT_AVAILABILITY.maintenanceMessageEn,
    maintenanceMessageAr:
      map.get("availability.maintenance_message_ar") ??
      DEFAULT_AVAILABILITY.maintenanceMessageAr,
  };
}

function buildHomepageFromMap(
  map: Map<string, string>,
  firstBanner?: {
    titleEn: string | null;
    titleAr: string | null;
    subtitleEn: string | null;
    subtitleAr: string | null;
  }
): HomepageConfigDTO {
  const announcementEnabledRaw = map.get("homepage.announcement_enabled");
  const promoEnabledRaw = map.get("homepage.promo_banner_enabled");

  return {
    announcementEnabled:
      announcementEnabledRaw !== undefined
        ? announcementEnabledRaw === "true"
        : DEFAULT_HOMEPAGE.announcementEnabled,
    announcementBadgeEn:
      map.get("homepage.announcement_badge_en") ??
      DEFAULT_HOMEPAGE.announcementBadgeEn,
    announcementBadgeAr:
      map.get("homepage.announcement_badge_ar") ??
      DEFAULT_HOMEPAGE.announcementBadgeAr,
    announcementTextEn:
      map.get("homepage.announcement_text_en") ??
      DEFAULT_HOMEPAGE.announcementTextEn,
    announcementTextAr:
      map.get("homepage.announcement_text_ar") ??
      DEFAULT_HOMEPAGE.announcementTextAr,
    promoBannerEnabled:
      promoEnabledRaw !== undefined
        ? promoEnabledRaw === "true"
        : DEFAULT_HOMEPAGE.promoBannerEnabled,
    promoBannerTitleEn:
      map.get("homepage.promo_banner_title_en") ??
      firstBanner?.titleEn ??
      DEFAULT_HOMEPAGE.promoBannerTitleEn,
    promoBannerTitleAr:
      map.get("homepage.promo_banner_title_ar") ??
      firstBanner?.titleAr ??
      DEFAULT_HOMEPAGE.promoBannerTitleAr,
    promoBannerSubtitleEn:
      map.get("homepage.promo_banner_subtitle_en") ??
      firstBanner?.subtitleEn ??
      DEFAULT_HOMEPAGE.promoBannerSubtitleEn,
    promoBannerSubtitleAr:
      map.get("homepage.promo_banner_subtitle_ar") ??
      firstBanner?.subtitleAr ??
      DEFAULT_HOMEPAGE.promoBannerSubtitleAr,
    featuredCollectionIds: parseJsonUuidArray(
      map.get("homepage.featured_collection_ids")
    ),
    featuredProductIds: parseJsonUuidArray(
      map.get("homepage.featured_product_ids")
    ),
  };
}

async function readPoliciesList(): Promise<Record<PolicyContentKey, PolicyContentDTO>> {
  const rows = await db
    .select()
    .from(websiteContent)
    .where(inArray(websiteContent.contentKey, [...POLICY_CONTENT_KEYS]));

  const rowMap = new Map(rows.map((r) => [r.contentKey, r]));
  const result = {} as Record<PolicyContentKey, PolicyContentDTO>;

  for (const key of POLICY_CONTENT_KEYS) {
    const row = rowMap.get(key);
    const defaults = DEFAULT_POLICIES[key];
    result[key] = {
      contentKey: key,
      titleEn: row?.titleEn ?? defaults.titleEn,
      titleAr: row?.titleAr ?? defaults.titleAr,
      bodyEn: row?.bodyEn ?? defaults.bodyEn,
      bodyAr: row?.bodyAr ?? defaults.bodyAr,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  return result;
}

export async function getStoreMaintenanceStatus(): Promise<StoreAvailabilityDTO> {
  const rows = await db
    .select({
      settingKey: websiteSettings.settingKey,
      settingValue: websiteSettings.settingValue,
    })
    .from(websiteSettings)
    .where(
      inArray(websiteSettings.settingKey, [
        "availability.maintenance_enabled",
        "availability.maintenance_message_en",
        "availability.maintenance_message_ar",
      ])
    );
  const map = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
  return buildAvailabilityFromMap(map);
}

export async function getHomepageAdminConfig(): Promise<HomepageConfigDTO> {
  const [map, bannerRows] = await Promise.all([
    readSettingsMap(),
    db
      .select({
        titleEn: banners.titleEn,
        titleAr: banners.titleAr,
        subtitleEn: banners.subtitleEn,
        subtitleAr: banners.subtitleAr,
      })
      .from(banners)
      .orderBy(asc(banners.displayOrder))
      .limit(1),
  ]);
  return buildHomepageFromMap(map, bannerRows[0]);
}

export async function getAdminSettingsOverview() {
  const [
    map,
    policies,
    shippingSummary,
    bannerRows,
    availableCollections,
    availableProducts,
  ] = await Promise.all([
    readSettingsMap(),
    readPoliciesList(),
    getShippingSettings(),
    db
      .select({
        titleEn: banners.titleEn,
        titleAr: banners.titleAr,
        subtitleEn: banners.subtitleEn,
        subtitleAr: banners.subtitleAr,
      })
      .from(banners)
      .orderBy(asc(banners.displayOrder))
      .limit(1),
    db
      .select({
        id: collections.id,
        slug: collections.slug,
        nameEn: collections.nameEn,
        nameAr: collections.nameAr,
        isActive: collections.isActive,
      })
      .from(collections)
      .orderBy(asc(collections.nameEn)),
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        isPublished: products.isPublished,
        categoryActive: categories.isActive,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .orderBy(desc(products.createdAt))
      .limit(200),
  ]);

  return {
    storeInfo: buildStoreInfoFromMap(map),
    availability: buildAvailabilityFromMap(map),
    policies,
    homepage: buildHomepageFromMap(map, bannerRows[0]),
    shippingSummary,
    availableCollections,
    availableProducts,
  };
}

export async function updateAdminGeneralSettings(
  input: UpdateGeneralSettingsInput
) {
  const settingPairs: Array<[string, string]> = [];

  if (input.storeInfo) {
    const s = input.storeInfo;
    if (s.storeName !== undefined) settingPairs.push(["store.name", s.storeName]);
    if (s.storeDescriptionEn !== undefined)
      settingPairs.push(["store.description_en", s.storeDescriptionEn]);
    if (s.storeDescriptionAr !== undefined)
      settingPairs.push(["store.description_ar", s.storeDescriptionAr]);
    if (s.contactEmail !== undefined)
      settingPairs.push(["store.contact_email", s.contactEmail]);
    if (s.contactPhone !== undefined)
      settingPairs.push(["store.contact_phone", s.contactPhone]);
    if (s.whatsappNumber !== undefined)
      settingPairs.push(["store.whatsapp_number", s.whatsappNumber]);
    if (s.storeAddressEn !== undefined)
      settingPairs.push(["store.address_en", s.storeAddressEn]);
    if (s.storeAddressAr !== undefined)
      settingPairs.push(["store.address_ar", s.storeAddressAr]);
    if (s.supportHoursEn !== undefined)
      settingPairs.push(["store.support_hours_en", s.supportHoursEn]);
    if (s.supportHoursAr !== undefined)
      settingPairs.push(["store.support_hours_ar", s.supportHoursAr]);
  }

  await upsertSettingsPairs(settingPairs);

  if (input.policies) {
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const key of POLICY_CONTENT_KEYS) {
        const entry = input.policies?.[key];
        if (!entry) continue;

        const [existing] = await tx
          .select()
          .from(websiteContent)
          .where(eq(websiteContent.contentKey, key))
          .limit(1);

        const defaults = DEFAULT_POLICIES[key];
        const titleEn = entry.titleEn ?? existing?.titleEn ?? defaults.titleEn;
        const titleAr = entry.titleAr ?? existing?.titleAr ?? defaults.titleAr;
        const bodyEn = entry.bodyEn ?? existing?.bodyEn ?? defaults.bodyEn;
        const bodyAr = entry.bodyAr ?? existing?.bodyAr ?? defaults.bodyAr;

        await tx
          .insert(websiteContent)
          .values({
            contentKey: key,
            titleEn,
            titleAr,
            bodyEn,
            bodyAr,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: websiteContent.contentKey,
            set: {
              titleEn,
              titleAr,
              bodyEn,
              bodyAr,
              updatedAt: now,
            },
          });
      }
    });
  }

  return getAdminSettingsOverview();
}

export async function updateAdminAvailabilitySettings(
  input: UpdateAvailabilityInput
) {
  await upsertSettingsPairs([
    ["availability.maintenance_enabled", String(input.isMaintenanceMode)],
    ["availability.maintenance_message_en", input.maintenanceMessageEn],
    ["availability.maintenance_message_ar", input.maintenanceMessageAr],
  ]);

  return getStoreMaintenanceStatus();
}

export async function updateAdminHomepageSettings(
  input: UpdateHomepageSettingsInput
) {
  const pairs: Array<[string, string]> = [
    ["homepage.announcement_enabled", String(input.announcementEnabled)],
    ["homepage.announcement_badge_en", input.announcementBadgeEn],
    ["homepage.announcement_badge_ar", input.announcementBadgeAr],
    ["homepage.announcement_text_en", input.announcementTextEn],
    ["homepage.announcement_text_ar", input.announcementTextAr],
    ["homepage.promo_banner_enabled", String(input.promoBannerEnabled)],
  ];

  if (input.promoBannerTitleEn !== undefined) {
    pairs.push(["homepage.promo_banner_title_en", input.promoBannerTitleEn]);
  }
  if (input.promoBannerTitleAr !== undefined) {
    pairs.push(["homepage.promo_banner_title_ar", input.promoBannerTitleAr]);
  }
  if (input.promoBannerSubtitleEn !== undefined) {
    pairs.push([
      "homepage.promo_banner_subtitle_en",
      input.promoBannerSubtitleEn,
    ]);
  }
  if (input.promoBannerSubtitleAr !== undefined) {
    pairs.push([
      "homepage.promo_banner_subtitle_ar",
      input.promoBannerSubtitleAr,
    ]);
  }

  if (input.featuredCollectionIds !== undefined) {
    let validIds: string[] = [];
    if (input.featuredCollectionIds.length > 0) {
      const existing = await db
        .select({ id: collections.id })
        .from(collections)
        .where(inArray(collections.id, input.featuredCollectionIds));
      const existingSet = new Set(existing.map((c) => c.id));
      validIds = input.featuredCollectionIds.filter((id) => existingSet.has(id));
    }
    pairs.push(["homepage.featured_collection_ids", JSON.stringify(validIds)]);
  }

  if (input.featuredProductIds !== undefined) {
    let validIds: string[] = [];
    if (input.featuredProductIds.length > 0) {
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, input.featuredProductIds));
      const existingSet = new Set(existing.map((p) => p.id));
      validIds = input.featuredProductIds.filter((id) => existingSet.has(id));
    }
    pairs.push(["homepage.featured_product_ids", JSON.stringify(validIds)]);
  }

  await upsertSettingsPairs(pairs);
  return getHomepageAdminConfig();
}

export async function getPublicStorefrontSettings() {
  const [map, policies, shipping] = await Promise.all([
    readSettingsMap(),
    readPoliciesList(),
    getShippingSettings(),
  ]);

  const homepage = buildHomepageFromMap(map);

  return {
    storeInfo: buildStoreInfoFromMap(map),
    availability: buildAvailabilityFromMap(map),
    announcement: {
      enabled: homepage.announcementEnabled,
      badgeEn: homepage.announcementBadgeEn,
      badgeAr: homepage.announcementBadgeAr,
      textEn: homepage.announcementTextEn,
      textAr: homepage.announcementTextAr,
    },
    promoBanner: {
      enabled: homepage.promoBannerEnabled,
      titleEn: homepage.promoBannerTitleEn,
      titleAr: homepage.promoBannerTitleAr,
      subtitleEn: homepage.promoBannerSubtitleEn,
      subtitleAr: homepage.promoBannerSubtitleAr,
    },
    shipping: {
      freeShippingThreshold: shipping.freeShippingThreshold,
      isFreeShippingEnabled: shipping.isFreeShippingEnabled,
      isCodEnabled: shipping.isCodEnabled,
    },
    policies,
  };
}
