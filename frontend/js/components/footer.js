import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Shared Storefront Footer Component
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import { escapeHtml, parsePhoneNumbers } from "../utils/formatters.js";

export function renderFooter(container) {
  if (!container) return;

  const lang = getLanguage();
  const storeInfo = getCachedPublicSettings()?.storeInfo;
  const storeName = storeInfo?.storeName?.trim() || "MR. ZAIN";
  const contactEmail = storeInfo?.contactEmail || "care@mrzain.eg";
  const whatsappNumbers = parsePhoneNumbers(
    (storeInfo?.whatsappNumber || "").trim() ||
      (storeInfo?.contactPhone || "").trim()
  );
  const socialLinks = [
    { label: "Instagram", url: storeInfo?.instagramUrl },
    { label: "TikTok", url: storeInfo?.tiktokUrl },
    { label: "Facebook", url: storeInfo?.facebookUrl },
  ].filter((link) => Boolean(link.url?.trim()));
  const supportHours =
    (lang === "ar"
      ? storeInfo?.supportHoursAr || storeInfo?.supportHoursEn
      : storeInfo?.supportHoursEn || storeInfo?.supportHoursAr) ||
    t("footer.hoursValue", lang);
  const location =
    (lang === "ar"
      ? storeInfo?.storeAddressAr || storeInfo?.storeAddressEn
      : storeInfo?.storeAddressEn || storeInfo?.storeAddressAr) ||
    t("footer.locationValue", lang);
  const brandDesc =
    (storeInfo
      ? lang === "ar"
        ? storeInfo.storeDescriptionAr || storeInfo.storeDescriptionEn
        : storeInfo.storeDescriptionEn || storeInfo.storeDescriptionAr
      : "") || t("brand.footerDesc", lang);

  container.className = "site-footer";
  container.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a href=appUrl("/index.html") class="footer-brand-box" aria-label="${escapeHtml(storeName)}">
            <img
              src=appUrl("/assets/images/logo-removebg-preview.png")
              alt="${escapeHtml(storeName)}"
              referrerpolicy="no-referrer"
            />
          </a>
          <p class="footer-description">${escapeHtml(brandDesc)}</p>
          ${
            socialLinks.length
              ? `<div class="footer-socials">
                  ${socialLinks
                    .map(
                      (link, index) => `
                        ${index > 0 ? '<span aria-hidden="true">·</span>' : ""}
                        <a href="${escapeHtml(link.url)}" aria-label="${escapeHtml(link.label)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>
                      `
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.customerService", lang))}</h2>
          <ul class="footer-links">
            <li><a href=appUrl("/pages/order-tracking.html")>${escapeHtml(t("footer.trackOrder", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.shippingEgypt", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.returns", lang))}</a></li>
            <li><a href="/shop.html">${escapeHtml(t("footer.sizeGuide", lang))}</a></li>
          </ul>
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.aboutHeading", lang))}</h2>
          <ul class="footer-links">
            <li><a href="/about.html">${escapeHtml(t("footer.ourStory", lang))}</a></li>
            <li><a href="/contact.html">${escapeHtml(t("footer.contactPage", lang))}</a></li>
            <li><a href="/collections.html">${escapeHtml(t("footer.craftsmanship", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.privacyPolicy", lang))}</a></li>
          </ul>
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.contactHeading", lang))}</h2>
          <div class="footer-contact-list">
            <div class="footer-contact-item">
              <span class="footer-contact-label">${escapeHtml(t("footer.emailLabel", lang))}</span>
              <a class="footer-contact-value" href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>
            </div>
            ${
              whatsappNumbers.length
                ? `<div class="footer-contact-item">
                    <span class="footer-contact-label">${escapeHtml(t("footer.whatsappLabel", lang))}</span>
                    ${whatsappNumbers
                      .map(
                        ({ number, digits }) =>
                          `<a class="footer-contact-value" href="https://wa.me/${escapeHtml(digits)}" aria-label="${escapeHtml(t("footer.chatOnWhatsApp", lang))}: ${escapeHtml(number)}" target="_blank" rel="noopener noreferrer">${escapeHtml(number)}</a>`
                      )
                      .join("")}
                  </div>`
                : ""
            }
            <div class="footer-contact-item">
              <span class="footer-contact-label">${escapeHtml(t("footer.hoursLabel", lang))}</span>
              <span class="footer-contact-value">${escapeHtml(supportHours)}</span>
            </div>
            <div class="footer-contact-item">
              <span class="footer-contact-label">${escapeHtml(t("footer.locationLabel", lang))}</span>
              <span class="footer-contact-value">${escapeHtml(location)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <span>${escapeHtml(t("brand.copyright", lang))}</span>
        <span>${escapeHtml(t("footer.paymentNote", lang))}</span>
      </div>
    </div>
  `;
}
