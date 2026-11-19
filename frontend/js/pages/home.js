/**
 * MR. ZAIN — Homepage Storefront Controller
 * Connected to live GET /api/v1/homepage endpoint (Neon PostgreSQL).
 */

import { initLayout } from "../components/layout.js";
import { createGarmentPlaceholder, inferGarmentType } from "../components/placeholders.js";
import { createProductCard } from "../components/product-card.js";
import {
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
import { fetchHomepageData } from "../services/catalog-service.js";
import {
  addToWishlist,
  getCachedWishlistIds,
  toggleWishlistItem,
} from "../services/wishlist-service.js";
import { pickLocalized } from "../utils/formatters.js";

let homepageState = {
  loaded: false,
  error: null,
  sections: [],
  banners: [],
  promoBannerConfig: null,
  featuredCollections: [],
  featuredProducts: [],
  newArrivals: [],
  bestSellers: [],
};

function renderCollectionCards() {
  const container = document.getElementById("home-collections-grid");
  if (!container) return;

  const lang = getLanguage();
  container.removeAttribute("aria-busy");
  container.innerHTML = "";

  if (homepageState.error) {
    renderErrorState(container, {
      onRetry: loadHomeData,
    });
    return;
  }

  const items = homepageState.featuredCollections.slice(0, 3);
  if (items.length === 0) {
    renderEmptyState(container, {
      title: t("home.emptyCollectionsTitle", lang),
      description: t("home.emptyCollectionsDesc", lang),
      actionLabel: t("home.heroCtaPrimary", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  items.forEach((collection) => {
    const title = pickLocalized(collection, "name", lang);
    const desc =
      pickLocalized(collection, "description", lang) ||
      pickLocalized(collection, "subtitle", lang);
    const countLabel =
      collection.productCount === 1
        ? t("collections.pieceCountSingle", lang)
        : t("collections.pieceCountPlural", lang).replace(
            "{count}",
            String(collection.productCount ?? 0)
          );

    const card = document.createElement("article");
    card.className = "collection-card";

    const media = document.createElement("div");
    media.className = "collection-card__media";
    if (collection.imageUrl) {
      const img = document.createElement("img");
      img.src = collection.imageUrl;
      img.alt = title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = "";
        media.appendChild(createGarmentPlaceholder(inferGarmentType(collection), title));
      });
      media.appendChild(img);
    } else {
      media.appendChild(createGarmentPlaceholder(inferGarmentType(collection), title));
    }

    const body = document.createElement("div");
    body.className = "collection-card__body";

    const metaEl = document.createElement("span");
    metaEl.className = "collection-card__meta";
    metaEl.textContent = countLabel;

    const titleEl = document.createElement("h3");
    titleEl.className = "collection-card__title";
    titleEl.textContent = title;

    const descEl = document.createElement("p");
    descEl.className = "collection-card__desc";
    descEl.textContent = desc;

    const ctaEl = document.createElement("a");
    ctaEl.href = `/shop.html?collection=${encodeURIComponent(collection.slug)}`;
    ctaEl.className = "collection-card__cta";
    ctaEl.textContent = t("collections.exploreCollection", lang);

    body.append(metaEl, titleEl, descEl, ctaEl);
    card.append(media, body);
    container.appendChild(card);
  });
}

function renderProductSection(containerId, items, emptyTitleKey, emptyDescKey) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const lang = getLanguage();
  container.removeAttribute("aria-busy");
  container.innerHTML = "";

  if (homepageState.error) {
    renderErrorState(container, {
      onRetry: loadHomeData,
    });
    return;
  }

  if (!items || items.length === 0) {
    renderEmptyState(container, {
      title: t(emptyTitleKey, lang),
      description: t(emptyDescKey, lang),
      actionLabel: t("home.heroCtaPrimary", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  const wishlistIds = getCachedUser() ? getCachedWishlistIds() : new Set();

  items.forEach((product) => {
    const card = createProductCard(product, {
      lang,
      isWishlisted: wishlistIds.has(product.id),
      onToggleWishlist: async (item, _nextState, wishBtn) => {
        if (!getCachedUser()) {
          const url = new URL(window.location.href);
          url.searchParams.set("pendingAction", "wishlist");
          url.searchParams.set("productId", item.id);
          redirectToAuth(`${url.pathname}${url.search}`);
          return;
        }

        if (wishBtn) wishBtn.disabled = true;
        try {
          const result = await toggleWishlistItem(item.id);
          const currentLang = getLanguage();
          if (wishBtn) {
            wishBtn.setAttribute("aria-pressed", String(result.added));
            wishBtn.setAttribute(
              "aria-label",
              result.added
                ? t("product.removeFromWishlist", currentLang)
                : t("product.addToWishlist", currentLang)
            );
          }
          showToast(
            t(result.added ? "ui.wishlistAdded" : "ui.wishlistRemoved", currentLang),
            result.added ? "success" : "info"
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
          if (wishBtn) wishBtn.disabled = false;
        }
      },
    });
    container.appendChild(card);
  });
}

function hydratePromoBannerFromDb() {
  const bannerSection = document.querySelector(".editorial-banner");
  const lang = getLanguage();
  const titleEl = document.getElementById("promo-banner-heading");
  const descEl = document.querySelector(".editorial-banner__desc");
  const ctaEl = document.querySelector(".editorial-banner .btn--gold");
  const frameEl = document.querySelector(".editorial-banner__frame");

  const cfg = homepageState.promoBannerConfig;
  if (bannerSection) {
    bannerSection.hidden = cfg?.enabled === false;
  }
  if (cfg?.enabled === false) return;

  const banner = homepageState.banners?.[0] || null;
  const title =
    (banner ? pickLocalized(banner, "title", lang) : "") ||
    (cfg ? pickLocalized(cfg, "title", lang) : "");
  const subtitle =
    (banner ? pickLocalized(banner, "subtitle", lang) : "") ||
    (cfg ? pickLocalized(cfg, "subtitle", lang) : "");

  if (titleEl && title) titleEl.textContent = title;
  if (descEl && subtitle) descEl.textContent = subtitle;
  if (ctaEl && banner?.targetUrl && banner.targetUrl.startsWith("/")) {
    ctaEl.setAttribute("href", banner.targetUrl);
  }
  if (frameEl && banner?.imageUrl) {
    frameEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = banner.imageUrl;
    img.alt = title || "MR. ZAIN";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.referrerPolicy = "no-referrer";
    frameEl.appendChild(img);
  }
}

function renderFeaturedProductsSection() {
  const section = document.getElementById("home-featured-section");
  const grid = document.getElementById("home-featured-products-grid");
  if (!section || !grid) return;

  const items = Array.isArray(homepageState.featuredProducts)
    ? homepageState.featuredProducts
    : [];
  if (items.length === 0) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  section.hidden = false;
  renderProductSection(
    "home-featured-products-grid",
    items,
    "home.emptyNewArrivalsTitle",
    "home.emptyNewArrivalsDesc"
  );
}

function renderAllHomeSections() {
  hydratePromoBannerFromDb();
  renderCollectionCards();
  renderFeaturedProductsSection();
  renderProductSection(
    "home-new-arrivals-grid",
    homepageState.newArrivals,
    "home.emptyNewArrivalsTitle",
    "home.emptyNewArrivalsDesc"
  );
  renderProductSection(
    "home-best-sellers-grid",
    homepageState.bestSellers,
    "home.emptyBestSellersTitle",
    "home.emptyBestSellersDesc"
  );
}

function bindHomeNewsletter() {
  const form = document.getElementById("home-newsletter-form");
  const emailInput = document.getElementById("home-newsletter-email");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailInput?.value.trim() || "";
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const lang = getLanguage();

    if (!isValid) {
      showToast(t("footer.newsletterInvalid", lang), "error");
      emailInput?.focus();
      return;
    }

    emailInput.value = "";
    showToast(t("footer.newsletterSuccess", lang), "success");
  });
}

async function loadHomeData() {
  const colGrid = document.getElementById("home-collections-grid");
  const newGrid = document.getElementById("home-new-arrivals-grid");
  const bestGrid = document.getElementById("home-best-sellers-grid");

  homepageState.error = null;
  renderLoadingState(colGrid, 3);
  renderLoadingState(newGrid, 3);
  renderLoadingState(bestGrid, 3);

  try {
    const data = await fetchHomepageData();
    homepageState = {
      loaded: true,
      error: null,
      sections: data.sections,
      banners: data.banners,
      promoBannerConfig: data.promoBannerConfig,
      featuredCollections: data.featuredCollections,
      featuredProducts: data.featuredProducts,
      newArrivals: data.newArrivals,
      bestSellers: data.bestSellers,
    };
  } catch (err) {
    homepageState = {
      ...homepageState,
      loaded: false,
      error: err,
    };
  }

  renderAllHomeSections();
}

async function processPendingHomeIntent() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("pendingAction");
  const productId = params.get("productId");
  if (action !== "wishlist" || !productId) return;

  params.delete("pendingAction");
  params.delete("productId");
  const cleanSearch = params.toString();
  window.history.replaceState(
    {},
    "",
    cleanSearch ? `${window.location.pathname}?${cleanSearch}` : window.location.pathname
  );

  try {
    const user = await fetchCurrentUser();
    if (!user) return;
    await addToWishlist(productId);
    showToast(t("ui.wishlistAdded", getLanguage()), "success");
  } catch {
    // Ignore non-fatal post-login resume failure
  }
}

function syncHomeWishlistButtons() {
  const wishlistIds = getCachedUser() ? getCachedWishlistIds() : new Set();
  const lang = getLanguage();
  document
    .querySelectorAll(".product-card__wishlist[data-product-id]")
    .forEach((btn) => {
      const pid = btn.dataset.productId;
      const active = Boolean(pid && wishlistIds.has(pid));
      btn.setAttribute("aria-pressed", String(active));
      btn.setAttribute(
        "aria-label",
        active
          ? t("product.removeFromWishlist", lang)
          : t("product.addToWishlist", lang)
      );
    });
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  bindHomeNewsletter();
  loadHomeData();
  processPendingHomeIntent();

  window.addEventListener("zain:wishlistchange", syncHomeWishlistButtons);
  window.addEventListener("zain:authchange", syncHomeWishlistButtons);

  window.addEventListener("zain:langchange", () => {
    if (homepageState.loaded || homepageState.error) {
      renderAllHomeSections();
    }
  });
});
