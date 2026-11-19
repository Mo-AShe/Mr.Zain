/**
 * MR. ZAIN — Admin Session Guard & Dashboard API Client
 * Uses existing HttpOnly session cookies and double-submit CSRF headers.
 * Never stores authentication tokens in localStorage or sessionStorage.
 */

import { api } from "../api.js";
import {
  buildAuthRedirectUrl,
  fetchCurrentUser,
  logoutUser,
} from "../services/auth-service.js";

const ADMIN_REDIRECT_TARGET = "/admin/index.html";

export async function verifyAdminAccess() {
  let sessionUser = null;
  try {
    sessionUser = await fetchCurrentUser({ force: true });
  } catch (err) {
    if (err && err.status === 401) {
      window.location.replace(buildAuthRedirectUrl(ADMIN_REDIRECT_TARGET));
      return { status: "unauthenticated", admin: null };
    }
    throw err;
  }

  if (!sessionUser) {
    window.location.replace(buildAuthRedirectUrl(ADMIN_REDIRECT_TARGET));
    return { status: "unauthenticated", admin: null };
  }

  try {
    const response = await api.get("/admin/me");
    return {
      status: "authorized",
      admin: response?.user || sessionUser,
    };
  } catch (err) {
    if (err && err.status === 401) {
      window.location.replace(buildAuthRedirectUrl(ADMIN_REDIRECT_TARGET));
      return { status: "unauthenticated", admin: null };
    }
    if (err && err.status === 403) {
      return { status: "forbidden", admin: null };
    }
    throw err;
  }
}

export async function fetchAdminDashboardOverview() {
  const response = await api.get("/admin/dashboard");
  return response?.overview || null;
}

export async function fetchAdminDashboardSales(params = {}) {
  const query = new URLSearchParams();
  if (params.startDate && params.endDate) {
    query.set("startDate", params.startDate);
    query.set("endDate", params.endDate);
  } else if (params.days) {
    query.set("days", String(params.days));
  } else {
    query.set("days", "30");
  }

  const response = await api.get(`/admin/dashboard/sales?${query.toString()}`);
  return response?.sales || null;
}

export async function signOutAdmin() {
  await logoutUser();
  window.location.replace(buildAuthRedirectUrl(ADMIN_REDIRECT_TARGET));
}

// ============================================================================
// Admin Products API
// ============================================================================

export async function fetchAdminProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.published) query.set("published", params.published);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/products${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminProductDetail(productId) {
  const res = await api.get(`/admin/products/${encodeURIComponent(productId)}`);
  return res?.product || null;
}

export async function createAdminProductRequest(payload) {
  const res = await api.post("/admin/products", payload);
  return res?.product || null;
}

export async function updateAdminProductRequest(productId, payload) {
  const res = await api.patch(`/admin/products/${encodeURIComponent(productId)}`, payload);
  return res?.product || null;
}

export async function deleteAdminProductRequest(productId) {
  return api.delete(`/admin/products/${encodeURIComponent(productId)}`);
}

// ============================================================================
// Admin Variants API
// ============================================================================

export async function createAdminVariantRequest(productId, payload) {
  const res = await api.post(
    `/admin/products/${encodeURIComponent(productId)}/variants`,
    payload
  );
  return res?.variant || null;
}

export async function updateAdminVariantRequest(productId, variantId, payload) {
  const res = await api.patch(
    `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    payload
  );
  return res?.variant || null;
}

export async function deleteAdminVariantRequest(productId, variantId) {
  return api.delete(
    `/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`
  );
}

// ============================================================================
// Admin Product Images API
// ============================================================================

export async function addAdminProductImageRequest(productId, payload) {
  const res = await api.post(
    `/admin/products/${encodeURIComponent(productId)}/images`,
    payload
  );
  return res?.image || null;
}

export async function updateAdminProductImageRequest(productId, imageId, payload) {
  const res = await api.patch(
    `/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    payload
  );
  return res?.image || null;
}

export async function reorderAdminProductImagesRequest(productId, imageIds) {
  const res = await api.patch(
    `/admin/products/${encodeURIComponent(productId)}/images/reorder`,
    { imageIds }
  );
  return res?.images || [];
}

export async function deleteAdminProductImageRequest(productId, imageId) {
  return api.delete(
    `/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`
  );
}

// ============================================================================
// Admin Categories API
// ============================================================================

export async function fetchAdminCategories(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  const res = await api.get(`/admin/categories${qs ? `?${qs}` : ""}`);
  return res?.categories || [];
}

export async function createAdminCategoryRequest(payload) {
  const res = await api.post("/admin/categories", payload);
  return res?.category || null;
}

export async function updateAdminCategoryRequest(categoryId, payload) {
  const res = await api.patch(
    `/admin/categories/${encodeURIComponent(categoryId)}`,
    payload
  );
  return res?.category || null;
}

export async function deleteAdminCategoryRequest(categoryId) {
  return api.delete(`/admin/categories/${encodeURIComponent(categoryId)}`);
}

// ============================================================================
// Admin Collections API
// ============================================================================

export async function fetchAdminCollections(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  const res = await api.get(`/admin/collections${qs ? `?${qs}` : ""}`);
  return res?.collections || [];
}

export async function fetchAdminCollectionDetail(collectionId) {
  const res = await api.get(`/admin/collections/${encodeURIComponent(collectionId)}`);
  return res?.collection || null;
}

export async function createAdminCollectionRequest(payload) {
  const res = await api.post("/admin/collections", payload);
  return res?.collection || null;
}

export async function updateAdminCollectionRequest(collectionId, payload) {
  const res = await api.patch(
    `/admin/collections/${encodeURIComponent(collectionId)}`,
    payload
  );
  return res?.collection || null;
}

export async function deleteAdminCollectionRequest(collectionId) {
  return api.delete(`/admin/collections/${encodeURIComponent(collectionId)}`);
}

export async function addProductToCollectionRequest(collectionId, productId) {
  const res = await api.post(
    `/admin/collections/${encodeURIComponent(collectionId)}/products`,
    { productId }
  );
  return res?.collection || null;
}

export async function removeProductFromCollectionRequest(collectionId, productId) {
  const res = await api.delete(
    `/admin/collections/${encodeURIComponent(collectionId)}/products/${encodeURIComponent(productId)}`
  );
  return res?.collection || null;
}

// ============================================================================
// Admin Inventory API
// ============================================================================

export async function fetchAdminInventorySummary() {
  const res = await api.get("/admin/inventory/summary");
  return res?.summary || null;
}

export async function fetchAdminInventoryList(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.stockStatus) query.set("stockStatus", params.stockStatus);
  if (params.activeOnly) query.set("activeOnly", params.activeOnly);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/inventory${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminInventoryVariantDetail(variantId) {
  return api.get(`/admin/inventory/${encodeURIComponent(variantId)}`);
}

export async function fetchAdminInventoryMovements(params = {}) {
  const query = new URLSearchParams();
  if (params.variantId) query.set("variantId", params.variantId);
  if (params.search) query.set("search", params.search);
  if (params.movementType) query.set("movementType", params.movementType);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/inventory/movements${qs ? `?${qs}` : ""}`);
}

export async function adjustAdminInventoryStockRequest(variantId, payload) {
  return api.post(
    `/admin/inventory/${encodeURIComponent(variantId)}/adjustments`,
    payload
  );
}

export async function updateAdminInventoryThresholdRequest(variantId, lowStockThreshold) {
  const res = await api.patch(
    `/admin/inventory/${encodeURIComponent(variantId)}/threshold`,
    { lowStockThreshold }
  );
  return res?.item || null;
}

// ============================================================================
// Admin Orders API
// ============================================================================

export async function fetchAdminOrders(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.orderStatus) query.set("orderStatus", params.orderStatus);
  if (params.paymentStatus) query.set("paymentStatus", params.paymentStatus);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/orders${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminOrderDetail(orderId) {
  const res = await api.get(`/admin/orders/${encodeURIComponent(orderId)}`);
  return res?.order || null;
}

export async function updateAdminOrderStatusRequest(orderId, payload) {
  const res = await api.patch(
    `/admin/orders/${encodeURIComponent(orderId)}/status`,
    payload
  );
  return res?.order || null;
}

export async function updateAdminOrderPaymentRequest(orderId, payload) {
  const res = await api.patch(
    `/admin/orders/${encodeURIComponent(orderId)}/payment`,
    payload
  );
  return res?.order || null;
}

export async function updateAdminOrderShipmentRequest(orderId, payload) {
  const res = await api.patch(
    `/admin/orders/${encodeURIComponent(orderId)}/shipment`,
    payload
  );
  return res?.order || null;
}

// ============================================================================
// Admin Customers API
// ============================================================================

export async function fetchAdminCustomers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/customers${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminCustomerDetail(customerId) {
  return api.get(`/admin/customers/${encodeURIComponent(customerId)}`);
}

export async function updateAdminCustomerStatusRequest(customerId, payload) {
  return api.patch(
    `/admin/customers/${encodeURIComponent(customerId)}/status`,
    payload
  );
}

// ============================================================================
// Admin Coupons API
// ============================================================================

export async function fetchAdminCoupons(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.discountType) query.set("discountType", params.discountType);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return api.get(`/admin/coupons${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminCouponDetail(couponId) {
  return api.get(`/admin/coupons/${encodeURIComponent(couponId)}`);
}

export async function createAdminCouponRequest(payload) {
  const res = await api.post("/admin/coupons", payload);
  return res?.coupon || null;
}

export async function updateAdminCouponRequest(couponId, payload) {
  const res = await api.patch(
    `/admin/coupons/${encodeURIComponent(couponId)}`,
    payload
  );
  return res?.coupon || null;
}

export async function deleteAdminCouponRequest(couponId) {
  return api.delete(`/admin/coupons/${encodeURIComponent(couponId)}`);
}

// ============================================================================
// Admin Shipping API
// ============================================================================

export async function fetchAdminShipping(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return api.get(`/admin/shipping${qs ? `?${qs}` : ""}`);
}

export async function createAdminShippingZoneRequest(payload) {
  const res = await api.post("/admin/shipping/zones", payload);
  return res?.zone || null;
}

export async function updateAdminShippingZoneRequest(zoneId, payload) {
  const res = await api.patch(
    `/admin/shipping/zones/${encodeURIComponent(zoneId)}`,
    payload
  );
  return res?.zone || null;
}

export async function deleteAdminShippingZoneRequest(zoneId) {
  return api.delete(`/admin/shipping/zones/${encodeURIComponent(zoneId)}`);
}

export async function updateAdminShippingSettingsRequest(payload) {
  const res = await api.patch("/admin/shipping/settings", payload);
  return res?.settings || null;
}

// ============================================================================
// Admin Store Settings API
// ============================================================================

export async function fetchAdminSettings() {
  const res = await api.get("/admin/settings");
  return res?.settings || null;
}

export async function updateAdminGeneralSettingsRequest(payload) {
  const res = await api.patch("/admin/settings", payload);
  return res?.settings || null;
}

export async function updateAdminAvailabilityRequest(payload) {
  const res = await api.patch("/admin/settings/availability", payload);
  return res?.availability || null;
}

export async function updateAdminHomepageRequest(payload) {
  const res = await api.patch("/admin/settings/homepage", payload);
  return res?.homepage || null;
}
