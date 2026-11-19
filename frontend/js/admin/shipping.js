/**
 * MR. ZAIN — Admin Shipping Zones & Global Rules Controller
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { localizeGovernorate } from "../components/address-form.js";
import {
  closeModal,
  openConfirmDialog,
  openModal,
  showToast,
} from "../components/ui.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import {
  createAdminShippingZoneRequest,
  deleteAdminShippingZoneRequest,
  fetchAdminShipping,
  updateAdminShippingSettingsRequest,
  updateAdminShippingZoneRequest,
} from "./admin.js";

const shipState = {
  loading: false,
  error: "",
  loadedOnce: false,
  settings: {
    freeShippingThreshold: 2500,
    isFreeShippingEnabled: true,
    isCodEnabled: true,
  },
  summary: {
    totalZones: 0,
    activeZones: 0,
    inactiveZones: 0,
    averageShippingFee: 0,
  },
  zones: [],
  filters: {
    search: "",
    status: "all",
    sort: "governorate_asc",
  },
  rulesSaving: false,
  zoneBusy: false,
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

function formatDeliveryEstimate(zone, lang) {
  const minDays = Number(zone.estimatedDeliveryDays ?? 3);
  const maxDays =
    zone.estimatedDeliveryMaxDays !== null &&
    zone.estimatedDeliveryMaxDays !== undefined
      ? Number(zone.estimatedDeliveryMaxDays)
      : null;

  if (maxDays !== null && maxDays > minDays) {
    return formatTemplate(t("adminOps.shipping.deliveryRangeDays", lang), {
      min: formatCount(minDays),
      max: formatCount(maxDays),
    });
  }
  return formatTemplate(t("adminOps.shipping.deliverySingleDays", lang), {
    days: formatCount(minDays),
  });
}

export function resetShippingLoadState() {
  shipState.loadedOnce = false;
}

export async function loadAdminShipping({ onAuthError, onRender } = {}) {
  shipState.loading = true;
  shipState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const res = await fetchAdminShipping({
      search: shipState.filters.search,
      status: shipState.filters.status,
      sort: shipState.filters.sort,
    });

    if (res?.settings) shipState.settings = res.settings;
    if (res?.summary) shipState.summary = res.summary;
    shipState.zones = Array.isArray(res?.zones) ? res.zones : [];
    shipState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    shipState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    shipState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

function openZoneFormModal(existingZone, { onAuthError, onRender }) {
  const lang = getLanguage();
  const isEdit = Boolean(existingZone);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <form id="shipping-zone-modal-form" class="admin-form" novalidate>
      <div id="shipping-zone-modal-error" class="admin-form-error" hidden></div>

      <div class="admin-form-grid">
        <div class="field admin-form-full">
          <label class="field__label" for="sz-governorate">${escapeHtml(t("adminOps.shipping.fieldGovernorate", lang))}</label>
          <input
            id="sz-governorate"
            type="text"
            class="input"
            maxlength="100"
            value="${escapeHtml(existingZone?.governorate || "")}"
            placeholder="Cairo"
            required
          />
        </div>

        <div class="field">
          <label class="field__label" for="sz-fee">${escapeHtml(t("adminOps.shipping.fieldFee", lang))}</label>
          <input
            id="sz-fee"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="0.01"
            min="0"
            value="${escapeHtml(existingZone ? String(existingZone.shippingFee) : "80")}"
            required
          />
        </div>

        <div class="field" style="justify-content: flex-end;">
          <label class="admin-checkbox" style="margin-top: 1.25rem;">
            <input id="sz-active" type="checkbox" ${existingZone ? (existingZone.isActive ? "checked" : "") : "checked"} />
            <span>${escapeHtml(t("adminOps.shipping.fieldZoneActive", lang))}</span>
          </label>
        </div>

        <div class="field">
          <label class="field__label" for="sz-min-days">${escapeHtml(t("adminOps.shipping.fieldMinDays", lang))}</label>
          <input
            id="sz-min-days"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="1"
            min="1"
            max="60"
            value="${escapeHtml(existingZone ? String(existingZone.estimatedDeliveryDays) : "2")}"
            required
          />
        </div>

        <div class="field">
          <label class="field__label" for="sz-max-days">${escapeHtml(t("adminOps.shipping.fieldMaxDays", lang))}</label>
          <input
            id="sz-max-days"
            type="number"
            class="input tabular-nums"
            dir="ltr"
            step="1"
            min="1"
            max="90"
            value="${escapeHtml(existingZone?.estimatedDeliveryMaxDays !== null && existingZone?.estimatedDeliveryMaxDays !== undefined ? String(existingZone.estimatedDeliveryMaxDays) : "")}"
            placeholder="${escapeHtml(t("adminOps.shipping.optionalDaysPlaceholder", lang))}"
          />
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; padding-top: 0.5rem;">
        <button type="button" class="btn btn--secondary" id="sz-cancel-btn">${escapeHtml(t("adminOps.common.cancelBtn", lang))}</button>
        <button type="submit" class="btn btn--primary" id="sz-submit-btn">
          ${escapeHtml(isEdit ? t("adminOps.common.saveBtn", lang) : t("adminOps.shipping.addZoneBtn", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? formatTemplate(t("adminOps.shipping.editZoneModalTitle", lang), {
          name: localizeGovernorate(existingZone.governorate, lang),
        })
      : t("adminOps.shipping.addZoneModalTitle", lang),
    content: wrapper,
  });

  const govEl = document.getElementById("sz-governorate");
  const feeEl = document.getElementById("sz-fee");
  const minDaysEl = document.getElementById("sz-min-days");
  const maxDaysEl = document.getElementById("sz-max-days");
  const activeEl = document.getElementById("sz-active");
  const errEl = document.getElementById("shipping-zone-modal-error");
  const submitBtn = document.getElementById("sz-submit-btn");

  document.getElementById("sz-cancel-btn")?.addEventListener("click", closeModal);

  document
    .getElementById("shipping-zone-modal-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!errEl) return;
      errEl.hidden = true;
      errEl.textContent = "";

      const currentLang = getLanguage();
      const governorate = (govEl?.value || "").trim();
      const shippingFee = Number(feeEl?.value);
      const estimatedDeliveryDays = Number(minDaysEl?.value);
      const maxRaw = (maxDaysEl?.value || "").trim();
      const estimatedDeliveryMaxDays = maxRaw === "" ? null : Number(maxRaw);
      const isActive = Boolean(activeEl?.checked);

      let validationMsg = "";
      if (governorate.length < 2) {
        validationMsg = t("adminOps.shipping.errGovernorate", currentLang);
      } else if (!Number.isFinite(shippingFee) || shippingFee < 0) {
        validationMsg = t("adminOps.shipping.errFee", currentLang);
      } else if (
        !Number.isInteger(estimatedDeliveryDays) ||
        estimatedDeliveryDays < 1 ||
        estimatedDeliveryDays > 60
      ) {
        validationMsg = t("adminOps.shipping.errMinDays", currentLang);
      } else if (
        estimatedDeliveryMaxDays !== null &&
        (!Number.isInteger(estimatedDeliveryMaxDays) ||
          estimatedDeliveryMaxDays < estimatedDeliveryDays ||
          estimatedDeliveryMaxDays > 90)
      ) {
        validationMsg = t("adminOps.shipping.errMaxDays", currentLang);
      }

      if (validationMsg) {
        errEl.textContent = validationMsg;
        errEl.hidden = false;
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t("adminOps.common.savingBtn", currentLang);
      }

      try {
        const payload = {
          governorate,
          shippingFee,
          estimatedDeliveryDays,
          estimatedDeliveryMaxDays,
          isActive,
        };
        if (isEdit) {
          await updateAdminShippingZoneRequest(existingZone.id, payload);
          showToast(t("adminOps.shipping.zoneUpdatedToast", currentLang), "success");
        } else {
          await createAdminShippingZoneRequest(payload);
          showToast(t("adminOps.shipping.zoneCreatedToast", currentLang), "success");
        }
        closeModal();
        await loadAdminShipping({ onAuthError, onRender });
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
            : t("adminOps.shipping.addZoneBtn", getLanguage());
        }
      }
    });
}

export function renderShippingSection(mainEl, { onAuthError, onRender } = {}) {
  const lang = getLanguage();

  if (!shipState.loadedOnce && !shipState.loading && !shipState.error) {
    void loadAdminShipping({ onAuthError, onRender });
  }

  const s = shipState.settings;
  const sum = shipState.summary;

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.shipping.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.shipping.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.shipping.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="ship-refresh-btn" ${shipState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
        </button>
        <button type="button" class="btn btn--primary btn--sm" id="ship-add-zone-btn">
          ${escapeHtml(t("adminOps.shipping.addZoneBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-kpi-grid--4" style="margin-bottom: var(--space-5);">
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.shipping.kpiTotalZones", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(sum.totalZones))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.shipping.kpiActiveZones", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(sum.activeZones))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.shipping.kpiFreeThreshold", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatPriceEGP(s.freeShippingThreshold, lang))}</strong>
        <p class="admin-stat-card__meta">
          ${escapeHtml(s.isFreeShippingEnabled ? t("adminOps.shipping.ruleEnabled", lang) : t("adminOps.shipping.ruleDisabled", lang))}
        </p>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.shipping.kpiCodStatus", lang))}</span>
        <strong class="admin-stat-card__value">
          ${escapeHtml(s.isCodEnabled ? t("adminOps.shipping.codEnabledLabel", lang) : t("adminOps.shipping.codDisabledLabel", lang))}
        </strong>
      </article>
    </section>

    <section class="admin-panel" style="margin-bottom: var(--space-5);">
      <div class="admin-panel__head">
        <div>
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.shipping.rulesHeading", lang))}</h2>
          <p class="admin-panel__subtitle">${escapeHtml(t("adminOps.shipping.rulesSubtitle", lang))}</p>
        </div>
      </div>

      <form id="ship-rules-form" class="admin-form" novalidate>
        <div id="ship-rules-error" class="admin-form-error" hidden></div>

        <div class="admin-form-grid--3">
          <div class="field">
            <label class="field__label" for="ship-threshold-input">${escapeHtml(t("adminOps.shipping.thresholdLabel", lang))}</label>
            <input
              id="ship-threshold-input"
              type="number"
              class="input tabular-nums"
              dir="ltr"
              step="0.01"
              min="0"
              value="${escapeHtml(String(s.freeShippingThreshold))}"
              required
            />
          </div>

          <div class="field" style="justify-content: flex-end;">
            <label class="admin-checkbox">
              <input id="ship-free-enabled" type="checkbox" ${s.isFreeShippingEnabled ? "checked" : ""} />
              <span>${escapeHtml(t("adminOps.shipping.freeShippingToggle", lang))}</span>
            </label>
          </div>

          <div class="field" style="justify-content: flex-end;">
            <label class="admin-checkbox">
              <input id="ship-cod-enabled" type="checkbox" ${s.isCodEnabled ? "checked" : ""} />
              <span>${escapeHtml(t("adminOps.shipping.codToggle", lang))}</span>
            </label>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn--primary btn--sm" id="ship-rules-save-btn" ${shipState.rulesSaving ? "disabled" : ""}>
            ${escapeHtml(shipState.rulesSaving ? t("adminOps.common.savingBtn", lang) : t("adminOps.shipping.saveRulesBtn", lang))}
          </button>
        </div>
      </form>
    </section>

    <section class="admin-panel">
      <div class="admin-panel__head">
        <div>
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.shipping.zonesHeading", lang))}</h2>
          <p class="admin-panel__subtitle">${escapeHtml(t("adminOps.shipping.zonesSubtitle", lang))}</p>
        </div>
      </div>

      <div class="admin-toolbar">
        <form class="admin-toolbar__filters" id="ship-filter-form">
          <input
            type="search"
            id="ship-search-input"
            class="input admin-toolbar__search"
            value="${escapeHtml(shipState.filters.search)}"
            placeholder="${escapeHtml(t("adminOps.shipping.searchPlaceholder", lang))}"
          />
          <select id="ship-status-select" class="select admin-toolbar__select">
            <option value="all" ${shipState.filters.status === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.shipping.filterAll", lang))}</option>
            <option value="active" ${shipState.filters.status === "active" ? "selected" : ""}>${escapeHtml(t("adminOps.common.activeStatus", lang))}</option>
            <option value="inactive" ${shipState.filters.status === "inactive" ? "selected" : ""}>${escapeHtml(t("adminOps.common.inactiveStatus", lang))}</option>
          </select>
          <select id="ship-sort-select" class="select admin-toolbar__select">
            <option value="governorate_asc" ${shipState.filters.sort === "governorate_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.shipping.sortGovAsc", lang))}</option>
            <option value="fee_asc" ${shipState.filters.sort === "fee_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.shipping.sortFeeAsc", lang))}</option>
            <option value="fee_desc" ${shipState.filters.sort === "fee_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.shipping.sortFeeDesc", lang))}</option>
            <option value="days_asc" ${shipState.filters.sort === "days_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.shipping.sortDaysAsc", lang))}</option>
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">${escapeHtml(t("adminOps.common.applyBtn", lang))}</button>
        </form>
      </div>

      ${
        shipState.error
          ? `<div class="admin-state-box admin-state-box--inline"><strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong><p class="admin-state-box__desc">${escapeHtml(shipState.error)}</p><button type="button" class="btn btn--primary btn--sm" id="ship-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button></div>`
          : shipState.loading && !shipState.loadedOnce
          ? `<div class="admin-skeleton" style="width: 100%; height: 240px;"></div>`
          : shipState.zones.length === 0
          ? `<div class="admin-state-box admin-state-box--inline"><strong class="admin-state-box__title">${escapeHtml(t("adminOps.shipping.emptyTitle", lang))}</strong><p class="admin-state-box__desc">${escapeHtml(t("adminOps.shipping.emptyDesc", lang))}</p></div>`
          : `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("adminOps.shipping.colGovernorate", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminOps.shipping.colFee", lang))}</th>
                <th>${escapeHtml(t("adminOps.shipping.colDelivery", lang))}</th>
                <th>${escapeHtml(t("adminOps.shipping.colStatus", lang))}</th>
                <th style="text-align: end;">${escapeHtml(t("adminOps.shipping.colActions", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${shipState.zones
                .map(
                  (z) => `
                <tr>
                  <td>
                    <div class="admin-table-item__meta">
                      <span class="admin-table-item__title">${escapeHtml(localizeGovernorate(z.governorate, lang))}</span>
                      ${
                        lang === "ar"
                          ? `<span class="admin-table-item__sub" dir="ltr">${escapeHtml(z.governorate)}</span>`
                          : ""
                      }
                    </div>
                  </td>
                  <td class="admin-table__num">${escapeHtml(formatPriceEGP(z.shippingFee, lang))}</td>
                  <td class="tabular-nums">${escapeHtml(formatDeliveryEstimate(z, lang))}</td>
                  <td>
                    <span class="admin-status-text ${z.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                      ${escapeHtml(z.isActive ? t("adminOps.common.activeStatus", lang) : t("adminOps.common.inactiveStatus", lang))}
                    </span>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button type="button" class="btn btn--secondary btn--sm" data-sz-edit="${escapeHtml(z.id)}">
                        ${escapeHtml(t("adminOps.shipping.editBtn", lang))}
                      </button>
                      <button type="button" class="btn btn--secondary btn--sm" data-sz-toggle="${escapeHtml(z.id)}" ${shipState.zoneBusy ? "disabled" : ""}>
                        ${escapeHtml(z.isActive ? t("adminOps.shipping.deactivateBtn", lang) : t("adminOps.shipping.activateBtn", lang))}
                      </button>
                      <button type="button" class="btn btn--danger btn--sm" data-sz-delete="${escapeHtml(z.id)}" ${shipState.zoneBusy ? "disabled" : ""}>
                        ${escapeHtml(t("adminOps.shipping.deleteBtn", lang))}
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
      }
    </section>
  `;

  document.getElementById("ship-refresh-btn")?.addEventListener("click", () => {
    void loadAdminShipping({ onAuthError, onRender });
  });
  document.getElementById("ship-retry-btn")?.addEventListener("click", () => {
    void loadAdminShipping({ onAuthError, onRender });
  });
  document.getElementById("ship-add-zone-btn")?.addEventListener("click", () => {
    openZoneFormModal(null, { onAuthError, onRender });
  });

  document.getElementById("ship-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    shipState.filters.search =
      document.getElementById("ship-search-input")?.value.trim() || "";
    shipState.filters.status =
      document.getElementById("ship-status-select")?.value || "all";
    shipState.filters.sort =
      document.getElementById("ship-sort-select")?.value || "governorate_asc";
    void loadAdminShipping({ onAuthError, onRender });
  });

  document.getElementById("ship-rules-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("ship-rules-error");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }

    const thresholdVal = Number(
      document.getElementById("ship-threshold-input")?.value
    );
    const isFreeShippingEnabled = Boolean(
      document.getElementById("ship-free-enabled")?.checked
    );
    const isCodEnabled = Boolean(
      document.getElementById("ship-cod-enabled")?.checked
    );

    if (!Number.isFinite(thresholdVal) || thresholdVal < 0) {
      if (errEl) {
        errEl.textContent = t("adminOps.shipping.errThreshold", getLanguage());
        errEl.hidden = false;
      }
      return;
    }

    shipState.rulesSaving = true;
    onRender();
    try {
      shipState.settings = await updateAdminShippingSettingsRequest({
        freeShippingThreshold: thresholdVal,
        isFreeShippingEnabled,
        isCodEnabled,
      });
      showToast(t("adminOps.shipping.rulesSavedToast", getLanguage()), "success");
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
    } finally {
      shipState.rulesSaving = false;
      onRender();
    }
  });

  mainEl.querySelectorAll("[data-sz-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-sz-edit");
      const zone = shipState.zones.find((z) => z.id === id);
      if (zone) openZoneFormModal(zone, { onAuthError, onRender });
    });
  });

  mainEl.querySelectorAll("[data-sz-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-sz-toggle");
      const zone = shipState.zones.find((z) => z.id === id);
      if (!zone || shipState.zoneBusy) return;

      shipState.zoneBusy = true;
      onRender();
      try {
        await updateAdminShippingZoneRequest(zone.id, { isActive: !zone.isActive });
        showToast(
          t(
            !zone.isActive
              ? "adminOps.shipping.zoneActivatedToast"
              : "adminOps.shipping.zoneDeactivatedToast",
            getLanguage()
          ),
          "success"
        );
        await loadAdminShipping({ onAuthError, onRender });
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
      } finally {
        shipState.zoneBusy = false;
        onRender();
      }
    });
  });

  mainEl.querySelectorAll("[data-sz-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-sz-delete");
      const zone = shipState.zones.find((z) => z.id === id);
      if (!zone || shipState.zoneBusy) return;

      const currentLang = getLanguage();
      openConfirmDialog({
        title: t("adminOps.shipping.deleteBtn", currentLang),
        message: formatTemplate(t("adminOps.shipping.deleteConfirmMsg", currentLang), {
          name: localizeGovernorate(zone.governorate, currentLang),
        }),
        confirmLabel: t("adminOps.shipping.deleteBtn", currentLang),
        cancelLabel: t("adminOps.common.cancelBtn", currentLang),
        onConfirm: async () => {
          shipState.zoneBusy = true;
          onRender();
          try {
            await deleteAdminShippingZoneRequest(zone.id);
            showToast(t("adminOps.shipping.zoneDeletedToast", getLanguage()), "success");
            await loadAdminShipping({ onAuthError, onRender });
          } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
              if (typeof onAuthError === "function") await onAuthError(err);
              return;
            }
            showToast(err?.message || t("adminOps.common.errorTitle", getLanguage()), "error");
          } finally {
            shipState.zoneBusy = false;
            onRender();
          }
        },
      });
    });
  });
}
