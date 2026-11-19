/**
 * MR. ZAIN — API Client
 * Lightweight Fetch wrapper using same-origin HttpOnly session cookies
 * and automatic double-submit CSRF headers for state-changing requests.
 */

import { CONFIG } from "./config.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name) {
  if (typeof document === "undefined" || !document.cookie) return "";
  const prefix = `${name}=`;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return "";
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method || "GET").toUpperCase();
    const csrfToken = MUTATING_METHODS.has(method)
      ? readCookie(CONFIG.AUTH.CSRF_COOKIE_NAME)
      : "";

    const headers = {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      method,
      credentials: "same-origin",
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null
          ? payload.error?.message || payload.detail || payload.message
          : null;
      const err = new Error(message || `Request failed with status ${response.status}`);
      err.status = response.status;
      err.code = typeof payload === "object" && payload !== null ? payload.error?.code : undefined;
      err.details =
        typeof payload === "object" && payload !== null ? payload.error?.details : undefined;
      throw err;
    }

    return payload;
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: "GET" });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: "DELETE" });
  }
}

export const api = new ApiClient(CONFIG.API_BASE_URL);
