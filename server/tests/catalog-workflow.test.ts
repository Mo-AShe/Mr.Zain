import assert from "node:assert/strict";
import test from "node:test";
import { getProductPublicationReadiness } from "../services/product-publication.js";
import {
  isWithinNewProductWindow,
  NEW_PRODUCT_WINDOW_DAYS,
} from "../services/product-merchandising.service.js";
import {
  createAdminCategorySchema,
  createAdminCollectionSchema,
  createAdminProductSchema,
  createVariantSchema,
  updateAdminProductSchema,
} from "../validators/adminCatalog.validators.js";
import {
  adminInventoryMovementsQuerySchema,
  createStockAdjustmentSchema,
} from "../validators/adminInventory.validators.js";
import { consumeStagedProductImage } from "../services/productImageStorage.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { TRANSLATIONS } from "../../frontend/js/i18n/translations.js";

test("publication readiness requires an active category and purchasable active variant", () => {
  assert.deepEqual(
    getProductPublicationReadiness(false, [
      { isActive: true, quantity: 3, reservedQuantity: 1 },
    ], true),
    { canPublish: false, blockers: ["inactive_category"] }
  );
  assert.deepEqual(
    getProductPublicationReadiness(true, [
      { isActive: false, quantity: 4, reservedQuantity: 0 },
    ], true),
    { canPublish: false, blockers: ["no_active_variant"] }
  );
  assert.deepEqual(
    getProductPublicationReadiness(true, [
      { isActive: true, quantity: 2, reservedQuantity: 2 },
    ], true),
    { canPublish: false, blockers: ["no_available_stock"] }
  );
  assert.deepEqual(
    getProductPublicationReadiness(true, [
      { isActive: true, quantity: 2, reservedQuantity: 1 },
    ], true),
    { canPublish: true, blockers: [] }
  );
  assert.deepEqual(
    getProductPublicationReadiness(true, [], false),
    {
      canPublish: false,
      blockers: ["no_product_image", "no_active_variant"],
    }
  );
});

test("category and collection slugs respect the database's 160-character limit", () => {
  const category = {
    nameEn: "Hoodies",
    nameAr: "هوديز",
    slug: "a".repeat(160),
  };
  assert.equal(createAdminCategorySchema.safeParse(category).success, true);
  assert.equal(
    createAdminCategorySchema.safeParse({ ...category, slug: "a".repeat(161) })
      .success,
    false
  );
  assert.equal(
    createAdminCollectionSchema.safeParse({
      nameEn: "Winter Collection",
      nameAr: "مجموعة الشتاء",
      slug: "a".repeat(161),
    }).success,
    false
  );
  assert.equal(
    createAdminCategorySchema.safeParse({ ...category, imageUrl: "/uploads/category.png" }).success,
    false
  );
  assert.equal(
    createAdminCollectionSchema.safeParse({
      nameEn: "Winter Collection",
      nameAr: "مجموعة الشتاء",
      imageUrl: "/uploads/collection.png",
    }).success,
    false
  );
});

test("admin product creation requires staged images and variants do not accept SKU input", () => {
  const product = {
    categoryId: "b2e3b87c-9037-4a14-9de8-9d8e85e4f410",
    nameEn: "Heavyweight Hoodie",
    nameAr: "هودي ثقيل",
    basePrice: 1200,
  };
  assert.equal(createAdminProductSchema.safeParse(product).success, false);
  assert.equal(
    createAdminProductSchema.safeParse({
      ...product,
      imageUploadIds: ["b2e3b87c-9037-4a14-9de8-9d8e85e4f410"],
    }).success,
    true
  );
  assert.equal(
    createAdminProductSchema.safeParse({
      ...product,
      imageUrls: ["https://example.com/hoodie.jpg"],
    }).success,
    true
  );
  assert.equal(
    createAdminProductSchema.safeParse({
      ...product,
      imageUploadIds: ["b2e3b87c-9037-4a14-9de8-9d8e85e4f410"],
      imageUrls: ["https://example.com/hoodie.jpg"],
    }).success,
    false
  );
  assert.equal(
    createAdminProductSchema.safeParse({
      ...product,
      imageUrls: ["javascript:alert(1)"],
    }).success,
    false
  );
  assert.equal(
    createAdminProductSchema.safeParse({
      ...product,
      imageUploadIds: ["b2e3b87c-9037-4a14-9de8-9d8e85e4f410"],
      isNew: false,
      isBestSeller: true,
    }).success,
    false
  );
  assert.equal(updateAdminProductSchema.safeParse({ isBestSeller: true }).success, false);
  assert.equal(
    createVariantSchema.safeParse({
      size: "M",
      color: "Black",
      sku: "MANUAL-SKU",
    }).success,
    false
  );
});

test("new product status expires at 15 days and cannot be set in the future", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const newProductWindowMs = NEW_PRODUCT_WINDOW_DAYS * millisecondsPerDay;

  assert.equal(
    isWithinNewProductWindow(new Date(now.getTime() - newProductWindowMs + millisecondsPerDay), now),
    true
  );
  assert.equal(
    isWithinNewProductWindow(new Date(now.getTime() - newProductWindowMs), now),
    false
  );
  assert.equal(
    isWithinNewProductWindow(new Date(now.getTime() + millisecondsPerDay), now),
    false
  );
});

test("missing staged product images return a clear expired-upload error", async () => {
  await assert.rejects(
    () =>
      consumeStagedProductImage(
        "b2e3b87c-9037-4a14-9de8-9d8e85e4f410",
        "e3d8f4f2-4f3e-4b59-8a3c-26cf5e2c6e13",
        "d7f0a390-69af-4a15-9b45-c1af4a0f9a61"
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 422 &&
      error.code === "IMAGE_UPLOAD_EXPIRED"
  );
});

test("manual stock adjustments require an idempotency key and movement dates must be real dates", () => {
  const adjustment = {
    mode: "increase",
    amount: 2,
    reason: "Initial stock",
  };
  assert.equal(createStockAdjustmentSchema.safeParse(adjustment).success, false);
  assert.equal(
    createStockAdjustmentSchema.safeParse({
      ...adjustment,
      idempotencyKey: "stock-adjustment-1",
    }).success,
    true
  );

  assert.equal(
    adminInventoryMovementsQuerySchema.safeParse({ startDate: "2026-02-29" })
      .success,
    false
  );
  assert.equal(
    adminInventoryMovementsQuerySchema.safeParse({ endDate: "2026-11-20" })
      .success,
    true
  );
});

test("catalog workflow guidance is translated in English and Arabic", () => {
  for (const language of ["en", "ar"] as const) {
    const catalog = TRANSLATIONS[language].adminCatalog;
    assert.ok(catalog.products.readinessTitle);
    assert.ok(catalog.products.readinessNoImage);
    assert.ok(catalog.images.uploadLabel);
    assert.ok(catalog.products.readinessNoVariant);
    assert.ok(catalog.categories.subtitle);
    assert.ok(catalog.collections.subtitle);
    assert.ok(catalog.collections.inactiveAssignNotice);
  }
});
