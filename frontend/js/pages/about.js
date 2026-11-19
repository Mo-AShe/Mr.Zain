/**
 * MR. ZAIN — About & Store Policies Page Controller
 * Safely hydrates live About copy and store policies from /api/v1/settings/public.
 */

import { initLayout } from "../components/layout.js";
import { getLanguage } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";

const DISPLAY_POLICY_KEYS = [
  "shipping_policy",
  "return_policy",
  "privacy_policy",
  "terms_conditions",
];

function hydrateAboutAndPolicies() {
  const settings = getCachedPublicSettings();
  if (!settings?.policies) return;

  const lang = getLanguage();
  const aboutPolicy = settings.policies.about;
  const titleEl = document.getElementById("about-page-title");
  const bodyEl = document.getElementById("about-page-body");

  if (aboutPolicy) {
    const title =
      lang === "ar"
        ? aboutPolicy.titleAr || aboutPolicy.titleEn
        : aboutPolicy.titleEn || aboutPolicy.titleAr;
    const body =
      lang === "ar"
        ? aboutPolicy.bodyAr || aboutPolicy.bodyEn
        : aboutPolicy.bodyEn || aboutPolicy.bodyAr;
    if (titleEl && title) titleEl.textContent = title;
    if (bodyEl && body) bodyEl.textContent = body;
  }

  const grid = document.getElementById("about-policies-grid");
  if (!grid) return;

  grid.innerHTML = "";
  DISPLAY_POLICY_KEYS.forEach((key, idx) => {
    const item = settings.policies[key];
    if (!item) return;

    const card = document.createElement("article");
    card.className = "story-item";

    const indexEl = document.createElement("span");
    indexEl.className = "story-item__index";
    indexEl.textContent = `0${idx + 1}`;

    const h3 = document.createElement("h3");
    h3.className = "story-item__title";
    h3.textContent =
      (lang === "ar" ? item.titleAr || item.titleEn : item.titleEn || item.titleAr) || "";

    const p = document.createElement("p");
    p.className = "story-item__text";
    p.style.whiteSpace = "pre-line";
    p.textContent =
      (lang === "ar" ? item.bodyAr || item.bodyEn : item.bodyEn || item.bodyAr) || "";

    card.append(indexEl, h3, p);
    grid.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  hydrateAboutAndPolicies();
  window.addEventListener("zain:settingsloaded", hydrateAboutAndPolicies);
  window.addEventListener("zain:langchange", hydrateAboutAndPolicies);
});
