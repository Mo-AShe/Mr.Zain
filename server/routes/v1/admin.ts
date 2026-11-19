import { Router } from "express";
import {
  ensureCsrfCookie,
  requireAdmin,
  requireAuth,
  requireMutatingCsrf,
} from "../../middleware/auth.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  addProductImage,
  addProductToCollection,
  createAdminCategory,
  createAdminCollection,
  createAdminProduct,
  createProductVariant,
  deleteAdminCategory,
  deleteAdminCollection,
  deleteOrArchiveAdminProduct,
  deleteOrDeactivateProductVariant,
  deleteProductImage,
  getAdminCategoryById,
  getAdminCollectionById,
  getAdminProductById,
  listAdminCategories,
  listAdminCollections,
  listAdminProducts,
  removeProductFromCollection,
  reorderProductImages,
  updateAdminCategory,
  updateAdminCollection,
  updateAdminProduct,
  updateProductImage,
  updateProductVariant,
} from "../../services/adminCatalog.service.js";
import {
  getAdminDashboardOverview,
  getAdminDashboardSales,
} from "../../services/adminDashboard.service.js";
import {
  adjustVariantInventoryStock,
  getAdminInventorySummary,
  getAdminInventoryVariantDetail,
  listAdminInventory,
  listAdminInventoryMovements,
  updateVariantLowStockThreshold,
} from "../../services/adminInventory.service.js";
import {
  getAdminOrderById,
  listAdminOrders,
  updateAdminOrderPayment,
  updateAdminOrderShipment,
  updateAdminOrderStatus,
} from "../../services/adminOrders.service.js";
import {
  getAdminCustomerById,
  listAdminCustomers,
  updateAdminCustomerStatus,
} from "../../services/adminCustomers.service.js";
import {
  createAdminCoupon,
  deleteAdminCoupon,
  getAdminCouponDetail,
  listAdminCoupons,
  updateAdminCoupon,
} from "../../services/adminCoupons.service.js";
import {
  createAdminShippingZone,
  deleteAdminShippingZone,
  getAdminShippingOverview,
  updateAdminShippingSettings,
  updateAdminShippingZone,
} from "../../services/adminShipping.service.js";
import {
  getAdminSettingsOverview,
  updateAdminAvailabilitySettings,
  updateAdminGeneralSettings,
  updateAdminHomepageSettings,
} from "../../services/adminSettings.service.js";
import {
  addCollectionProductSchema,
  adminCategoriesQuerySchema,
  adminCollectionsQuerySchema,
  adminProductsQuerySchema,
  collectionProductParamsSchema,
  createAdminCategorySchema,
  createAdminCollectionSchema,
  createAdminProductSchema,
  createProductImageSchema,
  createVariantSchema,
  imageParamsSchema,
  reorderProductImagesSchema,
  updateAdminCategorySchema,
  updateAdminCollectionSchema,
  updateAdminProductSchema,
  updateProductImageSchema,
  updateVariantSchema,
  uuidParamSchema,
  variantParamsSchema,
} from "../../validators/adminCatalog.validators.js";
import { salesQuerySchema } from "../../validators/adminDashboard.validators.js";
import {
  adminInventoryMovementsQuerySchema,
  adminInventoryQuerySchema,
  createStockAdjustmentSchema,
  inventoryVariantParamSchema,
  updateLowStockThresholdSchema,
} from "../../validators/adminInventory.validators.js";
import {
  adminOrdersQuerySchema,
  updateAdminOrderPaymentSchema,
  updateAdminOrderShipmentSchema,
  updateAdminOrderStatusSchema,
} from "../../validators/adminOrders.validators.js";
import {
  adminCustomersQuerySchema,
  updateCustomerStatusSchema,
} from "../../validators/adminCustomers.validators.js";
import {
  adminCouponsQuerySchema,
  createAdminCouponSchema,
  updateAdminCouponSchema,
} from "../../validators/adminCoupons.validators.js";
import {
  adminShippingQuerySchema,
  createShippingZoneSchema,
  updateShippingSettingsSchema,
  updateShippingZoneSchema,
} from "../../validators/adminShipping.validators.js";
import {
  updateAvailabilitySchema,
  updateGeneralSettingsSchema,
  updateHomepageSettingsSchema,
} from "../../validators/adminSettings.validators.js";

export const adminRouter = Router();

// Enforce no-store caching, active session auth, admin role authorization,
// and CSRF protection on all state-changing admin endpoints.
adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
adminRouter.use(requireAuth, requireAdmin, requireMutatingCsrf);

adminRouter.get("/me", (req, res) => {
  if (req.auth) {
    ensureCsrfCookie(req, res, req.auth);
  }

  res.json({
    success: true,
    user: req.auth!.user,
  });
});

adminRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const overview = await getAdminDashboardOverview();
    res.json({
      success: true,
      overview,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/dashboard/sales", async (req, res, next) => {
  try {
    const query = salesQuerySchema.parse(req.query);
    const sales = await getAdminDashboardSales(query);
    res.json({
      success: true,
      sales,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Products CRUD
// ============================================================================

adminRouter.get("/products", async (req, res, next) => {
  try {
    const query = adminProductsQuerySchema.parse(req.query);
    const result = await listAdminProducts(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/products", async (req, res, next) => {
  try {
    const input = createAdminProductSchema.parse(req.body);
    const product = await createAdminProduct(input);
    res.status(201).json({
      success: true,
      product,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/products/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const product = await getAdminProductById(id);
    if (!product) {
      throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }
    res.json({
      success: true,
      product,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/products/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminProductSchema.parse(req.body);
    const product = await updateAdminProduct(id, input);
    res.json({
      success: true,
      product,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/products/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const result = await deleteOrArchiveAdminProduct(id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Product Variants CRUD
// ============================================================================

adminRouter.post("/products/:id/variants", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = createVariantSchema.parse(req.body);
    const variant = await createProductVariant(id, input);
    res.status(201).json({
      success: true,
      variant,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/products/:id/variants/:variantId", async (req, res, next) => {
  try {
    const { id, variantId } = variantParamsSchema.parse(req.params);
    const input = updateVariantSchema.parse(req.body);
    const variant = await updateProductVariant(id, variantId, input);
    res.json({
      success: true,
      variant,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/products/:id/variants/:variantId", async (req, res, next) => {
  try {
    const { id, variantId } = variantParamsSchema.parse(req.params);
    const result = await deleteOrDeactivateProductVariant(id, variantId);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Product Images CRUD (URL-based gallery management)
// ============================================================================

adminRouter.post("/products/:id/images", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = createProductImageSchema.parse(req.body);
    const image = await addProductImage(id, input);
    res.status(201).json({
      success: true,
      image,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/products/:id/images/reorder", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const { imageIds } = reorderProductImagesSchema.parse(req.body);
    const images = await reorderProductImages(id, imageIds);
    res.json({
      success: true,
      images,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/products/:id/images/:imageId", async (req, res, next) => {
  try {
    const { id, imageId } = imageParamsSchema.parse(req.params);
    const input = updateProductImageSchema.parse(req.body);
    const image = await updateProductImage(id, imageId, input);
    res.json({
      success: true,
      image,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/products/:id/images/:imageId", async (req, res, next) => {
  try {
    const { id, imageId } = imageParamsSchema.parse(req.params);
    const result = await deleteProductImage(id, imageId);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Categories CRUD
// ============================================================================

adminRouter.get("/categories", async (req, res, next) => {
  try {
    const query = adminCategoriesQuerySchema.parse(req.query);
    const list = await listAdminCategories(query);
    res.json({
      success: true,
      categories: list,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/categories", async (req, res, next) => {
  try {
    const input = createAdminCategorySchema.parse(req.body);
    const category = await createAdminCategory(input);
    res.status(201).json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/categories/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const category = await getAdminCategoryById(id);
    if (!category) {
      throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
    }
    res.json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/categories/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminCategorySchema.parse(req.body);
    const category = await updateAdminCategory(id, input);
    res.json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/categories/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const result = await deleteAdminCategory(id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Collections CRUD & Associations
// ============================================================================

adminRouter.get("/collections", async (req, res, next) => {
  try {
    const query = adminCollectionsQuerySchema.parse(req.query);
    const list = await listAdminCollections(query);
    res.json({
      success: true,
      collections: list,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/collections", async (req, res, next) => {
  try {
    const input = createAdminCollectionSchema.parse(req.body);
    const collection = await createAdminCollection(input);
    res.status(201).json({
      success: true,
      collection,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/collections/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const collection = await getAdminCollectionById(id);
    if (!collection) {
      throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
    }
    res.json({
      success: true,
      collection,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/collections/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminCollectionSchema.parse(req.body);
    const collection = await updateAdminCollection(id, input);
    res.json({
      success: true,
      collection,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/collections/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const result = await deleteAdminCollection(id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/collections/:id/products", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const { productId } = addCollectionProductSchema.parse(req.body);
    const collection = await addProductToCollection(id, productId);
    res.status(201).json({
      success: true,
      collection,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/collections/:id/products/:productId", async (req, res, next) => {
  try {
    const { id, productId } = collectionProductParamsSchema.parse(req.params);
    const collection = await removeProductFromCollection(id, productId);
    res.json({
      success: true,
      collection,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Inventory Management & Movements
// ============================================================================

adminRouter.get("/inventory/summary", async (_req, res, next) => {
  try {
    const summary = await getAdminInventorySummary();
    res.json({
      success: true,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/inventory/movements", async (req, res, next) => {
  try {
    const query = adminInventoryMovementsQuerySchema.parse(req.query);
    const result = await listAdminInventoryMovements(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/inventory", async (req, res, next) => {
  try {
    const query = adminInventoryQuerySchema.parse(req.query);
    const result = await listAdminInventory(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/inventory/:variantId", async (req, res, next) => {
  try {
    const { variantId } = inventoryVariantParamSchema.parse(req.params);
    const detail = await getAdminInventoryVariantDetail(variantId);
    res.json({
      success: true,
      ...detail,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/inventory/:variantId/adjustments", async (req, res, next) => {
  try {
    const { variantId } = inventoryVariantParamSchema.parse(req.params);
    const headerIdempotencyKey =
      typeof req.header("idempotency-key") === "string"
        ? req.header("idempotency-key")?.trim() || undefined
        : undefined;
    const input = createStockAdjustmentSchema.parse({
      ...(req.body && typeof req.body === "object" ? req.body : {}),
      idempotencyKey:
        req.body && typeof req.body === "object" && req.body.idempotencyKey
          ? req.body.idempotencyKey
          : headerIdempotencyKey,
    });
    const result = await adjustVariantInventoryStock(
      variantId,
      req.auth!.user.id,
      input
    );
    res.status(result.alreadyProcessed ? 200 : 201).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/inventory/:variantId/threshold", async (req, res, next) => {
  try {
    const { variantId } = inventoryVariantParamSchema.parse(req.params);
    const input = updateLowStockThresholdSchema.parse(req.body);
    const item = await updateVariantLowStockThreshold(variantId, input);
    res.json({
      success: true,
      item,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Order Management & Fulfillment
// ============================================================================

adminRouter.get("/orders", async (req, res, next) => {
  try {
    const query = adminOrdersQuerySchema.parse(req.query);
    const result = await listAdminOrders(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/orders/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const order = await getAdminOrderById(id);
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminOrderStatusSchema.parse(req.body);
    const order = await updateAdminOrderStatus(id, req.auth!.user.id, input);
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/orders/:id/payment", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminOrderPaymentSchema.parse(req.body);
    const order = await updateAdminOrderPayment(id, req.auth!.user.id, input);
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/orders/:id/shipment", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminOrderShipmentSchema.parse(req.body);
    const order = await updateAdminOrderShipment(id, req.auth!.user.id, input);
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Customer Management
// ============================================================================

adminRouter.get("/customers", async (req, res, next) => {
  try {
    const query = adminCustomersQuerySchema.parse(req.query);
    const result = await listAdminCustomers(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/customers/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const detail = await getAdminCustomerById(id);
    res.json({
      success: true,
      ...detail,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/customers/:id/status", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateCustomerStatusSchema.parse(req.body);
    const result = await updateAdminCustomerStatus(id, req.auth!.user.id, input);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Coupon Management
// ============================================================================

adminRouter.get("/coupons", async (req, res, next) => {
  try {
    const query = adminCouponsQuerySchema.parse(req.query);
    const result = await listAdminCoupons(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/coupons", async (req, res, next) => {
  try {
    const input = createAdminCouponSchema.parse(req.body);
    const coupon = await createAdminCoupon(input);
    res.status(201).json({
      success: true,
      coupon,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/coupons/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const detail = await getAdminCouponDetail(id);
    res.json({
      success: true,
      ...detail,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/coupons/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateAdminCouponSchema.parse(req.body);
    const coupon = await updateAdminCoupon(id, input);
    res.json({
      success: true,
      coupon,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/coupons/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const result = await deleteAdminCoupon(id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Shipping Zones & Rules Configuration
// ============================================================================

adminRouter.get("/shipping", async (req, res, next) => {
  try {
    const query = adminShippingQuerySchema.parse(req.query);
    const result = await getAdminShippingOverview(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/shipping/zones", async (req, res, next) => {
  try {
    const input = createShippingZoneSchema.parse(req.body);
    const zone = await createAdminShippingZone(input);
    res.status(201).json({
      success: true,
      zone,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/shipping/zones/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateShippingZoneSchema.parse(req.body);
    const zone = await updateAdminShippingZone(id, input);
    res.json({
      success: true,
      zone,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/shipping/zones/:id", async (req, res, next) => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const result = await deleteAdminShippingZone(id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/shipping/settings", async (req, res, next) => {
  try {
    const input = updateShippingSettingsSchema.parse(req.body);
    const settings = await updateAdminShippingSettings(input);
    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// General Store Settings, Availability & Homepage Configuration
// ============================================================================

adminRouter.get("/settings", async (_req, res, next) => {
  try {
    const settings = await getAdminSettingsOverview();
    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/settings", async (req, res, next) => {
  try {
    const input = updateGeneralSettingsSchema.parse(req.body);
    const settings = await updateAdminGeneralSettings(input);
    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/settings/availability", async (req, res, next) => {
  try {
    const input = updateAvailabilitySchema.parse(req.body);
    const availability = await updateAdminAvailabilitySettings(input);
    res.json({
      success: true,
      availability,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/settings/homepage", async (req, res, next) => {
  try {
    const input = updateHomepageSettingsSchema.parse(req.body);
    const homepage = await updateAdminHomepageSettings(input);
    res.json({
      success: true,
      homepage,
    });
  } catch (err) {
    next(err);
  }
});
