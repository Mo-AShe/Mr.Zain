/**
 * MR. ZAIN — Admin General Store Settings, Policies, Maintenance & Homepage Config Controller
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { showToast } from "../components/ui.js";
import { escapeHtml } from "../utils/formatters.js";
import {
  fetchAdminSettings,
  createAdminBannerRequest,
  deleteAdminBannerRequest,
  discardStagedAdminProductImageRequest,
  stageAdminProductImageRequest,
  updateAdminBannerRequest,
  updateAdminAvailabilityRequest,
  updateAdminGeneralSettingsRequest,
  updateAdminHomepageRequest,
} from "./admin.js";

const POLICY_KEYS = [
  "about",
  "contact",
  "shipping_policy",
  "return_policy",
  "privacy_policy",
  "terms_conditions",
];

const settingsState = {
  loading: false,
  error: "",
  loadedOnce: false,
  activeTab: "info", // info | policies | availability | homepage
  saving: false,
  productFilter: "",
  data: null,
};

export function resetSettingsLoadState() {
  settingsState.loadedOnce = false;
}

export async function loadAdminSettings({ onAuthError, onRender } = {}) {
  settingsState.loading = true;
  settingsState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    settingsState.data = await fetchAdminSettings();
    settingsState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    settingsState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    settingsState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

function getPolicyLabel(key, lang) {
  const map = {
    about: t("adminOps.settings.policyAbout", lang),
    contact: t("adminOps.settings.policyContact", lang),
    shipping_policy: t("adminOps.settings.policyShipping", lang),
    return_policy: t("adminOps.settings.policyReturn", lang),
    privacy_policy: t("adminOps.settings.policyPrivacy", lang),
    terms_conditions: t("adminOps.settings.policyTerms", lang),
  };
  return map[key] || key;
}

function renderStoreInfoTab(data, lang) {
  const info = data.storeInfo;
  return `
    <form id="settings-info-form" class="admin-form" novalidate>
      <div id="settings-info-error" class="admin-form-error" hidden></div>

      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label" for="st-name">${escapeHtml(t("adminOps.settings.fieldStoreName", lang))}</label>
          <input id="st-name" type="text" class="input" maxlength="120" value="${escapeHtml(info.storeName)}" required />
        </div>

        <div class="field">
          <label class="field__label" for="st-currency">${escapeHtml(t("adminOps.settings.fieldCurrency", lang))}</label>
          <input id="st-currency" type="text" class="input" dir="ltr" value="EGP (Egyptian Pound)" readonly disabled />
        </div>

        <div class="field">
          <label class="field__label" for="st-email">${escapeHtml(t("adminOps.settings.fieldEmail", lang))}</label>
          <input id="st-email" type="email" class="input" dir="ltr" maxlength="180" value="${escapeHtml(info.contactEmail)}" required />
        </div>

        <div class="field">
          <label class="field__label" for="st-phone">${escapeHtml(t("adminOps.settings.fieldPhone", lang))}</label>
          <input id="st-phone" type="tel" class="input tabular-nums" dir="ltr" maxlength="40" value="${escapeHtml(info.contactPhone)}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-whatsapp">${escapeHtml(t("adminOps.settings.fieldWhatsapp", lang))}</label>
          <textarea id="st-whatsapp" class="textarea admin-textarea tabular-nums" dir="ltr" rows="3" maxlength="500">${escapeHtml(info.whatsappNumber)}</textarea>
        </div>

        <div class="field">
          <label class="field__label" for="st-instagram">${escapeHtml(t("adminOps.settings.fieldInstagramUrl", lang))}</label>
          <input id="st-instagram" type="url" class="input" dir="ltr" maxlength="500" value="${escapeHtml(info.instagramUrl || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-tiktok">${escapeHtml(t("adminOps.settings.fieldTiktokUrl", lang))}</label>
          <input id="st-tiktok" type="url" class="input" dir="ltr" maxlength="500" value="${escapeHtml(info.tiktokUrl || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-facebook">${escapeHtml(t("adminOps.settings.fieldFacebookUrl", lang))}</label>
          <input id="st-facebook" type="url" class="input" dir="ltr" maxlength="500" value="${escapeHtml(info.facebookUrl || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-addr-en">${escapeHtml(t("adminOps.settings.fieldAddressEn", lang))}</label>
          <input id="st-addr-en" type="text" class="input" dir="ltr" maxlength="300" value="${escapeHtml(info.storeAddressEn)}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-addr-ar">${escapeHtml(t("adminOps.settings.fieldAddressAr", lang))}</label>
          <input id="st-addr-ar" type="text" class="input" dir="rtl" maxlength="300" value="${escapeHtml(info.storeAddressAr)}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-hours-en">${escapeHtml(t("adminOps.settings.fieldHoursEn", lang))}</label>
          <input id="st-hours-en" type="text" class="input" dir="ltr" maxlength="200" value="${escapeHtml(info.supportHoursEn)}" />
        </div>

        <div class="field admin-form-full">
          <label class="field__label" for="st-hours-ar">${escapeHtml(t("adminOps.settings.fieldHoursAr", lang))}</label>
          <input id="st-hours-ar" type="text" class="input" dir="rtl" maxlength="200" value="${escapeHtml(info.supportHoursAr)}" />
        </div>

        <div class="field">
          <label class="field__label" for="st-desc-en">${escapeHtml(t("adminOps.settings.fieldDescEn", lang))}</label>
          <textarea id="st-desc-en" class="textarea admin-textarea" dir="ltr" maxlength="1000">${escapeHtml(info.storeDescriptionEn)}</textarea>
        </div>

        <div class="field">
          <label class="field__label" for="st-desc-ar">${escapeHtml(t("adminOps.settings.fieldDescAr", lang))}</label>
          <textarea id="st-desc-ar" class="textarea admin-textarea" dir="rtl" maxlength="1000">${escapeHtml(info.storeDescriptionAr)}</textarea>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" class="btn btn--primary btn--sm" ${settingsState.saving ? "disabled" : ""}>
          ${escapeHtml(settingsState.saving ? t("adminOps.common.savingBtn", lang) : t("adminOps.settings.saveInfoBtn", lang))}
        </button>
      </div>
    </form>
  `;
}

function renderPoliciesTab(data, lang) {
  const policies = data.policies || {};
  return `
    <form id="settings-policies-form" class="admin-form" novalidate>
      <div id="settings-policies-error" class="admin-form-error" hidden></div>

      <div class="admin-notice">${escapeHtml(t("adminOps.settings.policiesPlainTextHint", lang))}</div>

      <div class="admin-policy-list">
        ${POLICY_KEYS.map((key) => {
          const item = policies[key] || {
            titleEn: "",
            titleAr: "",
            bodyEn: "",
            bodyAr: "",
          };
          return `
            <div class="admin-policy-card">
              <div class="admin-policy-card__head">
                <strong class="admin-policy-card__title">${escapeHtml(getPolicyLabel(key, lang))}</strong>
              </div>
              <div class="admin-form-grid">
                <div class="field">
                  <label class="field__label" for="pol-${key}-title-en">${escapeHtml(t("adminOps.settings.fieldTitleEn", lang))}</label>
                  <input id="pol-${key}-title-en" type="text" class="input" dir="ltr" maxlength="200" value="${escapeHtml(item.titleEn || "")}" required />
                </div>
                <div class="field">
                  <label class="field__label" for="pol-${key}-title-ar">${escapeHtml(t("adminOps.settings.fieldTitleAr", lang))}</label>
                  <input id="pol-${key}-title-ar" type="text" class="input" dir="rtl" maxlength="200" value="${escapeHtml(item.titleAr || "")}" required />
                </div>
                <div class="field">
                  <label class="field__label" for="pol-${key}-body-en">${escapeHtml(t("adminOps.settings.fieldBodyEn", lang))}</label>
                  <textarea id="pol-${key}-body-en" class="textarea admin-textarea" dir="ltr" maxlength="8000">${escapeHtml(item.bodyEn || "")}</textarea>
                </div>
                <div class="field">
                  <label class="field__label" for="pol-${key}-body-ar">${escapeHtml(t("adminOps.settings.fieldBodyAr", lang))}</label>
                  <textarea id="pol-${key}-body-ar" class="textarea admin-textarea" dir="rtl" maxlength="8000">${escapeHtml(item.bodyAr || "")}</textarea>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" class="btn btn--primary btn--sm" ${settingsState.saving ? "disabled" : ""}>
          ${escapeHtml(settingsState.saving ? t("adminOps.common.savingBtn", lang) : t("adminOps.settings.savePoliciesBtn", lang))}
        </button>
      </div>
    </form>
  `;
}

function renderAvailabilityTab(data, lang) {
  const avail = data.availability;
  const isMaint = Boolean(avail?.isMaintenanceMode);

  return `
    <div class="admin-maintenance-banner ${isMaint ? "is-active" : ""}">
      <div class="admin-maintenance-banner__meta">
        <strong class="admin-maintenance-banner__title">
          ${escapeHtml(isMaint ? t("adminOps.settings.maintStatusOn", lang) : t("adminOps.settings.maintStatusOff", lang))}
        </strong>
        <p class="admin-maintenance-banner__desc">
          ${escapeHtml(isMaint ? t("adminOps.settings.maintDescOn", lang) : t("adminOps.settings.maintDescOff", lang))}
        </p>
      </div>
      <span class="admin-tag ${isMaint ? "admin-tag--gold" : ""}">
        ${escapeHtml(isMaint ? t("adminOps.settings.maintBadgeOn", lang) : t("adminOps.settings.maintBadgeOff", lang))}
      </span>
    </div>

    <form id="settings-availability-form" class="admin-form" novalidate>
      <div id="settings-availability-error" class="admin-form-error" hidden></div>

      <div class="admin-checkbox-grid">
        <label class="admin-checkbox">
          <input id="av-enabled" type="checkbox" ${isMaint ? "checked" : ""} />
          <span>${escapeHtml(t("adminOps.settings.maintToggleLabel", lang))}</span>
        </label>
      </div>

      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label" for="av-msg-en">${escapeHtml(t("adminOps.settings.maintMessageEn", lang))}</label>
          <textarea id="av-msg-en" class="textarea admin-textarea" dir="ltr" maxlength="600">${escapeHtml(avail?.maintenanceMessageEn || "")}</textarea>
        </div>
        <div class="field">
          <label class="field__label" for="av-msg-ar">${escapeHtml(t("adminOps.settings.maintMessageAr", lang))}</label>
          <textarea id="av-msg-ar" class="textarea admin-textarea" dir="rtl" maxlength="600">${escapeHtml(avail?.maintenanceMessageAr || "")}</textarea>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" class="btn btn--primary btn--sm" ${settingsState.saving ? "disabled" : ""}>
          ${escapeHtml(settingsState.saving ? t("adminOps.common.savingBtn", lang) : t("adminOps.settings.saveAvailabilityBtn", lang))}
        </button>
      </div>
    </form>
  `;
}

function renderHomepageTab(data, lang) {
  const hp = data.homepage;
  const collections = Array.isArray(data.availableCollections)
    ? data.availableCollections
    : [];
  const products = Array.isArray(data.availableProducts)
    ? data.availableProducts
    : [];

  const selectedCols = new Set(hp.featuredCollectionIds || []);
  const selectedProds = new Set(hp.featuredProductIds || []);
  const filterQ = settingsState.productFilter.trim().toLowerCase();
  const visibleProducts = filterQ
    ? products.filter(
        (p) =>
          p.nameEn.toLowerCase().includes(filterQ) ||
          p.nameAr.toLowerCase().includes(filterQ) ||
          p.slug.toLowerCase().includes(filterQ)
      )
    : products;

  return `
    <form id="settings-homepage-form" class="admin-form" novalidate>
      <div id="settings-homepage-error" class="admin-form-error" hidden></div>

      <div class="admin-policy-card">
        <div class="admin-policy-card__head">
          <strong class="admin-policy-card__title">${escapeHtml(t("adminOps.settings.announcementHeading", lang))}</strong>
          <label class="admin-checkbox">
            <input id="hp-ann-enabled" type="checkbox" ${hp.announcementEnabled ? "checked" : ""} />
            <span>${escapeHtml(t("adminOps.settings.announcementEnableLabel", lang))}</span>
          </label>
        </div>

        <div class="admin-form-grid">
          <div class="field">
            <label class="field__label" for="hp-ann-badge-en">${escapeHtml(t("adminOps.settings.annBadgeEn", lang))}</label>
            <input id="hp-ann-badge-en" type="text" class="input" dir="ltr" maxlength="80" value="${escapeHtml(hp.announcementBadgeEn || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-ann-badge-ar">${escapeHtml(t("adminOps.settings.annBadgeAr", lang))}</label>
            <input id="hp-ann-badge-ar" type="text" class="input" dir="rtl" maxlength="80" value="${escapeHtml(hp.announcementBadgeAr || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-ann-text-en">${escapeHtml(t("adminOps.settings.annTextEn", lang))}</label>
            <input id="hp-ann-text-en" type="text" class="input" dir="ltr" maxlength="300" value="${escapeHtml(hp.announcementTextEn || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-ann-text-ar">${escapeHtml(t("adminOps.settings.annTextAr", lang))}</label>
            <input id="hp-ann-text-ar" type="text" class="input" dir="rtl" maxlength="300" value="${escapeHtml(hp.announcementTextAr || "")}" />
          </div>
        </div>
      </div>

      <div class="admin-policy-card">
        <div class="admin-policy-card__head">
          <strong class="admin-policy-card__title">${escapeHtml(t("adminOps.settings.promoBannerHeading", lang))}</strong>
          <label class="admin-checkbox">
            <input id="hp-promo-enabled" type="checkbox" ${hp.promoBannerEnabled ? "checked" : ""} />
            <span>${escapeHtml(t("adminOps.settings.promoBannerEnableLabel", lang))}</span>
          </label>
        </div>

        <div class="admin-form-grid">
          <div class="field">
            <label class="field__label" for="hp-promo-title-en">${escapeHtml(t("adminOps.settings.fieldTitleEn", lang))}</label>
            <input id="hp-promo-title-en" type="text" class="input" dir="ltr" maxlength="200" value="${escapeHtml(hp.promoBannerTitleEn || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-promo-title-ar">${escapeHtml(t("adminOps.settings.fieldTitleAr", lang))}</label>
            <input id="hp-promo-title-ar" type="text" class="input" dir="rtl" maxlength="200" value="${escapeHtml(hp.promoBannerTitleAr || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-promo-sub-en">${escapeHtml(t("adminOps.settings.promoSubtitleEn", lang))}</label>
            <input id="hp-promo-sub-en" type="text" class="input" dir="ltr" maxlength="300" value="${escapeHtml(hp.promoBannerSubtitleEn || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="hp-promo-sub-ar">${escapeHtml(t("adminOps.settings.promoSubtitleAr", lang))}</label>
            <input id="hp-promo-sub-ar" type="text" class="input" dir="rtl" maxlength="300" value="${escapeHtml(hp.promoBannerSubtitleAr || "")}" />
          </div>
        </div>
      </div>

      <div class="admin-policy-card">
        <div class="admin-policy-card__head">
          <strong class="admin-policy-card__title">${escapeHtml(t("adminOps.settings.featuredCollectionsHeading", lang))}</strong>
          <span class="admin-table-item__sub">${escapeHtml(t("adminOps.settings.featuredCollectionsHint", lang))}</span>
        </div>

        ${
          collections.length === 0
            ? `<p class="text-muted" style="font-size: var(--text-xs);">${escapeHtml(t("adminOps.settings.noCollectionsYet", lang))}</p>`
            : `
          <div class="admin-pick-grid">
            ${collections
              .map(
                (col) => `
              <label class="admin-pick-item">
                <input type="checkbox" name="featuredCollection" value="${escapeHtml(col.id)}" ${selectedCols.has(col.id) ? "checked" : ""} />
                <span class="admin-pick-item__body">
                  <span class="admin-pick-item__name">${escapeHtml(lang === "ar" ? col.nameAr || col.nameEn : col.nameEn)}</span>
                  <span class="admin-pick-item__meta">
                    ${escapeHtml(col.isActive ? t("adminOps.common.activeStatus", lang) : t("adminOps.common.inactiveStatus", lang))}
                  </span>
                </span>
              </label>
            `
              )
              .join("")}
          </div>
        `
        }

      </div>

      <div class="admin-policy-card">
        <div class="admin-policy-card__head">
          <strong class="admin-policy-card__title">${escapeHtml(t("adminOps.settings.featuredProductsHeading", lang))}</strong>
          <span class="admin-table-item__sub">${escapeHtml(t("adminOps.settings.featuredProductsHint", lang))}</span>
        </div>

        <input
          type="search"
          id="hp-prod-search"
          class="input"
          value="${escapeHtml(settingsState.productFilter)}"
          placeholder="${escapeHtml(t("adminOps.settings.searchProductsPlaceholder", lang))}"
        />

        ${
          visibleProducts.length === 0
            ? `<p class="text-muted" style="font-size: var(--text-xs);">${escapeHtml(t("adminOps.settings.noProductsYet", lang))}</p>`
            : `
          <div class="admin-pick-grid">
            ${visibleProducts
              .map((prod) => {
                const isLive = prod.isPublished && prod.categoryActive;
                return `
                <label class="admin-pick-item">
                  <input type="checkbox" name="featuredProduct" value="${escapeHtml(prod.id)}" ${selectedProds.has(prod.id) ? "checked" : ""} />
                  <span class="admin-pick-item__body">
                    <span class="admin-pick-item__name">${escapeHtml(lang === "ar" ? prod.nameAr || prod.nameEn : prod.nameEn)}</span>
                    <span class="admin-pick-item__meta">
                      ${escapeHtml(isLive ? t("adminOps.settings.publishedTag", lang) : t("adminOps.settings.hiddenTag", lang))}
                    </span>
                  </span>
                </label>
              `;
              })
              .join("")}
          </div>
        `
        }
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" class="btn btn--primary btn--sm" ${settingsState.saving ? "disabled" : ""}>
          ${escapeHtml(settingsState.saving ? t("adminOps.common.savingBtn", lang) : t("adminOps.settings.saveHomepageBtn", lang))}
        </button>
      </div>
    </form>
  `;
}

function renderBannersTab(data, lang) {
  const banners = Array.isArray(data.banners) ? data.banners : [];
  const renderBannerForm = (banner = null) => {
    const formId = banner?.id || "new";
    return `
    <article class="admin-policy-card">
      <form class="admin-form" data-banner-form data-banner-id="${escapeHtml(banner?.id || "")}" novalidate>
        <div class="admin-policy-card__head">
          <strong class="admin-policy-card__title">
            ${escapeHtml(banner ? t("adminOps.settings.bannerEditTitle", lang) : t("adminOps.settings.bannerCreateTitle", lang))}
          </strong>
          ${
            banner?.imageUrl
              ? `<img src="${escapeHtml(banner.imageUrl)}" alt="" width="120" height="72" style="object-fit: cover; border-radius: var(--radius-sm);" />`
              : ""
          }
        </div>
        <div class="admin-form-grid">
          <div class="field">
            <label class="field__label" for="banner-title-en-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerTitleEn", lang))}</label>
            <input id="banner-title-en-${escapeHtml(formId)}" name="titleEn" type="text" class="input" dir="ltr" maxlength="200" value="${escapeHtml(banner?.titleEn || "")}" required />
          </div>
          <div class="field">
            <label class="field__label" for="banner-title-ar-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerTitleAr", lang))}</label>
            <input id="banner-title-ar-${escapeHtml(formId)}" name="titleAr" type="text" class="input" dir="rtl" maxlength="200" value="${escapeHtml(banner?.titleAr || "")}" required />
          </div>
          <div class="field">
            <label class="field__label" for="banner-subtitle-en-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerSubtitleEn", lang))}</label>
            <textarea id="banner-subtitle-en-${escapeHtml(formId)}" name="subtitleEn" class="textarea admin-textarea" dir="ltr" maxlength="300">${escapeHtml(banner?.subtitleEn || "")}</textarea>
          </div>
          <div class="field">
            <label class="field__label" for="banner-subtitle-ar-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerSubtitleAr", lang))}</label>
            <textarea id="banner-subtitle-ar-${escapeHtml(formId)}" name="subtitleAr" class="textarea admin-textarea" dir="rtl" maxlength="300">${escapeHtml(banner?.subtitleAr || "")}</textarea>
          </div>
          <div class="field">
            <label class="field__label" for="banner-image-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerImage", lang))}</label>
            <input id="banner-image-${escapeHtml(formId)}" name="image" type="file" class="input" accept="image/jpeg,image/png,image/webp" />
            <span class="field__hint">${escapeHtml(t("adminOps.settings.bannerImageHint", lang))}</span>
          </div>
          <div class="field">
            <label class="field__label" for="banner-image-url-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerImageUrl", lang))}</label>
            <input id="banner-image-url-${escapeHtml(formId)}" name="imageUrl" type="url" class="input" dir="ltr" maxlength="2000" placeholder="https://example.com/banner.jpg" value="${escapeHtml(banner?.imageUrl?.startsWith("http") ? banner.imageUrl : "")}" />
            <span class="field__hint">${escapeHtml(t("adminOps.settings.bannerImageUrlHint", lang))}</span>
          </div>
          <div class="field">
            <label class="field__label" for="banner-link-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerLink", lang))}</label>
            <input id="banner-link-${escapeHtml(formId)}" name="targetUrl" type="text" class="input" dir="ltr" maxlength="500" placeholder="/shop.html?category=jackets" value="${escapeHtml(banner?.targetUrl || "")}" />
          </div>
          <div class="field">
            <label class="field__label" for="banner-order-${escapeHtml(formId)}">${escapeHtml(t("adminOps.settings.bannerOrder", lang))}</label>
            <input id="banner-order-${escapeHtml(formId)}" name="displayOrder" type="number" class="input" min="0" max="10000" step="1" value="${escapeHtml(String(banner?.displayOrder ?? banners.length))}" required />
          </div>
          <label class="admin-checkbox">
            <input name="isActive" type="checkbox" ${banner?.isActive !== false ? "checked" : ""} />
            <span>${escapeHtml(t("adminOps.settings.bannerActive", lang))}</span>
          </label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
          ${
            banner
              ? `<button type="button" class="btn btn--secondary btn--sm" data-delete-banner="${escapeHtml(banner.id)}">${escapeHtml(t("adminOps.settings.bannerDelete", lang))}</button>`
              : ""
          }
          <button type="submit" class="btn btn--primary btn--sm">
            ${escapeHtml(banner ? t("adminOps.settings.bannerSave", lang) : t("adminOps.settings.bannerCreate", lang))}
          </button>
        </div>
      </form>
    </article>
  `;
  };

  return `
    <div class="admin-page-head">
      <div>
        <h2 class="admin-page-head__title">${escapeHtml(t("adminOps.settings.bannersTitle", lang))}</h2>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.settings.bannersHint", lang))}</p>
      </div>
    </div>
    ${renderBannerForm()}
    ${
      banners.length
        ? banners.map((banner) => renderBannerForm(banner)).join("")
        : `<div class="admin-state-box admin-state-box--inline"><p class="admin-state-box__desc">${escapeHtml(t("adminOps.settings.bannersEmpty", lang))}</p></div>`
    }
  `;
}

export function renderSettingsSection(mainEl, { onAuthError, onRender } = {}) {
  const lang = getLanguage();

  if (!settingsState.loadedOnce && !settingsState.loading && !settingsState.error) {
    void loadAdminSettings({ onAuthError, onRender });
  }

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.settings.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.settings.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.settings.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="settings-refresh-btn" ${settingsState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
        </button>
      </div>
    </div>

    <div class="admin-settings-subbar">
      <div class="admin-tabs admin-tabs--wrap" role="tablist" aria-label="${escapeHtml(t("adminOps.settings.title", lang))}">
        <button type="button" class="admin-tabs__btn ${settingsState.activeTab === "info" ? "is-active" : ""}" data-settings-tab="info">
          ${escapeHtml(t("adminOps.settings.tabInfo", lang))}
        </button>
        <button type="button" class="admin-tabs__btn ${settingsState.activeTab === "policies" ? "is-active" : ""}" data-settings-tab="policies">
          ${escapeHtml(t("adminOps.settings.tabPolicies", lang))}
        </button>
        <button type="button" class="admin-tabs__btn ${settingsState.activeTab === "availability" ? "is-active" : ""}" data-settings-tab="availability">
          ${escapeHtml(t("adminOps.settings.tabAvailability", lang))}
        </button>
        <button type="button" class="admin-tabs__btn ${settingsState.activeTab === "homepage" ? "is-active" : ""}" data-settings-tab="homepage">
          ${escapeHtml(t("adminOps.settings.tabHomepage", lang))}
        </button>
        <button type="button" class="admin-tabs__btn ${settingsState.activeTab === "banners" ? "is-active" : ""}" data-settings-tab="banners">
          ${escapeHtml(t("adminOps.settings.tabBanners", lang))}
        </button>
      </div>
    </div>

    <section class="admin-panel">
      ${
        settingsState.error
          ? `<div class="admin-state-box admin-state-box--inline"><strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong><p class="admin-state-box__desc">${escapeHtml(settingsState.error)}</p><button type="button" class="btn btn--primary btn--sm" id="settings-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button></div>`
          : !settingsState.data || (settingsState.loading && !settingsState.loadedOnce)
          ? `<div class="admin-skeleton" style="width: 100%; height: 280px;"></div>`
          : settingsState.activeTab === "info"
          ? renderStoreInfoTab(settingsState.data, lang)
          : settingsState.activeTab === "policies"
          ? renderPoliciesTab(settingsState.data, lang)
          : settingsState.activeTab === "availability"
          ? renderAvailabilityTab(settingsState.data, lang)
          : settingsState.activeTab === "banners"
          ? renderBannersTab(settingsState.data, lang)
          : renderHomepageTab(settingsState.data, lang)
      }
    </section>
  `;

  document.getElementById("settings-refresh-btn")?.addEventListener("click", () => {
    void loadAdminSettings({ onAuthError, onRender });
  });
  document.getElementById("settings-retry-btn")?.addEventListener("click", () => {
    void loadAdminSettings({ onAuthError, onRender });
  });

  mainEl.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      settingsState.activeTab = btn.getAttribute("data-settings-tab") || "info";
      onRender();
    });
  });

  document.getElementById("hp-prod-search")?.addEventListener("input", (e) => {
    settingsState.productFilter = e.target.value || "";
    onRender();
    const input = document.getElementById("hp-prod-search");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  mainEl.querySelectorAll("[data-banner-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = event.currentTarget;
      const bannerId = currentForm.getAttribute("data-banner-id");
      const formData = new FormData(currentForm);
      const imageFile = formData.get("image");
      const imageUrl = String(formData.get("imageUrl") || "").trim();
      let uploadId = null;
      settingsState.saving = true;
      onRender();
      try {
        if (imageUrl && imageFile instanceof File && imageFile.size > 0) {
          throw new Error(t("adminOps.settings.bannerImageSourceConflict", getLanguage()));
        }
        if (imageFile instanceof File && imageFile.size > 0) {
          uploadId = await stageAdminProductImageRequest(imageFile);
        }
        const payload = {
          titleEn: String(formData.get("titleEn") || "").trim(),
          titleAr: String(formData.get("titleAr") || "").trim(),
          subtitleEn: String(formData.get("subtitleEn") || "").trim(),
          subtitleAr: String(formData.get("subtitleAr") || "").trim(),
          targetUrl: String(formData.get("targetUrl") || "").trim(),
          displayOrder: Number(formData.get("displayOrder")),
          isActive: formData.get("isActive") === "on",
          ...(uploadId ? { imageUploadId: uploadId } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        };
        let savedBanner;
        if (bannerId) {
          savedBanner = await updateAdminBannerRequest(bannerId, payload);
        } else {
          if (!uploadId && !imageUrl) {
            throw new Error(t("adminOps.settings.bannerImageRequired", getLanguage()));
          }
          savedBanner = await createAdminBannerRequest(payload);
        }
        if (!savedBanner?.id) {
          throw new Error(t("adminOps.common.errorTitle", getLanguage()));
        }
        const banners = settingsState.data?.banners || [];
        settingsState.data.banners = [
          ...banners.filter((banner) => banner.id !== savedBanner.id),
          savedBanner,
        ].sort(
          (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)
        );
        showToast(t("adminOps.settings.bannersSaved", getLanguage()), "success");
      } catch (error) {
        if (uploadId) {
          await discardStagedAdminProductImageRequest(uploadId).catch((cleanupError) => {
            console.error("Could not clean up an unused staged banner image.", cleanupError);
          });
        }
        if (error && (error.status === 401 || error.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(error);
          return;
        }
        showToast(error?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        settingsState.saving = false;
        onRender();
      }
    });
  });

  mainEl.querySelectorAll("[data-delete-banner]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bannerId = button.getAttribute("data-delete-banner");
      if (!bannerId || !window.confirm(t("adminOps.settings.bannerDeleteConfirm", getLanguage()))) {
        return;
      }
      settingsState.saving = true;
      onRender();
      try {
        await deleteAdminBannerRequest(bannerId);
        settingsState.data.banners = (settingsState.data?.banners || []).filter(
          (banner) => banner.id !== bannerId
        );
        showToast(t("adminOps.settings.bannerDeleted", getLanguage()), "success");
      } catch (error) {
        if (error && (error.status === 401 || error.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(error);
          return;
        }
        showToast(error?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        settingsState.saving = false;
        onRender();
      }
    });
  });

  document.getElementById("settings-info-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("settings-info-error");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }

    const currentLang = getLanguage();
    const storeName = document.getElementById("st-name")?.value.trim() || "";
    const contactEmail = document.getElementById("st-email")?.value.trim() || "";
    const contactPhone = document.getElementById("st-phone")?.value.trim() || "";
    const whatsappNumber = document.getElementById("st-whatsapp")?.value.trim() || "";
    const instagramUrl = document.getElementById("st-instagram")?.value.trim() || "";
    const tiktokUrl = document.getElementById("st-tiktok")?.value.trim() || "";
    const facebookUrl = document.getElementById("st-facebook")?.value.trim() || "";

    if (storeName.length < 2) {
      if (errEl) {
        errEl.textContent = t("adminOps.settings.errStoreName", currentLang);
        errEl.hidden = false;
      }
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      if (errEl) {
        errEl.textContent = t("adminOps.settings.errEmail", currentLang);
        errEl.hidden = false;
      }
      return;
    }

    settingsState.saving = true;
    onRender();
    try {
      settingsState.data = await updateAdminGeneralSettingsRequest({
        storeInfo: {
          storeName,
          contactEmail,
          contactPhone,
          whatsappNumber,
          instagramUrl,
          tiktokUrl,
          facebookUrl,
          storeAddressEn: document.getElementById("st-addr-en")?.value.trim() || "",
          storeAddressAr: document.getElementById("st-addr-ar")?.value.trim() || "",
          supportHoursEn: document.getElementById("st-hours-en")?.value.trim() || "",
          supportHoursAr: document.getElementById("st-hours-ar")?.value.trim() || "",
          storeDescriptionEn: document.getElementById("st-desc-en")?.value.trim() || "",
          storeDescriptionAr: document.getElementById("st-desc-ar")?.value.trim() || "",
        },
      });
      showToast(t("adminOps.settings.savedToast", getLanguage()), "success");
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
    } finally {
      settingsState.saving = false;
      onRender();
    }
  });

  document
    .getElementById("settings-policies-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const policiesPayload = {};
      for (const key of POLICY_KEYS) {
        policiesPayload[key] = {
          titleEn: document.getElementById(`pol-${key}-title-en`)?.value.trim() || "",
          titleAr: document.getElementById(`pol-${key}-title-ar`)?.value.trim() || "",
          bodyEn: document.getElementById(`pol-${key}-body-en`)?.value.trim() || "",
          bodyAr: document.getElementById(`pol-${key}-body-ar`)?.value.trim() || "",
        };
      }

      settingsState.saving = true;
      onRender();
      try {
        settingsState.data = await updateAdminGeneralSettingsRequest({
          policies: policiesPayload,
        });
        showToast(t("adminOps.settings.policiesSavedToast", getLanguage()), "success");
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        settingsState.saving = false;
        onRender();
      }
    });

  document
    .getElementById("settings-availability-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isMaintenanceMode = Boolean(document.getElementById("av-enabled")?.checked);
      const maintenanceMessageEn =
        document.getElementById("av-msg-en")?.value.trim() || "";
      const maintenanceMessageAr =
        document.getElementById("av-msg-ar")?.value.trim() || "";

      settingsState.saving = true;
      onRender();
      try {
        const updatedAvail = await updateAdminAvailabilityRequest({
          isMaintenanceMode,
          maintenanceMessageEn,
          maintenanceMessageAr,
        });
        if (settingsState.data) {
          settingsState.data.availability = updatedAvail;
        }
        showToast(
          t("adminOps.settings.availabilitySavedToast", getLanguage()),
          "success"
        );
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        settingsState.saving = false;
        onRender();
      }
    });

  document
    .getElementById("settings-homepage-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("settings-homepage-error");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }

      const currentLang = getLanguage();
      const featuredCollectionIds = Array.from(
        mainEl.querySelectorAll('input[name="featuredCollection"]:checked')
      ).map((el) => el.value);
      const featuredProductIds = Array.from(
        mainEl.querySelectorAll('input[name="featuredProduct"]:checked')
      ).map((el) => el.value);

      if (featuredCollectionIds.length > 3) {
        if (errEl) {
          errEl.textContent = t("adminOps.settings.errMaxCollections", currentLang);
          errEl.hidden = false;
        }
        return;
      }
      if (featuredProductIds.length > 8) {
        if (errEl) {
          errEl.textContent = t("adminOps.settings.errMaxProducts", currentLang);
          errEl.hidden = false;
        }
        return;
      }

      settingsState.saving = true;
      onRender();
      try {
        const updatedHomepage = await updateAdminHomepageRequest({
          announcementEnabled: Boolean(
            document.getElementById("hp-ann-enabled")?.checked
          ),
          announcementBadgeEn:
            document.getElementById("hp-ann-badge-en")?.value.trim() || "",
          announcementBadgeAr:
            document.getElementById("hp-ann-badge-ar")?.value.trim() || "",
          announcementTextEn:
            document.getElementById("hp-ann-text-en")?.value.trim() || "",
          announcementTextAr:
            document.getElementById("hp-ann-text-ar")?.value.trim() || "",
          promoBannerEnabled: Boolean(
            document.getElementById("hp-promo-enabled")?.checked
          ),
          promoBannerTitleEn:
            document.getElementById("hp-promo-title-en")?.value.trim() || "",
          promoBannerTitleAr:
            document.getElementById("hp-promo-title-ar")?.value.trim() || "",
          promoBannerSubtitleEn:
            document.getElementById("hp-promo-sub-en")?.value.trim() || "",
          promoBannerSubtitleAr:
            document.getElementById("hp-promo-sub-ar")?.value.trim() || "",
          featuredCollectionIds,
          featuredProductIds,
        });
        if (settingsState.data) {
          settingsState.data.homepage = updatedHomepage;
        }
        showToast(t("adminOps.settings.homepageSavedToast", getLanguage()), "success");
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        settingsState.saving = false;
        onRender();
      }
    });
}
