/**
 * MR. ZAIN — Garment-Specific Replaceable Placeholders
 * Provides clean architectural silhouettes for hoodies, sweatshirts, and jackets
 * so product photography URLs can be dropped in without changing components.
 */

import { getLanguage, t } from "../i18n/i18n.js";

const GARMENT_SVG = {
  hoodie: `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M28 16c0-5 5.5-9 12-9s12 4 12 9c0 3-1.8 5.5-4.5 7l14.5 7-5 14-5-2v26H28V42l-5 2-5-14 14.5-7C29.8 21.5 28 19 28 16Z" />
      <path d="M33 21c2.2 2 4.5 3 7 3s4.8-1 7-3" />
      <path d="M37 24v9M43 24v9" />
      <path d="M31 49h18l2 10H29l2-10Z" />
    </svg>
  `,
  sweatshirt: `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M30 16a10 7 0 0 0 20 0l14 7-5 15-6-2v30H27V36l-6 2-5-15 14-7Z" />
      <path d="M30 16c2.8 4 6.2 6 10 6s7.2-2 10-6" />
      <path d="M27 61h26" />
    </svg>
  `,
  jacket: `
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M29 14h22l13 8-4 17-6-2v29H26V37l-6 2-4-17 13-8Z" />
      <path d="M29 14l6 8h10l6-8" />
      <path d="M40 22v44" />
      <path d="M29 44h7v8h-7zM44 44h7v8h-7z" />
    </svg>
  `,
};

export function inferGarmentType(entity) {
  if (!entity || typeof entity !== "object") return "hoodie";
  if (entity.garmentType && GARMENT_SVG[entity.garmentType]) {
    return entity.garmentType;
  }
  const haystack = [
    entity.category?.slug,
    entity.categorySlug,
    entity.slug,
    entity.name_en,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(jacket|coat|overshirt|outerwear|parka|puffer|vest)/.test(haystack)) {
    return "jacket";
  }
  if (/(sweatshirt|crewneck|crew|fleece|pullover)/.test(haystack)) {
    return "sweatshirt";
  }
  return "hoodie";
}

export function createGarmentPlaceholder(garmentType = "hoodie", labelText = "") {
  const lang = getLanguage();
  const keyMap = {
    hoodie: "product.placeholderHoodie",
    sweatshirt: "product.placeholderSweatshirt",
    jacket: "product.placeholderJacket",
  };
  const resolvedType = GARMENT_SVG[garmentType] ? garmentType : "hoodie";
  const label = labelText || t(keyMap[resolvedType] || "product.placeholderTag", lang);
  const svg = GARMENT_SVG[resolvedType];

  const box = document.createElement("div");
  box.className = "product-card__placeholder";
  box.innerHTML = svg;

  const span = document.createElement("span");
  span.className = "product-card__placeholder-label";
  span.textContent = label;
  box.appendChild(span);

  return box;
}
