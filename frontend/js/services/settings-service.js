/**
 * MR. ZAIN — Public Storefront Settings Loader
 * Reads safe non-secret store settings from GET /api/v1/settings/public.
 */

import { api } from "../api.js";

const PUBLIC_SETTINGS_CACHE_KEY = "mr_zain_public_settings_cache_v1";
const PUBLIC_SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

function readCachedPublicSettings() {
  try {
    const raw = window.localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const cachedAt = Number(cached?.cachedAt);
    if (
      !cached?.settings ||
      typeof cached.settings !== "object" ||
      !Number.isFinite(cachedAt) ||
      cachedAt > Date.now() ||
      Date.now() - cachedAt > PUBLIC_SETTINGS_CACHE_TTL_MS
    ) {
      return null;
    }

    return cached.settings;
  } catch {
    return null;
  }
}

function writeCachedPublicSettings(settings) {
  try {
    window.localStorage.setItem(
      PUBLIC_SETTINGS_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), settings })
    );
  } catch {
    // Public settings remain available in memory if storage is unavailable.
  }
}

let cachedPublicSettings = readCachedPublicSettings();
let inflightPromise = null;

export function getCachedPublicSettings() {
  return cachedPublicSettings;
}

export async function fetchPublicStoreSettings({ force = false } = {}) {
  if (inflightPromise && !force) {
    return inflightPromise;
  }

  const request = api
    .get("/settings/public")
    .then((res) => {
      cachedPublicSettings = res?.settings || null;
      if (cachedPublicSettings) writeCachedPublicSettings(cachedPublicSettings);
      window.dispatchEvent(
        new CustomEvent("zain:settingsloaded", { detail: cachedPublicSettings })
      );
      return cachedPublicSettings;
    })
    .catch(() => cachedPublicSettings)
    .finally(() => {
      if (inflightPromise === request) inflightPromise = null;
    });

  inflightPromise = request;
  return request;
}
