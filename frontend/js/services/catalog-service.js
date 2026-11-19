/**
 * MR. ZAIN — Catalog API Integration Service
 * Connects storefront pages directly to live Express + Neon PostgreSQL REST endpoints:
 *   - GET /api/v1/products
 *   - GET /api/v1/products/:slug
 *   - GET /api/v1/categories
 *   - GET /api/v1/collections
 *   - GET /api/v1/homepage
 */

import { api } from "../api.js";

export function getProductTotalStock(product) {
  if (!Array.isArray(product?.variants)) return 0;
  return product.variants.reduce(
    (sum, variant) => sum + Number(variant.availableStock ?? variant.stock ?? 0),
    0
  );
}

export async function fetchProducts(params = {}) {
  const query = new URLSearchParams();
  const search = params.search ?? params.q;
  const inStock = params.inStock ?? params.inStockOnly;
  const limit = params.limit ?? params.pageSize;

  if (search) query.set("search", String(search).trim());
  if (params.category) query.set("category", String(params.category));
  if (params.collection) query.set("collection", String(params.collection));
  if (params.minPrice !== undefined && params.minPrice !== null && params.minPrice !== "") {
    query.set("minPrice", String(params.minPrice));
  }
  if (params.maxPrice !== undefined && params.maxPrice !== null && params.maxPrice !== "") {
    query.set("maxPrice", String(params.maxPrice));
  }
  if (params.size) query.set("size", String(params.size));
  if (params.color) query.set("color", String(params.color));
  if (inStock === true || inStock === "true") query.set("inStock", "true");
  if (params.sort) query.set("sort", String(params.sort));
  if (params.page) query.set("page", String(params.page));
  if (limit) query.set("limit", String(limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await api.get(`/products${suffix}`);

  return {
    items: Array.isArray(response?.items) ? response.items : [],
    pagination: response?.pagination || {
      page: Number(params.page || 1),
      limit: Number(limit || 12),
      total: 0,
      totalPages: 1,
      hasMore: false,
    },
    facets: response?.facets || { sizes: [], colors: [] },
  };
}

export async function fetchProductBySlug(slug) {
  if (!slug) return null;
  try {
    const response = await api.get(`/products/${encodeURIComponent(slug)}`);
    return response?.product || null;
  } catch (err) {
    if (err && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function fetchCategories() {
  const response = await api.get("/categories");
  return Array.isArray(response?.items) ? response.items : [];
}

export async function fetchCollections() {
  const response = await api.get("/collections");
  return Array.isArray(response?.items) ? response.items : [];
}

export async function fetchHomepageData() {
  const response = await api.get("/homepage");
  return {
    sections: Array.isArray(response?.sections) ? response.sections : [],
    banners: Array.isArray(response?.banners) ? response.banners : [],
    promoBannerConfig: response?.promoBannerConfig || null,
    featuredCollections: Array.isArray(response?.featuredCollections)
      ? response.featuredCollections
      : [],
    newArrivals: Array.isArray(response?.newArrivals) ? response.newArrivals : [],
    bestSellers: Array.isArray(response?.bestSellers) ? response.bestSellers : [],
    featuredProducts: Array.isArray(response?.featuredProducts)
      ? response.featuredProducts
      : [],
  };
}
