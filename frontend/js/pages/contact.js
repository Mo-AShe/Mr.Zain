/**
 * MR. ZAIN — Contact Page Controller
 * Validates Egyptian phone (+20) and email inputs.
 * Clearly communicates Stage 2 frontend demonstration status (no backend send).
 */

import { initLayout } from "../components/layout.js";
import { showToast } from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";

function hydrateContactSettings() {
  const settings = getCachedPublicSettings();
  if (!settings) return;
  const lang = getLanguage();
  const info = settings.storeInfo;
  const contactPolicy = settings.policies?.contact;

  if (contactPolicy) {
    const headingEl = document.getElementById("contact-info-heading");
    const subEl = document.getElementById("contact-page-subtitle");
    const headingText =
      lang === "ar"
        ? contactPolicy.titleAr || contactPolicy.titleEn
        : contactPolicy.titleEn || contactPolicy.titleAr;
    const bodyText =
      lang === "ar"
        ? contactPolicy.bodyAr || contactPolicy.bodyEn
        : contactPolicy.bodyEn || contactPolicy.bodyAr;
    if (headingEl && headingText) headingEl.textContent = headingText;
    if (subEl && bodyText) subEl.textContent = bodyText;
  }

  if (info) {
    const emailEl = document.getElementById("contact-email-val");
    const phoneEl = document.getElementById("contact-phone-val");
    const hoursEl = document.getElementById("contact-hours-val");
    const locEl = document.getElementById("contact-location-val");

    if (emailEl && info.contactEmail) emailEl.textContent = info.contactEmail;
    if (phoneEl && (info.whatsappNumber || info.contactPhone)) {
      phoneEl.textContent = info.whatsappNumber || info.contactPhone;
    }
    const hours =
      lang === "ar"
        ? info.supportHoursAr || info.supportHoursEn
        : info.supportHoursEn || info.supportHoursAr;
    if (hoursEl && hours) hoursEl.textContent = hours;

    const addr =
      lang === "ar"
        ? info.storeAddressAr || info.storeAddressEn
        : info.storeAddressEn || info.storeAddressAr;
    if (locEl && addr) locEl.textContent = addr;
  }
}

function validateEgyptianPhone(raw) {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  return /^(\+20|0020|0)1[0125][0-9]{8}$/.test(cleaned);
}

function clearErrors() {
  ["name", "email", "phone", "message"].forEach((key) => {
    const el = document.getElementById(`err-contact-${key}`);
    if (el) el.textContent = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  hydrateContactSettings();
  window.addEventListener("zain:settingsloaded", hydrateContactSettings);
  window.addEventListener("zain:langchange", hydrateContactSettings);

  const form = document.getElementById("contact-form");
  const statusEl = document.getElementById("contact-status");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearErrors();
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.className = "form-status";
    }

    const lang = getLanguage();
    const nameInput = document.getElementById("contact-name");
    const emailInput = document.getElementById("contact-email");
    const phoneInput = document.getElementById("contact-phone");
    const messageInput = document.getElementById("contact-message");

    const name = nameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    const message = messageInput?.value.trim() || "";

    let hasError = false;

    if (name.length < 2) {
      document.getElementById("err-contact-name").textContent = t("contact.errName", lang);
      hasError = true;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById("err-contact-email").textContent = t("contact.errEmail", lang);
      hasError = true;
    }

    if (!validateEgyptianPhone(phone)) {
      document.getElementById("err-contact-phone").textContent = t("contact.errPhone", lang);
      hasError = true;
    }

    if (message.length < 10) {
      document.getElementById("err-contact-message").textContent = t("contact.errMessage", lang);
      hasError = true;
    }

    if (hasError) {
      showToast(t("ui.toastError", lang), "error");
      return;
    }

    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = "form-status form-status--success";
      statusEl.textContent = t("contact.demoSuccess", lang);
    }
    showToast(t("contact.demoSuccess", lang), "info", 5000);
    form.reset();
  });
});
