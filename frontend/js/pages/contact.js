/**
 * MR. ZAIN — Contact Page Controller
 */

import { initLayout } from "../components/layout.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import { parsePhoneNumbers } from "../utils/formatters.js";

function hydrateContactSettings() {
  const info = getCachedPublicSettings()?.storeInfo;
  const email = info?.contactEmail?.trim() || "care@mrzain.eg";
  const whatsappNumbers = parsePhoneNumbers(
    (info?.whatsappNumber || "").trim() || (info?.contactPhone || "").trim()
  );
  const hours =
    getLanguage() === "ar"
      ? info?.supportHoursAr || info?.supportHoursEn
      : info?.supportHoursEn || info?.supportHoursAr;
  const location =
    getLanguage() === "ar"
      ? info?.storeAddressAr || info?.storeAddressEn
      : info?.storeAddressEn || info?.storeAddressAr;

  const emailEl = document.getElementById("contact-email-val");
  if (emailEl) {
    emailEl.textContent = email;
    emailEl.href = `mailto:${email}`;
  }

  const whatsappItem = document.getElementById("contact-whatsapp-item");
  const whatsappLinksEl = document.getElementById("contact-whatsapp-links");
  if (whatsappItem && whatsappLinksEl) {
    whatsappItem.hidden = whatsappNumbers.length === 0;
    whatsappLinksEl.replaceChildren(
      ...whatsappNumbers.map(({ number, digits }) => {
        const link = document.createElement("a");
        const label = `${t("footer.chatOnWhatsApp", getLanguage())}: ${number}`;
        link.className = "contact-whatsapp-link";
        link.href = `https://wa.me/${digits}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        link.setAttribute("aria-label", label);
        return link;
      })
    );
  }

  const hoursEl = document.getElementById("contact-hours-val");
  if (hoursEl) hoursEl.textContent = hours || t("footer.hoursValue", getLanguage());

  const locationEl = document.getElementById("contact-location-val");
  if (locationEl) {
    locationEl.textContent = location || t("footer.locationValue", getLanguage());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  hydrateContactSettings();
  window.addEventListener("zain:settingsloaded", hydrateContactSettings);
  window.addEventListener("zain:langchange", hydrateContactSettings);
});
