/**
 * MR. ZAIN — Admin Inventory Management & Movement History Controller
 * Backed by /api/v1/admin/inventory endpoints.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { formatOrderDate } from "../components/order-view.js";
import {
  closeModal,
  openModal,
  showToast,
} from "../components/ui.js";
import { escapeHtml } from "../utils/formatters.js";
import {
  adjustAdminInventoryStockRequest,
  fetchAdminInventoryList,
  fetchAdminInventoryMovements,
  fetchAdminInventorySummary,
  updateAdminInventoryThresholdRequest,
} from "./admin.js";

const invState = {
  activeTab: "stock", // stock | movements
  summary: null,
  loading: false,
  error: "",
  loadedOnce: false,
  stockRequestId: 0,
  summaryRequestId: 0,
  items: [],
  pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
  filters: {
    search: "",
    searchDraft: "",
    stockStatus: "all",
    activeOnly: "active",
    sort: "updated_desc",
  },
  movLoading: false,
  movError: "",
  movLoadedOnce: false,
  movementsRequestId: 0,
  movements: [],
  movPagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  movFilters: {
    variantId: "",
    variantLabel: "",
    search: "",
    searchDraft: "",
    movementType: "all",
    startDate: "",
    endDate: "",
  },
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

function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function localizeStockState(stockState, lang) {
  if (stockState === "out_of_stock") return t("adminOps.inventory.stateOutOfStock", lang);
  if (stockState === "low_stock") return t("adminOps.inventory.stateLowStock", lang);
  return t("adminOps.inventory.stateInStock", lang);
}

function stockStateClass(stockState) {
  if (stockState === "out_of_stock") return "admin-status-text--danger";
  if (stockState === "low_stock") return "admin-status-text--pending";
  return "admin-status-text--success";
}

function localizeMovementType(type, lang) {
  const map = {
    addition: "adminOps.inventory.movTypeAddition",
    reduction: "adminOps.inventory.movTypeReduction",
    reservation: "adminOps.inventory.movTypeReservation",
    cancellation: "adminOps.inventory.movTypeCancellation",
    return: "adminOps.inventory.movTypeReturn",
    adjustment: "adminOps.inventory.movTypeAdjustment",
  };
  return t(map[type] || "adminOps.inventory.movTypeAdjustment", lang);
}

export function resetInventoryLoadState() {
  invState.stockRequestId += 1;
  invState.movementsRequestId += 1;
  invState.summaryRequestId += 1;
  invState.loading = false;
  invState.movLoading = false;
  invState.loadedOnce = false;
  invState.movLoadedOnce = false;
}

export async function loadAdminInventoryStock({ onAuthError, onRender } = {}) {
  const requestId = ++invState.stockRequestId;
  const summaryRequestId = ++invState.summaryRequestId;
  invState.loading = true;
  invState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const [summary, listRes] = await Promise.all([
      fetchAdminInventorySummary(),
      fetchAdminInventoryList({
        search: invState.filters.search,
        stockStatus: invState.filters.stockStatus,
        activeOnly: invState.filters.activeOnly,
        sort: invState.filters.sort,
        page: invState.pagination.page,
        limit: invState.pagination.limit,
      }),
    ]);

    if (requestId !== invState.stockRequestId) return;
    if (summaryRequestId === invState.summaryRequestId) invState.summary = summary;
    invState.items = Array.isArray(listRes?.items) ? listRes.items : [];
    invState.pagination = listRes?.pagination || {
      page: 1,
      limit: 15,
      total: 0,
      totalPages: 1,
    };
    invState.loadedOnce = true;
  } catch (err) {
    if (requestId !== invState.stockRequestId) return;
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    invState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    if (requestId === invState.stockRequestId) {
      invState.loading = false;
      if (typeof onRender === "function") onRender();
    }
  }
}

export async function loadAdminInventoryMovements({ onAuthError, onRender } = {}) {
  const requestId = ++invState.movementsRequestId;
  const summaryRequestId = ++invState.summaryRequestId;
  invState.movLoading = true;
  invState.movError = "";
  if (typeof onRender === "function") onRender();

  try {
    const [summary, movRes] = await Promise.all([
      fetchAdminInventorySummary(),
      fetchAdminInventoryMovements({
        variantId: invState.movFilters.variantId,
        search: invState.movFilters.search,
        movementType: invState.movFilters.movementType,
        startDate: invState.movFilters.startDate,
        endDate: invState.movFilters.endDate,
        page: invState.movPagination.page,
        limit: invState.movPagination.limit,
      }),
    ]);

    if (requestId !== invState.movementsRequestId) return;
    if (summaryRequestId === invState.summaryRequestId) invState.summary = summary;
    invState.movements = Array.isArray(movRes?.movements) ? movRes.movements : [];
    invState.movPagination = movRes?.pagination || {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    };
    invState.movLoadedOnce = true;
  } catch (err) {
    if (requestId !== invState.movementsRequestId) return;
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    invState.movError = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    if (requestId === invState.movementsRequestId) {
      invState.movLoading = false;
      if (typeof onRender === "function") onRender();
    }
  }
}

function openStockAdjustmentModal(item, { onAuthError, onRender }) {
  const lang = getLanguage();
  const idempotencyKey = generateIdempotencyKey();

  const body = document.createElement("form");
  body.className = "admin-form";
  body.noValidate = true;

  const productTitle =
    lang === "ar"
      ? item.productNameAr || item.productNameEn
      : item.productNameEn || item.productNameAr;

  body.innerHTML = `
    <div class="admin-notice">
      <strong>${escapeHtml(productTitle)}</strong> — ${escapeHtml(item.size)} / ${escapeHtml(item.color)}
      <div class="text-muted" style="margin-top: 0.25rem;">
        ${escapeHtml(t("adminOps.inventory.adjustModalHint", lang))}
      </div>
    </div>

    <div class="admin-calc-preview" id="inv-adjust-preview">
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewCurrentPhysical", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums">${escapeHtml(formatCount(item.quantity))}</strong>
      </div>
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewReserved", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums">${escapeHtml(formatCount(item.reservedQuantity))}</strong>
      </div>
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewCurrentAvailable", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums" id="inv-preview-available">${escapeHtml(formatCount(item.availableQuantity))}</strong>
      </div>
    </div>

    <div class="admin-form-grid">
      <div class="field">
        <label class="field__label" for="inv-adj-mode">${escapeHtml(t("adminOps.inventory.modeLabel", lang))}</label>
        <select id="inv-adj-mode" class="select">
          <option value="increase">${escapeHtml(t("adminOps.inventory.modeIncrease", lang))}</option>
          <option value="decrease">${escapeHtml(t("adminOps.inventory.modeDecrease", lang))}</option>
          <option value="set">${escapeHtml(t("adminOps.inventory.modeSet", lang))}</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="inv-adj-amount">${escapeHtml(t("adminOps.inventory.amountLabel", lang))}</label>
        <input id="inv-adj-amount" class="input tabular-nums" type="number" min="0" max="1000000" step="1" value="1" required />
      </div>
      <div class="field admin-form-full">
        <label class="field__label" for="inv-adj-reason">${escapeHtml(t("adminOps.inventory.reasonLabel", lang))}</label>
        <textarea
          id="inv-adj-reason"
          class="input admin-textarea"
          maxlength="500"
          placeholder="${escapeHtml(t("adminOps.inventory.reasonPlaceholder", lang))}"
          required
        ></textarea>
      </div>
    </div>

    <div class="admin-calc-preview">
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewNewPhysical", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums" id="inv-preview-physical">${escapeHtml(formatCount(item.quantity + 1))}</strong>
      </div>
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewReserved", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums">${escapeHtml(formatCount(item.reservedQuantity))}</strong>
      </div>
      <div class="admin-calc-preview__item">
        <span class="admin-calc-preview__label">${escapeHtml(t("adminOps.inventory.previewNewAvailable", lang))}</span>
        <strong class="admin-calc-preview__val tabular-nums" id="inv-preview-next-avail">${escapeHtml(formatCount(item.availableQuantity + 1))}</strong>
      </div>
    </div>

    <div id="inv-adj-error" class="admin-form-error" aria-live="polite" hidden></div>
  `;

  const modeEl = body.querySelector("#inv-adj-mode");
  const amountEl = body.querySelector("#inv-adj-amount");
  const reasonEl = body.querySelector("#inv-adj-reason");
  const errorEl = body.querySelector("#inv-adj-error");
  const previewPhysicalEl = body.querySelector("#inv-preview-physical");
  const previewNextAvailEl = body.querySelector("#inv-preview-next-avail");

  const computeTarget = () => {
    const mode = modeEl?.value || "increase";
    const rawVal = amountEl?.value ?? "";
    const parsed = Number(rawVal);
    if (rawVal.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
      return { valid: false, error: t("adminOps.inventory.errInvalidQty", lang) };
    }
    if ((mode === "increase" || mode === "decrease") && parsed < 1) {
      return { valid: false, error: t("adminOps.inventory.errInvalidQty", lang) };
    }

    let nextPhysical = item.quantity;
    if (mode === "increase") nextPhysical = item.quantity + parsed;
    else if (mode === "decrease") nextPhysical = item.quantity - parsed;
    else nextPhysical = parsed;

    const nextAvailable = nextPhysical - item.reservedQuantity;
    return {
      valid: true,
      mode,
      amount: parsed,
      nextPhysical,
      nextAvailable,
    };
  };

  const updatePreview = () => {
    const calc = computeTarget();
    if (!calc.valid) {
      if (previewPhysicalEl) previewPhysicalEl.textContent = "—";
      if (previewNextAvailEl) previewNextAvailEl.textContent = "—";
      return;
    }
    if (previewPhysicalEl) {
      previewPhysicalEl.textContent = formatCount(calc.nextPhysical);
      previewPhysicalEl.style.color =
        calc.nextPhysical < item.reservedQuantity ? "var(--color-danger)" : "var(--color-black)";
    }
    if (previewNextAvailEl) {
      previewNextAvailEl.textContent = formatCount(Math.max(0, calc.nextAvailable));
      previewNextAvailEl.style.color =
        calc.nextAvailable <= 0 ? "var(--color-danger)" : "var(--color-black)";
    }
  };

  modeEl?.addEventListener("change", () => {
    if (modeEl.value === "set" && amountEl) {
      amountEl.value = String(item.quantity);
    } else if (amountEl) {
      amountEl.value = "1";
    }
    updatePreview();
  });
  amountEl?.addEventListener("input", updatePreview);
  updatePreview();

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--secondary btn--sm";
  cancelBtn.textContent = t("adminOps.common.cancelBtn", lang);
  cancelBtn.addEventListener("click", closeModal);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "btn btn--primary btn--sm";
  submitBtn.textContent = t("adminOps.common.saveBtn", lang);

  footer.append(cancelBtn, submitBtn);

  const submitAdjustment = async () => {
    const showErr = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    if (errorEl) errorEl.hidden = true;
    const calc = computeTarget();
    if (!calc.valid) {
      showErr(calc.error);
      return;
    }
    if (calc.nextPhysical < 0) {
      showErr(t("adminOps.inventory.errNegativeStock", lang));
      return;
    }
    if (calc.nextPhysical < item.reservedQuantity) {
      showErr(
        formatTemplate(t("adminOps.inventory.errBelowReserved", lang), {
          reserved: formatCount(item.reservedQuantity),
        })
      );
      return;
    }
    if (calc.nextPhysical === item.quantity) {
      showErr(t("adminOps.inventory.errZeroDelta", lang));
      return;
    }
    const reason = reasonEl?.value.trim() || "";
    if (reason.length < 3) {
      showErr(t("adminOps.inventory.errReasonRequired", lang));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminOps.common.savingBtn", lang);

    try {
      await adjustAdminInventoryStockRequest(item.variantId, {
        mode: calc.mode,
        amount: calc.amount,
        reason,
        idempotencyKey,
      });
      closeModal();
      showToast(t("adminOps.inventory.adjustedToast", lang), "success");
      invState.movLoadedOnce = false;
      await loadAdminInventoryStock({ onAuthError, onRender });
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        closeModal();
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      showErr(err?.message || t("adminOps.common.errorTitle", lang));
      submitBtn.disabled = false;
      submitBtn.textContent = t("adminOps.common.saveBtn", lang);
    }
  };

  submitBtn.addEventListener("click", () => void submitAdjustment());
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitAdjustment();
  });

  body.append(footer);

  openModal({
    title: formatTemplate(t("adminOps.inventory.adjustModalTitle", lang), {
      product: productTitle,
      size: item.size,
      color: item.color,
    }),
    content: body,
  });
}

function openThresholdModal(item, { onAuthError, onRender }) {
  const lang = getLanguage();
  const body = document.createElement("form");
  body.className = "admin-form";
  body.noValidate = true;

  body.innerHTML = `
    <div class="field">
      <label class="field__label" for="inv-threshold-input">${escapeHtml(t("adminOps.inventory.thresholdLabel", lang))}</label>
      <input
        id="inv-threshold-input"
        class="input tabular-nums"
        type="number"
        min="0"
        max="100000"
        step="1"
        value="${escapeHtml(String(item.lowStockThreshold))}"
        required
      />
    </div>
    <div id="inv-threshold-error" class="admin-form-error" aria-live="polite" hidden></div>
  `;

  const inputEl = body.querySelector("#inv-threshold-input");
  const errorEl = body.querySelector("#inv-threshold-error");

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--secondary btn--sm";
  cancelBtn.textContent = t("adminOps.common.cancelBtn", lang);
  cancelBtn.addEventListener("click", closeModal);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary btn--sm";
  saveBtn.textContent = t("adminOps.common.saveBtn", lang);
  footer.append(cancelBtn, saveBtn);

  const submit = async () => {
    const val = Number(inputEl?.value ?? -1);
    if (!Number.isInteger(val) || val < 0 || val > 100000) {
      if (errorEl) {
        errorEl.textContent = t("adminOps.inventory.errInvalidQty", lang);
        errorEl.hidden = false;
      }
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t("adminOps.common.savingBtn", lang);
    try {
      await updateAdminInventoryThresholdRequest(item.variantId, val);
      closeModal();
      showToast(t("adminOps.inventory.thresholdUpdatedToast", lang), "success");
      await loadAdminInventoryStock({ onAuthError, onRender });
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        closeModal();
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      if (errorEl) {
        errorEl.textContent = err?.message || t("adminOps.common.errorTitle", lang);
        errorEl.hidden = false;
      }
      saveBtn.disabled = false;
      saveBtn.textContent = t("adminOps.common.saveBtn", lang);
    }
  };

  saveBtn.addEventListener("click", () => void submit());
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });

  body.append(footer);

  openModal({
    title: formatTemplate(t("adminOps.inventory.thresholdModalTitle", lang), {
      product: lang === "ar" ? item.productNameAr || item.productNameEn : item.productNameEn || item.productNameAr,
      size: item.size,
      color: item.color,
    }),
    content: body,
  });
}

function renderSummaryCardsHtml(summary, lang) {
  const s = summary || {
    totalActiveVariants: 0,
    totalAvailableUnits: 0,
    lowStockVariants: 0,
    outOfStockVariants: 0,
    totalReservedUnits: 0,
  };

  return `
    <section class="admin-kpi-grid--5">
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.inventory.kpiActiveVariants", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(s.totalActiveVariants))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.inventory.kpiAvailableUnits", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(s.totalAvailableUnits))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.inventory.kpiLowStock", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums" style="color: ${s.lowStockVariants > 0 ? "var(--color-gold-deep)" : "var(--color-black)"};">${escapeHtml(formatCount(s.lowStockVariants))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.inventory.kpiOutOfStock", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums" style="color: ${s.outOfStockVariants > 0 ? "var(--color-danger)" : "var(--color-black)"};">${escapeHtml(formatCount(s.outOfStockVariants))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.inventory.kpiReservedUnits", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(s.totalReservedUnits))}</strong>
      </article>
    </section>
  `;
}

export function renderInventorySection(mainEl, { onAuthError, onRender }) {
  if (!mainEl) return;
  const lang = getLanguage();
  const stockSearchInput = mainEl.querySelector("#inv-search-input");
  const movementsSearchInput = mainEl.querySelector("#inv-mov-search");
  if (stockSearchInput) invState.filters.searchDraft = stockSearchInput.value;
  if (movementsSearchInput) invState.movFilters.searchDraft = movementsSearchInput.value;

  if (invState.activeTab === "stock" && !invState.loadedOnce && !invState.loading && !invState.error) {
    void loadAdminInventoryStock({ onAuthError, onRender });
  } else if (
    invState.activeTab === "movements" &&
    !invState.movLoadedOnce &&
    !invState.movLoading &&
    !invState.movError
  ) {
    void loadAdminInventoryMovements({ onAuthError, onRender });
  }

  const headHtml = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.inventory.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.inventory.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.inventory.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <div class="admin-tabs" role="tablist">
          <button
            type="button"
            id="inv-tab-stock"
            class="admin-tabs__btn ${invState.activeTab === "stock" ? "is-active" : ""}"
            data-inv-tab="stock"
            role="tab"
            aria-selected="${invState.activeTab === "stock" ? "true" : "false"}"
            aria-controls="inv-stock-panel"
          >
            ${escapeHtml(t("adminOps.inventory.tabStock", lang))}
          </button>
          <button
            type="button"
            id="inv-tab-movements"
            class="admin-tabs__btn ${invState.activeTab === "movements" ? "is-active" : ""}"
            data-inv-tab="movements"
            role="tab"
            aria-selected="${invState.activeTab === "movements" ? "true" : "false"}"
            aria-controls="inv-movements-panel"
          >
            ${escapeHtml(t("adminOps.inventory.tabMovements", lang))}
          </button>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="inv-refresh-btn">
          ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
        </button>
      </div>
    </div>

    ${renderSummaryCardsHtml(invState.summary, lang)}
  `;

  if (invState.activeTab === "stock") {
    const { total, page, limit, totalPages } = invState.pagination;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(total, page * limit);

    mainEl.innerHTML = `
      ${headHtml}
      <section class="admin-panel" id="inv-stock-panel" role="tabpanel" aria-labelledby="inv-tab-stock" tabindex="0">
        <form class="admin-toolbar" id="inv-filter-form">
          <div class="admin-toolbar__filters">
            <input
              type="search"
              id="inv-search-input"
              class="input admin-toolbar__search"
              value="${escapeHtml(invState.filters.searchDraft)}"
              placeholder="${escapeHtml(t("adminOps.inventory.searchPlaceholder", lang))}"
            />
            <select id="inv-status-select" class="select admin-toolbar__select">
              <option value="all" ${invState.filters.stockStatus === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterAll", lang))}</option>
              <option value="in_stock" ${invState.filters.stockStatus === "in_stock" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterInStock", lang))}</option>
              <option value="low_stock" ${invState.filters.stockStatus === "low_stock" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterLowStock", lang))}</option>
              <option value="out_of_stock" ${invState.filters.stockStatus === "out_of_stock" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterOutOfStock", lang))}</option>
              <option value="reserved" ${invState.filters.stockStatus === "reserved" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterReserved", lang))}</option>
            </select>
            <select id="inv-active-select" class="select admin-toolbar__select">
              <option value="all" ${invState.filters.activeOnly === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterVariantAll", lang))}</option>
              <option value="active" ${invState.filters.activeOnly === "active" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterVariantActive", lang))}</option>
              <option value="inactive" ${invState.filters.activeOnly === "inactive" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.filterVariantInactive", lang))}</option>
            </select>
            <select id="inv-sort-select" class="select admin-toolbar__select">
              <option value="updated_desc" ${invState.filters.sort === "updated_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.sortUpdatedDesc", lang))}</option>
              <option value="available_asc" ${invState.filters.sort === "available_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.sortAvailableAsc", lang))}</option>
              <option value="available_desc" ${invState.filters.sort === "available_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.sortAvailableDesc", lang))}</option>
              <option value="product_asc" ${invState.filters.sort === "product_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.sortProductAsc", lang))}</option>
            </select>
            <button type="submit" class="btn btn--primary btn--sm">
              ${escapeHtml(t("adminOps.common.applyBtn", lang))}
            </button>
          </div>
        </form>

        ${
          invState.loading
            ? '<div class="admin-skeleton" role="status" aria-live="polite" style="width: 100%; height: 240px;"></div>'
            : invState.error
            ? `
              <div class="admin-state-box admin-state-box--inline" aria-live="polite">
                <strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong>
                <p class="admin-state-box__desc">${escapeHtml(invState.error)}</p>
                <button type="button" class="btn btn--secondary btn--sm" id="inv-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
              </div>
            `
            : invState.items.length === 0
            ? `
              <div class="admin-state-box admin-state-box--inline">
                <strong class="admin-state-box__title">${escapeHtml(t("adminOps.inventory.emptyTitle", lang))}</strong>
                <p class="admin-state-box__desc">${escapeHtml(t("adminOps.inventory.emptyDesc", lang))}</p>
              </div>
            `
            : `
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>${escapeHtml(t("adminOps.inventory.colVariant", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.colAvailable", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.colReserved", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.colPhysical", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.colThreshold", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.colState", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.colLastMovement", lang))}</th>
                      <th style="text-align: end;">${escapeHtml(t("adminOps.inventory.colActions", lang))}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invState.items
                      .map((item) => {
                        const title =
                          lang === "ar"
                            ? item.productNameAr || item.productNameEn
                            : item.productNameEn || item.productNameAr;
                        return `
                          <tr>
                            <td>
                              <div class="admin-table-item">
                                <span class="admin-thumb admin-thumb--square">
                                  ${
                                    item.primaryImageUrl
                                      ? `<img src="${escapeHtml(item.primaryImageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                                      : `<span style="font-size: 10px;">—</span>`
                                  }
                                </span>
                                <div class="admin-table-item__meta">
                                  <span class="admin-table-item__title">${escapeHtml(title)}</span>
                                  <span class="admin-table-item__sub">
                                    ${escapeHtml(item.size)} · ${escapeHtml(item.color)}
                                    ${!item.variantIsActive ? ` · ${escapeHtml(t("adminOps.inventory.inactiveTag", lang))}` : ""}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td class="admin-table__num"><strong>${escapeHtml(formatCount(item.availableQuantity))}</strong></td>
                            <td class="admin-table__num text-muted">${escapeHtml(formatCount(item.reservedQuantity))}</td>
                            <td class="admin-table__num">${escapeHtml(formatCount(item.quantity))}</td>
                            <td class="admin-table__num text-muted">${escapeHtml(formatCount(item.lowStockThreshold))}</td>
                            <td>
                              <span class="admin-status-text ${escapeHtml(stockStateClass(item.stockState))}">
                                ${escapeHtml(localizeStockState(item.stockState, lang))}
                              </span>
                            </td>
                            <td class="tabular-nums text-muted">
                              ${
                                item.lastMovementAt
                                  ? escapeHtml(formatOrderDate(item.lastMovementAt, lang))
                                  : escapeHtml(t("adminOps.common.noneLabel", lang))
                              }
                            </td>
                            <td>
                              <div class="admin-row-actions">
                                <button
                                  type="button"
                                  class="btn btn--primary btn--sm"
                                  data-inv-adjust="${escapeHtml(item.variantId)}"
                                >
                                  ${escapeHtml(t("adminOps.inventory.adjustBtn", lang))}
                                </button>
                                <button
                                  type="button"
                                  class="btn btn--secondary btn--sm"
                                  data-inv-threshold="${escapeHtml(item.variantId)}"
                                >
                                  ${escapeHtml(t("adminOps.inventory.thresholdBtn", lang))}
                                </button>
                                <button
                                  type="button"
                                  class="btn btn--secondary btn--sm"
                                  data-inv-history="${escapeHtml(item.variantId)}"
                                >
                                  ${escapeHtml(t("adminOps.inventory.historyBtn", lang))}
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>

              <div class="admin-pagination">
                <span class="admin-pagination__info tabular-nums">
                  ${escapeHtml(formatTemplate(t("adminOps.common.showingRange", lang), { from, to, total }))}
                </span>
                <div class="admin-pagination__controls">
                  <button type="button" class="btn btn--secondary btn--sm" id="inv-prev-page" ${page <= 1 ? "disabled" : ""}>
                    ${escapeHtml(t("adminOps.common.prevPage", lang))}
                  </button>
                  <span class="admin-pagination__info tabular-nums">
                    ${escapeHtml(formatTemplate(t("adminOps.common.pageOf", lang), { page, totalPages }))}
                  </span>
                  <button type="button" class="btn btn--secondary btn--sm" id="inv-next-page" ${page >= totalPages ? "disabled" : ""}>
                    ${escapeHtml(t("adminOps.common.nextPage", lang))}
                  </button>
                </div>
              </div>
            `
        }
      </section>
    `;

    document.getElementById("inv-filter-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      invState.filters.search = document.getElementById("inv-search-input")?.value.trim() || "";
      invState.filters.stockStatus = document.getElementById("inv-status-select")?.value || "all";
      invState.filters.activeOnly = document.getElementById("inv-active-select")?.value || "all";
      invState.filters.sort = document.getElementById("inv-sort-select")?.value || "updated_desc";
      invState.pagination.page = 1;
      void loadAdminInventoryStock({ onAuthError, onRender });
    });

    document.getElementById("inv-retry-btn")?.addEventListener("click", () => {
      void loadAdminInventoryStock({ onAuthError, onRender });
    });

    document.getElementById("inv-prev-page")?.addEventListener("click", () => {
      if (invState.pagination.page > 1) {
        invState.pagination.page -= 1;
        void loadAdminInventoryStock({ onAuthError, onRender });
      }
    });

    document.getElementById("inv-next-page")?.addEventListener("click", () => {
      if (invState.pagination.page < invState.pagination.totalPages) {
        invState.pagination.page += 1;
        void loadAdminInventoryStock({ onAuthError, onRender });
      }
    });

    mainEl.querySelectorAll("[data-inv-adjust]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-inv-adjust");
        const item = invState.items.find((i) => i.variantId === vid);
        if (item) openStockAdjustmentModal(item, { onAuthError, onRender });
      });
    });

    mainEl.querySelectorAll("[data-inv-threshold]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-inv-threshold");
        const item = invState.items.find((i) => i.variantId === vid);
        if (item) openThresholdModal(item, { onAuthError, onRender });
      });
    });

    mainEl.querySelectorAll("[data-inv-history]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-inv-history");
        const item = invState.items.find((i) => i.variantId === vid);
        invState.activeTab = "movements";
        invState.movFilters.variantId = vid || "";
        const productName = item
          ? lang === "ar" ? item.productNameAr || item.productNameEn : item.productNameEn || item.productNameAr
          : "";
        invState.movFilters.variantLabel = item ? `${productName} (${item.size} / ${item.color})` : "";
        invState.movPagination.page = 1;
        void loadAdminInventoryMovements({ onAuthError, onRender });
      });
    });
  } else {
    const { total, page, limit, totalPages } = invState.movPagination;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(total, page * limit);

    mainEl.innerHTML = `
      ${headHtml}
      <section class="admin-panel" id="inv-movements-panel" role="tabpanel" aria-labelledby="inv-tab-movements" tabindex="0">
        <form class="admin-toolbar" id="inv-mov-filter-form">
          <div class="admin-toolbar__filters">
            <input
              type="search"
              id="inv-mov-search"
              class="input admin-toolbar__search"
              value="${escapeHtml(invState.movFilters.searchDraft)}"
              placeholder="${escapeHtml(t("adminOps.inventory.movSearchPlaceholder", lang))}"
            />
            <select id="inv-mov-type" class="select admin-toolbar__select">
              <option value="all" ${invState.movFilters.movementType === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeAll", lang))}</option>
              <option value="addition" ${invState.movFilters.movementType === "addition" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeAddition", lang))}</option>
              <option value="reduction" ${invState.movFilters.movementType === "reduction" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeReduction", lang))}</option>
              <option value="reservation" ${invState.movFilters.movementType === "reservation" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeReservation", lang))}</option>
              <option value="cancellation" ${invState.movFilters.movementType === "cancellation" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeCancellation", lang))}</option>
              <option value="return" ${invState.movFilters.movementType === "return" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeReturn", lang))}</option>
              <option value="adjustment" ${invState.movFilters.movementType === "adjustment" ? "selected" : ""}>${escapeHtml(t("adminOps.inventory.movTypeAdjustment", lang))}</option>
            </select>
            <input id="inv-mov-start" type="date" class="input" style="width: auto;" value="${escapeHtml(invState.movFilters.startDate)}" />
            <input id="inv-mov-end" type="date" class="input" style="width: auto;" value="${escapeHtml(invState.movFilters.endDate)}" />
            <button type="submit" class="btn btn--primary btn--sm">
              ${escapeHtml(t("adminOps.common.applyBtn", lang))}
            </button>
          </div>
          ${
            invState.movFilters.variantId
              ? `<button type="button" class="btn btn--secondary btn--sm" id="inv-mov-clear-var">
                  ${escapeHtml(t("adminOps.inventory.movClearVariantFilter", lang))}: ${escapeHtml(invState.movFilters.variantLabel || invState.movFilters.variantId)}
                </button>`
              : ""
          }
        </form>

        ${
          invState.movLoading
            ? '<div class="admin-skeleton" role="status" aria-live="polite" style="width: 100%; height: 240px;"></div>'
            : invState.movError
            ? `
              <div class="admin-state-box admin-state-box--inline" aria-live="polite">
                <strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong>
                <p class="admin-state-box__desc">${escapeHtml(invState.movError)}</p>
                <button type="button" class="btn btn--secondary btn--sm" id="inv-mov-retry">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
              </div>
            `
            : invState.movements.length === 0
            ? `
              <div class="admin-state-box admin-state-box--inline">
                <strong class="admin-state-box__title">${escapeHtml(t("adminOps.inventory.movEmptyTitle", lang))}</strong>
                <p class="admin-state-box__desc">${escapeHtml(t("adminOps.inventory.movEmptyDesc", lang))}</p>
              </div>
            `
            : `
              <div class="admin-table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>${escapeHtml(t("adminOps.inventory.movColDate", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.movColVariant", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.movColType", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.movColDelta", lang))}</th>
                      <th class="admin-table__num">${escapeHtml(t("adminOps.inventory.movColBeforeAfter", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.movColActor", lang))}</th>
                      <th>${escapeHtml(t("adminOps.inventory.movColReason", lang))}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invState.movements
                      .map((m) => {
                        const prodName =
                          lang === "ar"
                            ? m.productNameAr || m.productNameEn
                            : m.productNameEn || m.productNameAr;
                        const isPos =
                          m.movementType === "addition" ||
                          m.movementType === "cancellation" ||
                          m.movementType === "return" ||
                          (!["reservation", "reduction"].includes(m.movementType) && m.quantity > 0);
                        const signPrefix = isPos ? "+" : "-";
                        const displayQuantity = `${signPrefix}${formatCount(Math.abs(m.quantity))}`;
                        const beforeAfter =
                          m.movementType !== "reservation" &&
                          m.movementType !== "cancellation" &&
                          m.previousQuantity !== null &&
                          m.resultingQuantity !== null
                            ? `${formatCount(m.previousQuantity)} → ${formatCount(m.resultingQuantity)}`
                            : t("adminOps.common.noneLabel", lang);

                        return `
                          <tr>
                            <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(m.createdAt, lang))}</td>
                            <td>
                              <div class="admin-table-item__meta">
                                <span class="admin-table-item__title">${escapeHtml(prodName)}</span>
                                <span class="admin-table-item__sub">${escapeHtml(m.size)} / ${escapeHtml(m.color)}</span>
                              </div>
                            </td>
                            <td>
                              <span class="admin-tag ${m.movementType === "addition" || m.movementType === "cancellation" ? "admin-tag--gold" : ""}">
                                ${escapeHtml(localizeMovementType(m.movementType, lang))}
                              </span>
                            </td>
                            <td class="admin-table__num tabular-nums">
                              <span class="${isPos ? "admin-delta-pos" : "admin-delta-neg"}">
                                ${escapeHtml(displayQuantity)}
                              </span>
                            </td>
                            <td class="admin-table__num tabular-nums">${escapeHtml(beforeAfter)}</td>
                            <td>${escapeHtml(m.performedByName || t("adminOps.orders.systemActor", lang))}</td>
                            <td>
                              <div>${escapeHtml(m.reason || t("adminOps.common.noneLabel", lang))}</div>
                              ${
                                m.orderNumber
                                  ? `<div class="text-muted tabular-nums" style="font-size: 11px;">${escapeHtml(m.orderNumber)}</div>`
                                  : ""
                              }
                            </td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>

              <div class="admin-pagination">
                <span class="admin-pagination__info tabular-nums">
                  ${escapeHtml(formatTemplate(t("adminOps.common.showingRange", lang), { from, to, total }))}
                </span>
                <div class="admin-pagination__controls">
                  <button type="button" class="btn btn--secondary btn--sm" id="inv-mov-prev" ${page <= 1 ? "disabled" : ""}>
                    ${escapeHtml(t("adminOps.common.prevPage", lang))}
                  </button>
                  <span class="admin-pagination__info tabular-nums">
                    ${escapeHtml(formatTemplate(t("adminOps.common.pageOf", lang), { page, totalPages }))}
                  </span>
                  <button type="button" class="btn btn--secondary btn--sm" id="inv-mov-next" ${page >= totalPages ? "disabled" : ""}>
                    ${escapeHtml(t("adminOps.common.nextPage", lang))}
                  </button>
                </div>
              </div>
            `
        }
      </section>
    `;

    document.getElementById("inv-mov-filter-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      invState.movFilters.search = document.getElementById("inv-mov-search")?.value.trim() || "";
      invState.movFilters.movementType = document.getElementById("inv-mov-type")?.value || "all";
      invState.movFilters.startDate = document.getElementById("inv-mov-start")?.value || "";
      invState.movFilters.endDate = document.getElementById("inv-mov-end")?.value || "";
      invState.movPagination.page = 1;
      void loadAdminInventoryMovements({ onAuthError, onRender });
    });

    document.getElementById("inv-mov-clear-var")?.addEventListener("click", () => {
      invState.movFilters.variantId = "";
      invState.movFilters.variantLabel = "";
      invState.movPagination.page = 1;
      void loadAdminInventoryMovements({ onAuthError, onRender });
    });

    document.getElementById("inv-mov-retry")?.addEventListener("click", () => {
      void loadAdminInventoryMovements({ onAuthError, onRender });
    });

    document.getElementById("inv-mov-prev")?.addEventListener("click", () => {
      if (invState.movPagination.page > 1) {
        invState.movPagination.page -= 1;
        void loadAdminInventoryMovements({ onAuthError, onRender });
      }
    });

    document.getElementById("inv-mov-next")?.addEventListener("click", () => {
      if (invState.movPagination.page < invState.movPagination.totalPages) {
        invState.movPagination.page += 1;
        void loadAdminInventoryMovements({ onAuthError, onRender });
      }
    });
  }

  mainEl.querySelectorAll("[data-inv-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = btn.getAttribute("data-inv-tab") || "stock";
      if (nextTab === invState.activeTab) return;
      invState.activeTab = nextTab;
      if (nextTab === "stock") {
        void loadAdminInventoryStock({ onAuthError, onRender });
      } else {
        void loadAdminInventoryMovements({ onAuthError, onRender });
      }
    });
  });

  document.getElementById("inv-refresh-btn")?.addEventListener("click", () => {
    if (invState.activeTab === "stock") {
      void loadAdminInventoryStock({ onAuthError, onRender });
    } else {
      void loadAdminInventoryMovements({ onAuthError, onRender });
    }
  });
}
