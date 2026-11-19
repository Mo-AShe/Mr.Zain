/**
 * MR. ZAIN — Authenticated Customer Order Tracking Controller
 * Looks up customer-owned orders safely via /api/v1/orders and /api/v1/orders/:id.
 */

import { initLayout } from "../components/layout.js";
import {
  buildOrderDetailElement,
  formatOrderDate,
  getOrderStatusClass,
  localizeOrderStatus,
} from "../components/order-view.js";
import {
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { fetchOrderById, fetchOrders } from "../services/order-service.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";

let searchDraft = "";
let ordersList = [];
let selectedOrder = null;
let loadError = null;
let isLoadingDetail = false;

async function loadTrackingData(orderNumber = "") {
  const root = document.getElementById("order-tracking-root");
  loadError = null;
  if (root) renderLoadingState(root, 2);

  try {
    const res = await fetchOrders({
      page: 1,
      limit: 10,
      ...(orderNumber ? { orderNumber } : {}),
    });
    ordersList = Array.isArray(res?.orders) ? res.orders : [];

    if (ordersList.length > 0) {
      selectedOrder = await fetchOrderById(ordersList[0].id);
    } else {
      selectedOrder = null;
    }
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth();
      return;
    }
    loadError = err;
  }

  renderTrackingView();
}

async function selectOrderForTracking(orderId) {
  isLoadingDetail = true;
  renderTrackingView();
  try {
    selectedOrder = await fetchOrderById(orderId);
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth();
      return;
    }
  } finally {
    isLoadingDetail = false;
    renderTrackingView();
  }
}

function renderTrackingView() {
  const root = document.getElementById("order-tracking-root");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  if (loadError) {
    renderErrorState(root, {
      title: t("orderTracking.errorTitle", lang),
      onRetry: () => loadTrackingData(searchDraft),
    });
    return;
  }

  root.innerHTML = `
    <div class="order-tracking-shell">
      <form id="order-tracking-form" class="order-tracking-search-bar" novalidate>
        <div class="field" style="flex: 1;">
          <label class="field__label" for="tracking-order-input">${escapeHtml(t("orderTracking.searchLabel", lang))}</label>
          <input
            type="text"
            id="tracking-order-input"
            class="input"
            dir="ltr"
            maxlength="40"
            value="${escapeHtml(searchDraft)}"
            placeholder="${escapeHtml(t("orderTracking.searchPlaceholder", lang))}"
          />
        </div>
        <div class="order-tracking-search-actions">
          <button type="submit" class="btn btn--primary">${escapeHtml(t("orderTracking.searchBtn", lang))}</button>
          ${
            searchDraft
              ? `<button type="button" id="tracking-clear-btn" class="btn btn--secondary">${escapeHtml(t("orderTracking.clearBtn", lang))}</button>`
              : ""
          }
        </div>
      </form>

      <div id="order-tracking-results"></div>
    </div>
  `;

  const resultsEl = document.getElementById("order-tracking-results");
  if (ordersList.length === 0) {
    renderEmptyState(resultsEl, {
      title: t("orderTracking.notFoundTitle", lang),
      description: t("orderTracking.notFoundDesc", lang),
      actionLabel: t("account.shopNowBtn", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
  } else {
    resultsEl.innerHTML = `
      <div class="order-tracking-grid">
        <aside class="order-tracking-sidebar">
          <h2 class="order-detail-box__title">${escapeHtml(t("orderTracking.recentHeading", lang))}</h2>
          <div class="order-tracking-list">
            ${ordersList
              .map(
                (ord) => `
                <button
                  type="button"
                  class="order-tracking-list-item ${selectedOrder?.id === ord.id ? "is-active" : ""}"
                  data-track-order="${escapeHtml(ord.id)}"
                >
                  <div class="order-tracking-list-item__top">
                    <strong class="tabular-nums">${escapeHtml(ord.orderNumber)}</strong>
                    <span class="tabular-nums">${escapeHtml(formatPriceEGP(ord.totalAmount, lang))}</span>
                  </div>
                  <div class="order-tracking-list-item__meta">
                    <span class="${escapeHtml(getOrderStatusClass(ord.orderStatus))}">${escapeHtml(localizeOrderStatus(ord.orderStatus, lang))}</span>
                    <span aria-hidden="true">·</span>
                    <span class="tabular-nums">${escapeHtml(formatOrderDate(ord.createdAt, lang))}</span>
                  </div>
                </button>
              `
              )
              .join("")}
          </div>
        </aside>

        <div id="order-tracking-detail-panel"></div>
      </div>
    `;

    const detailPanel = document.getElementById("order-tracking-detail-panel");
    if (isLoadingDetail) {
      renderLoadingState(detailPanel, 1);
    } else if (selectedOrder) {
      detailPanel?.appendChild(buildOrderDetailElement(selectedOrder, lang));
    }
  }

  const input = document.getElementById("tracking-order-input");
  input?.addEventListener("input", () => {
    searchDraft = input.value;
  });

  document.getElementById("order-tracking-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchDraft = (input?.value || "").trim();
    loadTrackingData(searchDraft);
  });

  document.getElementById("tracking-clear-btn")?.addEventListener("click", () => {
    searchDraft = "";
    loadTrackingData("");
  });

  document.querySelectorAll("[data-track-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-track-order");
      if (id && id !== selectedOrder?.id) {
        selectOrderForTracking(id);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("order-tracking-root");
  if (root) renderLoadingState(root, 2);

  const user = await requireCustomerAuth();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  searchDraft = (params.get("orderNumber") || "").trim();

  await loadTrackingData(searchDraft);

  window.addEventListener("zain:langchange", renderTrackingView);
});
