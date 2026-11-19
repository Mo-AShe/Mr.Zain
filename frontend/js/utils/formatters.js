/**
 * MR. ZAIN — Formatting Utilities
 * EGP currency formatting, safe HTML escaping, localized field selectors, and color swatches.
 */

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatPriceEGP(amount, lang = "en") {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return "";

  const formattedNumber = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric);

  return lang === "ar" ? `${formattedNumber} ج.م` : `${formattedNumber} EGP`;
}

export function pickLocalized(record, baseKey, lang = "en") {
  if (!record || typeof record !== "object") return "";
  const primary = record[`${baseKey}_${lang}`];
  if (typeof primary === "string" && primary.trim() !== "") return primary;
  const fallback = record[`${baseKey}_en`] ?? record[baseKey];
  return typeof fallback === "string" ? fallback : "";
}

const COLOR_MAP = {
  "jet black": { hex: "#0A0A0A", ar: "أسود فاحم" },
  black: { hex: "#0A0A0A", ar: "أسود" },
  ivory: { hex: "#F5F2EA", ar: "عاجي" },
  "off white": { hex: "#F5F2EA", ar: "أوف وايت" },
  white: { hex: "#FFFFFF", ar: "أبيض" },
  stone: { hex: "#C8C1B4", ar: "حجري" },
  sand: { hex: "#D6CBB8", ar: "رملي" },
  beige: { hex: "#D9CEBE", ar: "بيج" },
  camel: { hex: "#B58D59", ar: "كاميل" },
  charcoal: { hex: "#383838", ar: "رمادي فحمي" },
  "heather grey": { hex: "#8A8A88", ar: "رمادي فاتح" },
  grey: { hex: "#777777", ar: "رمادي" },
  gray: { hex: "#777777", ar: "رمادي" },
  olive: { hex: "#4D533C", ar: "زيتوني" },
  navy: { hex: "#1B263B", ar: "كحلي" },
  brown: { hex: "#4A3728", ar: "بني" },
  espresso: { hex: "#3B2820", ar: "بني داكن" },
  "royal gold": { hex: "#D4A13A", ar: "ذهبي ملكي" },
  gold: { hex: "#D4A13A", ar: "ذهبي" },
};

export function resolveColorMeta(colorName) {
  const raw = typeof colorName === "string" ? colorName.trim() : "";
  const matched = COLOR_MAP[raw.toLowerCase()];
  return {
    name_en: raw,
    name_ar: matched?.ar || raw,
    hex: matched?.hex || "#777777",
  };
}
