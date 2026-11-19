/**
 * MR. ZAIN — Shared Storefront Footer Component
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import { escapeHtml } from "../utils/formatters.js";
import { showToast } from "./ui.js";

export function renderFooter(container) {
  if (!container) return;

  const lang = getLanguage();
  const storeInfo = getCachedPublicSettings()?.storeInfo;
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
          <a href="/index.html" class="footer-brand-box" aria-label="MR. ZAIN">
            <img src="/assets/images/mr-zain-logo.png" alt="MR. ZAIN" referrerPolicy="no-referrer" />
          </a>
          <p class="footer-description">${escapeHtml(brandDesc)}</p>
          <div class="footer-socials">
            <a href="#instagram" aria-label="Instagram">Instagram</a>
            <span aria-hidden="true">·</span>
            <a href="#tiktok" aria-label="TikTok">TikTok</a>
            <span aria-hidden="true">·</span>
            <a href="#facebook" aria-label="Facebook">Facebook</a>
          </div>
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.customerService", lang))}</h2>
          <ul class="footer-links">
            <li><a href="/pages/order-tracking.html">${escapeHtml(t("footer.trackOrder", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.shippingEgypt", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.returns", lang))}</a></li>
            <li><a href="/shop.html">${escapeHtml(t("footer.sizeGuide", lang))}</a></li>
          </ul>
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.aboutHeading", lang))}</h2>
          <ul class="footer-links">
            <li><a href="/about.html">${escapeHtml(t("footer.ourStory", lang))}</a></li>
            <li><a href="/collections.html">${escapeHtml(t("footer.craftsmanship", lang))}</a></li>
            <li><a href="/contact.html">${escapeHtml(t("footer.contactUs", lang))}</a></li>
            <li><a href="/about.html#store-policies">${escapeHtml(t("footer.privacyPolicy", lang))}</a></li>
          </ul>
        </div>

        <div>
          <h2 class="footer-heading">${escapeHtml(t("footer.newsletterHeading", lang))}</h2>
          <p class="footer-newsletter-text">${escapeHtml(t("footer.newsletterDesc", lang))}</p>
          <form class="footer-newsletter-form" id="zain-newsletter-form" novalidate>
            <label for="zain-newsletter-email" class="sr-only">${escapeHtml(t("footer.newsletterPlaceholder", lang))}</label>
            <input
              type="email"
              id="zain-newsletter-email"
              class="footer-newsletter-input"
              placeholder="${escapeHtml(t("footer.newsletterPlaceholder", lang))}"
              required
            />
            <button type="submit" class="btn btn--gold btn--sm">
              ${escapeHtml(t("footer.newsletterSubmit", lang))}
            </button>
          </form>
        </div>
      </div>

      <div class="footer-bottom">
        <span>${escapeHtml(t("brand.copyright", lang))}</span>
        <span>${escapeHtml(t("footer.paymentNote", lang))}</span>
      </div>
    </div>
  `;

  const form = container.querySelector("#zain-newsletter-form");
  const emailInput = container.querySelector("#zain-newsletter-email");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailInput?.value.trim() || "";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      showToast(t("footer.newsletterInvalid", getLanguage()), "error");
      emailInput?.focus();
      return;
    }
    emailInput.value = "";
    showToast(t("footer.newsletterSuccess", getLanguage()), "success");
  });
}
