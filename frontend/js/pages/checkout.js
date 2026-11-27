import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Checkout Page Controller
 * Complete 4-step COD checkout backed by Neon PostgreSQL:
 * Step 1: Egyptian Delivery Address (select, add, edit, delete)
 * Step 2: Order Summary & Server-Validated Coupon
 * Step 3: Cash on Delivery (COD) Payment Method
 * Step 4: Final Review & Idempotent Order Submission
 */

import {
  formatAddressLines,
  localizeGovernorate,
  openAddressFormModal,
} from "../components/address-form.js";
import { initLayout } from "../components/layout.js";
import { createGarmentPlaceholder, inferGarmentType } from "../components/placeholders.js";
import {
  openConfirmDialog,
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
  showToast,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { deleteAddress } from "../services/address-service.js";
import { redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { clearCartState, fetchCart } from "../services/cart-service.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import {
  fetchCheckoutPreview,
  fetchShippingQuote,
  placeCodOrder,
} from "../services/checkout-service.js";
import {
  escapeHtml,
  formatPriceEGP,
  pickLocalized,
  resolveColorMeta,
} from "../utils/formatters.js";

let activeUser = null;
let previewData = null;
let selectedAddressId = null;
let appliedCouponCode = "";
let couponInputDraft = "";
let couponInlineError = "";
let customerNotesDraft = "";
let loadError = null;
let stockConflictMessage = "";
let isQuoting = false;
let isSubmitting = false;
let checkoutIdempotencyKey = generateIdempotencyKey();
const couponRejectionCodes = new Set([
  "INVALID_COUPON",
  "COUPON_NOT_STARTED",
  "COUPON_EXPIRED",
  "COUPON_MIN_ORDER_NOT_MET",
  "COUPON_USAGE_LIMIT_REACHED",
  "COUPON_CUSTOMER_LIMIT_REACHED",
]);

function isValidEgyptianPhone(raw) {
  const cleaned = String(raw || "").replace(/[\s\-().]/g, "").trim();
  return /^(?:\+20|20|0)1[0125]\d{8}$/.test(cleaned);
}

function hasCompleteDeliveryAddress(address) {
  return Boolean(
    address &&
      address.recipientName?.trim() &&
      isValidEgyptianPhone(address.phone) &&
      address.governorate?.trim() &&
      address.city?.trim() &&
      address.street?.trim() &&
      address.building?.trim()
  );
}

function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mz-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function rotateCheckoutIdempotencyKey() {
  // Keep the key for network/5xx outcomes that may have committed; rotate when order inputs change or stale inputs are rejected.
  checkoutIdempotencyKey = generateIdempotencyKey();
}

function getSelectedAddress() {
  const addresses = Array.isArray(previewData?.addresses) ? previewData.addresses : [];
  if (!selectedAddressId) return null;
  return addresses.find((a) => a.id === selectedAddressId) || null;
}

function buildCheckoutRenderState() {
  const summary = previewData?.summary || {};
  const shipping = previewData?.shipping || null;
  const settings = previewData?.shippingSettings || {};
  const publicShipping = getCachedPublicSettings()?.shipping;
  const subtotal = Number(summary.subtotal ?? previewData?.cart?.subtotal ?? 0);
  const discountAmount = Number(summary.discountAmount ?? 0);
  const shippingFee =
    shipping !== null && shipping !== undefined
      ? Number(shipping.shippingFee)
      : summary.shippingFee !== null && summary.shippingFee !== undefined
        ? Number(summary.shippingFee)
        : null;
  const totalAmount = Number(summary.totalAmount ?? Math.max(0, subtotal - discountAmount));
  const freeShippingThreshold =
    publicShipping?.freeShippingThreshold ??
    settings.freeShippingThreshold ??
    summary.freeShippingThreshold ??
    null;
  const isFreeShippingEnabled = Boolean(settings.isFreeShippingEnabled ?? true);
  const qualifiesForFreeShipping = Boolean(summary.qualifiesForFreeShipping);
  const amountToFreeShipping = Number(summary.amountToFreeShipping ?? 0);
  const estimatedDeliveryDays =
    shipping?.estimatedDeliveryDays ?? summary.estimatedDeliveryDays ?? null;
  const estimatedDeliveryMaxDays =
    shipping?.estimatedDeliveryMaxDays ?? summary.estimatedDeliveryMaxDays ?? null;

  return {
    subtotal,
    discountAmount,
    shippingFee,
    totalAmount,
    freeShippingThreshold,
    isFreeShippingEnabled,
    qualifiesForFreeShipping,
    amountToFreeShipping,
    estimatedDeliveryDays,
    estimatedDeliveryMaxDays,
  };
}

async function refreshQuoteForSelection({ couponOverride } = {}) {
  const selectedAddress = getSelectedAddress();
  if (!selectedAddress) {
    if (previewData) {
      previewData.shipping = null;
      previewData.summary = {
        ...previewData.summary,
        shippingFee: null,
        totalAmount: Math.max(
          0,
          Number(previewData.cart?.subtotal ?? 0) - Number(previewData.summary?.discountAmount ?? 0)
        ),
        estimatedDeliveryDays: null,
      };
    }
    renderCheckoutView();
    return;
  }

  isQuoting = true;
  renderCheckoutView();

  try {
    const codeToTest =
      couponOverride !== undefined ? couponOverride : appliedCouponCode;
    const quote = await fetchShippingQuote({
      addressId: selectedAddress.id,
      ...(codeToTest ? { couponCode: codeToTest } : {}),
    });

    if (couponOverride !== undefined) {
      appliedCouponCode = quote?.appliedCoupon?.code || "";
      couponInputDraft = appliedCouponCode;
      couponInlineError = "";
    }

    if (previewData && quote) {
      previewData.shipping = quote;
      previewData.appliedCoupon = quote.appliedCoupon || null;
      previewData.summary = {
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        shippingFee: quote.shippingFee,
        totalAmount: quote.totalAmount,
        currency: quote.currency || "EGP",
        qualifiesForFreeShipping: quote.qualifiesForFreeShipping,
        freeShippingThreshold: quote.freeShippingThreshold,
        amountToFreeShipping: quote.amountToFreeShipping,
        estimatedDeliveryDays: quote.estimatedDeliveryDays,
        estimatedDeliveryMaxDays: quote.estimatedDeliveryMaxDays ?? null,
      };
    }
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(appUrl("/pages/checkout.html"));
      return;
    }
    if (couponOverride !== undefined) {
      couponInlineError = err?.message || t("ui.actionFailed", getLanguage());
      if (couponOverride === "") {
        appliedCouponCode = "";
      }
    } else {
      showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
    }
  } finally {
    isQuoting = false;
    renderCheckoutView();
  }
}

async function loadCheckoutPage({ preserveSelection = true } = {}) {
  const root = document.getElementById("checkout-root");
  loadError = null;
  if (root && !previewData) {
    renderLoadingState(root, 3);
  }

  try {
    const data = await fetchCheckoutPreview({
      ...(preserveSelection && selectedAddressId ? { addressId: selectedAddressId } : {}),
      ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
    });

    previewData = data;
    const addresses = Array.isArray(data?.addresses) ? data.addresses : [];
    if (preserveSelection && selectedAddressId && addresses.some((a) => a.id === selectedAddressId)) {
      // Keep current selection
    } else {
      selectedAddressId = data?.selectedAddressId || addresses[0]?.id || null;
    }

    if (data?.couponError) {
      couponInlineError = data.couponError;
      if (appliedCouponCode) {
        rotateCheckoutIdempotencyKey();
      }
      appliedCouponCode = "";
      couponInputDraft = "";
    } else if (data?.appliedCoupon?.code) {
      appliedCouponCode = data.appliedCoupon.code;
      couponInputDraft = appliedCouponCode;
      couponInlineError = "";
    }
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(appUrl("/pages/checkout.html"));
      return;
    }
    loadError = err;
  }

  renderCheckoutView();
}

function renderCheckoutView() {
  const root = document.getElementById("checkout-root");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  if (loadError) {
    renderErrorState(root, {
      title: t("checkout.errorTitle", lang),
      onRetry: () => loadCheckoutPage({ preserveSelection: true }),
    });
    return;
  }

  const cartItems = Array.isArray(previewData?.cart?.items) ? previewData.cart.items : [];
  if (cartItems.length === 0) {
    renderEmptyState(root, {
      title: t("checkout.emptyBagTitle", lang),
      description: t("checkout.emptyBagDesc", lang),
      actionLabel: t("cart.emptyAction", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  const addresses = Array.isArray(previewData?.addresses) ? previewData.addresses : [];
  const selectedAddress = getSelectedAddress();
  const hasStockIssues = Boolean(previewData?.cart?.hasStockIssues);
  const isCodEnabled = Boolean(previewData?.shippingSettings?.isCodEnabled ?? true);
  const availability = previewData?.availability || null;
  const isMaintenanceMode = Boolean(availability?.isMaintenanceMode);
  const maintenanceMsg =
    (isMaintenanceMode
      ? lang === "ar"
        ? availability.maintenanceMessageAr || availability.maintenanceMessageEn
        : availability.maintenanceMessageEn || availability.maintenanceMessageAr
      : "") || t("checkout.maintenanceAlert", lang);
  const calc = buildCheckoutRenderState();

  const addressCardsHtml =
    addresses.length > 0
      ? `
      <div class="checkout-address-grid">
        ${addresses
          .map((addr) => {
            const isSelected = addr.id === selectedAddressId;
            const lines = formatAddressLines(addr, lang);
            return `
              <div class="checkout-address-card ${isSelected ? "is-selected" : ""}">
                <label class="checkout-address-card__select">
                  <input
                    type="radio"
                    name="selectedAddress"
                    value="${escapeHtml(addr.id)}"
                    ${isSelected ? "checked" : ""}
                  />
                  <div class="checkout-address-card__body">
                    <div class="checkout-address-card__head">
                      <strong>${escapeHtml(addr.recipientName)}</strong>
                      ${
                        addr.isDefault
                          ? `<span class="checkout-meta-label">${escapeHtml(t("address.defaultBadge", lang))}</span>`
                          : ""
                      }
                    </div>
                    <p class="checkout-address-card__phone tabular-nums" dir="ltr">${escapeHtml(addr.phone)}</p>
                    ${
                      isValidEgyptianPhone(addr.phone)
                        ? ""
                        : `<p class="form-error" role="alert">${escapeHtml(t("checkout.invalidAddressPhone", lang))}</p>`
                    }
                    ${
                      addr.recipientName?.trim() &&
                      addr.governorate?.trim() &&
                      addr.city?.trim() &&
                      addr.street?.trim() &&
                      addr.building?.trim()
                        ? ""
                        : `<p class="form-error" role="alert">${escapeHtml(t("checkout.incompleteAddress", lang))}</p>`
                    }
                    <p class="checkout-address-card__lines">${lines.map(escapeHtml).join("<br />")}</p>
                    ${
                      addr.additionalInformation
                        ? `<p class="checkout-address-card__note">${escapeHtml(addr.additionalInformation)}</p>`
                        : ""
                    }
                  </div>
                </label>

                <div class="checkout-address-card__actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-addr-edit="${escapeHtml(addr.id)}">
                    ${escapeHtml(t("address.editBtn", lang))}
                  </button>
                  <button type="button" class="btn btn--ghost btn--sm checkout-addr-delete" data-addr-delete="${escapeHtml(addr.id)}">
                    ${escapeHtml(t("address.deleteBtn", lang))}
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `
      : `<p class="text-muted" style="font-size: 0.9375rem;">${escapeHtml(t("checkout.noAddressesNote", lang))}</p>`;

  const reviewAddressText = selectedAddress
    ? `${selectedAddress.recipientName} — ${formatAddressLines(selectedAddress, lang).join(", ")}`
    : t("checkout.reviewNoAddress", lang);

  const canPlaceOrder =
    !isSubmitting &&
    !isQuoting &&
    !isMaintenanceMode &&
    hasCompleteDeliveryAddress(selectedAddress) &&
    !hasStockIssues &&
    isCodEnabled;

  root.innerHTML = `
    <div class="checkout-layout">
      <div class="checkout-steps-col">
        ${
          isMaintenanceMode
            ? `<div class="form-status form-status--error" role="alert">${escapeHtml(maintenanceMsg)}</div>`
            : ""
        }
        ${
          stockConflictMessage || hasStockIssues
            ? `<div class="form-status form-status--error" role="alert">${escapeHtml(stockConflictMessage || t("checkout.stockChangedAlert", lang))}</div>`
            : ""
        }

        <section class="checkout-step-card">
          <div class="checkout-step-card__head">
            <div>
              <h2 class="checkout-step-card__title">${escapeHtml(t("checkout.step1Title", lang))}</h2>
              <p class="checkout-step-card__sub">${escapeHtml(t("checkout.step1Subtitle", lang))}</p>
            </div>
            <button type="button" id="checkout-add-addr-btn" class="btn btn--secondary btn--sm">
              ${escapeHtml(t("checkout.addNewAddress", lang))}
            </button>
          </div>
          ${addressCardsHtml}
        </section>

        <section class="checkout-step-card">
          <div class="checkout-step-card__head">
            <div>
              <h2 class="checkout-step-card__title">${escapeHtml(t("checkout.step2Title", lang))}</h2>
              <p class="checkout-step-card__sub">${escapeHtml(t("checkout.step2Subtitle", lang))}</p>
            </div>
            <a href=appUrl("/pages/cart.html") class="btn btn--ghost btn--sm">
              ${escapeHtml(t("checkout.backToBag", lang))}
            </a>
          </div>

          <div id="checkout-items-list" class="checkout-items-list"></div>

          <form id="checkout-coupon-form" class="checkout-coupon-form" novalidate>
            <div class="checkout-coupon-row">
              <div class="field" style="flex: 1;">
                <label class="field__label" for="checkout-coupon-input">${escapeHtml(t("checkout.couponLabel", lang))}</label>
                <input
                  type="text"
                  id="checkout-coupon-input"
                  class="input"
                  maxlength="60"
                  value="${escapeHtml(couponInputDraft)}"
                  placeholder="${escapeHtml(t("checkout.couponPlaceholder", lang))}"
                  ${appliedCouponCode ? "readonly" : ""}
                />
              </div>
              ${
                appliedCouponCode
                  ? `<button type="button" id="checkout-remove-coupon-btn" class="btn btn--secondary btn--sm checkout-coupon-btn" ${isQuoting ? "disabled" : ""}>${escapeHtml(t("checkout.removeCoupon", lang))}</button>`
                  : `<button type="submit" id="checkout-apply-coupon-btn" class="btn btn--secondary btn--sm checkout-coupon-btn" ${isQuoting ? "disabled" : ""}>${escapeHtml(t("checkout.applyCoupon", lang))}</button>`
              }
            </div>
            ${
              couponInlineError
                ? `<p class="field__error" role="alert">${escapeHtml(couponInlineError)}</p>`
                : appliedCouponCode && calc.discountAmount > 0
                  ? `<p class="checkout-coupon-applied">${escapeHtml(
                      t("checkout.couponAppliedMsg", lang)
                        .replace("{code}", appliedCouponCode)
                        .replace("{amount}", formatPriceEGP(calc.discountAmount, lang))
                    )}</p>`
                  : ""
            }
          </form>
        </section>

        <section class="checkout-step-card">
          <div class="checkout-step-card__head">
            <div>
              <h2 class="checkout-step-card__title">${escapeHtml(t("checkout.step3Title", lang))}</h2>
              <p class="checkout-step-card__sub">${escapeHtml(t("checkout.step3Subtitle", lang))}</p>
            </div>
          </div>

          ${
            !isCodEnabled
              ? `<div class="form-status form-status--error" role="alert">${escapeHtml(t("checkout.codDisabledAlert", lang))}</div>`
              : `
              <div class="checkout-cod-box">
                <div class="checkout-cod-box__head">
                  <strong>${escapeHtml(t("checkout.codTitle", lang))}</strong>
                  <span class="checkout-meta-label">${escapeHtml(t("checkout.codBadge", lang))}</span>
                </div>
                <p class="text-muted" style="font-size: 0.875rem; line-height: 1.6;">
                  ${escapeHtml(t("checkout.codDesc", lang))}
                </p>
              </div>
            `
          }
        </section>

        <section class="checkout-step-card">
          <div class="checkout-step-card__head">
            <div>
              <h2 class="checkout-step-card__title">${escapeHtml(t("checkout.step4Title", lang))}</h2>
              <p class="checkout-step-card__sub">${escapeHtml(t("checkout.step4Subtitle", lang))}</p>
            </div>
          </div>

          <dl class="checkout-review-list">
            <div class="checkout-review-row">
              <dt class="text-muted">${escapeHtml(t("checkout.reviewAddressLabel", lang))}</dt>
              <dd>${escapeHtml(reviewAddressText)}</dd>
            </div>
            ${
              calc.estimatedDeliveryDays
                ? `
                <div class="checkout-review-row">
                  <dt class="text-muted">${escapeHtml(t("checkout.reviewDeliveryLabel", lang))}</dt>
                  <dd class="tabular-nums">${escapeHtml(
                    t("checkout.deliveryDays", lang).replace(
                      "{days}",
                      calc.estimatedDeliveryMaxDays &&
                        calc.estimatedDeliveryMaxDays > calc.estimatedDeliveryDays
                        ? `${calc.estimatedDeliveryDays}–${calc.estimatedDeliveryMaxDays}`
                        : String(calc.estimatedDeliveryDays)
                    )
                  )}</dd>
                </div>
              `
                : ""
            }
            <div class="checkout-review-row">
              <dt class="text-muted">${escapeHtml(t("checkout.reviewPaymentLabel", lang))}</dt>
              <dd class="tabular-nums"><strong>${escapeHtml(formatPriceEGP(calc.totalAmount, lang))}</strong> · ${escapeHtml(t("orders.methodCod", lang))}</dd>
            </div>
          </dl>

          <div class="field">
            <label class="field__label" for="checkout-notes-input">${escapeHtml(t("checkout.notesLabel", lang))}</label>
            <textarea
              id="checkout-notes-input"
              class="textarea"
              rows="2"
              maxlength="500"
              placeholder="${escapeHtml(t("checkout.notesPlaceholder", lang))}"
            >${escapeHtml(customerNotesDraft)}</textarea>
          </div>

          <div class="checkout-submit-wrap">
            <button
              type="button"
              id="checkout-place-order-btn"
              class="btn btn--primary"
              ${canPlaceOrder ? "" : "disabled"}
            >
              ${escapeHtml(isSubmitting ? t("checkout.placingOrder", lang) : t("checkout.placeOrderBtn", lang))}
            </button>
          </div>
        </section>
      </div>

      <aside class="cart-summary-card" aria-label="${escapeHtml(t("checkout.summaryTitle", lang))}">
        <h2 class="cart-summary-card__title">${escapeHtml(t("checkout.summaryTitle", lang))}</h2>

        <dl class="cart-summary-rows">
          <div class="cart-summary-row">
            <dt class="text-muted">${escapeHtml(t("checkout.subtotalLabel", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(calc.subtotal, lang))}</dd>
          </div>

          ${
            calc.discountAmount > 0
              ? `
              <div class="cart-summary-row">
                <dt class="text-muted">${escapeHtml(t("checkout.discountLabel", lang))}</dt>
                <dd class="tabular-nums" style="color: var(--color-success);">−${escapeHtml(formatPriceEGP(calc.discountAmount, lang))}</dd>
              </div>
            `
              : ""
          }

          <div class="cart-summary-row">
            <dt class="text-muted">
              ${escapeHtml(t("checkout.shippingLabel", lang))}
              ${
                selectedAddress
                  ? `<span>(${escapeHtml(localizeGovernorate(selectedAddress.governorate, lang))})</span>`
                  : ""
              }
            </dt>
            <dd class="tabular-nums">
              ${
                calc.shippingFee === null
                  ? `<span class="text-muted">${escapeHtml(t("checkout.shippingSelectAddress", lang))}</span>`
                  : calc.shippingFee === 0
                    ? `<strong style="color: var(--color-success);">${escapeHtml(t("checkout.shippingFree", lang))}</strong>`
                    : escapeHtml(formatPriceEGP(calc.shippingFee, lang))
              }
            </dd>
          </div>

          <div class="cart-summary-row cart-summary-row--total">
            <dt>${escapeHtml(t("checkout.totalLabel", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(calc.totalAmount, lang))}</dd>
          </div>
        </dl>

        ${
          calc.isFreeShippingEnabled
            ? `<p class="cart-summary-note">
                ${
                  calc.qualifiesForFreeShipping
                    ? escapeHtml(t("checkout.freeShippingAchieved", lang))
                    : escapeHtml(
                        t("checkout.freeShippingRemaining", lang).replace(
                          "{amount}",
                          formatPriceEGP(calc.amountToFreeShipping, lang)
                        )
                      )
                }
              </p>`
            : ""
        }
      </aside>
    </div>
  `;

  const itemsListEl = document.getElementById("checkout-items-list");
  cartItems.forEach((item) => {
    const title = pickLocalized(item, "name", lang);
    const colorMeta = resolveColorMeta(item.color);
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
        media.appendChild(createGarmentPlaceholder(inferGarmentType(item)));
      });
      media.appendChild(img);
    } else {
      media.appendChild(createGarmentPlaceholder(inferGarmentType(item)));
    }

    const info = document.createElement("div");
    info.className = "checkout-item__info";
    info.innerHTML = `
      <div class="checkout-item__top">
        <strong>${escapeHtml(title)}</strong>
        <span class="tabular-nums"><strong>${escapeHtml(formatPriceEGP(item.itemSubtotal, lang))}</strong></span>
      </div>
      <div class="checkout-item__meta">
        <span>${escapeHtml(t("cart.sizeLabel", lang))}: ${escapeHtml(item.size)}</span>
        <span aria-hidden="true">·</span>
        <span class="cart-item__color-inline">
          <span class="color-dot" style="background-color: ${escapeHtml(colorMeta.hex)};" aria-hidden="true"></span>
          ${escapeHtml(colorLabel)}
        </span>
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">${escapeHtml(t("orders.qtyLabel", lang))}: ${item.quantity} × ${escapeHtml(formatPriceEGP(item.unitPrice, lang))}</span>
      </div>
      ${
        item.exceedsStock
          ? `<p class="cart-item__stock cart-item__stock--error">${escapeHtml(
              !item.isAvailable
                ? t("cart.productUnavailable", lang)
                : item.availableStock <= 0
                ? t("cart.outOfStockWarning", lang)
                : t("cart.exceedsStockWarning", lang).replace("{count}", String(item.availableStock))
            )}</p>`
          : ""
      }
    `;

    row.append(media, info);
    itemsListEl?.appendChild(row);
  });

  bindCheckoutEvents();
}

function bindCheckoutEvents() {
  const governorates = Array.isArray(previewData?.shippingZones)
    ? previewData.shippingZones
    : [];
  const addresses = Array.isArray(previewData?.addresses) ? previewData.addresses : [];
  const addressById = new Map(addresses.map((a) => [a.id, a]));

  document.querySelectorAll('input[name="selectedAddress"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked && radio.value !== selectedAddressId) {
        selectedAddressId = radio.value;
        rotateCheckoutIdempotencyKey();
        refreshQuoteForSelection();
      }
    });
  });

  document.getElementById("checkout-add-addr-btn")?.addEventListener("click", () => {
    openAddressFormModal({
      governorates,
      defaultFullName: activeUser?.fullName || "",
      defaultPhone: activeUser?.phone || "",
      onSaved: async (saved) => {
        if (saved?.id) selectedAddressId = saved.id;
        rotateCheckoutIdempotencyKey();
        await loadCheckoutPage({ preserveSelection: true });
      },
    });
  });

  document.querySelectorAll("[data-addr-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addr = addressById.get(btn.getAttribute("data-addr-edit"));
      if (!addr) return;
      openAddressFormModal({
        address: addr,
        governorates,
        onSaved: async (saved) => {
          if (saved?.id) selectedAddressId = saved.id;
          rotateCheckoutIdempotencyKey();
          await loadCheckoutPage({ preserveSelection: true });
        },
      });
    });
  });

  document.querySelectorAll("[data-addr-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addrId = btn.getAttribute("data-addr-delete");
      if (!addrId) return;
      const lang = getLanguage();
      openConfirmDialog({
        title: t("address.deleteConfirmTitle", lang),
        message: t("address.deleteConfirmMessage", lang),
        confirmLabel: t("address.deleteBtn", lang),
        cancelLabel: t("ui.cancel", lang),
        onConfirm: async () => {
          try {
            await deleteAddress(addrId);
            rotateCheckoutIdempotencyKey();
            showToast(t("address.deletedSuccess", getLanguage()), "info");
            if (selectedAddressId === addrId) {
              selectedAddressId = null;
            }
            await loadCheckoutPage({ preserveSelection: true });
          } catch (err) {
            if (err && err.status === 401) {
              redirectToAuth(appUrl("/pages/checkout.html"));
              return;
            }
            showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
          }
        },
      });
    });
  });

  const couponInput = document.getElementById("checkout-coupon-input");
  couponInput?.addEventListener("input", () => {
    couponInputDraft = couponInput.value;
  });

  document.getElementById("checkout-coupon-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = (couponInput?.value || "").trim();
    couponInputDraft = code;
    if (!code) {
      couponInlineError = t("checkout.couponPlaceholder", getLanguage());
      renderCheckoutView();
      return;
    }
    if (!getSelectedAddress()) {
      showToast(t("checkout.selectAddressRequired", getLanguage()), "warning");
      return;
    }
    if (code !== appliedCouponCode) {
      rotateCheckoutIdempotencyKey();
    }
    await refreshQuoteForSelection({ couponOverride: code });
  });

  document.getElementById("checkout-remove-coupon-btn")?.addEventListener("click", async () => {
    if (appliedCouponCode) {
      rotateCheckoutIdempotencyKey();
    }
    appliedCouponCode = "";
    couponInputDraft = "";
    couponInlineError = "";
    await refreshQuoteForSelection({ couponOverride: "" });
  });

  const notesInput = document.getElementById("checkout-notes-input");
  notesInput?.addEventListener("input", () => {
    customerNotesDraft = notesInput.value;
  });

  document.getElementById("checkout-place-order-btn")?.addEventListener("click", handlePlaceOrder);
}

async function handlePlaceOrder() {
  if (isSubmitting) return;
  const lang = getLanguage();

  if (!selectedAddressId) {
    showToast(t("checkout.selectAddressRequired", lang), "warning");
    return;
  }
  if (!hasCompleteDeliveryAddress(getSelectedAddress())) {
    const address = getSelectedAddress();
    showToast(
      address && isValidEgyptianPhone(address.phone)
        ? t("checkout.incompleteAddress", lang)
        : t("checkout.invalidAddressPhone", lang),
      "error"
    );
    return;
  }

  isSubmitting = true;
  stockConflictMessage = "";

  try {
    renderCheckoutView();
    const response = await placeCodOrder({
      addressId: selectedAddressId,
      ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
      ...(customerNotesDraft.trim() ? { customerNotes: customerNotesDraft.trim() } : {}),
      idempotencyKey: checkoutIdempotencyKey,
    });

    const order = response?.order;
    clearCartState();
    fetchCart({ force: true }).catch(() => {});

    if (order?.id) {
      showToast(
        t("checkout.orderPlacedToast", getLanguage()).replace(
          "{orderNumber}",
          order.orderNumber
        ),
        "success"
      );
      window.location.replace(
        `/pages/order-confirmation.html?id=${encodeURIComponent(order.id)}`
      );
      return;
    }
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(appUrl("/pages/checkout.html"));
      return;
    }

    const code = err?.code || "";
    if (code === "STORE_MAINTENANCE") {
      await loadCheckoutPage({ preserveSelection: true });
      showToast(err?.message || t("checkout.maintenanceAlert", getLanguage()), "error", 5000);
    } else if (couponRejectionCodes.has(code)) {
      const message = err?.message || t("ui.actionFailed", getLanguage());
      appliedCouponCode = "";
      couponInputDraft = "";
      rotateCheckoutIdempotencyKey();
      await loadCheckoutPage({ preserveSelection: true });
      couponInlineError = message;
      renderCheckoutView();
    } else if (code === "COD_DISABLED" || code === "ADDRESS_NOT_FOUND") {
      rotateCheckoutIdempotencyKey();
      if (code === "ADDRESS_NOT_FOUND") {
        selectedAddressId = null;
      }
      await loadCheckoutPage({
        preserveSelection: code !== "ADDRESS_NOT_FOUND",
      });
      showToast(
        code === "COD_DISABLED"
          ? t("checkout.codDisabledAlert", getLanguage())
          : t("checkout.addressUnavailableAlert", getLanguage()),
        "error",
        4500
      );
    } else if (
      code === "INSUFFICIENT_STOCK" ||
      code === "OUT_OF_STOCK" ||
      code === "PRODUCT_UNAVAILABLE" ||
      code === "VARIANT_UNAVAILABLE" ||
      code === "CART_EMPTY"
    ) {
      stockConflictMessage = err?.message || t("checkout.stockChangedAlert", getLanguage());
      rotateCheckoutIdempotencyKey();
      await loadCheckoutPage({ preserveSelection: true });
      showToast(stockConflictMessage, "error", 4500);
    } else if (code === "ADDRESS_INCOMPLETE" || code === "PHONE_REQUIRED") {
      await loadCheckoutPage({ preserveSelection: true });
      showToast(
        code === "ADDRESS_INCOMPLETE"
          ? t("checkout.incompleteAddress", getLanguage())
          : t("checkout.invalidAddressPhone", getLanguage()),
        "error"
      );
    } else if (code === "VALIDATION_ERROR" || (err?.status === 422 && Array.isArray(err?.details))) {
      const firstFieldError = Array.isArray(err?.details)
        ? err.details.find((detail) => detail?.message)
        : null;
      showToast(
        firstFieldError?.message || err?.message || t("ui.actionFailed", getLanguage()),
        "error",
        4500
      );
    } else if (err?.status === 403 && err?.code === "FORBIDDEN") {
      showToast(t("ui.customerOnlyAction", getLanguage()), "error", 4500);
    } else {
      // No response status means the order outcome is unknown; retry with the same idempotency key.
      showToast(err?.message || t("ui.actionFailed", getLanguage()), "error", 4500);
    }
  } finally {
    isSubmitting = false;
    renderCheckoutView();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("checkout-root");
  if (root) renderLoadingState(root, 3);

  activeUser = await requireCustomerAuth();
  if (!activeUser) return;

  await fetchCart({ force: true }).catch(() => {});
  await loadCheckoutPage({ preserveSelection: false });

  window.addEventListener("zain:langchange", renderCheckoutView);
  window.addEventListener("zain:settingsloaded", renderCheckoutView);
});
