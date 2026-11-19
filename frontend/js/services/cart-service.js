/**
 * MR. ZAIN — Persistent Shopping Cart Service
 * Backed exclusively by /api/v1/cart (Neon PostgreSQL + HttpOnly session cookies).
 * Never persists cart items in localStorage or sessionStorage.
 */

import { api } from "../api.js";

let cachedCart = null;
let cartLoaded = false;
let pendingCartFetch = null;

function notifyCartChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("zain:cartchange", {
        detail: {
          cart: cachedCart,
          bagCount: getCachedBagCount(),
        },
      })
    );
  }
}

export function getCachedCart() {
  return cachedCart;
}

export function hasLoadedCart() {
  return cartLoaded;
}

export function getCachedBagCount() {
  return Number(cachedCart?.totalItemCount ?? 0);
}

export function clearCartState() {
  const hadData = cachedCart !== null || cartLoaded;
  cachedCart = null;
  cartLoaded = false;
  pendingCartFetch = null;
  if (hadData) {
    notifyCartChange();
  }
}

export async function fetchCart({ force = false } = {}) {
  if (cartLoaded && !force) {
    return cachedCart;
  }

  if (pendingCartFetch && !force) {
    return pendingCartFetch;
  }

  const run = (async () => {
    try {
      const response = await api.get("/cart");
      cachedCart = response?.cart || null;
      cartLoaded = true;
      notifyCartChange();
      return cachedCart;
    } catch (err) {
      if (err && err.status === 401) {
        cachedCart = null;
        cartLoaded = false;
        notifyCartChange();
        return null;
      }
      throw err;
    } finally {
      pendingCartFetch = null;
    }
  })();

  if (!force) {
    pendingCartFetch = run;
  }
  return run;
}

export async function addToCart({ variantId, productId, quantity = 1 }) {
  const payload = {
    variantId,
    quantity: Number(quantity) || 1,
    ...(productId ? { productId } : {}),
  };
  const response = await api.post("/cart/items", payload);
  cachedCart = response?.cart || null;
  cartLoaded = true;
  notifyCartChange();
  return cachedCart;
}

export async function updateCartItemQuantity(itemId, quantity) {
  const response = await api.patch(`/cart/items/${encodeURIComponent(itemId)}`, {
    quantity: Number(quantity),
  });
  cachedCart = response?.cart || null;
  cartLoaded = true;
  notifyCartChange();
  return cachedCart;
}

export async function removeCartItem(itemId) {
  const response = await api.delete(`/cart/items/${encodeURIComponent(itemId)}`);
  cachedCart = response?.cart || null;
  cartLoaded = true;
  notifyCartChange();
  return cachedCart;
}

export async function clearCart() {
  const response = await api.delete("/cart");
  cachedCart = response?.cart || null;
  cartLoaded = true;
  notifyCartChange();
  return cachedCart;
}
