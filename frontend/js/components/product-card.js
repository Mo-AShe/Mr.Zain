/**
 * MR. ZAIN — Reusable Product Card Component
 * Purely data-driven component; contains no hardcoded product catalog data.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { getCachedUser, hasCheckedAuthSession } from "../services/auth-service.js";
import { hasLoadedWishlist } from "../services/wishlist-service.js";
import { formatPriceEGP, pickLocalized } from "../utils/formatters.js";
import { createGarmentPlaceholder, inferGarmentType } from "./placeholders.js";

export function createProductCard(product, options = {}) {
  const lang = options.lang || getLanguage();
  const isWishlisted = Boolean(options.isWishlisted);
  const onToggleWishlist = options.onToggleWishlist;

  const title = pickLocalized(product, "name", lang);
  const category =
    product.category && typeof product.category === "object"
      ? pickLocalized(product.category, "name", lang)
      : pickLocalized(product, "category", lang);
  const garmentType = inferGarmentType(product);
  const productUrl = product.slug
    ? `/product.html?slug=${encodeURIComponent(product.slug)}`
    : "/product.html";

  const price = Number(product.price ?? product.basePrice ?? 0);
  const compareAt =
    product.compareAtPrice !== null && product.compareAtPrice !== undefined
      ? Number(product.compareAtPrice)
      : null;
  const hasDiscount = compareAt !== null && compareAt > price;

  const article = document.createElement("article");
  article.className = "product-card";

  // Media Container (uniform 3:4 aspect ratio)
  const media = document.createElement("div");
  media.className = "product-card__media";

  const mediaLink = document.createElement("a");
  mediaLink.href = productUrl;
  mediaLink.className = "product-card__link-media";
  mediaLink.setAttribute("aria-label", title || t("product.viewProduct", lang));

  const primaryImage =
    product.imageUrl ||
    (Array.isArray(product.images)
      ? product.images[0]?.imageUrl || product.images[0]?.url
      : "");

  if (primaryImage) {
    const img = document.createElement("img");
    img.src = primaryImage;
    img.alt = title;
    img.className = "product-card__img";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      mediaLink.innerHTML = "";
      mediaLink.appendChild(createGarmentPlaceholder(garmentType));
    });
    mediaLink.appendChild(img);
  } else {
    mediaLink.appendChild(createGarmentPlaceholder(garmentType));
  }

  media.appendChild(mediaLink);

  // Single Restrained Badge (at most one editorial tag)
  if (product.isNew || product.isBestSeller) {
    const badgeSlot = document.createElement("div");
    badgeSlot.className = "product-card__badge-slot";
    const badge = document.createElement("span");
    badge.className = product.isNew ? "badge badge--new" : "badge badge--best-seller";
    badge.textContent = product.isNew
      ? t("product.newBadge", lang)
      : t("product.bestSellerBadge", lang);
    badgeSlot.appendChild(badge);
    media.appendChild(badgeSlot);
  }

  // Wishlist Button
  const wishBtn = document.createElement("button");
  wishBtn.type = "button";
  wishBtn.className = "product-card__wishlist";
  wishBtn.disabled =
    !hasCheckedAuthSession() ||
    (getCachedUser()?.role === "customer" && !hasLoadedWishlist());
  wishBtn.dataset.productId = product.id;
  wishBtn.setAttribute("aria-pressed", String(isWishlisted));
  wishBtn.setAttribute(
    "aria-label",
    isWishlisted
      ? t("product.removeFromWishlist", lang)
      : t("product.addToWishlist", lang)
  );
  wishBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.7-9.2-9.2C1.7 8.4 3.4 5 6.8 5c2 0 3.6 1 5.2 2.8C13.6 6 15.2 5 17.2 5c3.4 0 5.1 3.4 4 6.3-1.7 4.5-9.2 9.2-9.2 9.2Z" />
    </svg>
  `;
  wishBtn.addEventListener("click", async () => {
    if (wishBtn.disabled) return;
    const currentlyWishlisted = wishBtn.getAttribute("aria-pressed") === "true";
    if (typeof onToggleWishlist === "function") {
      await onToggleWishlist(product, !currentlyWishlisted, wishBtn);
    }
  });
  media.appendChild(wishBtn);

  // Body Metadata
  const body = document.createElement("div");
  body.className = "product-card__body";

  if (category) {
    const catEl = document.createElement("span");
    catEl.className = "product-card__category";
    catEl.textContent = category;
    body.appendChild(catEl);
  }

  const titleEl = document.createElement("h3");
  titleEl.className = "product-card__title";
  const titleLink = document.createElement("a");
  titleLink.href = productUrl;
  titleLink.textContent = title;
  titleEl.appendChild(titleLink);
  body.appendChild(titleEl);

  const priceRow = document.createElement("div");
  priceRow.className = "product-card__price-row";

  const priceEl = document.createElement("span");
  priceEl.className = "product-card__price";
  priceEl.textContent = formatPriceEGP(price, lang);
  priceRow.appendChild(priceEl);

  if (hasDiscount) {
    const compareEl = document.createElement("span");
    compareEl.className = "product-card__compare-price";
    compareEl.textContent = formatPriceEGP(compareAt, lang);
    priceRow.appendChild(compareEl);
  }

  body.appendChild(priceRow);
  article.append(media, body);
  return article;
}
