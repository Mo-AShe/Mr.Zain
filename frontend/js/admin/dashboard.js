/**
 * MR. ZAIN — Admin Overview & Sales Analytics Controller
 * Strictly backed by GET /api/v1/admin/me, /api/v1/admin/dashboard,
 * and /api/v1/admin/dashboard/sales.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import {
  formatOrderDate,
  localizeOrderStatus,
  localizePaymentStatus,
} from "../components/order-view.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import {
  fetchAdminDashboardOverview,
  fetchAdminDashboardSales,
  signOutAdmin,
  verifyAdminAccess,
} from "./admin.js";
import {
  ADMIN_NAV_ITEMS,
  renderAdminAccessDenied,
  renderAdminAuthLoading,
  renderAdminShell,
  renderUpcomingSection,
} from "./admin-layout.js";
import {
  renderCategoriesSection,
  resetCategoriesLoadState,
} from "./categories.js";
import {
  renderCollectionsSection,
  resetCollectionsLoadState,
} from "./collections.js";
import {
  renderProductsSection,
  resetProductsLoadState,
} from "./products.js";
import {
  renderInventorySection,
  resetInventoryLoadState,
} from "./inventory.js";
import {
  openAdminOrderDetailView,
  renderOrdersSection,
  resetOrdersLoadState,
} from "./orders.js";
import {
  renderCustomersSection,
  resetCustomersLoadState,
} from "./customers.js";
import {
  renderCouponsSection,
  resetCouponsLoadState,
} from "./coupons.js";
import {
  renderShippingSection,
  resetShippingLoadState,
} from "./shipping.js";
import {
  renderSettingsSection,
  resetSettingsLoadState,
} from "./settings.js";

const state = {
  authStatus: "checking", // checking | authorized | forbidden
  adminUser: null,
  activeSection: resolveInitialSection(),
  overviewLoading: false,
  overviewError: "",
  overview: null,
  salesLoading: false,
  salesError: "",
  salesRangeError: "",
  salesParams: { mode: "preset", days: 30, startDate: "", endDate: "" },
  sales: null,
};

function resolveInitialSection() {
  const hash = (window.location.hash || "").replace(/^#/, "").trim();
  if (ADMIN_NAV_ITEMS.some((item) => item.key === hash)) {
    return hash;
  }
  return "overview";
}

function formatCount(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US").format(num);
}

function formatTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replaceAll(`{${key}}`, String(val)),
    template
  );
}

function formatShortChartDate(isoDate, lang) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return isoDate;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function getOrderStatusTextClass(status) {
  if (status === "delivered") return "admin-status-text--success";
  if (status === "cancelled") return "admin-status-text--danger";
  if (status === "confirmed" || status === "processing" || status === "shipped") {
    return "admin-status-text--active";
  }
  return "admin-status-text--pending";
}

function renderOverviewSkeleton(mainEl) {
  const lang = getLanguage();
  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("admin.overviewKicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("admin.overviewTitle", lang))}</h1>
      </div>
    </div>
    <div class="admin-kpi-grid" aria-busy="true">
      ${Array.from({ length: 4 })
        .map(
          () => `
        <div class="admin-stat-card">
          <div class="admin-skeleton" style="width: 45%; height: 14px;"></div>
          <div class="admin-skeleton" style="width: 70%; height: 30px;"></div>
          <div class="admin-skeleton" style="width: 90%; height: 12px;"></div>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="admin-panel" aria-busy="true">
      <div class="admin-skeleton" style="width: 200px; height: 22px;"></div>
      <div class="admin-skeleton" style="width: 100%; height: 240px;"></div>
    </div>
  `;
}

function buildSalesChartHtml(sales, lang) {
  const daily = Array.isArray(sales?.dailySales) ? sales.dailySales : [];
  if (daily.length === 0) {
    return `
      <div class="admin-state-box admin-state-box--inline">
        <strong class="admin-state-box__title">${escapeHtml(t("admin.chartEmptyTitle", lang))}</strong>
        <p class="admin-state-box__desc">${escapeHtml(t("admin.chartEmptyDesc", lang))}</p>
      </div>
    `;
  }

  const svgWidth = 860;
  const svgHeight = 260;
  const padLeft = 64;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxRev = Math.max(...daily.map((d) => Number(d.revenue) || 0), 0);
  const yCeiling = maxRev > 0 ? maxRev * 1.15 : 100;

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const gridHtml = gridTicks
    .map((ratio) => {
      const y = padTop + plotH - ratio * plotH;
      const tickVal = Math.round(yCeiling * ratio);
      return `
        <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${svgWidth - padRight}" y2="${y.toFixed(1)}" class="admin-chart-gridline" />
        <text x="${padLeft - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="admin-chart-axis-text">${escapeHtml(formatCount(tickVal))}</text>
      `;
    })
    .join("");

  const slotW = plotW / daily.length;
  const barW = Math.max(4, Math.min(28, slotW * 0.62));
  const labelEvery = daily.length <= 10 ? 1 : Math.ceil(daily.length / 7);

  const barsHtml = daily
    .map((point, idx) => {
      const rev = Number(point.revenue) || 0;
      const ratio = yCeiling > 0 ? rev / yCeiling : 0;
      const barH = rev > 0 ? Math.max(4, ratio * plotH) : 3;
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const y = padTop + plotH - barH;
      const showLabel = idx === 0 || idx === daily.length - 1 || idx % labelEvery === 0;
      const labelX = padLeft + idx * slotW + slotW / 2;

      return `
        <g>
          <rect
            class="admin-chart-bar ${rev <= 0 ? "admin-chart-bar--zero" : ""}"
            x="${x.toFixed(1)}"
            y="${y.toFixed(1)}"
            width="${barW.toFixed(1)}"
            height="${barH.toFixed(1)}"
            rx="1"
            tabindex="0"
            data-chart-date="${escapeHtml(point.date)}"
            data-chart-rev="${escapeHtml(String(rev))}"
            data-chart-orders="${escapeHtml(String(point.paidOrdersCount))}"
            aria-label="${escapeHtml(`${point.date}: ${formatPriceEGP(rev, lang)}`)}"
          />
          ${
            showLabel
              ? `<text x="${labelX.toFixed(1)}" y="${svgHeight - 10}" text-anchor="middle" class="admin-chart-axis-text">${escapeHtml(formatShortChartDate(point.date, lang))}</text>`
              : ""
          }
        </g>
      `;
    })
    .join("");

  const hasZeroPaid = Number(sales?.summary?.totalPaidOrders ?? 0) === 0;

  return `
    <div class="admin-chart-wrap" dir="ltr">
      <div class="admin-chart-tooltip" id="admin-chart-tooltip" hidden></div>
      <svg
        class="admin-chart-svg"
        viewBox="0 0 ${svgWidth} ${svgHeight}"
        role="img"
        aria-label="${escapeHtml(t("admin.salesHeading", lang))}"
      >
        ${gridHtml}
        ${barsHtml}
      </svg>
      ${
        hasZeroPaid
          ? `
        <div class="admin-chart-empty-banner" dir="${lang === "ar" ? "rtl" : "ltr"}">
          <strong>${escapeHtml(t("admin.chartEmptyTitle", lang))}</strong>
          <span>${escapeHtml(t("admin.chartEmptyDesc", lang))}</span>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function bindChartTooltips(container, lang) {
  const tooltip = document.getElementById("admin-chart-tooltip");
  if (!container || !tooltip) return;

  const showTip = (barEl) => {
    const date = barEl.getAttribute("data-chart-date") || "";
    const rev = Number(barEl.getAttribute("data-chart-rev") || 0);
    const ordersCount = Number(barEl.getAttribute("data-chart-orders") || 0);
    tooltip.innerHTML = `
      <strong class="tabular-nums">${escapeHtml(formatShortChartDate(date, lang))} (${escapeHtml(date)})</strong>
      <span class="tabular-nums">${escapeHtml(formatPriceEGP(rev, lang))} · ${escapeHtml(
      formatTemplate(t("admin.chartTooltipOrders", lang), { count: formatCount(ordersCount) })
    )}</span>
    `;
    tooltip.hidden = false;
  };

  const hideTip = () => {
    tooltip.hidden = true;
  };

  container.querySelectorAll("[data-chart-date]").forEach((bar) => {
    bar.addEventListener("mouseenter", () => showTip(bar));
    bar.addEventListener("focus", () => showTip(bar));
    bar.addEventListener("mouseleave", hideTip);
    bar.addEventListener("blur", hideTip);
  });
}

function renderOverviewSection(mainEl) {
  const lang = getLanguage();

  if (state.overviewLoading && !state.overview) {
    renderOverviewSkeleton(mainEl);
    return;
  }

  if (state.overviewError && !state.overview) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("admin.overviewKicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("admin.overviewTitle", lang))}</h1>
        </div>
      </div>
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("admin.errorTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(state.overviewError)}</p>
        <div class="admin-state-actions">
          <button type="button" class="btn btn--primary" id="admin-overview-retry">
            ${escapeHtml(t("admin.errorRetry", lang))}
          </button>
        </div>
      </div>
    `;
    document.getElementById("admin-overview-retry")?.addEventListener("click", () => {
      void loadDashboardData();
    });
    return;
  }

  const ov = state.overview || {
    orders: { total: 0, pending: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
    customers: { totalRegistered: 0 },
    products: { total: 0, published: 0, active: 0 },
    inventory: { activeVariants: 0, lowStockVariants: 0, outOfStockVariants: 0 },
    revenue: { totalCollected: 0, currentMonth: 0, previousMonth: 0, paidOrdersCount: 0 },
    recentOrders: [],
    bestSellingProducts: [],
  };

  const rangeStartVal = state.salesParams.startDate || state.sales?.range?.startDate || "";
  const rangeEndVal = state.salesParams.endDate || state.sales?.range?.endDate || "";
  const activePreset = state.salesParams.mode === "preset" ? state.salesParams.days : 0;

  const salesSummary = state.sales?.summary || {
    totalRevenue: 0,
    totalPaidOrders: 0,
    averageDailyRevenue: 0,
    peakDay: null,
  };

  const recentOrders = Array.isArray(ov.recentOrders) ? ov.recentOrders : [];
  const bestSellers = Array.isArray(ov.bestSellingProducts) ? ov.bestSellingProducts : [];

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("admin.overviewKicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("admin.overviewTitle", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("admin.overviewSubtitle", lang))}</p>
      </div>
      <button
        type="button"
        class="btn btn--secondary btn--sm"
        id="admin-refresh-btn"
        ${state.overviewLoading || state.salesLoading ? "disabled" : ""}
      >
        ${escapeHtml(
          state.overviewLoading || state.salesLoading
            ? t("admin.refreshing", lang)
            : t("admin.refreshBtn", lang)
        )}
      </button>
    </div>

    <section class="admin-kpi-grid" aria-label="${escapeHtml(t("admin.overviewTitle", lang))}">
      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("admin.kpiCollectedRevenue", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatPriceEGP(ov.revenue.totalCollected, lang))}</strong>
        <p class="admin-stat-card__meta">
          ${escapeHtml(formatTemplate(t("admin.kpiPaidOrdersCount", lang), { count: formatCount(ov.revenue.paidOrdersCount) }))}
          · ${escapeHtml(t("admin.kpiExcludesPendingCod", lang))}
        </p>
      </article>

      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("admin.kpiCurrentMonthRevenue", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatPriceEGP(ov.revenue.currentMonth, lang))}</strong>
        <p class="admin-stat-card__meta tabular-nums">
          ${escapeHtml(
            formatTemplate(t("admin.kpiPreviousMonthCompare", lang), {
              amount: formatPriceEGP(ov.revenue.previousMonth, lang),
            })
          )}
        </p>
      </article>

      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("admin.kpiTotalOrders", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(ov.orders.total))}</strong>
        <p class="admin-stat-card__meta tabular-nums">
          ${escapeHtml(
            formatTemplate(t("admin.kpiOrdersBreakdown", lang), {
              pending: formatCount(ov.orders.pending),
              confirmed: formatCount(ov.orders.confirmed),
              delivered: formatCount(ov.orders.delivered),
              cancelled: formatCount(ov.orders.cancelled),
            })
          )}
        </p>
      </article>

      <article class="admin-stat-card">
        <span class="admin-stat-card__label">${escapeHtml(t("admin.kpiCustomersCatalog", lang))}</span>
        <strong class="admin-stat-card__value tabular-nums">${escapeHtml(formatCount(ov.customers.totalRegistered))}</strong>
        <p class="admin-stat-card__meta tabular-nums">
          ${escapeHtml(
            formatTemplate(t("admin.kpiCatalogSummary", lang), {
              published: formatCount(ov.products.published),
              active: formatCount(ov.products.active),
            })
          )}
        </p>
      </article>
    </section>

    <section class="admin-ops-grid">
      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("admin.orderStatusHeading", lang))}</h2>
        </div>
        <div class="admin-mini-grid">
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusPending", lang))}</span>
            <strong class="admin-mini-metric__value admin-mini-metric__value--warn tabular-nums">${escapeHtml(formatCount(ov.orders.pending))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusConfirmed", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.orders.confirmed))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusProcessing", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.orders.processing))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusShipped", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.orders.shipped))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusDelivered", lang))}</span>
            <strong class="admin-mini-metric__value admin-mini-metric__value--success tabular-nums">${escapeHtml(formatCount(ov.orders.delivered))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.statusCancelled", lang))}</span>
            <strong class="admin-mini-metric__value admin-mini-metric__value--danger tabular-nums">${escapeHtml(formatCount(ov.orders.cancelled))}</strong>
          </div>
        </div>
      </article>

      <article class="admin-panel">
        <div class="admin-panel__head">
          <div>
            <h2 class="admin-panel__title">${escapeHtml(t("admin.inventoryHealthHeading", lang))}</h2>
            <p class="admin-panel__subtitle">${escapeHtml(t("admin.reservedNote", lang))}</p>
          </div>
        </div>
        <div class="admin-mini-grid">
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.publishedProducts", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.products.published))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.activeProducts", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.products.active))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.activeVariants", lang))}</span>
            <strong class="admin-mini-metric__value tabular-nums">${escapeHtml(formatCount(ov.inventory.activeVariants))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.lowStockVariants", lang))}</span>
            <strong class="admin-mini-metric__value admin-mini-metric__value--warn tabular-nums">${escapeHtml(formatCount(ov.inventory.lowStockVariants))}</strong>
          </div>
          <div class="admin-mini-metric">
            <span class="admin-mini-metric__label">${escapeHtml(t("admin.outOfStockVariants", lang))}</span>
            <strong class="admin-mini-metric__value admin-mini-metric__value--danger tabular-nums">${escapeHtml(formatCount(ov.inventory.outOfStockVariants))}</strong>
          </div>
        </div>
      </article>
    </section>

    <section class="admin-panel" aria-label="${escapeHtml(t("admin.salesHeading", lang))}">
      <div class="admin-panel__head">
        <div>
          <h2 class="admin-panel__title">${escapeHtml(t("admin.salesHeading", lang))}</h2>
          <p class="admin-panel__subtitle">${escapeHtml(t("admin.salesSubtitle", lang))}</p>
        </div>

        <div class="admin-sales-controls">
          <div class="admin-segmented" role="group" aria-label="${escapeHtml(t("admin.salesHeading", lang))}">
            ${[
              { days: 7, key: "admin.preset7d" },
              { days: 30, key: "admin.preset30d" },
              { days: 90, key: "admin.preset90d" },
            ]
              .map(
                (preset) => `
              <button
                type="button"
                class="admin-segmented__btn ${activePreset === preset.days ? "is-active" : ""}"
                data-sales-days="${preset.days}"
              >
                ${escapeHtml(t(preset.key, lang))}
              </button>
            `
              )
              .join("")}
          </div>

          <form class="admin-date-range-form" id="admin-sales-range-form">
            <div class="admin-date-field">
              <label for="admin-sales-start">${escapeHtml(t("admin.startDateLabel", lang))}</label>
              <input id="admin-sales-start" type="date" value="${escapeHtml(rangeStartVal)}" required />
            </div>
            <div class="admin-date-field">
              <label for="admin-sales-end">${escapeHtml(t("admin.endDateLabel", lang))}</label>
              <input id="admin-sales-end" type="date" value="${escapeHtml(rangeEndVal)}" required />
            </div>
            <button type="submit" class="btn btn--primary btn--sm">
              ${escapeHtml(t("admin.applyRangeBtn", lang))}
            </button>
          </form>
        </div>
      </div>

      ${
        state.salesRangeError
          ? `<p class="text-muted" style="color: var(--color-danger); font-size: var(--text-xs);" role="alert">${escapeHtml(state.salesRangeError)}</p>`
          : ""
      }

      <div class="admin-sales-summary">
        <div class="admin-sales-summary__item">
          <span class="admin-sales-summary__label">${escapeHtml(t("admin.periodRevenue", lang))}</span>
          <strong class="admin-sales-summary__val tabular-nums">${escapeHtml(formatPriceEGP(salesSummary.totalRevenue, lang))}</strong>
        </div>
        <div class="admin-sales-summary__item">
          <span class="admin-sales-summary__label">${escapeHtml(t("admin.periodPaidOrders", lang))}</span>
          <strong class="admin-sales-summary__val tabular-nums">${escapeHtml(formatCount(salesSummary.totalPaidOrders))}</strong>
        </div>
        <div class="admin-sales-summary__item">
          <span class="admin-sales-summary__label">${escapeHtml(t("admin.dailyAverage", lang))}</span>
          <strong class="admin-sales-summary__val tabular-nums">${escapeHtml(formatPriceEGP(salesSummary.averageDailyRevenue, lang))}</strong>
        </div>
        <div class="admin-sales-summary__item">
          <span class="admin-sales-summary__label">${escapeHtml(t("admin.peakDay", lang))}</span>
          <strong class="admin-sales-summary__val tabular-nums">${
            salesSummary.peakDay
              ? `${escapeHtml(formatPriceEGP(salesSummary.peakDay.revenue, lang))} (${escapeHtml(formatShortChartDate(salesSummary.peakDay.date, lang))})`
              : escapeHtml(t("admin.noPeakYet", lang))
          }</strong>
        </div>
      </div>

      <div id="admin-sales-chart-slot">
        ${
          state.salesLoading
            ? '<div class="admin-skeleton" style="width: 100%; height: 260px;"></div>'
            : state.salesError
            ? `
              <div class="admin-state-box admin-state-box--inline">
                <strong class="admin-state-box__title">${escapeHtml(t("admin.salesErrorTitle", lang))}</strong>
                <p class="admin-state-box__desc">${escapeHtml(state.salesError)}</p>
                <div class="admin-state-actions">
                  <button type="button" class="btn btn--secondary btn--sm" id="admin-sales-retry">
                    ${escapeHtml(t("admin.errorRetry", lang))}
                  </button>
                </div>
              </div>
            `
            : buildSalesChartHtml(state.sales, lang)
        }
      </div>
    </section>

    <section class="admin-data-grid">
      <article class="admin-panel">
        <div class="admin-panel__head">
          <div>
            <h2 class="admin-panel__title">${escapeHtml(t("admin.recentOrdersHeading", lang))}</h2>
            <p class="admin-panel__subtitle">${escapeHtml(t("admin.recentOrdersSubtitle", lang))}</p>
          </div>
        </div>

        ${
          recentOrders.length === 0
            ? `
          <div class="admin-state-box admin-state-box--inline">
            <strong class="admin-state-box__title">${escapeHtml(t("admin.noOrdersTitle", lang))}</strong>
            <p class="admin-state-box__desc">${escapeHtml(t("admin.noOrdersDesc", lang))}</p>
          </div>
        `
            : `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t("admin.colOrderNumber", lang))}</th>
                  <th>${escapeHtml(t("admin.colCustomer", lang))}</th>
                  <th>${escapeHtml(t("admin.colOrderStatus", lang))}</th>
                  <th>${escapeHtml(t("admin.colPayment", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("admin.colTotal", lang))}</th>
                  <th>${escapeHtml(t("admin.colDate", lang))}</th>
                </tr>
              </thead>
              <tbody>
                ${recentOrders
                  .map(
                    (order) => `
                  <tr>
                    <td class="tabular-nums"><strong>${escapeHtml(order.orderNumber)}</strong></td>
                    <td>${escapeHtml(order.customerName)}</td>
                    <td>
                      <span class="admin-status-text ${escapeHtml(getOrderStatusTextClass(order.orderStatus))}">
                        ${escapeHtml(localizeOrderStatus(order.orderStatus, lang))}
                      </span>
                    </td>
                    <td>${escapeHtml(localizePaymentStatus(order.paymentStatus, lang))}</td>
                    <td class="admin-table__num">${escapeHtml(formatPriceEGP(order.totalAmount, lang))}</td>
                    <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(order.createdAt, lang))}</td>
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

      <article class="admin-panel">
        <div class="admin-panel__head">
          <div>
            <h2 class="admin-panel__title">${escapeHtml(t("admin.bestSellersHeading", lang))}</h2>
            <p class="admin-panel__subtitle">${escapeHtml(t("admin.bestSellersSubtitle", lang))}</p>
          </div>
        </div>

        ${
          bestSellers.length === 0
            ? `
          <div class="admin-state-box admin-state-box--inline">
            <strong class="admin-state-box__title">${escapeHtml(t("admin.noBestSellersTitle", lang))}</strong>
            <p class="admin-state-box__desc">${escapeHtml(t("admin.noBestSellersDesc", lang))}</p>
          </div>
        `
            : `
          <div class="admin-bestsellers-list">
            ${bestSellers
              .map((item, idx) => {
                const title =
                  lang === "ar"
                    ? item.name_ar || item.name_en
                    : item.name_en || item.name_ar;
                return `
                  <div class="admin-bestseller-row">
                    <div>
                      <div class="admin-bestseller-row__title">${idx + 1}. ${escapeHtml(title)}</div>
                      <div class="admin-bestseller-row__meta tabular-nums">
                        ${escapeHtml(
                          formatTemplate(t("admin.unitsSoldLabel", lang), {
                            count: formatCount(item.unitsSold),
                          })
                        )}
                      </div>
                    </div>
                    <strong class="admin-bestseller-row__revenue tabular-nums">
                      ${escapeHtml(formatPriceEGP(item.revenue, lang))}
                    </strong>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
        }
      </article>
    </section>
  `;

  document.getElementById("admin-refresh-btn")?.addEventListener("click", () => {
    void loadDashboardData();
  });

  mainEl.querySelectorAll("[data-sales-days]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = Number(btn.getAttribute("data-sales-days") || 30);
      state.salesRangeError = "";
      state.salesParams = { mode: "preset", days, startDate: "", endDate: "" };
      void loadSalesData();
    });
  });

  document.getElementById("admin-sales-range-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const startInput = document.getElementById("admin-sales-start");
    const endInput = document.getElementById("admin-sales-end");
    const startDate = startInput?.value || "";
    const endDate = endInput?.value || "";
    const diffDays =
      startDate && endDate
        ? Math.floor(
            (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
              86_400_000
          ) + 1
        : 0;

    if (!startDate || !endDate || startDate > endDate || diffDays > 366) {
      state.salesRangeError = t("admin.invalidRangeError", getLanguage());
      renderCurrentView();
      return;
    }

    state.salesRangeError = "";
    state.salesParams = { mode: "custom", days: diffDays, startDate, endDate };
    void loadSalesData();
  });

  document.getElementById("admin-sales-retry")?.addEventListener("click", () => {
    void loadSalesData();
  });

  bindChartTooltips(document.getElementById("admin-sales-chart-slot"), lang);
}

function renderCurrentView() {
  const rootEl = document.getElementById("admin-app-shell");
  if (!rootEl) return;

  if (state.authStatus === "checking") {
    renderAdminAuthLoading(rootEl);
    return;
  }

  if (state.authStatus === "forbidden") {
    renderAdminAccessDenied(rootEl, { onSignOut: signOutAdmin });
    return;
  }

  const handleSectionSelect = (sectionKey) => {
    if (sectionKey === "products" && state.activeSection === "products") {
      resetProductsLoadState();
    } else if (sectionKey === "categories" && state.activeSection === "categories") {
      resetCategoriesLoadState();
    } else if (sectionKey === "collections" && state.activeSection === "collections") {
      resetCollectionsLoadState();
    } else if (sectionKey === "inventory" && state.activeSection === "inventory") {
      resetInventoryLoadState();
    } else if (sectionKey === "orders" && state.activeSection === "orders") {
      resetOrdersLoadState();
    } else if (sectionKey === "customers" && state.activeSection === "customers") {
      resetCustomersLoadState();
    } else if (sectionKey === "coupons" && state.activeSection === "coupons") {
      resetCouponsLoadState();
    } else if (sectionKey === "shipping" && state.activeSection === "shipping") {
      resetShippingLoadState();
    } else if (sectionKey === "settings" && state.activeSection === "settings") {
      resetSettingsLoadState();
    }
    state.activeSection = sectionKey;
    if (window.location.hash !== `#${sectionKey}`) {
      window.history.replaceState(null, "", `#${sectionKey}`);
    }
    renderCurrentView();
  };

  const handleCatalogAuthError = async () => {
    const authCheck = await verifyAdminAccess();
    state.authStatus = authCheck.status;
    state.adminUser = authCheck.admin;
    renderCurrentView();
  };

  const mainEl = renderAdminShell(rootEl, {
    admin: state.adminUser,
    activeSection: state.activeSection,
    onSelectSection: handleSectionSelect,
    onSignOut: signOutAdmin,
    onAuthError: handleCatalogAuthError,
    onOpenNotification: (orderId) => {
      state.activeSection = "orders";
      if (window.location.hash !== "#orders") {
        window.history.replaceState(null, "", "#orders");
      }
      openAdminOrderDetailView(orderId, {
        onAuthError: handleCatalogAuthError,
        onRender: renderCurrentView,
      });
    },
  });

  if (!mainEl) return;

  if (state.activeSection === "overview") {
    renderOverviewSection(mainEl);
  } else if (state.activeSection === "products") {
    renderProductsSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
      onNavigateSection: handleSectionSelect,
    });
  } else if (state.activeSection === "categories") {
    renderCategoriesSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else if (state.activeSection === "collections") {
    renderCollectionsSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else if (state.activeSection === "inventory") {
    renderInventorySection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else if (state.activeSection === "orders") {
    renderOrdersSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else if (state.activeSection === "customers") {
    renderCustomersSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
      onOpenOrder: (orderId) => {
        state.activeSection = "orders";
        if (window.location.hash !== "#orders") {
          window.history.replaceState(null, "", "#orders");
        }
        openAdminOrderDetailView(orderId, {
          onAuthError: handleCatalogAuthError,
          onRender: renderCurrentView,
        });
      },
    });
  } else if (state.activeSection === "coupons") {
    renderCouponsSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
      onOpenOrder: (orderId) => {
        state.activeSection = "orders";
        if (window.location.hash !== "#orders") {
          window.history.replaceState(null, "", "#orders");
        }
        openAdminOrderDetailView(orderId, {
          onAuthError: handleCatalogAuthError,
          onRender: renderCurrentView,
        });
      },
    });
  } else if (state.activeSection === "shipping") {
    renderShippingSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else if (state.activeSection === "settings") {
    renderSettingsSection(mainEl, {
      onAuthError: handleCatalogAuthError,
      onRender: renderCurrentView,
    });
  } else {
    renderUpcomingSection(mainEl, state.activeSection, {
      onBackToOverview: () => handleSectionSelect("overview"),
    });
  }
}

async function loadSalesData() {
  state.salesLoading = true;
  state.salesError = "";
  renderCurrentView();

  try {
    state.sales = await fetchAdminDashboardSales(
      state.salesParams.mode === "custom"
        ? {
            startDate: state.salesParams.startDate,
            endDate: state.salesParams.endDate,
          }
        : { days: state.salesParams.days }
    );
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      const authCheck = await verifyAdminAccess();
      state.authStatus = authCheck.status;
      state.adminUser = authCheck.admin;
    } else {
      state.salesError = err?.message || t("admin.salesErrorTitle", getLanguage());
    }
  } finally {
    state.salesLoading = false;
    renderCurrentView();
  }
}

async function loadDashboardData() {
  state.overviewLoading = true;
  state.salesLoading = true;
  state.overviewError = "";
  state.salesError = "";
  renderCurrentView();

  const [overviewRes, salesRes] = await Promise.allSettled([
    fetchAdminDashboardOverview(),
    fetchAdminDashboardSales(
      state.salesParams.mode === "custom"
        ? {
            startDate: state.salesParams.startDate,
            endDate: state.salesParams.endDate,
          }
        : { days: state.salesParams.days }
    ),
  ]);

  if (overviewRes.status === "fulfilled") {
    state.overview = overviewRes.value;
  } else {
    const err = overviewRes.reason;
    if (err && (err.status === 401 || err.status === 403)) {
      const authCheck = await verifyAdminAccess();
      state.authStatus = authCheck.status;
      state.adminUser = authCheck.admin;
    } else {
      state.overviewError = err?.message || t("admin.errorTitle", getLanguage());
    }
  }

  if (salesRes.status === "fulfilled") {
    state.sales = salesRes.value;
  } else {
    const err = salesRes.reason;
    if (!err || (err.status !== 401 && err.status !== 403)) {
      state.salesError = err?.message || t("admin.salesErrorTitle", getLanguage());
    }
  }

  state.overviewLoading = false;
  state.salesLoading = false;
  renderCurrentView();
}

document.addEventListener("DOMContentLoaded", async () => {
  renderCurrentView();

  try {
    const authResult = await verifyAdminAccess();
    if (authResult.status === "unauthenticated") return;

    state.authStatus = authResult.status;
    state.adminUser = authResult.admin;

    if (state.authStatus === "authorized") {
      await loadDashboardData();
    } else {
      renderCurrentView();
    }
  } catch (err) {
    state.authStatus = "authorized";
    state.overviewError = err?.message || t("admin.errorTitle", getLanguage());
    renderCurrentView();
  }
});

window.addEventListener("zain:langchange", () => {
  renderCurrentView();
});
