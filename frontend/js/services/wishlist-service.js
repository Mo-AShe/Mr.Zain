/**
 * MR. ZAIN — Persistent Wishlist Service
 * Backed exclusively by /api/v1/wishlist (Neon PostgreSQL + HttpOnly session cookies).
 * Never persists wishlist items in localStorage or sessionStorage.
 */

import { api } from "../api.js";

let cachedWishlist = null;
let wishlistLoaded = false;
let pendingWishlistFetch = null;

function notifyWishlistChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("zain:wishlistchange", {
        detail: {
          wishlist: cachedWishlist,
          wishlistCount: getCachedWishlistCount(),
          productIds: getCachedWishlistIds(),
        },
      })
    );
  }
}

export function getCachedWishlist() {
  return cachedWishlist;
}

export function hasLoadedWishlist() {
  return wishlistLoaded;
}

export function getCachedWishlistCount() {
  return Number(cachedWishlist?.totalCount ?? 0);
}

export function getCachedWishlistIds() {
  const ids = Array.isArray(cachedWishlist?.productIds)
    ? cachedWishlist.productIds
    : [];
  return new Set(ids);
}

export function clearWishlistState() {
  const hadData = cachedWishlist !== null || wishlistLoaded;
  cachedWishlist = null;
  wishlistLoaded = false;
  pendingWishlistFetch = null;
  if (hadData) {
    notifyWishlistChange();
  }
}

export async function fetchWishlist({ force = false } = {}) {
  if (wishlistLoaded && !force) {
    return cachedWishlist;
  }

  if (pendingWishlistFetch && !force) {
    return pendingWishlistFetch;
  }

  const run = (async () => {
    try {
      const response = await api.get("/wishlist");
      cachedWishlist = response?.wishlist || null;
      wishlistLoaded = true;
      notifyWishlistChange();
      return cachedWishlist;
    } catch (err) {
      if (err && err.status === 401) {
        cachedWishlist = null;
        wishlistLoaded = false;
        notifyWishlistChange();
        return null;
      }
      throw err;
    } finally {
      pendingWishlistFetch = null;
    }
  })();

  if (!force) {
    pendingWishlistFetch = run;
  }
  return run;
}

export async function addToWishlist(productId) {
  const response = await api.post("/wishlist/items", { productId });
  cachedWishlist = response?.wishlist || null;
  wishlistLoaded = true;
  notifyWishlistChange();
  return cachedWishlist;
}

export async function removeFromWishlist(productId) {
  const response = await api.delete(
    `/wishlist/items/${encodeURIComponent(productId)}`
  );
  cachedWishlist = response?.wishlist || null;
  wishlistLoaded = true;
  notifyWishlistChange();
  return cachedWishlist;
}
