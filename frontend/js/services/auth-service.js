/**
 * MR. ZAIN — Customer Authentication Service
 * Session state is backed exclusively by server-managed HttpOnly cookies via /api/v1/auth/*.
 * No authentication tokens are ever stored in localStorage or sessionStorage.
 */

import { api } from "../api.js";

let cachedUser = null;
let sessionChecked = false;
let pendingMeRequest = null;

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("zain:authchange", {
        detail: { user: cachedUser },
      })
    );
  }
}

export function getCachedUser() {
  return cachedUser;
}

export function hasCheckedAuthSession() {
  return sessionChecked;
}

export async function fetchCurrentUser({ force = false } = {}) {
  if (sessionChecked && !force) {
    return cachedUser;
  }

  if (pendingMeRequest && !force) {
    return pendingMeRequest;
  }

  const run = (async () => {
    const previousId = cachedUser?.id ?? null;
    try {
      const response = await api.get("/auth/me");
      cachedUser = response?.user || null;
    } catch (err) {
      if (err && err.status === 401) {
        cachedUser = null;
      } else {
        throw err;
      }
    } finally {
      sessionChecked = true;
      pendingMeRequest = null;
    }

    if ((cachedUser?.id ?? null) !== previousId || force) {
      notifyAuthChange();
    }
    return cachedUser;
  })();

  if (!force) {
    pendingMeRequest = run;
  }
  return run;
}

export async function loginUser({ email, password, rememberMe = false }) {
  const response = await api.post("/auth/login", {
    email,
    password,
    rememberMe: Boolean(rememberMe),
  });
  cachedUser = response?.user || null;
  sessionChecked = true;
  notifyAuthChange();
  return cachedUser;
}

export async function registerUser({
  fullName,
  email,
  password,
  confirmPassword,
  phone,
}) {
  const payload = {
    fullName,
    email,
    password,
    confirmPassword,
    ...(phone ? { phone } : {}),
  };
  const response = await api.post("/auth/register", payload);
  cachedUser = response?.user || null;
  sessionChecked = true;
  notifyAuthChange();
  return cachedUser;
}

export async function logoutUser() {
  try {
    await api.post("/auth/logout", {});
  } catch (err) {
    if (!err || err.status !== 401) {
      throw err;
    }
  } finally {
    cachedUser = null;
    sessionChecked = true;
    notifyAuthChange();
  }
}

export function getSafeRedirectUrl(fallback = "/pages/account.html") {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("redirect") || "").trim();
  if (!raw) return fallback;

  // Allow only relative same-origin paths starting with single "/"
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  if (raw.startsWith("/pages/auth.html")) {
    return fallback;
  }
  return raw;
}

export function buildAuthRedirectUrl(intendedUrl) {
  const targetPath =
    typeof intendedUrl === "string" &&
    intendedUrl.startsWith("/") &&
    !intendedUrl.startsWith("//") &&
    !intendedUrl.startsWith("/\\")
      ? intendedUrl
      : `${window.location.pathname}${window.location.search}`;
  return `/pages/auth.html?redirect=${encodeURIComponent(targetPath)}`;
}

export function redirectToAuth(intendedUrl) {
  window.location.assign(buildAuthRedirectUrl(intendedUrl));
}

export async function requireCustomerAuth() {
  try {
    const user = await fetchCurrentUser({ force: true });
    if (user) return user;
  } catch {
    // Fall through to auth redirect
  }

  window.location.replace(buildAuthRedirectUrl());
  return null;
}
