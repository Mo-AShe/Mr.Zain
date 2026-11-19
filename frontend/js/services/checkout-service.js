/**
 * MR. ZAIN — Checkout Service
 * Server-authoritative preview, shipping quotes, and idempotent COD order placement.
 */

import { api } from "../api.js";

export async function fetchCheckoutPreview({ addressId, governorate, couponCode } = {}) {
  const params = new URLSearchParams();
  if (addressId) params.set("addressId", addressId);
  if (governorate) params.set("governorate", governorate);
  if (couponCode) params.set("couponCode", couponCode);
  const qs = params.toString();
  const response = await api.get(`/checkout/preview${qs ? `?${qs}` : ""}`);
  return response?.preview || null;
}

export async function fetchShippingQuote({ addressId, governorate, couponCode } = {}) {
  const payload = {
    ...(addressId ? { addressId } : {}),
    ...(governorate ? { governorate } : {}),
    ...(couponCode ? { couponCode } : {}),
  };
  const response = await api.post("/checkout/shipping-quote", payload);
  return response?.quote || null;
}

export async function placeCodOrder({
  addressId,
  couponCode,
  customerNotes,
  idempotencyKey,
}) {
  const payload = {
    addressId,
    paymentMethod: "cod",
    ...(couponCode ? { couponCode } : {}),
    ...(customerNotes ? { customerNotes } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };

  const options = idempotencyKey
    ? { headers: { "Idempotency-Key": idempotencyKey } }
    : {};

  return api.post("/checkout/orders", payload, options);
}
