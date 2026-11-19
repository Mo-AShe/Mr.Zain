/**
 * MR. ZAIN — Public Storefront Settings Loader
 * Reads safe non-secret store settings from GET /api/v1/settings/public.
 */

import { api } from "../api.js";

let cachedPublicSettings = null;
let inflightPromise = null;

export function getCachedPublicSettings() {
  return cachedPublicSettings;
}

export async function fetchPublicStoreSettings({ force = false } = {}) {
  if (cachedPublicSettings && !force) {
    return cachedPublicSettings;
  }
  if (inflightPromise && !force) {
    return inflightPromise;
  }

  inflightPromise = api
    .get("/settings/public")
    .then((res) => {
      cachedPublicSettings = res?.settings || null;
      window.dispatchEvent(
        new CustomEvent("zain:settingsloaded", { detail: cachedPublicSettings })
      );
      return cachedPublicSettings;
    })
    .catch(() => cachedPublicSettings)
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
}
