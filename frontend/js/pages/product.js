/**
 * MR. ZAIN — Product Details Page Controller
 * Connected to live GET /api/v1/products/:slug endpoint (Neon PostgreSQL).
 */

import { initLayout } from "../components/layout.js";
import { createGarmentPlaceholder, inferGarmentType } from "../components/placeholders.js";
import { createProductCard } from "../components/product-card.js";
import {
  openModal,
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
  showToast,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import {
  fetchCurrentUser,
  getCachedUser,
  redirectToAuth,
} from "../services/auth-service.js";
import { addToCart } from "../services/cart-service.js";
import { fetchProductBySlug } from "../services/catalog-service.js";
import {
  addToWishlist,
  getCachedWishlistIds,
  toggleWishlistItem,
} from "../services/wishlist-service.js";
import {
  escapeHtml,
  formatPriceEGP,
  pickLocalized,
  resolveColorMeta,
} from "../utils/formatters.js";

let currentProduct = null;
let loadError = null;
let requestedSlug = "";
let selectedImageIndex = 0;
let selectedColor = "";
let selectedSize = "";
let selectedQty = 1;

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];

function getVariantStock(variant) {
  return Number(variant?.availableStock ?? variant?.stock ?? 0);
}

function getUniqueColors(variants = []) {
  const map = new Map();
  variants.forEach((v) => {
    if (!map.has(v.color)) {
      const meta = resolveColorMeta(v.color);
      map.set(v.color, {
        color: v.color,
        name_en: meta.name_en,
        name_ar: v.color_ar || meta.name_ar,
        colorHex: v.colorHex || meta.hex,
      });
    }
  });
  return [...map.values()];
}

function getUniqueSizes(variants = []) {
  const sizes = new Set(variants.map((v) => v.size));
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function findVariant(color, size) {
  if (!currentProduct) return null;
  return (currentProduct.variants || []).find(
    (v) => v.color === color && v.size === size
  );
}

function openSizeGuideModal() {
  const lang = getLanguage();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <p class="text-muted" style="font-size: 0.875rem;">${escapeHtml(t("pdp.sizeGuideIntro", lang))}</p>
    <table class="size-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("pdp.sizeColSize", lang))}</th>
          <th>${escapeHtml(t("pdp.sizeColChest", lang))}</th>
          <th>${escapeHtml(t("pdp.sizeColLength", lang))}</th>
          <th>${escapeHtml(t("pdp.sizeColShoulder", lang))}</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>S</td><td>58</td><td>68</td><td>54</td></tr>
        <tr><td>M</td><td>61</td><td>71</td><td>56</td></tr>
        <tr><td>L</td><td>64</td><td>74</td><td>58</td></tr>
        <tr><td>XL</td><td>67</td><td>77</td><td>60</td></tr>
      </tbody>
    </table>
  `;

  openModal({
    title: t("pdp.sizeGuideTitle", lang),
    content: wrapper,
  });
}

function renderProductPage() {
  const root = document.getElementById("pdp-root");
  const breadcrumb = document.getElementById("pdp-breadcrumb");
  const relatedSection = document.getElementById("pdp-related-section");
  const relatedGrid = document.getElementById("pdp-related-grid");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  if (loadError && loadError.status !== 422) {
    if (breadcrumb) breadcrumb.innerHTML = "";
    if (relatedSection) relatedSection.hidden = true;
    renderErrorState(root, {
      onRetry: loadProductPage,
    });
    return;
  }

  if (!currentProduct) {
    if (breadcrumb) breadcrumb.innerHTML = "";
    if (relatedSection) relatedSection.hidden = true;
    renderEmptyState(root, {
      title: t("pdp.notFoundTitle", lang),
      description: t("pdp.notFoundDesc", lang),
      actionLabel: t("pdp.backToShop", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  const title = pickLocalized(currentProduct, "name", lang);
  const category =
    currentProduct.category && typeof currentProduct.category === "object"
      ? pickLocalized(currentProduct.category, "name", lang)
      : pickLocalized(currentProduct, "category", lang);
  const desc = pickLocalized(currentProduct, "description", lang) || t("pdp.noDescription", lang);
  const garmentType = inferGarmentType(currentProduct);

  document.title = `${title} — MR. ZAIN`;

  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <a href="/index.html">${escapeHtml(t("pdp.breadcrumbHome", lang))}</a>
      <span aria-hidden="true">/</span>
      <a href="/shop.html">${escapeHtml(t("pdp.breadcrumbShop", lang))}</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(title)}</span>
    `;
  }

  const variants = Array.isArray(currentProduct.variants) ? currentProduct.variants : [];
  const colors = getUniqueColors(variants);
  const sizes = getUniqueSizes(variants);
  const activeVariant = findVariant(selectedColor, selectedSize);
  const stock = getVariantStock(activeVariant);
  if (stock > 0 && selectedQty > stock) selectedQty = stock;
  if (stock === 0) selectedQty = 1;

  const displayPrice = activeVariant
    ? Number(activeVariant.price)
    : Number(currentProduct.basePrice);
  const compareAt =
    currentProduct.compareAtPrice !== null && currentProduct.compareAtPrice !== undefined
      ? Number(currentProduct.compareAtPrice)
      : null;
  const hasDiscount = compareAt !== null && compareAt > displayPrice;

  const images =
    Array.isArray(currentProduct.images) && currentProduct.images.length > 0
      ? currentProduct.images.map((img) => ({
          id: img.id,
          url: img.imageUrl || img.url || "",
          alt: img.altText || title,
        }))
      : [{ id: "default", url: "", alt: title }];
  const activeImg = images[selectedImageIndex] || images[0];
  const wishlistIds = getCachedUser() ? getCachedWishlistIds() : new Set();
  const isWishlisted = wishlistIds.has(currentProduct.id);

  let stockText = variants.length === 0 ? t("pdp.noVariants", lang) : t("pdp.outOfStock", lang);
  let stockClass = "pdp-stock-line--out";
  if (stock > 5) {
    stockText = t("pdp.inStockCount", lang).replace("{count}", String(stock));
    stockClass = "pdp-stock-line--ok";
  } else if (stock > 0) {
    stockText = t("pdp.lowStockCount", lang).replace("{count}", String(stock));
    stockClass = "pdp-stock-line--low";
  }

  const selectedColorMeta = colors.find((c) => c.color === selectedColor);
  const selectedColorLabel = selectedColorMeta
    ? lang === "ar"
      ? selectedColorMeta.name_ar
      : selectedColorMeta.name_en
    : "";

  const collectionNames = Array.isArray(currentProduct.collections)
    ? currentProduct.collections.map((c) => pickLocalized(c, "name", lang)).filter(Boolean)
    : [];

  root.innerHTML = `
    <div class="pdp-grid">
      <div class="pdp-gallery">
        <div class="pdp-thumbs" id="pdp-thumbs"></div>
        <div class="pdp-main-frame" id="pdp-main-frame"></div>
      </div>

      <div class="pdp-info">
        <div>
          <span class="section-kicker">${escapeHtml(category)}${activeVariant ? ` · ${escapeHtml(activeVariant.sku)}` : ""}</span>
          <h1 style="font-size: clamp(1.75rem, 3vw, 2.35rem);">${escapeHtml(title)}</h1>
        </div>

        <div class="pdp-price-row">
          <span class="pdp-price">${escapeHtml(formatPriceEGP(displayPrice, lang))}</span>
          ${hasDiscount ? `<span class="pdp-compare-price">${escapeHtml(formatPriceEGP(compareAt, lang))}</span>` : ""}
        </div>

        <p class="text-muted">${escapeHtml(desc)}</p>

        ${
          colors.length > 0
            ? `
          <div>
            <div class="pdp-option-header">
              <span class="pdp-option-label">${escapeHtml(t("pdp.selectColor", lang))}: ${escapeHtml(selectedColorLabel)}</span>
            </div>
            <div class="pdp-swatches" id="pdp-colors"></div>
          </div>
        `
            : ""
        }

        ${
          sizes.length > 0
            ? `
          <div>
            <div class="pdp-option-header">
              <span class="pdp-option-label">${escapeHtml(t("pdp.selectSize", lang))}: ${escapeHtml(selectedSize)}</span>
              <button type="button" id="pdp-size-guide-btn" class="btn btn--ghost btn--sm">
                ${escapeHtml(t("pdp.sizeGuide", lang))}
              </button>
            </div>
            <div class="pdp-sizes" id="pdp-sizes"></div>
          </div>
        `
            : ""
        }

        <p class="pdp-stock-line ${stockClass}">${escapeHtml(stockText)}</p>

        <div class="pdp-buy-row">
          <div class="qty-stepper" aria-label="${escapeHtml(t("pdp.quantity", lang))}">
            <button type="button" class="qty-stepper__btn" id="pdp-qty-dec" ${stock <= 0 || selectedQty <= 1 ? "disabled" : ""} aria-label="-">−</button>
            <span class="qty-stepper__value" id="pdp-qty-val">${selectedQty}</span>
            <button type="button" class="qty-stepper__btn" id="pdp-qty-inc" ${stock <= 0 || selectedQty >= stock ? "disabled" : ""} aria-label="+">+</button>
          </div>

          <button type="button" id="pdp-add-cart" class="btn btn--primary" style="flex: 1;" ${stock <= 0 ? "disabled" : ""}>
            ${escapeHtml(stock <= 0 ? t("pdp.outOfStock", lang) : t("pdp.addToCart", lang))}
          </button>

          <button type="button" id="pdp-wishlist-btn" class="btn btn--secondary" aria-pressed="${isWishlisted}">
            ${escapeHtml(isWishlisted ? t("pdp.savedWishlist", lang) : t("pdp.addToWishlist", lang))}
          </button>
        </div>

        <div class="pdp-shipping-box">
          <strong>${escapeHtml(t("pdp.shippingSummaryTitle", lang))}</strong>
          <span class="text-muted">${escapeHtml(t("pdp.shippingSummaryText", lang))}</span>
        </div>

        <div class="pdp-accordion">
          <details class="pdp-accordion__item" open>
            <summary class="pdp-accordion__trigger">
              <span>${escapeHtml(t("pdp.detailsHeading", lang))}</span>
              <span aria-hidden="true">+</span>
            </summary>
            <div class="pdp-accordion__body">
              <p>${escapeHtml(desc)}</p>
              ${activeVariant ? `<p class="text-muted" style="margin-top: 0.5rem;">${escapeHtml(t("pdp.skuLabel", lang))}: ${escapeHtml(activeVariant.sku)}</p>` : ""}
              ${collectionNames.length > 0 ? `<p class="text-muted" style="margin-top: 0.25rem;">${escapeHtml(t("pdp.collectionsLabel", lang))}: ${escapeHtml(collectionNames.join(", "))}</p>` : ""}
            </div>
          </details>

          <details class="pdp-accordion__item">
            <summary class="pdp-accordion__trigger">
              <span>${escapeHtml(t("pdp.shippingHeading", lang))}</span>
              <span aria-hidden="true">+</span>
            </summary>
            <div class="pdp-accordion__body">${escapeHtml(t("pdp.shippingDetailsBody", lang))}</div>
          </details>
        </div>
      </div>
    </div>
  `;

  // Populate Main Image
  const mainFrame = document.getElementById("pdp-main-frame");
  if (mainFrame) {
    if (activeImg.url) {
      const img = document.createElement("img");
      img.src = activeImg.url;
      img.alt = activeImg.alt || title;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        mainFrame.innerHTML = "";
        mainFrame.appendChild(createGarmentPlaceholder(garmentType, title));
      });
      mainFrame.appendChild(img);
    } else {
      mainFrame.appendChild(createGarmentPlaceholder(garmentType, title));
    }
  }

  // Populate Thumbnails
  const thumbsEl = document.getElementById("pdp-thumbs");
  if (thumbsEl) {
    images.forEach((imgItem, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pdp-thumb-btn ${idx === selectedImageIndex ? "is-active" : ""}`;
      btn.setAttribute("aria-label", imgItem.alt || `${title} ${idx + 1}`);
      if (imgItem.url) {
        const img = document.createElement("img");
        img.src = imgItem.url;
        img.alt = imgItem.alt || title;
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
          btn.innerHTML = "";
          const placeholder = createGarmentPlaceholder(garmentType, title);
          placeholder.style.padding = "0.25rem";
          btn.appendChild(placeholder);
        });
        btn.appendChild(img);
      } else {
        const placeholder = createGarmentPlaceholder(garmentType, title);
        placeholder.style.padding = "0.25rem";
        btn.appendChild(placeholder);
      }
      btn.addEventListener("click", () => {
        selectedImageIndex = idx;
        renderProductPage();
      });
      thumbsEl.appendChild(btn);
    });
  }

  // Populate Colors
  const colorsEl = document.getElementById("pdp-colors");
  colors.forEach((colorObj) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pdp-color-btn ${colorObj.color === selectedColor ? "is-active" : ""}`;

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.backgroundColor = colorObj.colorHex;

    const text = document.createElement("span");
    text.textContent = lang === "ar" ? colorObj.name_ar : colorObj.name_en;

    btn.append(dot, text);
    btn.addEventListener("click", () => {
      selectedColor = colorObj.color;
      const candidate = findVariant(selectedColor, selectedSize);
      if (!candidate || getVariantStock(candidate) <= 0) {
        const firstAvailable = variants.find(
          (v) => v.color === selectedColor && getVariantStock(v) > 0
        );
        if (firstAvailable) selectedSize = firstAvailable.size;
      }
      selectedQty = 1;
      renderProductPage();
    });
    colorsEl?.appendChild(btn);
  });

  // Populate Sizes (Visibly disable unavailable variants)
  const sizesEl = document.getElementById("pdp-sizes");
  sizes.forEach((size) => {
    const variant = findVariant(selectedColor, size);
    const available = Boolean(variant && getVariantStock(variant) > 0);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pdp-size-btn ${size === selectedSize ? "is-active" : ""}`;
    btn.textContent = size;
    btn.disabled = !available;
    btn.addEventListener("click", () => {
      selectedSize = size;
      selectedQty = 1;
      renderProductPage();
    });
    sizesEl?.appendChild(btn);
  });

  // Bind Controls
  document.getElementById("pdp-size-guide-btn")?.addEventListener("click", openSizeGuideModal);

  document.getElementById("pdp-qty-dec")?.addEventListener("click", () => {
    if (selectedQty > 1) {
      selectedQty -= 1;
      renderProductPage();
    }
  });

  document.getElementById("pdp-qty-inc")?.addEventListener("click", () => {
    if (activeVariant && selectedQty < getVariantStock(activeVariant)) {
      selectedQty += 1;
      renderProductPage();
    }
  });

  const addCartBtn = document.getElementById("pdp-add-cart");
  addCartBtn?.addEventListener("click", async () => {
    const currentLang = getLanguage();
    if (!activeVariant) {
      showToast(t("pdp.selectVariantError", currentLang), "warning");
      return;
    }

    const availableStock = getVariantStock(activeVariant);
    if (availableStock <= 0) {
      showToast(t("pdp.outOfStock", currentLang), "error");
      return;
    }

    if (!getCachedUser()) {
      const url = new URL(window.location.href);
      url.searchParams.set("pendingAction", "cart");
      url.searchParams.set("variantId", activeVariant.id);
      url.searchParams.set("qty", String(selectedQty));
      redirectToAuth(`${url.pathname}${url.search}`);
      return;
    }

    addCartBtn.disabled = true;
    addCartBtn.textContent = t("pdp.addingToCart", currentLang);

    try {
      await addToCart({
        variantId: activeVariant.id,
        productId: currentProduct.id,
        quantity: selectedQty,
      });

      const updatedLang = getLanguage();
      const colorMeta = resolveColorMeta(activeVariant.color);
      const colorLabel = updatedLang === "ar" ? colorMeta.name_ar : colorMeta.name_en;
      const message = t("pdp.addedToCartSuccess", updatedLang)
        .replace("{qty}", String(selectedQty))
        .replace("{name}", title)
        .replace("{size}", activeVariant.size)
        .replace("{color}", colorLabel);
      showToast(message, "success", 4500);
    } catch (err) {
      const updatedLang = getLanguage();
      if (err && err.status === 401) {
        const url = new URL(window.location.href);
        url.searchParams.set("pendingAction", "cart");
        url.searchParams.set("variantId", activeVariant.id);
        url.searchParams.set("qty", String(selectedQty));
        redirectToAuth(`${url.pathname}${url.search}`);
        return;
      }
      if (err && (err.code === "INSUFFICIENT_STOCK" || err.code === "OUT_OF_STOCK")) {
        showToast(err.message || t("pdp.stockConflictError", updatedLang), "error", 4500);
      } else {
        showToast(t("ui.actionFailed", updatedLang), "error");
      }
    } finally {
      const updatedLang = getLanguage();
      addCartBtn.disabled = stock <= 0;
      addCartBtn.textContent =
        stock <= 0 ? t("pdp.outOfStock", updatedLang) : t("pdp.addToCart", updatedLang);
    }
  });

  const wishBtn = document.getElementById("pdp-wishlist-btn");
  wishBtn?.addEventListener("click", async () => {
    if (!getCachedUser()) {
      const url = new URL(window.location.href);
      url.searchParams.set("pendingAction", "wishlist");
      url.searchParams.set("productId", currentProduct.id);
      redirectToAuth(`${url.pathname}${url.search}`);
      return;
    }

    wishBtn.disabled = true;
    try {
      const wish = await toggleWishlistItem(currentProduct.id);
      const currentLang = getLanguage();
      showToast(
        t(wish.added ? "ui.wishlistAdded" : "ui.wishlistRemoved", currentLang),
        wish.added ? "success" : "info"
      );
      renderProductPage();
    } catch (err) {
      if (err && err.status === 401) {
        const url = new URL(window.location.href);
        url.searchParams.set("pendingAction", "wishlist");
        url.searchParams.set("productId", currentProduct.id);
        redirectToAuth(`${url.pathname}${url.search}`);
        return;
      }
      showToast(t("ui.actionFailed", getLanguage()), "error");
    } finally {
      wishBtn.disabled = false;
    }
  });

  // Related Products from API response
  const relatedList = Array.isArray(currentProduct.relatedProducts)
    ? currentProduct.relatedProducts
    : [];
  if (relatedSection && relatedGrid) {
    if (relatedList.length > 0) {
      relatedSection.hidden = false;
      relatedGrid.innerHTML = "";
      const relWishlistIds = getCachedUser() ? getCachedWishlistIds() : new Set();

      relatedList.forEach((rel) => {
        const card = createProductCard(rel, {
          lang,
          isWishlisted: relWishlistIds.has(rel.id),
          onToggleWishlist: async (item, _nextState, relWishBtn) => {
            if (!getCachedUser()) {
              const url = new URL(window.location.href);
              url.searchParams.set("pendingAction", "wishlist");
              url.searchParams.set("productId", item.id);
              redirectToAuth(`${url.pathname}${url.search}`);
              return;
            }

            if (relWishBtn) relWishBtn.disabled = true;
            try {
              const wish = await toggleWishlistItem(item.id);
              const currentLang = getLanguage();
              if (relWishBtn) {
                relWishBtn.setAttribute("aria-pressed", String(wish.added));
                relWishBtn.setAttribute(
                  "aria-label",
                  wish.added
                    ? t("product.removeFromWishlist", currentLang)
                    : t("product.addToWishlist", currentLang)
                );
              }
              showToast(
                t(wish.added ? "ui.wishlistAdded" : "ui.wishlistRemoved", currentLang),
                wish.added ? "success" : "info"
              );
            } catch (err) {
              if (err && err.status === 401) {
                const url = new URL(window.location.href);
                url.searchParams.set("pendingAction", "wishlist");
                url.searchParams.set("productId", item.id);
                redirectToAuth(`${url.pathname}${url.search}`);
                return;
              }
              showToast(t("ui.actionFailed", getLanguage()), "error");
            } finally {
              if (relWishBtn) relWishBtn.disabled = false;
            }
          },
        });
        relatedGrid.appendChild(card);
      });
    } else {
      relatedSection.hidden = true;
    }
  }
}

async function loadProductPage() {
  const root = document.getElementById("pdp-root");
  loadError = null;
  currentProduct = null;
  selectedImageIndex = 0;
  selectedColor = "";
  selectedSize = "";
  selectedQty = 1;

  if (!requestedSlug) {
    renderProductPage();
    return;
  }

  renderLoadingState(root, 2);

  try {
    currentProduct = await fetchProductBySlug(requestedSlug);
    if (currentProduct) {
      const variants = Array.isArray(currentProduct.variants) ? currentProduct.variants : [];
      const inStockVariant =
        variants.find((v) => getVariantStock(v) > 0) || variants[0];
      if (inStockVariant) {
        selectedColor = inStockVariant.color;
        selectedSize = inStockVariant.size;
      }
    }
  } catch (err) {
    loadError = err;
  }

  renderProductPage();
}

async function processPendingPdpIntent(pending) {
  if (!pending.action) return;

  try {
    const user = await fetchCurrentUser();
    if (!user) return;

    const lang = getLanguage();
    if (pending.action === "cart" && pending.variantId && currentProduct) {
      const targetVariant = (currentProduct.variants || []).find(
        (v) => v.id === pending.variantId
      );
      if (targetVariant) {
        selectedColor = targetVariant.color;
        selectedSize = targetVariant.size;
        const maxStock = getVariantStock(targetVariant);
        selectedQty = Math.max(1, Math.min(pending.qty || 1, maxStock || 1));
        renderProductPage();

        if (maxStock > 0) {
          await addToCart({
            variantId: targetVariant.id,
            productId: currentProduct.id,
            quantity: selectedQty,
          });
          const title = pickLocalized(currentProduct, "name", lang);
          const colorMeta = resolveColorMeta(targetVariant.color);
          const colorLabel = lang === "ar" ? colorMeta.name_ar : colorMeta.name_en;
          showToast(
            t("pdp.addedToCartSuccess", lang)
              .replace("{qty}", String(selectedQty))
              .replace("{name}", title)
              .replace("{size}", targetVariant.size)
              .replace("{color}", colorLabel),
            "success",
            4500
          );
        }
      }
    } else if (pending.action === "wishlist" && pending.productId) {
      await addToWishlist(pending.productId);
      showToast(t("ui.wishlistAdded", lang), "success");
      renderProductPage();
    }
  } catch (err) {
    if (err && (err.code === "INSUFFICIENT_STOCK" || err.code === "OUT_OF_STOCK")) {
      showToast(err.message || t("pdp.stockConflictError", getLanguage()), "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout();
  const params = new URLSearchParams(window.location.search);
  requestedSlug = (params.get("slug") || "").trim();

  const pending = {
    action: params.get("pendingAction"),
    variantId: params.get("variantId"),
    productId: params.get("productId"),
    qty: Number(params.get("qty") || 1),
  };

  if (pending.action) {
    params.delete("pendingAction");
    params.delete("variantId");
    params.delete("productId");
    params.delete("qty");
    const cleanSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      cleanSearch ? `${window.location.pathname}?${cleanSearch}` : window.location.pathname
    );
  }

  await loadProductPage();
  await processPendingPdpIntent(pending);

  window.addEventListener("zain:wishlistchange", () => {
    if (currentProduct) renderProductPage();
  });
  window.addEventListener("zain:authchange", () => {
    if (currentProduct) renderProductPage();
  });
  window.addEventListener("zain:langchange", renderProductPage);
});
