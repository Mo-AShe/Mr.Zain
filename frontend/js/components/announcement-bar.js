/**
 * MR. ZAIN — Reusable Announcement & Maintenance Bar Component
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import { escapeHtml } from "../utils/formatters.js";

const DISMISS_KEY = "mr_zain_announcement_dismissed_text";

export function renderAnnouncementBar(container, options = {}) {
  if (!container) return;

  const lang = getLanguage();
  const settings = options.settings || getCachedPublicSettings();
  const avail = settings?.availability;

  if (avail?.isMaintenanceMode) {
    const badge = t("announcement.maintenanceBadge", lang);
    const msg =
      (lang === "ar"
        ? avail.maintenanceMessageAr || avail.maintenanceMessageEn
        : avail.maintenanceMessageEn || avail.maintenanceMessageAr) ||
      t("checkout.maintenanceAlert", lang);

    container.innerHTML = `
      <div class="announcement-bar" role="status" aria-label="${escapeHtml(badge)}">
        <div class="announcement-bar__inner">
          <span class="announcement-bar__accent">${escapeHtml(badge)}</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(msg)}</span>
        </div>
      </div>
    `;
    return;
  }

  const ann = settings?.announcement;
  if (ann && ann.enabled === false) {
    container.innerHTML = "";
    return;
  }

  const badgeText =
    options.badgeText ||
    (ann
      ? lang === "ar"
        ? ann.badgeAr || ann.badgeEn
        : ann.badgeEn || ann.badgeAr
      : "") ||
    t("announcement.badge", lang);

  const messageText =
    options.messageText ||
    (ann
      ? lang === "ar"
        ? ann.textAr || ann.textEn
        : ann.textEn || ann.textAr
      : "") ||
    t("announcement.message", lang);

  const dismissToken = `${badgeText}::${messageText}`;
  if (sessionStorage.getItem(DISMISS_KEY) === dismissToken) {
    container.innerHTML = "";
    return;
  }

  const dismissible = options.dismissible !== false;

  container.innerHTML = `
    <div class="announcement-bar" role="region" aria-label="${escapeHtml(badgeText)}">
      <div class="announcement-bar__inner">
        <span class="announcement-bar__accent">${escapeHtml(badgeText)}</span>
        <span aria-hidden="true">·</span>
        <span>${escapeHtml(messageText)}</span>
      </div>
      ${
        dismissible
          ? `<button type="button" class="announcement-bar__close" aria-label="${escapeHtml(t("announcement.closeAria", lang))}">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                 <path d="M18 6 6 18M6 6l12 12" />
               </svg>
             </button>`
          : ""
      }
    </div>
  `;

  const closeBtn = container.querySelector(".announcement-bar__close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      sessionStorage.setItem(DISMISS_KEY, dismissToken);
      container.innerHTML = "";
    });
  }
}
