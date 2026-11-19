/**
 * MR. ZAIN — Customer Orders Service
 * Authenticated customer order history, detail lookup, and safe self-cancellation.
 */

import { api } from "../api.js";

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
  return response?.order || null;
}
