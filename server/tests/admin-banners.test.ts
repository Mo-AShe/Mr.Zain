import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminBannerSchema,
  updateAdminBannerSchema,
} from "../validators/adminBanners.validators.js";

const validBanner = {
  titleEn: "Winter collection",
  titleAr: "مجموعة الشتاء",
  subtitleEn: "Seasonal outerwear",
  subtitleAr: "ملابس شتوية",
  targetUrl: "/shop.html?category=jackets",
  displayOrder: 1,
  isActive: true,
  imageUploadId: "9f1f834d-5176-4b67-8a68-2fd1022454cc",
};

test("admin banners accept valid bilingual content and safe internal links", () => {
  assert.equal(createAdminBannerSchema.safeParse(validBanner).success, true);
  assert.equal(
    createAdminBannerSchema.safeParse({
      ...validBanner,
      imageUploadId: undefined,
      imageUrl: "https://example.com/banner.jpg",
    }).success,
    true
  );
  assert.equal(
    createAdminBannerSchema.safeParse({
      ...validBanner,
      imageUrl: "https://example.com/banner.jpg",
    }).success,
    false
  );
  assert.equal(
    createAdminBannerSchema.safeParse({
      ...validBanner,
      imageUploadId: undefined,
      imageUrl: "javascript:alert(1)",
    }).success,
    false
  );
  assert.equal(
    createAdminBannerSchema.safeParse({
      ...validBanner,
      targetUrl: "https://example.com",
    }).success,
    false
  );
  assert.equal(
    createAdminBannerSchema.safeParse({
      ...validBanner,
      targetUrl: "//example.com",
    }).success,
    false
  );
});

test("banner updates require at least one valid editable field", () => {
  assert.equal(updateAdminBannerSchema.safeParse({ isActive: false }).success, true);
  assert.equal(updateAdminBannerSchema.safeParse({}).success, false);
  assert.equal(
    updateAdminBannerSchema.safeParse({ displayOrder: -1 }).success,
    false
  );
});
