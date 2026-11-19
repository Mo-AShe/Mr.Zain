/**
 * MR. ZAIN — Admin Customer Directory & Profile Controller
 * Strictly customer role accounts; admin accounts never appear here.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { formatAddressLines } from "../components/address-form.js";
import {
  formatOrderDate,
  localizeOrderStatus,
  localizePaymentStatus,
} from "../components/order-view.js";
import {
  openConfirmDialog,
  showToast,
} from "../components/ui.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import {
  fetchAdminCustomerDetail,
  fetchAdminCustomers,
  updateAdminCustomerStatusRequest,
} from "./admin.js";

const custState = {
  loading: false,
  error: "",
  loadedOnce: false,
  customers: [],
  pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
  filters: {
    search: "",
    status: "all",
    sort: "newest",
  },
  selectedCustomerId: null,
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

export function resetCustomersLoadState() {
  custState.selectedCustomerId = null;
  custState.detail = null;
  custState.detailError = "";
  custState.loadedOnce = false;
}

export async function loadAdminCustomersList({ onAuthError, onRender } = {}) {
  custState.loading = true;
  custState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const res = await fetchAdminCustomers({
      search: custState.filters.search,
      status: custState.filters.status,
      sort: custState.filters.sort,
      page: custState.pagination.page,
      limit: custState.pagination.limit,
    });

    custState.customers = Array.isArray(res?.customers) ? res.customers : [];
    custState.pagination = res?.pagination || {
      page: 1,
      limit: 15,
      total: 0,
      totalPages: 1,
    };
    custState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    custState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    custState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

export async function loadAdminCustomerDetail(customerId, { onAuthError, onRender } = {}) {
  custState.selectedCustomerId = customerId;
  custState.detailLoading = true;
  custState.detailError = "";
  if (typeof onRender === "function") onRender();

  try {
    custState.detail = await fetchAdminCustomerDetail(customerId);
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    custState.detailError = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    custState.detailLoading = false;
    if (typeof onRender === "function") onRender();
  }
}

function renderCustomerProfileView(mainEl, { onAuthError, onRender, onOpenOrder }) {
  const lang = getLanguage();

  if (custState.detailLoading && !custState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.customers.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.customers.title", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="cust-back-btn">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-panel"><div class="admin-skeleton" style="width: 100%; height: 260px;"></div></div>
    `;
    document.getElementById("cust-back-btn")?.addEventListener("click", () => {
      custState.selectedCustomerId = null;
      custState.detail = null;
      onRender();
    });
    return;
  }

  if (custState.detailError || !custState.detail?.customer) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.customers.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.customers.title", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="cust-back-btn">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(custState.detailError || "")}</p>
        <button type="button" class="btn btn--primary btn--sm" id="cust-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
      </div>
    `;
    document.getElementById("cust-back-btn")?.addEventListener("click", () => {
      custState.selectedCustomerId = null;
      custState.detail = null;
      onRender();
    });
    document.getElementById("cust-retry-btn")?.addEventListener("click", () => {
      if (custState.selectedCustomerId) {
        void loadAdminCustomerDetail(custState.selectedCustomerId, { onAuthError, onRender });
      }
    });
    return;
  }

  const c = custState.detail.customer;
  const addresses = Array.isArray(custState.detail.addresses) ? custState.detail.addresses : [];
  const orders = Array.isArray(custState.detail.orders) ? custState.detail.orders : [];

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.customers.kicker", lang))}</span>
        <h1 class="admin-page-head__title">
          ${escapeHtml(formatTemplate(t("adminOps.customers.profileTitle", lang), { name: c.fullName }))}
        </h1>
        <p class="admin-page-head__subtitle">
          <span dir="ltr">${escapeHtml(c.email)}</span> ·
          <span class="admin-status-text ${c.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
            ${escapeHtml(c.isActive ? t("adminOps.common.activeStatus", lang) : t("adminOps.common.inactiveStatus", lang))}
          </span>
        </p>
      </div>
      <div class="admin-page-head__actions">
        <button
          type="button"
          class="btn ${c.isActive ? "btn--danger" : "btn--primary"} btn--sm"
          id="cust-toggle-status-btn"
          ${custState.actionBusy ? "disabled" : ""}
        >
          ${escapeHtml(c.isActive ? t("adminOps.customers.disableBtn", lang) : t("adminOps.customers.enableBtn", lang))}
        </button>
        <button type="button" class="btn btn--secondary btn--sm" id="cust-back-btn">
          ${escapeHtml(t("adminOps.common.backBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-kpi-grid--4">
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.customers.kpiTotalOrders", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(c.totalOrders))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.customers.kpiDeliveredOrders", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(c.deliveredOrders))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.customers.kpiPaidSpend", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatPriceEGP(c.totalPaidSpend, lang))}</strong>
      </article>
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("adminOps.customers.kpiActiveSessions", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(c.activeSessionsCount))}</strong>
      </article>
    </section>

    <div class="admin-detail-grid" style="margin-top: var(--space-5);">
      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.customers.accountInfoHeading", lang))}</h2>
        </div>
        <dl class="admin-info-dl">
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.orders.labelCustomerName", lang))}</dt>
            <dd>${escapeHtml(c.fullName)}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.orders.labelEmail", lang))}</dt>
            <dd dir="ltr">${escapeHtml(c.email)}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.orders.labelPhone", lang))}</dt>
            <dd dir="ltr" class="tabular-nums">${escapeHtml(c.phone || t("adminOps.common.noneLabel", lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.customers.colRegistered", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatOrderDate(c.createdAt, lang))}</dd>
          </div>
          <div class="admin-info-row">
            <dt>${escapeHtml(t("adminOps.customers.colLastOrder", lang))}</dt>
            <dd class="tabular-nums">${c.lastOrderAt ? escapeHtml(formatOrderDate(c.lastOrderAt, lang)) : escapeHtml(t("adminOps.customers.neverOrdered", lang))}</dd>
          </div>
        </dl>
      </article>

      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.customers.addressesHeading", lang))}</h2>
        </div>
        ${
          addresses.length === 0
            ? `<p class="text-muted" style="font-size: var(--text-sm);">${escapeHtml(t("adminOps.customers.noAddressesText", lang))}</p>`
            : `
            <div class="admin-timeline-list">
              ${addresses
                .map((addr) => {
                  const lines = formatAddressLines(addr, lang);
                  return `
                    <div class="admin-timeline-item">
                      <div class="admin-timeline-item__top">
                        <span class="admin-timeline-item__title">${escapeHtml(addr.recipientName)}</span>
                        ${addr.isDefault ? `<span class="admin-tag admin-tag--gold">${escapeHtml(t("adminOps.customers.defaultAddressTag", lang))}</span>` : ""}
                      </div>
                      <span class="admin-timeline-item__meta tabular-nums" dir="ltr">${escapeHtml(addr.phone)}</span>
                      <p class="admin-timeline-item__meta" style="color: var(--color-black);">${lines.map(escapeHtml).join("<br />")}</p>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
        }
      </article>
    </div>

    <article class="admin-panel" style="margin-top: var(--space-5);">
      <div class="admin-panel__head">
        <h2 class="admin-panel__title">${escapeHtml(t("adminOps.customers.ordersHeading", lang))} (${escapeHtml(formatCount(orders.length))})</h2>
      </div>
      ${
        orders.length === 0
          ? `<p class="text-muted" style="font-size: var(--text-sm);">${escapeHtml(t("adminOps.customers.noOrdersText", lang))}</p>`
          : `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t("adminOps.orders.colOrderNumber", lang))}</th>
                  <th>${escapeHtml(t("adminOps.orders.colDate", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminOps.orders.colItems", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminOps.orders.colTotal", lang))}</th>
                  <th>${escapeHtml(t("adminOps.orders.colPayment", lang))}</th>
                  <th>${escapeHtml(t("adminOps.orders.colStatus", lang))}</th>
                  <th style="text-align: end;">${escapeHtml(t("adminOps.orders.colActions", lang))}</th>
                </tr>
              </thead>
              <tbody>
                ${orders
                  .map(
                    (o) => `
                  <tr>
                    <td class="tabular-nums"><strong>${escapeHtml(o.orderNumber)}</strong></td>
                    <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(o.createdAt, lang))}</td>
                    <td class="admin-table__num tabular-nums">${escapeHtml(formatCount(o.itemCount))}</td>
                    <td class="admin-table__num tabular-nums"><strong>${escapeHtml(formatPriceEGP(o.totalAmount, lang))}</strong></td>
                    <td>${escapeHtml(localizePaymentStatus(o.paymentStatus, lang))}</td>
                    <td>${escapeHtml(localizeOrderStatus(o.orderStatus, lang))}</td>
                    <td>
                      <div class="admin-row-actions">
                        <button type="button" class="btn btn--secondary btn--sm" data-cust-open-order="${escapeHtml(o.id)}">
                          ${escapeHtml(t("adminOps.orders.viewBtn", lang))}
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
    </article>
  `;

  document.getElementById("cust-back-btn")?.addEventListener("click", () => {
    custState.selectedCustomerId = null;
    custState.detail = null;
    void loadAdminCustomersList({ onAuthError, onRender });
  });

  document.getElementById("cust-toggle-status-btn")?.addEventListener("click", () => {
    const nextIsActive = !c.isActive;
    openConfirmDialog({
      title: nextIsActive
        ? t("adminOps.customers.enableBtn", lang)
        : t("adminOps.customers.disableBtn", lang),
      message: formatTemplate(
        nextIsActive
          ? t("adminOps.customers.enableConfirmMsg", lang)
          : t("adminOps.customers.disableConfirmMsg", lang),
        { name: c.fullName }
      ),
      confirmLabel: nextIsActive
        ? t("adminOps.customers.enableBtn", lang)
        : t("adminOps.customers.disableBtn", lang),
      cancelLabel: t("adminOps.common.cancelBtn", lang),
      danger: !nextIsActive,
      onConfirm: async () => {
        custState.actionBusy = true;
        onRender();
        try {
          await updateAdminCustomerStatusRequest(c.id, { isActive: nextIsActive });
          showToast(
            nextIsActive
              ? t("adminOps.customers.enabledToast", lang)
              : t("adminOps.customers.disabledToast", lang),
            "success"
          );
          await loadAdminCustomerDetail(c.id, { onAuthError, onRender });
        } catch (err) {
          if (err && (err.status === 401 || err.status === 403)) {
            if (typeof onAuthError === "function") await onAuthError(err);
            return;
          }
          showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
        } finally {
          custState.actionBusy = false;
          onRender();
        }
      },
    });
  });

  mainEl.querySelectorAll("[data-cust-open-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const orderId = btn.getAttribute("data-cust-open-order");
      if (orderId && typeof onOpenOrder === "function") {
        onOpenOrder(orderId);
      }
    });
  });
}

export function renderCustomersSection(mainEl, { onAuthError, onRender, onOpenOrder }) {
  if (!mainEl) return;

  if (custState.selectedCustomerId) {
    renderCustomerProfileView(mainEl, { onAuthError, onRender, onOpenOrder });
    return;
  }

  if (!custState.loadedOnce && !custState.loading && !custState.error) {
    void loadAdminCustomersList({ onAuthError, onRender });
  }

  const lang = getLanguage();
  const { total, page, limit, totalPages } = custState.pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.customers.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.customers.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.customers.subtitle", lang))}</p>
      </div>
      <button type="button" class="btn btn--secondary btn--sm" id="cust-refresh-btn">
        ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
      </button>
    </div>

    <section class="admin-panel">
      <form class="admin-toolbar" id="cust-filter-form">
        <div class="admin-toolbar__filters">
          <input
            type="search"
            id="cust-search-input"
            class="input admin-toolbar__search"
            value="${escapeHtml(custState.filters.search)}"
            placeholder="${escapeHtml(t("adminOps.customers.searchPlaceholder", lang))}"
          />
          <select id="cust-status-filter" class="select admin-toolbar__select">
            <option value="all" ${custState.filters.status === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.filterAll", lang))}</option>
            <option value="active" ${custState.filters.status === "active" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.filterActive", lang))}</option>
            <option value="inactive" ${custState.filters.status === "inactive" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.filterInactive", lang))}</option>
          </select>
          <select id="cust-sort-filter" class="select admin-toolbar__select">
            <option value="newest" ${custState.filters.sort === "newest" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.sortNewest", lang))}</option>
            <option value="oldest" ${custState.filters.sort === "oldest" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.sortOldest", lang))}</option>
            <option value="spend_desc" ${custState.filters.sort === "spend_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.sortSpendDesc", lang))}</option>
            <option value="orders_desc" ${custState.filters.sort === "orders_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.sortOrdersDesc", lang))}</option>
            <option value="name_asc" ${custState.filters.sort === "name_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.customers.sortNameAsc", lang))}</option>
          </select>
          <button type="submit" class="btn btn--primary btn--sm">
            ${escapeHtml(t("adminOps.common.applyBtn", lang))}
          </button>
        </div>
      </form>

      ${
        custState.loading
          ? '<div class="admin-skeleton" style="width: 100%; height: 240px;"></div>'
          : custState.error
          ? `
            <div class="admin-state-box admin-state-box--inline">
              <strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong>
              <p class="admin-state-box__desc">${escapeHtml(custState.error)}</p>
              <button type="button" class="btn btn--secondary btn--sm" id="cust-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
            </div>
          `
          : custState.customers.length === 0
          ? `
            <div class="admin-state-box admin-state-box--inline">
              <strong class="admin-state-box__title">${escapeHtml(t("adminOps.customers.emptyTitle", lang))}</strong>
              <p class="admin-state-box__desc">${escapeHtml(t("adminOps.customers.emptyDesc", lang))}</p>
            </div>
          `
          : `
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>${escapeHtml(t("adminOps.customers.colCustomer", lang))}</th>
                    <th>${escapeHtml(t("adminOps.customers.colContact", lang))}</th>
                    <th>${escapeHtml(t("adminOps.customers.colRegistered", lang))}</th>
                    <th class="admin-table__num">${escapeHtml(t("adminOps.customers.colOrders", lang))}</th>
                    <th class="admin-table__num">${escapeHtml(t("adminOps.customers.colPaidSpend", lang))}</th>
                    <th>${escapeHtml(t("adminOps.customers.colLastOrder", lang))}</th>
                    <th>${escapeHtml(t("adminOps.customers.colStatus", lang))}</th>
                    <th style="text-align: end;">${escapeHtml(t("adminOps.customers.colActions", lang))}</th>
                  </tr>
                </thead>
                <tbody>
                  ${custState.customers
                    .map(
                      (c) => `
                    <tr>
                      <td><strong>${escapeHtml(c.fullName)}</strong></td>
                      <td>
                        <div class="admin-table-item__meta">
                          <span class="admin-table-item__title" dir="ltr">${escapeHtml(c.email)}</span>
                          <span class="admin-table-item__sub tabular-nums" dir="ltr">${escapeHtml(c.phone || t("adminOps.common.noneLabel", lang))}</span>
                        </div>
                      </td>
                      <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(c.createdAt, lang))}</td>
                      <td class="admin-table__num tabular-nums">${escapeHtml(formatCount(c.totalOrders))}</td>
                      <td class="admin-table__num tabular-nums"><strong>${escapeHtml(formatPriceEGP(c.totalPaidSpend, lang))}</strong></td>
                      <td class="tabular-nums text-muted">
                        ${c.lastOrderAt ? escapeHtml(formatOrderDate(c.lastOrderAt, lang)) : escapeHtml(t("adminOps.customers.neverOrdered", lang))}
                      </td>
                      <td>
                        <span class="admin-status-text ${c.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                          ${escapeHtml(c.isActive ? t("adminOps.common.activeStatus", lang) : t("adminOps.common.inactiveStatus", lang))}
                        </span>
                      </td>
                      <td>
                        <div class="admin-row-actions">
                          <button type="button" class="btn btn--secondary btn--sm" data-cust-view="${escapeHtml(c.id)}">
                            ${escapeHtml(t("adminOps.customers.viewProfileBtn", lang))}
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

            <div class="admin-pagination">
              <span class="admin-pagination__info tabular-nums">
                ${escapeHtml(formatTemplate(t("adminOps.common.showingRange", lang), { from, to, total }))}
              </span>
              <div class="admin-pagination__controls">
                <button type="button" class="btn btn--secondary btn--sm" id="cust-prev-page" ${page <= 1 ? "disabled" : ""}>
                  ${escapeHtml(t("adminOps.common.prevPage", lang))}
                </button>
                <span class="admin-pagination__info tabular-nums">
                  ${escapeHtml(formatTemplate(t("adminOps.common.pageOf", lang), { page, totalPages }))}
                </span>
                <button type="button" class="btn btn--secondary btn--sm" id="cust-next-page" ${page >= totalPages ? "disabled" : ""}>
                  ${escapeHtml(t("adminOps.common.nextPage", lang))}
                </button>
              </div>
            </div>
          `
      }
    </section>
  `;

  document.getElementById("cust-refresh-btn")?.addEventListener("click", () => {
    void loadAdminCustomersList({ onAuthError, onRender });
  });

  document.getElementById("cust-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    custState.filters.search = document.getElementById("cust-search-input")?.value.trim() || "";
    custState.filters.status = document.getElementById("cust-status-filter")?.value || "all";
    custState.filters.sort = document.getElementById("cust-sort-filter")?.value || "newest";
    custState.pagination.page = 1;
    void loadAdminCustomersList({ onAuthError, onRender });
  });

  document.getElementById("cust-retry-btn")?.addEventListener("click", () => {
    void loadAdminCustomersList({ onAuthError, onRender });
  });

  document.getElementById("cust-prev-page")?.addEventListener("click", () => {
    if (custState.pagination.page > 1) {
      custState.pagination.page -= 1;
      void loadAdminCustomersList({ onAuthError, onRender });
    }
  });

  document.getElementById("cust-next-page")?.addEventListener("click", () => {
    if (custState.pagination.page < custState.pagination.totalPages) {
      custState.pagination.page += 1;
      void loadAdminCustomersList({ onAuthError, onRender });
    }
  });

  mainEl.querySelectorAll("[data-cust-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cust-view");
      if (id) void loadAdminCustomerDetail(id, { onAuthError, onRender });
    });
  });
}
