/**
 * MR. ZAIN — Order Confirmation Page Controller
 * Fetches a customer-owned order by ID from /api/v1/orders/:id.
 */

import { initLayout } from "../components/layout.js";
import { buildOrderDetailElement } from "../components/order-view.js";
import {
  openConfirmDialog,
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
  showToast,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { cancelOrder, fetchOrderById } from "../services/order-service.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";

let currentOrder = null;
let loadError = null;
let notFound = false;
let isCancelling = false;

function getOrderIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("id") || "").trim();
}

function renderConfirmationView() {
  const root = document.getElementById("order-confirmation-root");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  if (loadError) {
    renderErrorState(root, {
      title: t("orderConfirmation.errorTitle", lang),
      onRetry: loadConfirmationOrder,
    });
    return;
  }

  if (notFound || !currentOrder) {
    renderEmptyState(root, {
      title: t("orderConfirmation.notFoundTitle", lang),
      description: t("orderConfirmation.notFoundDesc", lang),
      actionLabel: t("orderConfirmation.viewAccountBtn", lang),
      onAction: () => {
        window.location.href = "/pages/account.html";
      },
    });
    return;
  }

  const showCodNotice = currentOrder.orderStatus !== "cancelled";

  root.innerHTML = `
    <div class="order-confirmation-shell">
      ${
        showCodNotice
          ? `
          <div class="order-cod-banner">
            <h2>${escapeHtml(t("orderConfirmation.codNoticeTitle", lang))}</h2>
            <p>${escapeHtml(
              t("orderConfirmation.codNoticeBody", lang).replace(
                "{total}",
                formatPriceEGP(currentOrder.totalAmount, lang)
              )
            )}</p>
          </div>
        `
          : ""
      }

      <div id="order-confirmation-detail-slot"></div>

      <div class="order-confirmation-actions">
        <a href="/pages/account.html" class="btn btn--primary">
          ${escapeHtml(t("orderConfirmation.viewAccountBtn", lang))}
        </a>
        <a href="/pages/order-tracking.html?orderNumber=${encodeURIComponent(currentOrder.orderNumber)}" class="btn btn--secondary">
          ${escapeHtml(t("orderConfirmation.trackOrderBtn", lang))}
        </a>
        <a href="/shop.html" class="btn btn--secondary">
          ${escapeHtml(t("orderConfirmation.continueShoppingBtn", lang))}
        </a>
        ${
          currentOrder.canCancel
            ? `
            <button
              type="button"
              id="confirm-cancel-order-btn"
              class="btn btn--ghost"
              ${isCancelling ? "disabled" : ""}
            >
              ${escapeHtml(t("account.cancelOrderBtn", lang))}
            </button>
          `
            : ""
        }
      </div>
    </div>
  `;

  const slot = document.getElementById("order-confirmation-detail-slot");
  slot?.appendChild(buildOrderDetailElement(currentOrder, lang));

  document.getElementById("confirm-cancel-order-btn")?.addEventListener("click", () => {
    const currentLang = getLanguage();
    openConfirmDialog({
      title: t("account.cancelConfirmTitle", currentLang),
      message: t("account.cancelConfirmMessage", currentLang).replace(
        "{orderNumber}",
        currentOrder.orderNumber
      ),
      confirmLabel: t("account.cancelOrderBtn", currentLang),
      cancelLabel: t("ui.cancel", currentLang),
      onConfirm: async () => {
        if (isCancelling) return;
        isCancelling = true;
        renderConfirmationView();
        try {
          currentOrder = await cancelOrder(currentOrder.id);
          showToast(
            t("account.cancelSuccess", getLanguage()).replace(
              "{orderNumber}",
              currentOrder.orderNumber
            ),
            "info"
          );
        } catch (err) {
          if (err && err.status === 401) {
            redirectToAuth();
            return;
          }
          showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
        } finally {
          isCancelling = false;
          renderConfirmationView();
        }
      },
    });
  });
}

async function loadConfirmationOrder() {
  const root = document.getElementById("order-confirmation-root");
  loadError = null;
  notFound = false;

  const orderId = getOrderIdFromUrl();
  if (!orderId) {
    notFound = true;
    renderConfirmationView();
    return;
  }

  if (root) renderLoadingState(root, 2);

  try {
    currentOrder = await fetchOrderById(orderId);
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth();
      return;
    }
    if (err && (err.status === 404 || err.status === 422)) {
      notFound = true;
    } else {
      loadError = err;
    }
  }

  renderConfirmationView();
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("order-confirmation-root");
  if (root) renderLoadingState(root, 2);

  const user = await requireCustomerAuth();
  if (!user) return;

  await loadConfirmationOrder();

  window.addEventListener("zain:langchange", renderConfirmationView);
});
