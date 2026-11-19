/**
 * MR. ZAIN — Admin Coupon Management & Usage History Controller
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { formatOrderDate, localizeOrderStatus } from "../components/order-view.js";
import {
  closeModal,
  openConfirmDialog,
  openModal,
  showToast,
} from "../components/ui.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import {
  createAdminCouponRequest,
  deleteAdminCouponRequest,
  fetchAdminCouponDetail,
  fetchAdminCoupons,
  updateAdminCouponRequest,
} from "./admin.js";

const couponState = {
  loading: false,
  error: "",
  loadedOnce: false,
  coupons: [],
  pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
  filters: {
    search: "",
    status: "all",
    discountType: "all",
    sort: "code_asc",
  },
  selectedCouponId: null,
  detailLoading: false,
  detailError: "",
  detail: null,
  actionBusy: false,
};

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function formatTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template
  );
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function localizeDerivedStatus(status, lang) {
  const map = {
    active: t("adminOps.coupons.statusActive", lang),
    inactive: t("adminOps.coupons.statusInactive", lang),
    scheduled: t("adminOps.coupons.statusScheduled", lang),
    expired: t("adminOps.coupons.statusExpired", lang),
    exhausted: t("adminOps.coupons.statusExhausted", lang),
  };
  return map[status] || status;
}

function getDerivedStatusClass(status) {
  if (status === "active") return "admin-status-text--success";
  if (status === "scheduled") return "admin-status-text--pending";
  if (status === "expired" || status === "exhausted") return "admin-status-text--danger";
  return "";
}

function formatCouponDiscount(coupon, lang) {
  if (coupon.discountType === "percentage") {
    const base = `${coupon.discountValue}%`;
    if (coupon.maximumDiscount !== null && coupon.maximumDiscount > 0) {
      return `${base} (${t("adminOps.coupons.maxCapShort", lang).replace(
        "{amount}",
        formatPriceEGP(coupon.maximumDiscount, lang)
      )})`;
    }
    return base;
  }
  return formatPriceEGP(coupon.discountValue, lang);
}

export function resetCouponsLoadState() {
  couponState.selectedCouponId = null;
  couponState.detail = null;
  couponState.detailError = "";
  couponState.loadedOnce = false;
}

export async function loadAdminCouponsList({ onAuthError, onRender } = {}) {
  couponState.loading = true;
  couponState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const res = await fetchAdminCoupons({
      search: couponState.filters.search,
      status: couponState.filters.status,
      discountType: couponState.filters.discountType,
      sort: couponState.filters.sort,
      page: couponState.pagination.page,
      limit: couponState.pagination.limit,
    });

    couponState.coupons = Array.isArray(res?.coupons) ? res.coupons : [];
    couponState.pagination = res?.pagination || {
      page: 1,
      limit: 15,
      total: 0,
      totalPages: 1,
    };
    couponState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    couponState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    couponState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

async function loadCouponDetail(couponId, { onAuthError, onRender } = {}) {
  couponState.selectedCouponId = couponId;
  couponState.detailLoading = true;
  couponState.detailError = "";
  if (typeof onRender === "function") onRender();

  try {
    couponState.detail = await fetchAdminCouponDetail(couponId);
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    couponState.detailError = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    couponState.detailLoading = false;
    if (typeof onRender === "function") onRender();
  }
}

function openCouponFormModal(existingCoupon, { onAuthError, onRender }) {
  const lang = getLanguage();
  const isEdit = Boolean(existingCoupon);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <form id="coupon-modal-form" class="admin-form" novalidate>
      <div id="coupon-modal-error" class="admin-form-error" hidden></div>

      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label" for="cp-code">${escapeHtml(t("adminOps.coupons.fieldCode", lang))}</label>
          <input
            id="cp-code"
            type="text"
            class="input"
            dir="ltr"
            maxlength="40"
            value="${escapeHtml(existingCoupon?.code || "")}"
            placeholder="WINTER25"
            required
          />
          <span class="field__hint">${escapeHtml(t("adminOps.coupons.codeHint", lang))}</span>
        </div>

        <div class="field">
          <label class="field__label" for="cp-type">${escapeHtml(t("adminOps.coupons.fieldType", lang))}</label>
          <select id="cp-type" class="select">
            <option value="percentage" ${existingCoupon?.discountType !== "fixed" ? "selected" : ""}>
              ${escapeHtml(t("adminOps.coupons.typePercentage", lang))}
            </option>
            <option value="fixed" ${existingCoupon?.discountType === "fixed" ? "selected" : ""}>
              ${escapeHtml(t("adminOps.coupons.typeFixed", lang))}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="cp-value">${escapeHtml(t("adminOps.coupons.fieldValue", lang))}</label>
          <input
            id="cp-value"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="0.01"
            min="0.01"
            value="${escapeHtml(existingCoupon ? String(existingCoupon.discountValue) : "")}"
            required
          />
        </div>

        <div class="field">
          <label class="field__label" for="cp-max-discount">${escapeHtml(t("adminOps.coupons.fieldMaxDiscount", lang))}</label>
          <input
            id="cp-max-discount"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="0.01"
            min="0.01"
            value="${escapeHtml(existingCoupon?.maximumDiscount !== null && existingCoupon?.maximumDiscount !== undefined ? String(existingCoupon.maximumDiscount) : "")}"
            placeholder="${escapeHtml(t("adminOps.coupons.optionalPlaceholder", lang))}"
          />
        </div>

        <div class="field">
          <label class="field__label" for="cp-min-order">${escapeHtml(t("adminOps.coupons.fieldMinOrder", lang))}</label>
          <input
            id="cp-min-order"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="0.01"
            min="0"
            value="${escapeHtml(existingCoupon ? String(existingCoupon.minimumOrderAmount) : "0")}"
          />
        </div>

        <div class="field">
          <label class="field__label" for="cp-usage-limit">${escapeHtml(t("adminOps.coupons.fieldUsageLimit", lang))}</label>
          <input
            id="cp-usage-limit"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="1"
            min="1"
            value="${escapeHtml(existingCoupon?.usageLimit !== null && existingCoupon?.usageLimit !== undefined ? String(existingCoupon.usageLimit) : "")}"
            placeholder="${escapeHtml(t("adminOps.coupons.unlimitedPlaceholder", lang))}"
          />
        </div>

        <div class="field">
          <label class="field__label" for="cp-per-customer">${escapeHtml(t("adminOps.coupons.fieldPerCustomer", lang))}</label>
          <input
            id="cp-per-customer"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="1"
            min="1"
            value="${escapeHtml(existingCoupon ? String(existingCoupon.usagePerCustomer) : "1")}"
            required
          />
        </div>

        <div class="field" style="justify-content: flex-end;">
          <label class="admin-checkbox" style="margin-top: 1.25rem;">
            <input id="cp-active" type="checkbox" ${existingCoupon ? (existingCoupon.isActive ? "checked" : "") : "checked"} />
            <span>${escapeHtml(t("adminOps.coupons.fieldActive", lang))}</span>
          </label>
        </div>

        <div class="field">
          <label class="field__label" for="cp-starts-at">${escapeHtml(t("adminOps.coupons.fieldStartsAt", lang))}</label>
          <input
            id="cp-starts-at"
            type="datetime-local"
            class="input tabular-nums"
            dir="ltr"
            value="${escapeHtml(toDatetimeLocalValue(existingCoupon?.startsAt))}"
          />
        </div>

        <div class="field">
          <label class="field__label" for="cp-expires-at">${escapeHtml(t("adminOps.coupons.fieldExpiresAt", lang))}</label>
          <input
            id="cp-expires-at"
            type="datetime-local"
            class="input tabular-nums"
            dir="ltr"
            value="${escapeHtml(toDatetimeLocalValue(existingCoupon?.expiresAt))}"
          />
        </div>
      </div>

      ${
        isEdit && existingCoupon.usedCount > 0
          ? `<div class="admin-notice admin-notice--warn">${escapeHtml(
              formatTemplate(t("adminOps.coupons.usedEditHint", lang), {
                count: formatCount(existingCoupon.usedCount),
              })
            )}</div>`
          : ""
      }

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; padding-top: 0.5rem;">
        <button type="button" class="btn btn--secondary" id="cp-cancel-btn">${escapeHtml(t("adminOps.common.cancelBtn", lang))}</button>
        <button type="submit" class="btn btn--primary" id="cp-submit-btn">
          ${escapeHtml(isEdit ? t("adminOps.common.saveBtn", lang) : t("adminOps.coupons.createBtn", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? formatTemplate(t("adminOps.coupons.editModalTitle", lang), {
          code: existingCoupon.code,
        })
      : t("adminOps.coupons.createModalTitle", lang),
    content: wrapper,
    variant: "wide",
  });

  const codeEl = document.getElementById("cp-code");
  const typeEl = document.getElementById("cp-type");
  const valueEl = document.getElementById("cp-value");
  const maxDiscountEl = document.getElementById("cp-max-discount");
  const minOrderEl = document.getElementById("cp-min-order");
  const usageLimitEl = document.getElementById("cp-usage-limit");
  const perCustomerEl = document.getElementById("cp-per-customer");
  const activeEl = document.getElementById("cp-active");
  const startsEl = document.getElementById("cp-starts-at");
  const expiresEl = document.getElementById("cp-expires-at");
  const errEl = document.getElementById("coupon-modal-error");
  const submitBtn = document.getElementById("cp-submit-btn");

  const syncTypeFields = () => {
    if (!typeEl || !maxDiscountEl) return;
    const isFixed = typeEl.value === "fixed";
    maxDiscountEl.disabled = isFixed;
    if (isFixed) maxDiscountEl.value = "";
  };

  syncTypeFields();
  typeEl?.addEventListener("change", syncTypeFields);
  codeEl?.addEventListener("input", () => {
    codeEl.value = codeEl.value.toUpperCase();
  });

  document.getElementById("cp-cancel-btn")?.addEventListener("click", closeModal);

  document.getElementById("coupon-modal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!errEl) return;
    errEl.hidden = true;
    errEl.textContent = "";

    const currentLang = getLanguage();
    const code = (codeEl?.value || "").trim().toUpperCase();
    const discountType = typeEl?.value === "fixed" ? "fixed" : "percentage";
    const discountValue = Number(valueEl?.value);
    const maxDiscountRaw = (maxDiscountEl?.value || "").trim();
    const maximumDiscount =
      discountType === "percentage" && maxDiscountRaw !== ""
        ? Number(maxDiscountRaw)
        : null;
    const minimumOrderAmount =
      (minOrderEl?.value || "").trim() === "" ? 0 : Number(minOrderEl?.value);
    const usageLimitRaw = (usageLimitEl?.value || "").trim();
    const usageLimit = usageLimitRaw === "" ? null : Number(usageLimitRaw);
    const usagePerCustomer = Number(perCustomerEl?.value);
    const startsRaw = (startsEl?.value || "").trim();
    const expiresRaw = (expiresEl?.value || "").trim();
    const startsAt = startsRaw ? new Date(startsRaw).toISOString() : null;
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;
    const isActive = Boolean(activeEl?.checked);

    let validationMsg = "";
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      validationMsg = t("adminOps.coupons.errInvalidCode", currentLang);
    } else if (!Number.isFinite(discountValue) || discountValue <= 0) {
      validationMsg = t("adminOps.coupons.errInvalidValue", currentLang);
    } else if (discountType === "percentage" && discountValue > 100) {
      validationMsg = t("adminOps.coupons.errPercentageMax", currentLang);
    } else if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      validationMsg = t("adminOps.coupons.errMinOrder", currentLang);
    } else if (
      maximumDiscount !== null &&
      (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)
    ) {
      validationMsg = t("adminOps.coupons.errMaxDiscount", currentLang);
    } else if (
      usageLimit !== null &&
      (!Number.isInteger(usageLimit) || usageLimit < 1)
    ) {
      validationMsg = t("adminOps.coupons.errUsageLimit", currentLang);
    } else if (!Number.isInteger(usagePerCustomer) || usagePerCustomer < 1) {
      validationMsg = t("adminOps.coupons.errPerCustomer", currentLang);
    } else if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      validationMsg = t("adminOps.coupons.errDateRange", currentLang);
    }

    if (validationMsg) {
      errEl.textContent = validationMsg;
      errEl.hidden = false;
      return;
    }

    const payload = {
      code,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      usagePerCustomer,
      startsAt,
      expiresAt,
      isActive,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t("adminOps.common.savingBtn", currentLang);
    }

    try {
      if (isEdit) {
        await updateAdminCouponRequest(existingCoupon.id, payload);
        showToast(t("adminOps.coupons.updatedToast", currentLang), "success");
      } else {
        await createAdminCouponRequest(payload);
        showToast(t("adminOps.coupons.createdToast", currentLang), "success");
      }
      closeModal();
      await loadAdminCouponsList({ onAuthError, onRender });
      if (couponState.selectedCouponId && isEdit && couponState.selectedCouponId === existingCoupon.id) {
        await loadCouponDetail(existingCoupon.id, { onAuthError, onRender });
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        closeModal();
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      errEl.textContent = err?.message || t("adminOps.common.errorTitle", currentLang);
      errEl.hidden = false;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit
          ? t("adminOps.common.saveBtn", getLanguage())
          : t("adminOps.coupons.createBtn", getLanguage());
      }
    }
  });
}

function renderCouponDetailView(mainEl, { onAuthError, onRender, onOpenOrder }) {
  const lang = getLanguage();

  if (couponState.detailLoading && !couponState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.coupons.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.coupons.detailHeading", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="cp-back-btn">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-panel"><div class="admin-skeleton" style="width: 100%; height: 220px;"></div></div>
    `;
    document.getElementById("cp-back-btn")?.addEventListener("click", () => {
      couponState.selectedCouponId = null;
      couponState.detail = null;
      onRender();
    });
    return;
  }

  if (couponState.detailError || !couponState.detail?.coupon) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.coupons.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.coupons.detailHeading", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="cp-back-btn">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(couponState.detailError || "")}</p>
        <button type="button" class="btn btn--primary btn--sm" id="cp-detail-retry">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
      </div>
    `;
    document.getElementById("cp-back-btn")?.addEventListener("click", () => {
      couponState.selectedCouponId = null;
      couponState.detail = null;
      onRender();
    });
    document.getElementById("cp-detail-retry")?.addEventListener("click", () => {
      if (couponState.selectedCouponId) {
        void loadCouponDetail(couponState.selectedCouponId, { onAuthError, onRender });
      }
    });
    return;
  }

  const c = couponState.detail.coupon;
  const stats = couponState.detail.stats || {
    usedCount: c.usedCount,
    uniqueCustomersCount: 0,
    remainingUses: null,
    totalDiscountGranted: c.totalDiscountGranted,
  };
  const usages = Array.isArray(couponState.detail.usages)
    ? couponState.detail.usages
    : [];

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.coupons.kicker", lang))}</span>
        <h1 class="admin-page-head__title" style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <span class="admin-code-pill">${escapeHtml(c.code)}</span>
          <span class="admin-status-text ${escapeHtml(getDerivedStatusClass(c.derivedStatus))}">
            ${escapeHtml(localizeDerivedStatus(c.derivedStatus, lang))}
          </span>
        </h1>
        <p class="admin-page-head__subtitle">${escapeHtml(formatCouponDiscount(c, lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="cp-detail-edit-btn">
          ${escapeHtml(t("adminOps.coupons.editBtn", lang))}
        </button>
        <button type="button" class="btn btn--secondary btn--sm" id="cp-back-btn">
          ${escapeHtml(t("adminOps.common.backBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-kpi-grid--4">
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.coupons.kpiUsedCount", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(stats.usedCount))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.coupons.kpiUniqueCustomers", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(stats.uniqueCustomersCount))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.coupons.kpiRemainingUses", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">
          ${stats.remainingUses === null ? escapeHtml(t("adminOps.coupons.unlimitedLabel", lang)) : escapeHtml(formatCount(stats.remainingUses))}
        </strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.coupons.kpiTotalDiscount", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatPriceEGP(stats.totalDiscountGranted, lang))}</strong>
      </article>
    </section>

    <div class="admin-detail-grid" style="margin-top: var(--space-5);">
      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.coupons.configHeading", lang))}</h2>
        </div>
        <dl class="admin-info-dl">
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldCode", lang))}</dt>
            <dd dir="ltr" class="tabular-nums"><strong>${escapeHtml(c.code)}</strong></dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldType", lang))}</dt>
            <dd>${escapeHtml(c.discountType === "fixed" ? t("adminOps.coupons.typeFixed", lang) : t("adminOps.coupons.typePercentage", lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldValue", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatCouponDiscount(c, lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldMinOrder", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(c.minimumOrderAmount, lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldUsageLimit", lang))}</dt>
            <dd class="tabular-nums">${c.usageLimit === null ? escapeHtml(t("adminOps.coupons.unlimitedLabel", lang)) : escapeHtml(formatCount(c.usageLimit))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldPerCustomer", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatCount(c.usagePerCustomer))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldStartsAt", lang))}</dt>
            <dd class="tabular-nums">${c.startsAt ? escapeHtml(formatOrderDate(c.startsAt, lang)) : escapeHtml(t("adminOps.common.noneLabel", lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.coupons.fieldExpiresAt", lang))}</dt>
            <dd class="tabular-nums">${c.expiresAt ? escapeHtml(formatOrderDate(c.expiresAt, lang)) : escapeHtml(t("adminOps.common.noneLabel", lang))}</dd>
          </div>
        </dl>
      </article>

      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.coupons.usageHistoryHeading", lang))}</h2>
        </div>
        ${
          usages.length === 0
            ? `<p class="text-muted" style="font-size: var(--text-sm);">${escapeHtml(t("adminOps.coupons.noUsagesText", lang))}</p>`
            : `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t("adminOps.orders.colOrderNumber", lang))}</th>
                  <th>${escapeHtml(t("adminOps.orders.colCustomer", lang))}</th>
                  <th>${escapeHtml(t("adminOps.orders.colStatus", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminOps.orders.labelDiscount", lang))}</th>
                  <th>${escapeHtml(t("adminOps.coupons.colUsedAt", lang))}</th>
                </tr>
              </thead>
              <tbody>
                ${usages
                  .map(
                    (u) => `
                  <tr>
                    <td class="tabular-nums">
                      ${
                        typeof onOpenOrder === "function"
                          ? `<button type="button" class="btn btn--ghost btn--sm" data-open-order-id="${escapeHtml(u.orderId)}"><strong>${escapeHtml(u.orderNumber)}</strong></button>`
                          : `<strong>${escapeHtml(u.orderNumber)}</strong>`
                      }
                    </td>
                    <td>
                      <div class="admin-table-item__meta">
                        <span>${escapeHtml(u.customerName)}</span>
                        <span class="admin-table-item__sub" dir="ltr">${escapeHtml(u.customerEmail)}</span>
                      </div>
                    </td>
                    <td>${escapeHtml(localizeOrderStatus(u.orderStatus, lang))}</td>
                    <td class="admin-table__num">${escapeHtml(formatPriceEGP(u.discountAmount, lang))}</td>
                    <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(u.usedAt, lang))}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        }
      </article>
    </div>
  `;

  document.getElementById("cp-back-btn")?.addEventListener("click", () => {
    couponState.selectedCouponId = null;
    couponState.detail = null;
    onRender();
  });

  document.getElementById("cp-detail-edit-btn")?.addEventListener("click", () => {
    openCouponFormModal(c, { onAuthError, onRender });
  });

  mainEl.querySelectorAll("[data-open-order-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const oid = btn.getAttribute("data-open-order-id");
      if (oid && typeof onOpenOrder === "function") onOpenOrder(oid);
    });
  });
}

export function renderCouponsSection(mainEl, { onAuthError, onRender, onOpenOrder } = {}) {
  const lang = getLanguage();

  if (!couponState.loadedOnce && !couponState.loading && !couponState.error) {
    void loadAdminCouponsList({ onAuthError, onRender });
  }

  if (couponState.selectedCouponId) {
    renderCouponDetailView(mainEl, { onAuthError, onRender, onOpenOrder });
    return;
  }

  const pg = couponState.pagination;
  const fromIdx = pg.total === 0 ? 0 : (pg.page - 1) * pg.limit + 1;
  const toIdx = Math.min(pg.page * pg.limit, pg.total);

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.coupons.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.coupons.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.coupons.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="cp-refresh-btn" ${couponState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
        </button>
        <button type="button" class="btn btn--primary btn--sm" id="cp-new-btn">
          ${escapeHtml(t("adminOps.coupons.newBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-panel">
      <div class="admin-toolbar">
        <form class="admin-toolbar__filters" id="cp-filter-form">
          <input
            type="search"
            id="cp-search-input"
            class="input admin-toolbar__search"
            value="${escapeHtml(couponState.filters.search)}"
            placeholder="${escapeHtml(t("adminOps.coupons.searchPlaceholder", lang))}"
          />
          <select id="cp-status-select" class="select admin-toolbar__select">
            <option value="all" ${couponState.filters.status === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.filterAll", lang))}</option>
            <option value="active" ${couponState.filters.status === "active" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.statusActive", lang))}</option>
            <option value="scheduled" ${couponState.filters.status === "scheduled" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.statusScheduled", lang))}</option>
            <option value="expired" ${couponState.filters.status === "expired" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.statusExpired", lang))}</option>
            <option value="inactive" ${couponState.filters.status === "inactive" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.statusInactive", lang))}</option>
          </select>
          <select id="cp-type-select" class="select admin-toolbar__select">
            <option value="all" ${couponState.filters.discountType === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.filterTypeAll", lang))}</option>
            <option value="percentage" ${couponState.filters.discountType === "percentage" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.typePercentage", lang))}</option>
            <option value="fixed" ${couponState.filters.discountType === "fixed" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.typeFixed", lang))}</option>
          </select>
          <select id="cp-sort-select" class="select admin-toolbar__select">
            <option value="code_asc" ${couponState.filters.sort === "code_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.sortCodeAsc", lang))}</option>
            <option value="code_desc" ${couponState.filters.sort === "code_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.sortCodeDesc", lang))}</option>
            <option value="value_desc" ${couponState.filters.sort === "value_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.sortValueDesc", lang))}</option>
            <option value="used_desc" ${couponState.filters.sort === "used_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.sortUsedDesc", lang))}</option>
            <option value="expires_asc" ${couponState.filters.sort === "expires_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.coupons.sortExpiresAsc", lang))}</option>
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">${escapeHtml(t("adminOps.common.applyBtn", lang))}</button>
        </form>
      </div>

      ${
        couponState.error
          ? `<div class="admin-state-box admin-state-box--inline"><strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong><p class="admin-state-box__desc">${escapeHtml(couponState.error)}</p><button type="button" class="btn btn--primary btn--sm" id="cp-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button></div>`
          : couponState.loading && !couponState.loadedOnce
          ? `<div class="admin-skeleton" style="width: 100%; height: 240px;"></div>`
          : couponState.coupons.length === 0
          ? `<div class="admin-state-box admin-state-box--inline"><strong class="admin-state-box__title">${escapeHtml(t("adminOps.coupons.emptyTitle", lang))}</strong><p class="admin-state-box__desc">${escapeHtml(t("adminOps.coupons.emptyDesc", lang))}</p></div>`
          : `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("adminOps.coupons.colCode", lang))}</th>
                <th>${escapeHtml(t("adminOps.coupons.colDiscount", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminOps.coupons.colMinOrder", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminOps.coupons.colUsage", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminOps.coupons.colPerCustomer", lang))}</th>
                <th>${escapeHtml(t("adminOps.coupons.colWindow", lang))}</th>
                <th>${escapeHtml(t("adminOps.coupons.colStatus", lang))}</th>
                <th style="text-align: end;">${escapeHtml(t("adminOps.coupons.colActions", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${couponState.coupons
                .map(
                  (c) => `
                <tr>
                  <td><span class="admin-code-pill">${escapeHtml(c.code)}</span></td>
                  <td class="tabular-nums">${escapeHtml(formatCouponDiscount(c, lang))}</td>
                  <td class="admin-table__num">${escapeHtml(formatPriceEGP(c.minimumOrderAmount, lang))}</td>
                  <td class="admin-table__num">
                    ${escapeHtml(formatCount(c.usedCount))} / ${c.usageLimit === null ? "∞" : escapeHtml(formatCount(c.usageLimit))}
                  </td>
                  <td class="admin-table__num">${escapeHtml(formatCount(c.usagePerCustomer))}</td>
                  <td class="tabular-nums text-muted" style="font-size: var(--text-xs);">
                    ${c.startsAt ? escapeHtml(formatOrderDate(c.startsAt, lang)) : "—"} → ${c.expiresAt ? escapeHtml(formatOrderDate(c.expiresAt, lang)) : "∞"}
                  </td>
                  <td>
                    <span class="admin-status-text ${escapeHtml(getDerivedStatusClass(c.derivedStatus))}">
                      ${escapeHtml(localizeDerivedStatus(c.derivedStatus, lang))}
                    </span>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button type="button" class="btn btn--ghost btn--sm" data-cp-inspect="${escapeHtml(c.id)}">
                        ${escapeHtml(t("adminOps.coupons.usageBtn", lang))}
                      </button>
                      <button type="button" class="btn btn--secondary btn--sm" data-cp-edit="${escapeHtml(c.id)}">
                        ${escapeHtml(t("adminOps.coupons.editBtn", lang))}
                      </button>
                      <button type="button" class="btn btn--secondary btn--sm" data-cp-toggle="${escapeHtml(c.id)}" ${couponState.actionBusy ? "disabled" : ""}>
                        ${escapeHtml(c.isActive ? t("adminOps.coupons.deactivateBtn", lang) : t("adminOps.coupons.activateBtn", lang))}
                      </button>
                      ${
                        c.usedCount === 0
                          ? `<button type="button" class="btn btn--danger btn--sm" data-cp-delete="${escapeHtml(c.id)}" ${couponState.actionBusy ? "disabled" : ""}>${escapeHtml(t("adminOps.coupons.deleteBtn", lang))}</button>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="admin-pagination">
          <span class="admin-pagination__info tabular-nums">
            ${escapeHtml(formatTemplate(t("adminOps.common.showingRange", lang), { from: formatCount(fromIdx), to: formatCount(toIdx), total: formatCount(pg.total) }))}
          </span>
          <div class="admin-pagination__controls">
            <button type="button" class="btn btn--secondary btn--sm" id="cp-prev-btn" ${pg.page <= 1 ? "disabled" : ""}>
              ${escapeHtml(t("adminOps.common.prevPage", lang))}
            </button>
            <span class="admin-pagination__info tabular-nums">
              ${escapeHtml(formatTemplate(t("adminOps.common.pageOf", lang), { page: formatCount(pg.page), totalPages: formatCount(pg.totalPages) }))}
            </span>
            <button type="button" class="btn btn--secondary btn--sm" id="cp-next-btn" ${pg.page >= pg.totalPages ? "disabled" : ""}>
              ${escapeHtml(t("adminOps.common.nextPage", lang))}
            </button>
          </div>
        </div>
      `
      }
    </section>
  `;

  document.getElementById("cp-refresh-btn")?.addEventListener("click", () => {
    void loadAdminCouponsList({ onAuthError, onRender });
  });
  document.getElementById("cp-retry-btn")?.addEventListener("click", () => {
    void loadAdminCouponsList({ onAuthError, onRender });
  });
  document.getElementById("cp-new-btn")?.addEventListener("click", () => {
    openCouponFormModal(null, { onAuthError, onRender });
  });

  document.getElementById("cp-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    couponState.filters.search =
      document.getElementById("cp-search-input")?.value.trim() || "";
    couponState.filters.status =
      document.getElementById("cp-status-select")?.value || "all";
    couponState.filters.discountType =
      document.getElementById("cp-type-select")?.value || "all";
    couponState.filters.sort =
      document.getElementById("cp-sort-select")?.value || "code_asc";
    couponState.pagination.page = 1;
    void loadAdminCouponsList({ onAuthError, onRender });
  });

  document.getElementById("cp-prev-btn")?.addEventListener("click", () => {
    if (couponState.pagination.page > 1) {
      couponState.pagination.page -= 1;
      void loadAdminCouponsList({ onAuthError, onRender });
    }
  });
  document.getElementById("cp-next-btn")?.addEventListener("click", () => {
    if (couponState.pagination.page < couponState.pagination.totalPages) {
      couponState.pagination.page += 1;
      void loadAdminCouponsList({ onAuthError, onRender });
    }
  });

  mainEl.querySelectorAll("[data-cp-inspect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cp-inspect");
      if (id) void loadCouponDetail(id, { onAuthError, onRender });
    });
  });

  mainEl.querySelectorAll("[data-cp-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cp-edit");
      const found = couponState.coupons.find((c) => c.id === id);
      if (found) openCouponFormModal(found, { onAuthError, onRender });
    });
  });

  mainEl.querySelectorAll("[data-cp-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-cp-toggle");
      const found = couponState.coupons.find((c) => c.id === id);
      if (!found || couponState.actionBusy) return;

      couponState.actionBusy = true;
      onRender();
      try {
        await updateAdminCouponRequest(found.id, { isActive: !found.isActive });
        showToast(
          t(
            !found.isActive
              ? "adminOps.coupons.activatedToast"
              : "adminOps.coupons.deactivatedToast",
            getLanguage()
          ),
          "success"
        );
        await loadAdminCouponsList({ onAuthError, onRender });
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        couponState.actionBusy = false;
        onRender();
      }
    });
  });

  mainEl.querySelectorAll("[data-cp-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cp-delete");
      const found = couponState.coupons.find((c) => c.id === id);
      if (!found || couponState.actionBusy) return;

      const currentLang = getLanguage();
      openConfirmDialog({
        title: t("adminOps.coupons.deleteBtn", currentLang),
        message: formatTemplate(t("adminOps.coupons.deleteConfirmMsg", currentLang), {
          code: found.code,
        }),
        confirmLabel: t("adminOps.coupons.deleteBtn", currentLang),
        cancelLabel: t("adminOps.common.cancelBtn", currentLang),
        onConfirm: async () => {
          couponState.actionBusy = true;
          onRender();
          try {
            await deleteAdminCouponRequest(found.id);
            showToast(t("adminOps.coupons.deletedToast", getLanguage()), "success");
            await loadAdminCouponsList({ onAuthError, onRender });
          } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
              if (typeof onAuthError === "function") await onAuthError(err);
              return;
            }
            showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
          } finally {
            couponState.actionBusy = false;
            onRender();
          }
        },
      });
    });
  });
}
