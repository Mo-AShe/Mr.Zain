/**
 * MR. ZAIN — Admin Order Management, Fulfillment & COD Payment Controller
 * Backed by /api/v1/admin/orders endpoints.
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
import {
  escapeHtml,
  formatPriceEGP,
  resolveColorMeta,
} from "../utils/formatters.js";
import {
  fetchAdminOrderDetail,
  fetchAdminOrders,
  updateAdminOrderPaymentRequest,
  updateAdminOrderShipmentRequest,
  updateAdminOrderStatusRequest,
} from "./admin.js";

const ordState = {
  loading: false,
  error: "",
  loadedOnce: false,
  orders: [],
  pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
  filters: {
    search: "",
    orderStatus: "all",
    paymentStatus: "all",
    startDate: "",
    endDate: "",
    sort: "newest",
  },
  selectedOrderId: null,
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

function getOrderStatusClass(status) {
  if (status === "delivered") return "admin-status-text--success";
  if (status === "cancelled") return "admin-status-text--danger";
  if (status === "confirmed" || status === "processing" || status === "shipped") {
    return "admin-status-text--active";
  }
  return "admin-status-text--pending";
}

function getPaymentStatusClass(status) {
  if (status === "paid") return "admin-status-text--success";
  if (status === "failed" || status === "cancelled") return "admin-status-text--danger";
  return "admin-status-text--pending";
}

export function resetOrdersLoadState() {
  ordState.selectedOrderId = null;
  ordState.detail = null;
  ordState.detailError = "";
  ordState.loadedOnce = false;
}

export function openAdminOrderDetailView(orderId, { onAuthError, onRender } = {}) {
  void loadAdminOrderDetail(orderId, { onAuthError, onRender });
}

export async function loadAdminOrdersList({ onAuthError, onRender } = {}) {
  ordState.loading = true;
  ordState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const res = await fetchAdminOrders({
      search: ordState.filters.search,
      orderStatus: ordState.filters.orderStatus,
      paymentStatus: ordState.filters.paymentStatus,
      startDate: ordState.filters.startDate,
      endDate: ordState.filters.endDate,
      sort: ordState.filters.sort,
      page: ordState.pagination.page,
      limit: ordState.pagination.limit,
    });

    ordState.orders = Array.isArray(res?.orders) ? res.orders : [];
    ordState.pagination = res?.pagination || {
      page: 1,
      limit: 15,
      total: 0,
      totalPages: 1,
    };
    ordState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    ordState.error = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    ordState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

export async function loadAdminOrderDetail(orderId, { onAuthError, onRender } = {}) {
  ordState.selectedOrderId = orderId;
  ordState.detailLoading = true;
  ordState.detailError = "";
  if (typeof onRender === "function") onRender();

  try {
    ordState.detail = await fetchAdminOrderDetail(orderId);
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    ordState.detailError = err?.message || t("adminOps.common.errorTitle", getLanguage());
  } finally {
    ordState.detailLoading = false;
    if (typeof onRender === "function") onRender();
  }
}

function renderOrderDetailView(mainEl, { onAuthError, onRender }) {
  const lang = getLanguage();

  if (ordState.detailLoading && !ordState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.orders.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.orders.title", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="ord-detail-back">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-panel"><div class="admin-skeleton" style="width: 100%; height: 280px;"></div></div>
    `;
    document.getElementById("ord-detail-back")?.addEventListener("click", () => {
      ordState.selectedOrderId = null;
      ordState.detail = null;
      onRender();
    });
    return;
  }

  if (ordState.detailError || !ordState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.orders.kicker", lang))}</span>
          <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.orders.title", lang))}</h1>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" id="ord-detail-back">${escapeHtml(t("adminOps.common.backBtn", lang))}</button>
      </div>
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(ordState.detailError || "")}</p>
        <button type="button" class="btn btn--primary btn--sm" id="ord-detail-retry">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
      </div>
    `;
    document.getElementById("ord-detail-back")?.addEventListener("click", () => {
      ordState.selectedOrderId = null;
      ordState.detail = null;
      onRender();
    });
    document.getElementById("ord-detail-retry")?.addEventListener("click", () => {
      if (ordState.selectedOrderId) {
        void loadAdminOrderDetail(ordState.selectedOrderId, { onAuthError, onRender });
      }
    });
    return;
  }

  const order = ordState.detail;
  const snap = order.shippingAddressSnapshot || {};
  const addressLines = formatAddressLines(snap, lang);
  const allowedNext = Array.isArray(order.allowedNextStatuses)
    ? order.allowedNextStatuses
    : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const movements = Array.isArray(order.inventoryMovements) ? order.inventoryMovements : [];

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.orders.kicker", lang))}</span>
        <h1 class="admin-page-head__title tabular-nums">
          ${escapeHtml(formatTemplate(t("adminOps.orders.detailTitle", lang), { orderNumber: order.orderNumber }))}
        </h1>
        <p class="admin-page-head__subtitle tabular-nums">
          ${escapeHtml(formatOrderDate(order.createdAt, lang))} ·
          <span class="${escapeHtml(getOrderStatusClass(order.orderStatus))}">${escapeHtml(localizeOrderStatus(order.orderStatus, lang))}</span> ·
          <span class="${escapeHtml(getPaymentStatusClass(order.paymentStatus))}">${escapeHtml(localizePaymentStatus(order.paymentStatus, lang))}</span>
        </p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="ord-detail-refresh">
          ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
        </button>
        <button type="button" class="btn btn--secondary btn--sm" id="ord-detail-back">
          ${escapeHtml(t("adminOps.common.backBtn", lang))}
        </button>
      </div>
    </div>

    <div class="admin-editor-stack">
      <div class="admin-detail-grid">
        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailCustomerHeading", lang))}</h2>
          </div>
          <dl class="admin-info-dl">
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelCustomerName", lang))}</dt>
              <dd>${escapeHtml(order.customer?.fullName || "")}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelEmail", lang))}</dt>
              <dd dir="ltr">${escapeHtml(order.customer?.email || "")}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelPhone", lang))}</dt>
              <dd dir="ltr" class="tabular-nums">${escapeHtml(order.customer?.phone || t("adminOps.common.noneLabel", lang))}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelAccountStatus", lang))}</dt>
              <dd>
                <span class="admin-status-text ${order.customer?.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                  ${escapeHtml(order.customer?.isActive ? t("adminOps.common.activeStatus", lang) : t("adminOps.common.inactiveStatus", lang))}
                </span>
              </dd>
            </div>
          </dl>
        </article>

        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailAddressHeading", lang))}</h2>
          </div>
          <dl class="admin-info-dl">
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelRecipient", lang))}</dt>
              <dd>${escapeHtml(snap.recipientName || "")}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelPhone", lang))}</dt>
              <dd dir="ltr" class="tabular-nums">${escapeHtml(snap.phone || "")}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelAddress", lang))}</dt>
              <dd>${addressLines.map(escapeHtml).join("<br />")}</dd>
            </div>
            ${
              snap.additionalInformation
                ? `<div class="admin-info-row"><dt>${escapeHtml(t("adminOps.orders.labelCustomerNotes", lang))}</dt><dd>${escapeHtml(snap.additionalInformation)}</dd></div>`
                : ""
            }
            ${
              order.customerNotes
                ? `<div class="admin-info-row"><dt>${escapeHtml(t("adminOps.orders.labelCustomerNotes", lang))}</dt><dd>${escapeHtml(order.customerNotes)}</dd></div>`
                : ""
            }
          </dl>
        </article>
      </div>

      <div class="admin-detail-grid">
        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailTotalsHeading", lang))}</h2>
          </div>
          <dl class="admin-info-dl">
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelSubtotal", lang))}</dt>
              <dd class="tabular-nums">${escapeHtml(formatPriceEGP(order.subtotal, lang))}</dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelDiscount", lang))}</dt>
              <dd class="tabular-nums">−${escapeHtml(formatPriceEGP(order.discountAmount, lang))}</dd>
            </div>
            ${
              order.coupon
                ? `<div class="admin-info-row"><dt>${escapeHtml(t("adminOps.orders.labelCoupon", lang))}</dt><dd class="tabular-nums"><strong>${escapeHtml(order.coupon.code)}</strong></dd></div>`
                : ""
            }
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelShipping", lang))}</dt>
              <dd class="tabular-nums">${escapeHtml(formatPriceEGP(order.shippingFee, lang))}</dd>
            </div>
            <div class="admin-info-row">
              <dt><strong>${escapeHtml(t("adminOps.orders.labelTotal", lang))}</strong></dt>
              <dd class="tabular-nums"><strong>${escapeHtml(formatPriceEGP(order.totalAmount, lang))}</strong></dd>
            </div>
            <div class="admin-info-row">
              <dt>${escapeHtml(t("adminOps.orders.labelPaymentMethod", lang))}</dt>
              <dd>${escapeHtml(t("orders.methodCod", lang))} · <span class="${escapeHtml(getPaymentStatusClass(order.paymentStatus))}">${escapeHtml(localizePaymentStatus(order.paymentStatus, lang))}</span></dd>
            </div>
            ${
              order.payment?.transactionReference
                ? `<div class="admin-info-row"><dt>${escapeHtml(t("adminOps.orders.labelTransactionRef", lang))}</dt><dd class="tabular-nums">${escapeHtml(order.payment.transactionReference)}</dd></div>`
                : ""
            }
          </dl>
        </article>

        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailLifecycleHeading", lang))}</h2>
          </div>
          <div class="admin-action-stack">
            ${
              allowedNext.length === 0
                ? `<div class="admin-notice">${escapeHtml(
                    formatTemplate(t("adminOps.orders.noTransitionsNotice", lang), {
                      status: localizeOrderStatus(order.orderStatus, lang),
                    })
                  )}</div>`
                : `
                <form id="ord-status-form" class="admin-form">
                  <div class="field">
                    <label class="field__label" for="ord-next-status">${escapeHtml(t("adminOps.orders.nextStatusLabel", lang))}</label>
                    <select id="ord-next-status" class="select">
                      ${allowedNext
                        .map(
                          (st) =>
                            `<option value="${escapeHtml(st)}">${escapeHtml(localizeOrderStatus(st, lang))}</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                  <div id="ord-ship-inline-fields" class="admin-form-grid" hidden>
                    <div class="field">
                      <label class="field__label" for="ord-inline-carrier">${escapeHtml(t("adminOps.orders.labelCarrier", lang))}</label>
                      <input id="ord-inline-carrier" class="input" maxlength="100" value="${escapeHtml(order.shippingCarrier || "")}" placeholder="${escapeHtml(t("adminOps.orders.carrierPlaceholder", lang))}" />
                    </div>
                    <div class="field">
                      <label class="field__label" for="ord-inline-tracking">${escapeHtml(t("adminOps.orders.labelTrackingNumber", lang))}</label>
                      <input id="ord-inline-tracking" class="input tabular-nums" maxlength="120" value="${escapeHtml(order.trackingNumber || "")}" placeholder="${escapeHtml(t("adminOps.orders.trackingPlaceholder", lang))}" />
                    </div>
                  </div>
                  <div class="field">
                    <label class="field__label" for="ord-status-note">${escapeHtml(t("adminOps.orders.detailTimelineHeading", lang))}</label>
                    <input id="ord-status-note" class="input" maxlength="500" placeholder="${escapeHtml(t("adminOps.orders.notePlaceholder", lang))}" />
                  </div>
                  <div>
                    <button type="submit" class="btn btn--primary btn--sm" ${ordState.actionBusy ? "disabled" : ""}>
                      ${escapeHtml(t("adminOps.orders.updateStatusBtn", lang))}
                    </button>
                  </div>
                </form>
              `
            }
          </div>
        </article>
      </div>

      <div class="admin-detail-grid">
        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailShipmentHeading", lang))}</h2>
            ${
              order.shippedAt
                ? `<span class="text-muted tabular-nums" style="font-size: var(--text-xs);">${escapeHtml(t("adminOps.orders.labelShippedAt", lang))}: ${escapeHtml(formatOrderDate(order.shippedAt, lang))}</span>`
                : ""
            }
          </div>
          ${
            order.orderStatus === "cancelled"
              ? `<div class="admin-notice">${escapeHtml(t("adminOps.orders.shipmentCancelledNotice", lang))}</div>`
              : `
              <form id="ord-shipment-form" class="admin-form">
                <div class="admin-form-grid">
                  <div class="field">
                    <label class="field__label" for="ord-carrier-input">${escapeHtml(t("adminOps.orders.labelCarrier", lang))}</label>
                    <input id="ord-carrier-input" class="input" maxlength="100" required value="${escapeHtml(order.shippingCarrier || "")}" placeholder="${escapeHtml(t("adminOps.orders.carrierPlaceholder", lang))}" />
                  </div>
                  <div class="field">
                    <label class="field__label" for="ord-tracking-input">${escapeHtml(t("adminOps.orders.labelTrackingNumber", lang))}</label>
                    <input id="ord-tracking-input" class="input tabular-nums" maxlength="120" required value="${escapeHtml(order.trackingNumber || "")}" placeholder="${escapeHtml(t("adminOps.orders.trackingPlaceholder", lang))}" />
                  </div>
                </div>
                <div>
                  <button type="submit" class="btn btn--secondary btn--sm" ${ordState.actionBusy ? "disabled" : ""}>
                    ${escapeHtml(t("adminOps.orders.saveShipmentBtn", lang))}
                  </button>
                </div>
              </form>
            `
          }
        </article>

        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailPaymentHeading", lang))}</h2>
          </div>
          ${
            order.orderStatus === "cancelled"
              ? `<div class="admin-notice">${escapeHtml(t("adminOps.orders.paymentCancelledNotice", lang))}</div>`
              : order.paymentStatus === "paid"
              ? `
                <div class="admin-action-stack">
                  <div class="admin-notice">${escapeHtml(t("adminOps.orders.paymentPaidNotice", lang))}</div>
                  <div>
                    <button type="button" class="btn btn--secondary btn--sm" id="ord-mark-refunded-btn" ${ordState.actionBusy ? "disabled" : ""}>
                      ${escapeHtml(t("adminOps.orders.markRefundedBtn", lang))}
                    </button>
                  </div>
                </div>
              `
              : order.paymentStatus === "refunded"
              ? `<div class="admin-notice">${escapeHtml(localizePaymentStatus("refunded", lang))}</div>`
              : `
                <div class="admin-form">
                  <div class="field">
                    <label class="field__label" for="ord-tx-ref">${escapeHtml(t("adminOps.orders.labelTransactionRef", lang))}</label>
                    <input id="ord-tx-ref" class="input tabular-nums" maxlength="255" value="${escapeHtml(order.payment?.transactionReference || "")}" placeholder="${escapeHtml(t("adminOps.orders.txRefPlaceholder", lang))}" />
                  </div>
                  <div class="admin-row-actions" style="justify-content: flex-start;">
                    <button type="button" class="btn btn--primary btn--sm" id="ord-confirm-cod-btn" ${ordState.actionBusy ? "disabled" : ""}>
                      ${escapeHtml(t("adminOps.orders.confirmCodPaidBtn", lang))}
                    </button>
                    ${
                      order.paymentStatus === "pending"
                        ? `<button type="button" class="btn btn--danger btn--sm" id="ord-mark-failed-btn" ${ordState.actionBusy ? "disabled" : ""}>
                            ${escapeHtml(t("adminOps.orders.markPaymentFailedBtn", lang))}
                          </button>`
                        : ""
                    }
                  </div>
                </div>
              `
          }
        </article>
      </div>

      <article class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailItemsHeading", lang))} (${escapeHtml(formatCount(order.itemCount))})</h2>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("admin.navProducts", lang))}</th>
                <th>${escapeHtml(t("adminOps.inventory.colSku", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("orders.qtyLabel", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminOps.orders.labelTotal", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map((item) => {
                  const colorMeta = resolveColorMeta(item.colorSnapshot);
                  const colorLabel = lang === "ar" ? colorMeta.name_ar : colorMeta.name_en;
                  return `
                    <tr>
                      <td>
                        <div class="admin-table-item">
                          <span class="admin-thumb admin-thumb--square">
                            ${
                              item.imageUrl
                                ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                                : `<span style="font-size: 10px;">—</span>`
                            }
                          </span>
                          <div class="admin-table-item__meta">
                            <span class="admin-table-item__title">${escapeHtml(item.productNameSnapshot)}</span>
                            <span class="admin-table-item__sub">
                              ${escapeHtml(item.sizeSnapshot)} · ${escapeHtml(colorLabel)} · ${escapeHtml(formatPriceEGP(item.unitPrice, lang))}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td class="tabular-nums">${escapeHtml(item.skuSnapshot)}</td>
                      <td class="admin-table__num tabular-nums">${escapeHtml(formatCount(item.quantity))}</td>
                      <td class="admin-table__num tabular-nums"><strong>${escapeHtml(formatPriceEGP(item.totalPrice, lang))}</strong></td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </article>

      <div class="admin-detail-grid">
        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailTimelineHeading", lang))}</h2>
          </div>
          <div class="admin-timeline-list">
            ${history
              .map(
                (entry) => `
              <div class="admin-timeline-item">
                <div class="admin-timeline-item__top">
                  <span class="admin-timeline-item__title">
                    ${
                      entry.previousStatus && entry.previousStatus !== entry.newStatus
                        ? `${escapeHtml(localizeOrderStatus(entry.previousStatus, lang))} → ${escapeHtml(localizeOrderStatus(entry.newStatus, lang))}`
                        : escapeHtml(localizeOrderStatus(entry.newStatus, lang))
                    }
                  </span>
                  <span class="admin-timeline-item__meta tabular-nums">${escapeHtml(formatOrderDate(entry.createdAt, lang))}</span>
                </div>
                ${entry.note ? `<p class="admin-timeline-item__meta" style="color: var(--color-black);">${escapeHtml(entry.note)}</p>` : ""}
                <span class="admin-timeline-item__meta">${escapeHtml(entry.changedByName || t("adminOps.orders.systemActor", lang))}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </article>

        <article class="admin-panel">
          <div class="admin-panel__head">
            <h2 class="admin-panel__title">${escapeHtml(t("adminOps.orders.detailMovementsHeading", lang))}</h2>
          </div>
          ${
            movements.length === 0
              ? `<p class="text-muted" style="font-size: var(--text-sm);">${escapeHtml(t("adminOps.orders.noMovementsText", lang))}</p>`
              : `
              <div class="admin-timeline-list">
                ${movements
                  .map((m) => {
                    const sign = m.quantity > 0 ? "+" : "";
                    return `
                      <div class="admin-timeline-item">
                        <div class="admin-timeline-item__top">
                          <span class="admin-timeline-item__title tabular-nums">
                            ${escapeHtml(m.sku)} (${escapeHtml(m.movementType)}) ·
                            <span class="${m.quantity > 0 ? "admin-delta-pos" : "admin-delta-neg"}">${escapeHtml(`${sign}${formatCount(m.quantity)}`)}</span>
                          </span>
                          <span class="admin-timeline-item__meta tabular-nums">${escapeHtml(formatOrderDate(m.createdAt, lang))}</span>
                        </div>
                        ${m.reason ? `<p class="admin-timeline-item__meta">${escapeHtml(m.reason)}</p>` : ""}
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
          }
        </article>
      </div>
    </div>
  `;

  document.getElementById("ord-detail-back")?.addEventListener("click", () => {
    ordState.selectedOrderId = null;
    ordState.detail = null;
    void loadAdminOrdersList({ onAuthError, onRender });
  });

  document.getElementById("ord-detail-refresh")?.addEventListener("click", () => {
    void loadAdminOrderDetail(order.id, { onAuthError, onRender });
  });

  const nextStatusSelect = document.getElementById("ord-next-status");
  const shipInlineFields = document.getElementById("ord-ship-inline-fields");
  const syncShipInlineVisibility = () => {
    if (!shipInlineFields || !nextStatusSelect) return;
    shipInlineFields.hidden = nextStatusSelect.value !== "shipped";
  };
  nextStatusSelect?.addEventListener("change", syncShipInlineVisibility);
  syncShipInlineVisibility();

  document.getElementById("ord-status-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nextStatus = nextStatusSelect?.value;
    if (!nextStatus) return;

    const note = document.getElementById("ord-status-note")?.value.trim() || null;
    const shippingCarrier =
      nextStatus === "shipped"
        ? document.getElementById("ord-inline-carrier")?.value.trim() || undefined
        : undefined;
    const trackingNumber =
      nextStatus === "shipped"
        ? document.getElementById("ord-inline-tracking")?.value.trim() || undefined
        : undefined;

    const executeStatusUpdate = async () => {
      ordState.actionBusy = true;
      onRender();
      try {
        ordState.detail = await updateAdminOrderStatusRequest(order.id, {
          status: nextStatus,
          note,
          shippingCarrier,
          trackingNumber,
        });
        showToast(
          formatTemplate(t("adminOps.orders.statusUpdatedToast", lang), {
            status: localizeOrderStatus(nextStatus, lang),
          }),
          "success"
        );
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          if (typeof onAuthError === "function") await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
      } finally {
        ordState.actionBusy = false;
        onRender();
      }
    };

    if (nextStatus === "cancelled") {
      openConfirmDialog({
        title: localizeOrderStatus("cancelled", lang),
        message: formatTemplate(t("adminOps.orders.confirmCancelMsg", lang), {
          orderNumber: order.orderNumber,
        }),
        confirmLabel: localizeOrderStatus("cancelled", lang),
        cancelLabel: t("adminOps.common.cancelBtn", lang),
        danger: true,
        onConfirm: executeStatusUpdate,
      });
    } else if (nextStatus === "delivered") {
      openConfirmDialog({
        title: localizeOrderStatus("delivered", lang),
        message: formatTemplate(t("adminOps.orders.confirmDeliveredMsg", lang), {
          orderNumber: order.orderNumber,
        }),
        confirmLabel: localizeOrderStatus("delivered", lang),
        cancelLabel: t("adminOps.common.cancelBtn", lang),
        onConfirm: executeStatusUpdate,
      });
    } else {
      await executeStatusUpdate();
    }
  });

  document.getElementById("ord-shipment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const carrier = document.getElementById("ord-carrier-input")?.value.trim() || "";
    const tracking = document.getElementById("ord-tracking-input")?.value.trim() || "";
    if (carrier.length < 2 || tracking.length < 2) {
      showToast(t("adminOps.common.errorTitle", lang), "error");
      return;
    }

    ordState.actionBusy = true;
    onRender();
    try {
      ordState.detail = await updateAdminOrderShipmentRequest(order.id, {
        shippingCarrier: carrier,
        trackingNumber: tracking,
      });
      showToast(t("adminOps.orders.shipmentSavedToast", lang), "success");
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
    } finally {
      ordState.actionBusy = false;
      onRender();
    }
  });

  document.getElementById("ord-confirm-cod-btn")?.addEventListener("click", () => {
    const txRef = document.getElementById("ord-tx-ref")?.value.trim() || null;
    openConfirmDialog({
      title: t("adminOps.orders.confirmCodPaidBtn", lang),
      message: formatTemplate(t("adminOps.orders.confirmCodPaidMsg", lang), {
        amount: formatPriceEGP(order.totalAmount, lang),
        orderNumber: order.orderNumber,
      }),
      confirmLabel: t("adminOps.orders.confirmCodPaidBtn", lang),
      cancelLabel: t("adminOps.common.cancelBtn", lang),
      onConfirm: async () => {
        ordState.actionBusy = true;
        onRender();
        try {
          ordState.detail = await updateAdminOrderPaymentRequest(order.id, {
            paymentStatus: "paid",
            transactionReference: txRef,
          });
          showToast(t("adminOps.orders.paymentUpdatedToast", lang), "success");
        } catch (err) {
          if (err && (err.status === 401 || err.status === 403)) {
            if (typeof onAuthError === "function") await onAuthError(err);
            return;
          }
          showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
        } finally {
          ordState.actionBusy = false;
          onRender();
        }
      },
    });
  });

  document.getElementById("ord-mark-failed-btn")?.addEventListener("click", async () => {
    const txRef = document.getElementById("ord-tx-ref")?.value.trim() || null;
    ordState.actionBusy = true;
    onRender();
    try {
      ordState.detail = await updateAdminOrderPaymentRequest(order.id, {
        paymentStatus: "failed",
        transactionReference: txRef,
      });
      showToast(t("adminOps.orders.paymentUpdatedToast", lang), "success");
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        if (typeof onAuthError === "function") await onAuthError(err);
        return;
      }
      showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
    } finally {
      ordState.actionBusy = false;
      onRender();
    }
  });

  document.getElementById("ord-mark-refunded-btn")?.addEventListener("click", () => {
    openConfirmDialog({
      title: t("adminOps.orders.markRefundedBtn", lang),
      message: `${order.orderNumber} — ${formatPriceEGP(order.totalAmount, lang)}`,
      confirmLabel: t("adminOps.orders.markRefundedBtn", lang),
      cancelLabel: t("adminOps.common.cancelBtn", lang),
      danger: true,
      onConfirm: async () => {
        ordState.actionBusy = true;
        onRender();
        try {
          ordState.detail = await updateAdminOrderPaymentRequest(order.id, {
            paymentStatus: "refunded",
          });
          showToast(t("adminOps.orders.paymentUpdatedToast", lang), "success");
        } catch (err) {
          if (err && (err.status === 401 || err.status === 403)) {
            if (typeof onAuthError === "function") await onAuthError(err);
            return;
          }
          showToast(err?.message || t("adminOps.common.errorTitle", lang), "error");
        } finally {
          ordState.actionBusy = false;
          onRender();
        }
      },
    });
  });
}

export function renderOrdersSection(mainEl, { onAuthError, onRender }) {
  if (!mainEl) return;

  if (ordState.selectedOrderId) {
    renderOrderDetailView(mainEl, { onAuthError, onRender });
    return;
  }

  if (!ordState.loadedOnce && !ordState.loading && !ordState.error) {
    void loadAdminOrdersList({ onAuthError, onRender });
  }

  const lang = getLanguage();
  const { total, page, limit, totalPages } = ordState.pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminOps.orders.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminOps.orders.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminOps.orders.subtitle", lang))}</p>
      </div>
      <button type="button" class="btn btn--secondary btn--sm" id="ord-refresh-btn">
        ${escapeHtml(t("adminOps.common.refreshBtn", lang))}
      </button>
    </div>

    <section class="admin-panel">
      <form class="admin-toolbar" id="ord-filter-form">
        <div class="admin-toolbar__filters">
          <input
            type="search"
            id="ord-search-input"
            class="input admin-toolbar__search"
            value="${escapeHtml(ordState.filters.search)}"
            placeholder="${escapeHtml(t("adminOps.orders.searchPlaceholder", lang))}"
          />
          <select id="ord-status-filter" class="select admin-toolbar__select">
            <option value="all" ${ordState.filters.orderStatus === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.filterStatusAll", lang))}</option>
            <option value="pending" ${ordState.filters.orderStatus === "pending" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("pending", lang))}</option>
            <option value="confirmed" ${ordState.filters.orderStatus === "confirmed" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("confirmed", lang))}</option>
            <option value="processing" ${ordState.filters.orderStatus === "processing" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("processing", lang))}</option>
            <option value="shipped" ${ordState.filters.orderStatus === "shipped" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("shipped", lang))}</option>
            <option value="delivered" ${ordState.filters.orderStatus === "delivered" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("delivered", lang))}</option>
            <option value="cancelled" ${ordState.filters.orderStatus === "cancelled" ? "selected" : ""}>${escapeHtml(localizeOrderStatus("cancelled", lang))}</option>
          </select>
          <select id="ord-payment-filter" class="select admin-toolbar__select">
            <option value="all" ${ordState.filters.paymentStatus === "all" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.filterPaymentAll", lang))}</option>
            <option value="pending" ${ordState.filters.paymentStatus === "pending" ? "selected" : ""}>${escapeHtml(localizePaymentStatus("pending", lang))}</option>
            <option value="paid" ${ordState.filters.paymentStatus === "paid" ? "selected" : ""}>${escapeHtml(localizePaymentStatus("paid", lang))}</option>
            <option value="failed" ${ordState.filters.paymentStatus === "failed" ? "selected" : ""}>${escapeHtml(localizePaymentStatus("failed", lang))}</option>
            <option value="cancelled" ${ordState.filters.paymentStatus === "cancelled" ? "selected" : ""}>${escapeHtml(localizePaymentStatus("cancelled", lang))}</option>
            <option value="refunded" ${ordState.filters.paymentStatus === "refunded" ? "selected" : ""}>${escapeHtml(localizePaymentStatus("refunded", lang))}</option>
          </select>
          <input id="ord-start-date" type="date" class="input" style="width: auto;" value="${escapeHtml(ordState.filters.startDate)}" />
          <input id="ord-end-date" type="date" class="input" style="width: auto;" value="${escapeHtml(ordState.filters.endDate)}" />
          <select id="ord-sort-filter" class="select admin-toolbar__select">
            <option value="newest" ${ordState.filters.sort === "newest" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.sortNewest", lang))}</option>
            <option value="oldest" ${ordState.filters.sort === "oldest" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.sortOldest", lang))}</option>
            <option value="total_desc" ${ordState.filters.sort === "total_desc" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.sortTotalDesc", lang))}</option>
            <option value="total_asc" ${ordState.filters.sort === "total_asc" ? "selected" : ""}>${escapeHtml(t("adminOps.orders.sortTotalAsc", lang))}</option>
          </select>
          <button type="submit" class="btn btn--primary btn--sm">${escapeHtml(t("adminOps.common.applyBtn", lang))}</button>
        </div>
      </form>

      ${
        ordState.loading
          ? '<div class="admin-skeleton" style="width: 100%; height: 240px;"></div>'
          : ordState.error
          ? `
            <div class="admin-state-box admin-state-box--inline">
              <strong class="admin-state-box__title">${escapeHtml(t("adminOps.common.errorTitle", lang))}</strong>
              <p class="admin-state-box__desc">${escapeHtml(ordState.error)}</p>
              <button type="button" class="btn btn--secondary btn--sm" id="ord-retry-btn">${escapeHtml(t("adminOps.common.retryBtn", lang))}</button>
            </div>
          `
          : ordState.orders.length === 0
          ? `
            <div class="admin-state-box admin-state-box--inline">
              <strong class="admin-state-box__title">${escapeHtml(t("adminOps.orders.emptyTitle", lang))}</strong>
              <p class="admin-state-box__desc">${escapeHtml(t("adminOps.orders.emptyDesc", lang))}</p>
            </div>
          `
          : `
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>${escapeHtml(t("adminOps.orders.colOrderNumber", lang))}</th>
                    <th>${escapeHtml(t("adminOps.orders.colCustomer", lang))}</th>
                    <th>${escapeHtml(t("adminOps.orders.colDate", lang))}</th>
                    <th class="admin-table__num">${escapeHtml(t("adminOps.orders.colItems", lang))}</th>
                    <th class="admin-table__num">${escapeHtml(t("adminOps.orders.colTotal", lang))}</th>
                    <th>${escapeHtml(t("adminOps.orders.colPayment", lang))}</th>
                    <th>${escapeHtml(t("adminOps.orders.colStatus", lang))}</th>
                    <th style="text-align: end;">${escapeHtml(t("adminOps.orders.colActions", lang))}</th>
                  </tr>
                </thead>
                <tbody>
                  ${ordState.orders
                    .map(
                      (order) => `
                    <tr>
                      <td class="tabular-nums"><strong>${escapeHtml(order.orderNumber)}</strong></td>
                      <td>
                        <div class="admin-table-item__meta">
                          <span class="admin-table-item__title">${escapeHtml(order.customerName)}</span>
                          <span class="admin-table-item__sub" dir="ltr">${escapeHtml(order.recipientPhone || order.customerEmail)}</span>
                        </div>
                      </td>
                      <td class="tabular-nums text-muted">${escapeHtml(formatOrderDate(order.createdAt, lang))}</td>
                      <td class="admin-table__num tabular-nums">${escapeHtml(formatCount(order.itemCount))}</td>
                      <td class="admin-table__num tabular-nums"><strong>${escapeHtml(formatPriceEGP(order.totalAmount, lang))}</strong></td>
                      <td>
                        <span class="admin-status-text ${escapeHtml(getPaymentStatusClass(order.paymentStatus))}">
                          ${escapeHtml(localizePaymentStatus(order.paymentStatus, lang))}
                        </span>
                      </td>
                      <td>
                        <span class="admin-status-text ${escapeHtml(getOrderStatusClass(order.orderStatus))}">
                          ${escapeHtml(localizeOrderStatus(order.orderStatus, lang))}
                        </span>
                      </td>
                      <td>
                        <div class="admin-row-actions">
                          <button type="button" class="btn btn--secondary btn--sm" data-ord-view="${escapeHtml(order.id)}">
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

            <div class="admin-pagination">
              <span class="admin-pagination__info tabular-nums">
                ${escapeHtml(formatTemplate(t("adminOps.common.showingRange", lang), { from, to, total }))}
              </span>
              <div class="admin-pagination__controls">
                <button type="button" class="btn btn--secondary btn--sm" id="ord-prev-page" ${page <= 1 ? "disabled" : ""}>
                  ${escapeHtml(t("adminOps.common.prevPage", lang))}
                </button>
                <span class="admin-pagination__info tabular-nums">
                  ${escapeHtml(formatTemplate(t("adminOps.common.pageOf", lang), { page, totalPages }))}
                </span>
                <button type="button" class="btn btn--secondary btn--sm" id="ord-next-page" ${page >= totalPages ? "disabled" : ""}>
                  ${escapeHtml(t("adminOps.common.nextPage", lang))}
                </button>
              </div>
            </div>
          `
      }
    </section>
  `;

  document.getElementById("ord-refresh-btn")?.addEventListener("click", () => {
    void loadAdminOrdersList({ onAuthError, onRender });
  });

  document.getElementById("ord-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    ordState.filters.search = document.getElementById("ord-search-input")?.value.trim() || "";
    ordState.filters.orderStatus = document.getElementById("ord-status-filter")?.value || "all";
    ordState.filters.paymentStatus = document.getElementById("ord-payment-filter")?.value || "all";
    ordState.filters.startDate = document.getElementById("ord-start-date")?.value || "";
    ordState.filters.endDate = document.getElementById("ord-end-date")?.value || "";
    ordState.filters.sort = document.getElementById("ord-sort-filter")?.value || "newest";
    ordState.pagination.page = 1;
    void loadAdminOrdersList({ onAuthError, onRender });
  });

  document.getElementById("ord-retry-btn")?.addEventListener("click", () => {
    void loadAdminOrdersList({ onAuthError, onRender });
  });

  document.getElementById("ord-prev-page")?.addEventListener("click", () => {
    if (ordState.pagination.page > 1) {
      ordState.pagination.page -= 1;
      void loadAdminOrdersList({ onAuthError, onRender });
    }
  });

  document.getElementById("ord-next-page")?.addEventListener("click", () => {
    if (ordState.pagination.page < ordState.pagination.totalPages) {
      ordState.pagination.page += 1;
      void loadAdminOrdersList({ onAuthError, onRender });
    }
  });

  mainEl.querySelectorAll("[data-ord-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-ord-view");
      if (id) void loadAdminOrderDetail(id, { onAuthError, onRender });
    });
  });
}
