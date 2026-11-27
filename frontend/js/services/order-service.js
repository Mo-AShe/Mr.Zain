/**
 * MR. ZAIN — Customer Orders Service
 * Authenticated customer order history, detail lookup, and safe self-cancellation.
 */

import { api } from "../api.js";
import { fetchCart } from "./cart-service.js";
import { fetchWishlist } from "./wishlist-service.js";

export async function fetchOrders({ page = 1, limit = 10, orderNumber } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (orderNumber) params.set("orderNumber", orderNumber);
  return api.get(`/orders?${params.toString()}`);
}

export async function fetchOrderById(orderId) {
  const response = await api.get(`/orders/${encodeURIComponent(orderId)}`);
  return response?.order || null;
}

export async function cancelOrder(orderId, reason) {
  const response = await api.post(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    ...(reason ? { reason } : {}),
  });

  void Promise.allSettled([
    fetchCart({ force: true }),
    fetchWishlist({ force: true }),
  ]).then((refreshResults) => {
    for (const result of refreshResults) {
      if (result.status === "rejected") {
        console.warn(
          "Order cancellation succeeded, but refreshing inventory-dependent customer state failed.",
          result.reason
        );
      }
    }
  });

  return response?.order || null;
}
