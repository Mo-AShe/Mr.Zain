/**
 * MR. ZAIN — Customer Delivery Addresses Service
 * Backed by /api/v1/addresses (Neon PostgreSQL + HttpOnly session cookies).
 */

import { api } from "../api.js";

export async function fetchAddresses() {
  const response = await api.get("/addresses");
  return Array.isArray(response?.addresses) ? response.addresses : [];
}

export async function fetchGovernorates() {
  const response = await api.get("/addresses/governorates");
  return Array.isArray(response?.governorates) ? response.governorates : [];
}

export async function createAddress(payload) {
  const response = await api.post("/addresses", payload);
  return response?.address || null;
}

export async function updateAddress(addressId, payload) {
  const response = await api.patch(`/addresses/${encodeURIComponent(addressId)}`, payload);
  return response?.address || null;
}

export async function deleteAddress(addressId) {
  return api.delete(`/addresses/${encodeURIComponent(addressId)}`);
}
