import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Wishlist Page Controller
 * Protected customer route backed by Neon PostgreSQL via /api/v1/wishlist and /api/v1/cart.
 */

import { initLayout } from "../components/layout.js";
import { createGarmentPlaceholder, inferGarmentType } from "../components/placeholders.js";
import {
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
  showToast,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { addToCart } from "../services/cart-service.js";
import { fetchWishlist, removeFromWishlist } from "../services/wishlist-service.js";
import {
  escapeHtml,
  formatPriceEGP,
  pickLocalized,
  resolveColorMeta,
} from "../utils/formatters.js";

let currentWishlist = null;
let loadError = null;
const selectedVariantsByProduct = new Map();
const busyProductIds = new Set();

function formatVariantOptionLabel(variant, lang) {
  const colorMeta = resolveColorMeta(variant.color);
  const colorLabel = lang === "ar" ? colorMeta.name_ar : colorMeta.name_en;
  const stockSuffix = !variant.inStock ? ` (${t("wishlist.outOfStockBadge", lang)})` : "";
  return `${variant.size} · ${colorLabel}${stockSuffix}`;
}

function getSelectedVariant(item) {
  const variants = Array.isArray(item.variants) ? item.variants : [];
  if (variants.length === 0) return null;

  const chosenId = selectedVariantsByProduct.get(item.productId);
  if (chosenId) {
    const match = variants.find((v) => v.id === chosenId);
    if (match) return match;
  }

  return variants.find((v) => v.inStock) || variants[0];
}

function renderWishlistView() {
  const root = document.getElementById("wishlist-root");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  if (loadError) {
    renderErrorState(root, {
      title: t("wishlist.errorTitle", lang),
      onRetry: loadWishlistPage,
    });
    return;
  }

  const items = Array.isArray(currentWishlist?.items) ? currentWishlist.items : [];
  if (items.length === 0) {
    renderEmptyState(root, {
      title: t("wishlist.emptyTitle", lang),
      description: t("wishlist.emptyDesc", lang),
      actionLabel: t("wishlist.emptyAction", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  const countLabel =
    items.length === 1
      ? t("wishlist.countSingle", lang)
      : t("wishlist.countPlural", lang).replace("{count}", String(items.length));

  root.innerHTML = `
    <div class="wishlist-toolbar">
      <span class="text-muted tabular-nums" style="font-size: 0.875rem;">${escapeHtml(countLabel)}</span>
      <a href="/shop.html" class="btn btn--ghost btn--sm">${escapeHtml(t("wishlist.continueShopping", lang))}</a>
    </div>
    <div id="wishlist-grid" class="product-grid"></div>
  `;

  const grid = document.getElementById("wishlist-grid");
  if (!grid) return;

  items.forEach((item) => {
    const title = pickLocalized(item, "name", lang);
    const categoryName = pickLocalized(item.category, "name", lang);
    const productUrl = `/product.html?slug=${encodeURIComponent(item.slug)}`;
    const activeVariant = getSelectedVariant(item);
    const displayPrice = activeVariant ? Number(activeVariant.price) : Number(item.price);
    const hasCompareAt =
      item.compareAtPrice !== null &&
      item.compareAtPrice !== undefined &&
      Number(item.compareAtPrice) > displayPrice;

    const isBusy = busyProductIds.has(item.productId);
    const canAddVariant = Boolean(item.inStock && activeVariant && activeVariant.inStock);

    let statusKey = "wishlist.outOfStockBadge";
    let statusClass = "wishlist-card__status--out";
    if (item.availabilityStatus === "in_stock") {
      statusKey = "wishlist.inStockBadge";
      statusClass = "wishlist-card__status--ok";
    } else if (item.availabilityStatus === "low_stock") {
      statusKey = "wishlist.lowStockBadge";
      statusClass = "wishlist-card__status--low";
    }

    const card = document.createElement("article");
    card.className = "wishlist-card";

    const media = document.createElement("div");
    media.className = "product-card__media";

    const mediaLink = document.createElement("a");
    mediaLink.href = productUrl;
    mediaLink.className = "product-card__link-media";
    mediaLink.setAttribute("aria-label", title);

    if (item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = title;
      img.className = "product-card__img";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        mediaLink.innerHTML = "";
        mediaLink.appendChild(createGarmentPlaceholder(inferGarmentType(item)));
      });
      mediaLink.appendChild(img);
    } else {
      mediaLink.appendChild(createGarmentPlaceholder(inferGarmentType(item)));
    }
    media.appendChild(mediaLink);

    const body = document.createElement("div");
    body.className = "wishlist-card__body";

    const topMeta = document.createElement("div");
    topMeta.className = "wishlist-card__meta-row";
    topMeta.innerHTML = `
      <span class="product-card__category">${escapeHtml(categoryName)}</span>
      <span aria-hidden="true">·</span>
      <span class="wishlist-card__status ${statusClass}">${escapeHtml(t(statusKey, lang))}</span>
    `;

    const titleEl = document.createElement("h2");
    titleEl.className = "product-card__title";
    titleEl.innerHTML = `<a href="${productUrl}">${escapeHtml(title)}</a>`;

    const priceRow = document.createElement("div");
    priceRow.className = "product-card__price-row";
    priceRow.innerHTML = `
      <span class="product-card__price">${escapeHtml(formatPriceEGP(displayPrice, lang))}</span>
      ${hasCompareAt ? `<span class="product-card__compare-price">${escapeHtml(formatPriceEGP(item.compareAtPrice, lang))}</span>` : ""}
    `;

    body.append(topMeta, titleEl, priceRow);

    if (Array.isArray(item.variants) && item.variants.length > 0 && item.inStock) {
      const selectWrap = document.createElement("div");
      selectWrap.className = "wishlist-card__variant-wrap";

      const label = document.createElement("label");
      const selectId = `wish-var-${item.productId}`;
      label.htmlFor = selectId;
      label.className = "sr-only";
      label.textContent = t("wishlist.selectVariant", lang);

      const select = document.createElement("select");
      select.id = selectId;
      select.className = "input wishlist-card__select";
      select.disabled = isBusy;

      item.variants.forEach((variant) => {
        const opt = document.createElement("option");
        opt.value = variant.id;
        opt.textContent = formatVariantOptionLabel(variant, lang);
        opt.disabled = !variant.inStock;
        if (activeVariant && variant.id === activeVariant.id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener("change", () => {
        selectedVariantsByProduct.set(item.productId, select.value);
        renderWishlistView();
      });

      selectWrap.append(label, select);
      body.appendChild(selectWrap);
    }

    const actions = document.createElement("div");
    actions.className = "wishlist-card__actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--primary btn--sm";
    addBtn.disabled = isBusy || !canAddVariant;
    addBtn.textContent = !canAddVariant
      ? t("wishlist.unavailableAction", lang)
      : isBusy
      ? t("wishlist.addingToBag", lang)
      : t("wishlist.addToBag", lang);

    addBtn.addEventListener("click", async () => {
      if (!canAddVariant || busyProductIds.has(item.productId)) return;
      busyProductIds.add(item.productId);
      renderWishlistView();

      try {
        await addToCart({
          variantId: activeVariant.id,
          productId: item.productId,
          quantity: 1,
        });
        showToast(
          t("wishlist.addedToBag", getLanguage()).replace("{name}", title),
          "success"
        );
      } catch (err) {
        if (err && err.status === 401) {
          redirectToAuth(appUrl("/pages/wishlist.html"));
          return;
        }
        if (err && (err.code === "INSUFFICIENT_STOCK" || err.code === "OUT_OF_STOCK")) {
          showToast(err.message || t("pdp.stockConflictError", getLanguage()), "error");
          await loadWishlistPage();
          return;
        }
        showToast(
          err?.status === 403 && err?.code === "FORBIDDEN"
            ? t("ui.customerOnlyAction", getLanguage())
            : t("ui.actionFailed", getLanguage()),
          "error"
        );
      } finally {
        busyProductIds.delete(item.productId);
        renderWishlistView();
      }
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--secondary btn--sm";
    removeBtn.disabled = isBusy;
    removeBtn.textContent = t("wishlist.remove", lang);

    removeBtn.addEventListener("click", async () => {
      if (busyProductIds.has(item.productId)) return;
      busyProductIds.add(item.productId);
      renderWishlistView();

      try {
        currentWishlist = await removeFromWishlist(item.productId);
        selectedVariantsByProduct.delete(item.productId);
        showToast(t("ui.wishlistRemoved", getLanguage()), "info");
      } catch (err) {
        if (err && err.status === 401) {
          redirectToAuth(appUrl("/pages/wishlist.html"));
          return;
        }
        showToast(
          err?.status === 403 && err?.code === "FORBIDDEN"
            ? t("ui.customerOnlyAction", getLanguage())
            : t("ui.actionFailed", getLanguage()),
          "error"
        );
      } finally {
        busyProductIds.delete(item.productId);
        renderWishlistView();
      }
    });

    actions.append(addBtn, removeBtn);
    body.appendChild(actions);

    card.append(media, body);
    grid.appendChild(card);
  });
}

async function loadWishlistPage() {
  const root = document.getElementById("wishlist-root");
  loadError = null;
  if (root) renderLoadingState(root, 3);

  try {
    currentWishlist = await fetchWishlist({ force: true });
    if (!currentWishlist) {
      redirectToAuth(appUrl("/pages/wishlist.html"));
      return;
    }
  } catch (err) {
    loadError = err;
  }

  renderWishlistView();
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("wishlist-root");
  if (root) renderLoadingState(root, 3);

  const user = await requireCustomerAuth();
  if (!user) return;

  await loadWishlistPage();

  window.addEventListener("zain:langchange", renderWishlistView);
});
