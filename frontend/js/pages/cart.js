import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Shopping Bag Page Controller
 * Protected customer route backed by Neon PostgreSQL via /api/v1/cart.
 */

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
import { redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { getCachedPublicSettings } from "../services/settings-service.js";
import {
  clearCart,
  fetchCart,
  removeCartItem,
  updateCartItemQuantity,
} from "../services/cart-service.js";
import {
  escapeHtml,
  formatPriceEGP,
  pickLocalized,
  resolveColorMeta,
} from "../utils/formatters.js";

let currentCart = null;
let loadError = null;
let isClearing = false;
const busyItemIds = new Set();

function renderCartView() {
  const root = document.getElementById("cart-root");
  if (!root) return;

  const lang = getLanguage();
  const rawFreeShippingThreshold =
    getCachedPublicSettings()?.shipping?.freeShippingThreshold;
  const hasFreeShippingThreshold =
    rawFreeShippingThreshold !== null &&
    rawFreeShippingThreshold !== undefined &&
    Number.isFinite(Number(rawFreeShippingThreshold));
  const shippingNote = hasFreeShippingThreshold
    ? t("cart.summaryShippingNote", lang).replace(
        "{amount}",
        formatPriceEGP(Number(rawFreeShippingThreshold), lang)
      )
    : t("cart.summaryShippingNotePending", lang);
  root.removeAttribute("aria-busy");

  if (loadError) {
    renderErrorState(root, {
      title: t("cart.errorTitle", lang),
      onRetry: loadCartPage,
    });
    return;
  }

  const items = Array.isArray(currentCart?.items) ? currentCart.items : [];
  if (items.length === 0) {
    renderEmptyState(root, {
      title: t("cart.emptyTitle", lang),
      description: t("cart.emptyDesc", lang),
      actionLabel: t("cart.emptyAction", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  const totalCount = Number(currentCart?.totalItemCount ?? 0);
  const countText =
    totalCount === 1
      ? t("cart.itemCountSingle", lang)
      : t("cart.itemCountPlural", lang).replace("{count}", String(totalCount));

  root.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items-panel">
        <div class="cart-panel__head">
          <div class="cart-panel__title-group">
            <h2 style="font-size: 1.25rem;">${escapeHtml(t("cart.itemsHeading", lang))}</h2>
            <span class="text-muted tabular-nums" style="font-size: 0.875rem;">(${escapeHtml(countText)})</span>
          </div>
          <button
            type="button"
            id="cart-clear-btn"
            class="btn btn--ghost btn--sm"
            ${isClearing ? "disabled" : ""}
          >
            ${escapeHtml(t("cart.clearBag", lang))}
          </button>
        </div>

        ${
          currentCart?.hasStockIssues
            ? `<div class="form-status form-status--error" role="alert">${escapeHtml(t("cart.stockIssuesAlert", lang))}</div>`
            : ""
        }

        <div id="cart-items-list" class="cart-items-list"></div>
      </div>

      <aside class="cart-summary-card" aria-label="${escapeHtml(t("cart.summaryHeading", lang))}">
        <h2 class="cart-summary-card__title">${escapeHtml(t("cart.summaryHeading", lang))}</h2>

        <dl class="cart-summary-rows">
          <div class="cart-summary-row">
            <dt class="text-muted">${escapeHtml(t("cart.summaryItems", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(countText)}</dd>
          </div>
          <div class="cart-summary-row cart-summary-row--total">
            <dt>${escapeHtml(t("cart.summarySubtotal", lang))}</dt>
            <dd class="tabular-nums">${escapeHtml(formatPriceEGP(currentCart.subtotal, lang))}</dd>
          </div>
        </dl>

        <p class="cart-summary-note">${escapeHtml(shippingNote)}</p>

        <div class="cart-summary-actions">
          ${
            currentCart?.hasStockIssues
              ? `
              <button type="button" class="btn btn--primary" disabled aria-disabled="true">
                ${escapeHtml(t("cart.proceedCheckout", lang))}
              </button>
              <p class="cart-checkout-future-note">${escapeHtml(t("cart.checkoutResolveStockNote", lang))}</p>
            `
              : `
              <a href=${appUrl("/pages/checkout.html")} class="btn btn--primary">
                ${escapeHtml(t("cart.proceedCheckout", lang))}
              </a>
            `
          }
          <a href="/shop.html" class="btn btn--secondary">
            ${escapeHtml(t("cart.continueShopping", lang))}
          </a>
        </div>
      </aside>
    </div>
  `;

  const listEl = document.getElementById("cart-items-list");
  items.forEach((item) => {
    const title = pickLocalized(item, "name", lang);
    const productUrl = `/product.html?slug=${encodeURIComponent(item.slug)}`;
    const colorMeta = resolveColorMeta(item.color);
    const colorLabel = lang === "ar" ? colorMeta.name_ar : colorMeta.name_en;
    const isBusy = busyItemIds.has(item.id) || isClearing;
    const hasCompareAt =
      item.compareAtPrice !== null &&
      item.compareAtPrice !== undefined &&
      Number(item.compareAtPrice) > Number(item.unitPrice);

    let stockLine = "";
    let stockLineClass = "cart-item__stock";
    if (!item.isAvailable) {
      stockLine = t("cart.productUnavailable", lang);
      stockLineClass += " cart-item__stock--error";
    } else if (!item.inStock || item.availableStock <= 0) {
      stockLine = t("cart.outOfStockWarning", lang);
      stockLineClass += " cart-item__stock--error";
    } else if (item.exceedsStock) {
      stockLine = t("cart.exceedsStockWarning", lang).replace(
        "{count}",
        String(item.availableStock)
      );
      stockLineClass += " cart-item__stock--error";
    } else if (item.availableStock <= 5) {
      stockLine = t("cart.lowStockHint", lang).replace(
        "{count}",
        String(item.availableStock)
      );
      stockLineClass += " cart-item__stock--warn";
    } else {
      stockLine = t("cart.inStockHint", lang).replace(
        "{count}",
        String(item.availableStock)
      );
    }

    const row = document.createElement("article");
    row.className = "cart-item-row";
    row.dataset.itemId = item.id;

    const media = document.createElement("a");
    media.href = productUrl;
    media.className = "cart-item__media";
    media.setAttribute("aria-label", title);
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

    const details = document.createElement("div");
    details.className = "cart-item__details";
    details.innerHTML = `
      <div class="cart-item__top">
        <div>
          <h3 class="cart-item__title">
            <a href="${productUrl}">${escapeHtml(title)}</a>
          </h3>
          <div class="cart-item__meta">
            <span>${escapeHtml(t("cart.sizeLabel", lang))}: <strong>${escapeHtml(item.size)}</strong></span>
            <span aria-hidden="true">·</span>
            <span class="cart-item__color-inline">
              ${escapeHtml(t("cart.colorLabel", lang))}:
              <span class="color-dot" style="background-color: ${escapeHtml(colorMeta.hex)};" aria-hidden="true"></span>
              <strong>${escapeHtml(colorLabel)}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span class="tabular-nums">${escapeHtml(t("cart.skuLabel", lang))}: ${escapeHtml(item.sku)}</span>
          </div>
        </div>

        <div class="cart-item__price-col tabular-nums">
          <span class="cart-item__subtotal">${escapeHtml(formatPriceEGP(item.itemSubtotal, lang))}</span>
          <span class="cart-item__unit-price text-muted">
            ${escapeHtml(formatPriceEGP(item.unitPrice, lang))}
            ${hasCompareAt ? `<span class="product-card__compare-price">${escapeHtml(formatPriceEGP(item.compareAtPrice, lang))}</span>` : ""}
          </span>
        </div>
      </div>

      <p class="${stockLineClass}">${escapeHtml(stockLine)}</p>

      <div class="cart-item__actions">
        <div class="qty-stepper" aria-label="${escapeHtml(t("pdp.quantity", lang))}">
          <button
            type="button"
            class="qty-stepper__btn"
            data-cart-dec="${escapeHtml(item.id)}"
            ${isBusy || !item.isAvailable || item.quantity <= 1 ? "disabled" : ""}
            aria-label="-"
          >−</button>
          <span class="qty-stepper__value">${item.quantity}</span>
          <button
            type="button"
            class="qty-stepper__btn"
            data-cart-inc="${escapeHtml(item.id)}"
            ${isBusy || !item.inStock || item.quantity >= item.availableStock ? "disabled" : ""}
            aria-label="+"
          >+</button>
        </div>

        <button
          type="button"
          class="btn btn--ghost btn--sm cart-item__remove"
          data-cart-remove="${escapeHtml(item.id)}"
          ${isBusy ? "disabled" : ""}
        >
          ${escapeHtml(t("cart.removeItem", lang))}
        </button>
      </div>
    `;

    row.append(media, details);
    listEl?.appendChild(row);
  });

  bindCartRowHandlers();
}

async function handleQuantityChange(item, nextQuantity) {
  if (busyItemIds.has(item.id) || isClearing) return;
  if (nextQuantity < 1) return;

  busyItemIds.add(item.id);
  renderCartView();

  try {
    currentCart = await updateCartItemQuantity(item.id, nextQuantity);
    showToast(t("cart.updatedSuccess", getLanguage()), "success", 2200);
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(${appUrl("/pages/cart.html")});
      return;
    }
    if (err && (err.code === "INSUFFICIENT_STOCK" || err.code === "OUT_OF_STOCK")) {
      showToast(err.message || t("pdp.stockConflictError", getLanguage()), "error", 4000);
      try {
        currentCart = await fetchCart({ force: true });
      } catch {
        // Keep current view
      }
    } else {
      showToast(
        err?.status === 403 && err?.code === "FORBIDDEN"
          ? t("ui.customerOnlyAction", getLanguage())
          : t("ui.actionFailed", getLanguage()),
        "error"
      );
    }
  } finally {
    busyItemIds.delete(item.id);
    renderCartView();
  }
}

async function handleRemoveItem(item) {
  if (busyItemIds.has(item.id) || isClearing) return;
  busyItemIds.add(item.id);
  renderCartView();

  try {
    currentCart = await removeCartItem(item.id);
    showToast(t("cart.removedSuccess", getLanguage()), "info");
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(${appUrl("/pages/cart.html")});
      return;
    }
    showToast(
      err?.status === 403 && err?.code === "FORBIDDEN"
        ? t("ui.customerOnlyAction", getLanguage())
        : t("ui.actionFailed", getLanguage()),
      "error"
    );
  } finally {
    busyItemIds.delete(item.id);
    renderCartView();
  }
}

function bindCartRowHandlers() {
  const items = Array.isArray(currentCart?.items) ? currentCart.items : [];
  const itemById = new Map(items.map((i) => [i.id, i]));

  document.querySelectorAll("[data-cart-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = itemById.get(btn.getAttribute("data-cart-dec"));
      if (item && item.quantity > 1) {
        handleQuantityChange(item, item.quantity - 1);
      }
    });
  });

  document.querySelectorAll("[data-cart-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = itemById.get(btn.getAttribute("data-cart-inc"));
      if (item) {
        handleQuantityChange(item, item.quantity + 1);
      }
    });
  });

  document.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = itemById.get(btn.getAttribute("data-cart-remove"));
      if (item) {
        handleRemoveItem(item);
      }
    });
  });

  document.getElementById("cart-clear-btn")?.addEventListener("click", () => {
    const lang = getLanguage();
    openConfirmDialog({
      title: t("cart.clearConfirmTitle", lang),
      message: t("cart.clearConfirmMessage", lang),
      confirmLabel: t("cart.clearBag", lang),
      cancelLabel: t("ui.cancel", lang),
      onConfirm: async () => {
        if (isClearing) return;
        isClearing = true;
        renderCartView();
        try {
          currentCart = await clearCart();
          showToast(t("cart.clearedSuccess", getLanguage()), "info");
        } catch (err) {
          if (err && err.status === 401) {
            redirectToAuth(${appUrl("/pages/cart.html")});
            return;
          }
          showToast(
            err?.status === 403 && err?.code === "FORBIDDEN"
              ? t("ui.customerOnlyAction", getLanguage())
              : t("ui.actionFailed", getLanguage()),
            "error"
          );
        } finally {
          isClearing = false;
          renderCartView();
        }
      },
    });
  });
}

async function loadCartPage() {
  const root = document.getElementById("cart-root");
  loadError = null;
  if (root) renderLoadingState(root, 2);

  try {
    currentCart = await fetchCart({ force: true });
    if (!currentCart) {
      redirectToAuth(${appUrl("/pages/cart.html")});
      return;
    }
  } catch (err) {
    loadError = err;
  }

  renderCartView();
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("cart-root");
  if (root) renderLoadingState(root, 2);

  const user = await requireCustomerAuth();
  if (!user) return;

  await loadCartPage();

  window.addEventListener("zain:langchange", renderCartView);
  window.addEventListener("zain:settingsloaded", renderCartView);
});
