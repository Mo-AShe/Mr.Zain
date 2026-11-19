/**
 * MR. ZAIN — Shared Order Formatting & Detail Rendering Helpers
 */

import { getLanguage, t } from "../i18n/i18n.js";
import {
  escapeHtml,
  formatPriceEGP,
  pickLocalized,
  resolveColorMeta,
} from "../utils/formatters.js";
import { formatAddressLines } from "./address-form.js";
import { createGarmentPlaceholder, inferGarmentType } from "./placeholders.js";

export function localizeOrderStatus(status, lang = getLanguage()) {
  const map = {
    pending: "orders.statusPending",
    confirmed: "orders.statusConfirmed",
    processing: "orders.statusProcessing",
    shipped: "orders.statusShipped",
    delivered: "orders.statusDelivered",
    cancelled: "orders.statusCancelled",
  };
  return t(map[status] || "orders.statusPending", lang);
}

export function localizePaymentStatus(status, lang = getLanguage()) {
  const map = {
    pending: "orders.paymentPending",
    paid: "orders.paymentPaid",
    failed: "orders.paymentFailed",
    cancelled: "orders.paymentCancelled",
    refunded: "orders.paymentRefunded",
  };
  return t(map[status] || "orders.paymentPending", lang);
}

export function getOrderStatusClass(status) {
  if (status === "delivered") return "order-status-text--success";
  if (status === "cancelled") return "order-status-text--danger";
  if (status === "confirmed" || status === "processing" || status === "shipped") {
    return "order-status-text--active";
  }
  return "order-status-text--pending";
}

export function formatOrderDate(iso, lang = getLanguage()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function buildOrderDetailElement(order, lang = getLanguage()) {
  const container = document.createElement("div");
  container.className = "order-detail-stack";

  const snap = order.shippingAddressSnapshot || {};
  const addressLines = formatAddressLines(snap, lang);
  const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  container.innerHTML = `
    <div class="order-detail-meta-grid">
      <div class="order-detail-meta-item">
        <span class="account-profile-item__label">${escapeHtml(t("orders.orderNumberLabel", lang))}</span>
        <strong class="tabular-nums">${escapeHtml(order.orderNumber)}</strong>
      </div>
      <div class="order-detail-meta-item">
        <span class="account-profile-item__label">${escapeHtml(t("orders.orderDateLabel", lang))}</span>
        <span class="tabular-nums">${escapeHtml(formatOrderDate(order.createdAt, lang))}</span>
      </div>
      <div class="order-detail-meta-item">
        <span class="account-profile-item__label">${escapeHtml(t("orders.statusLabel", lang))}</span>
        <strong class="${escapeHtml(getOrderStatusClass(order.orderStatus))}">${escapeHtml(localizeOrderStatus(order.orderStatus, lang))}</strong>
      </div>
      <div class="order-detail-meta-item">
        <span class="account-profile-item__label">${escapeHtml(t("orders.paymentStatusLabel", lang))}</span>
        <span>${escapeHtml(t("orders.methodCod", lang))} · ${escapeHtml(localizePaymentStatus(order.paymentStatus, lang))}</span>
      </div>
    </div>

    <div class="order-detail-two-col">
      <div class="order-detail-box">
        <h3 class="order-detail-box__title">${escapeHtml(t("orderConfirmation.addressHeading", lang))}</h3>
        <p><strong>${escapeHtml(snap.recipientName || "")}</strong></p>
        <p class="tabular-nums text-muted" dir="ltr">${escapeHtml(snap.phone || "")}</p>
        <p class="order-detail-address-lines">${addressLines.map(escapeHtml).join("<br />")}</p>
        ${
          snap.additionalInformation
            ? `<p class="text-muted" style="font-size: 0.8125rem; margin-top: 0.35rem;">${escapeHtml(snap.additionalInformation)}</p>`
            : ""
        }
        ${
          order.customerNotes
            ? `<p class="text-muted" style="font-size: 0.8125rem; margin-top: 0.5rem;"><strong>${escapeHtml(t("orders.notesLabel", lang))}:</strong> ${escapeHtml(order.customerNotes)}</p>`
            : ""
        }
      </div>

      <div class="order-detail-box">
        <h3 class="order-detail-box__title">${escapeHtml(t("orderConfirmation.summaryHeading", lang))}</h3>
        <dl class="cart-summary-rows">
          <div class="cart-summary-row">
            <dt class="text-muted">${escapeHtml(t("checkout.subtotalLabel", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(order.subtotal, lang))}</dd>
          </div>
          ${
            Number(order.discountAmount) > 0
              ? `
              <div class="cart-summary-row">
                <dt class="text-muted">${escapeHtml(t("checkout.discountLabel", lang))}</dt>
                <dd class="tabular-nums" style="color: var(--color-success);">−${escapeHtml(formatPriceEGP(order.discountAmount, lang))}</dd>
              </div>
            `
              : ""
          }
          <div class="cart-summary-row">
            <dt class="text-muted">${escapeHtml(t("checkout.shippingLabel", lang))}</dt>
            <dd class="tabular-nums">${
              Number(order.shippingFee) === 0
                ? `<strong style="color: var(--color-success);">${escapeHtml(t("checkout.shippingFree", lang))}</strong>`
                : escapeHtml(formatPriceEGP(order.shippingFee, lang))
            }</dd>
          </div>
          <div class="cart-summary-row cart-summary-row--total">
            <dt>${escapeHtml(t("orders.totalLabel", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(order.totalAmount, lang))}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="order-detail-box">
      <h3 class="order-detail-box__title">${escapeHtml(t("orderConfirmation.itemsHeading", lang))}</h3>
      <div class="order-detail-items" data-order-items-slot></div>
    </div>

    ${
      statusHistory.length > 0
        ? `
        <div class="order-detail-box">
          <h3 class="order-detail-box__title">${escapeHtml(t("orders.timelineHeading", lang))}</h3>
          <ol class="order-timeline">
            ${statusHistory
              .map(
                (entry) => `
                <li class="order-timeline__item">
                  <div class="order-timeline__top">
                    <strong>${escapeHtml(localizeOrderStatus(entry.newStatus, lang))}</strong>
                    <span class="text-muted tabular-nums" style="font-size: 0.8125rem;">${escapeHtml(formatOrderDate(entry.createdAt, lang))}</span>
                  </div>
                  ${
                    entry.note
                      ? `<p class="text-muted" style="font-size: 0.8125rem;">${escapeHtml(entry.note)}</p>`
                      : ""
                  }
                </li>
              `
              )
              .join("")}
          </ol>
        </div>
      `
        : ""
    }
  `;

  const itemsSlot = container.querySelector("[data-order-items-slot]");
  const items = Array.isArray(order.items) ? order.items : [];
  items.forEach((item) => {
    const title = pickLocalized(item, "name", lang) || item.productNameSnapshot;
    const colorMeta = resolveColorMeta(item.colorSnapshot);
    const colorLabel = lang === "ar" ? colorMeta.name_ar : colorMeta.name_en;

    const row = document.createElement("div");
    row.className = "checkout-item-row";

    const media = document.createElement("div");
    media.className = "checkout-item__media";
    if (item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = "";
        media.appendChild(createGarmentPlaceholder(inferGarmentType({ name_en: title })));
      });
      media.appendChild(img);
    } else {
      media.appendChild(createGarmentPlaceholder(inferGarmentType({ name_en: title })));
    }

    const info = document.createElement("div");
    info.className = "checkout-item__info";
    info.innerHTML = `
      <div class="checkout-item__top">
        <strong>${
          item.productSlug
            ? `<a href="/product.html?slug=${encodeURIComponent(item.productSlug)}">${escapeHtml(title)}</a>`
            : escapeHtml(title)
        }</strong>
        <span class="tabular-nums"><strong>${escapeHtml(formatPriceEGP(item.totalPrice, lang))}</strong></span>
      </div>
      <div class="checkout-item__meta">
        <span>${escapeHtml(t("cart.sizeLabel", lang))}: ${escapeHtml(item.sizeSnapshot)}</span>
        <span aria-hidden="true">·</span>
        <span class="cart-item__color-inline">
          <span class="color-dot" style="background-color: ${escapeHtml(colorMeta.hex)};" aria-hidden="true"></span>
          ${escapeHtml(colorLabel)}
        </span>
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">${escapeHtml(t("orders.qtyLabel", lang))}: ${item.quantity} × ${escapeHtml(formatPriceEGP(item.unitPrice, lang))}</span>
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">${escapeHtml(t("cart.skuLabel", lang))}: ${escapeHtml(item.skuSnapshot)}</span>
      </div>
    `;

    row.append(media, info);
    itemsSlot?.appendChild(row);
  });

  return container;
}
