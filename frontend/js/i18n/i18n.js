/**
 * MR. ZAIN — Internationalization & RTL/LTR Controller
 * Persists only non-sensitive UI language preference in localStorage.
 */

import { CONFIG } from "../config.js";
import { TRANSLATIONS } from "./translations.js";

const SUPPORTED_LANGS = ["en", "ar"];

function readSavedLanguage() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (SUPPORTED_LANGS.includes(parsed?.lang)) {
        return parsed.lang;
      }
    }
  } catch {
    // Ignore storage read issues
  }
  return "en";
}

function saveLanguage(lang) {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_PREFS);
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      CONFIG.STORAGE_KEYS.USER_PREFS,
      JSON.stringify({ ...current, lang })
    );
  } catch {
    // Ignore storage write issues
  }
}

let activeLanguage = readSavedLanguage();

export function getLanguage() {
  return activeLanguage;
}

export function isRTL(lang = activeLanguage) {
  return lang === "ar";
}

export function t(keyPath, lang = activeLanguage) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const parts = keyPath.split(".");
  let cursor = dict;

  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in cursor) {
      cursor = cursor[part];
    } else {
      return keyPath;
    }
  }

  return typeof cursor === "string" ? cursor : keyPath;
}

export function applyDocumentLanguage(lang = activeLanguage) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = isRTL(lang) ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, lang);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key, lang));
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key, lang));
  });
}

export function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  activeLanguage = lang;
  saveLanguage(lang);
  applyDocumentLanguage(lang);
  window.dispatchEvent(new CustomEvent("zain:langchange", { detail: { lang } }));
}

export function toggleLanguage() {
  setLanguage(activeLanguage === "en" ? "ar" : "en");
}
