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
  hasCheckedAuthSession,
  redirectToAuth,
} from "../services/auth-service.js";
import { fetchHomepageData } from "../services/catalog-service.js";
import {
  addToWishlist,
  fetchWishlist,
  hasLoadedWishlist,
  getCachedWishlistIds,
  removeFromWishlist,
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
  activeBannerIndex: 0,
};

let promoBannerTimer = null;
let promoBannerPaused = false;
let heroImageTimer = null;
let activeHeroImageIndex = 0;

function setPromoBannerChanging() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bannerSection = document.querySelector(".editorial-banner");
  if (!bannerSection) return;
  bannerSection.classList.remove("is-changing");
  void bannerSection.offsetWidth;
  bannerSection.classList.add("is-changing");
  window.setTimeout(() => bannerSection.classList.remove("is-changing"), 700);
}

function startPromoBannerAutoplay() {
  if (promoBannerTimer) window.clearInterval(promoBannerTimer);
  promoBannerTimer = null;

  const banners = homepageState.banners || [];
  if (
    banners.length < 2 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  promoBannerTimer = window.setInterval(() => {
    if (promoBannerPaused || document.hidden) return;
    homepageState.activeBannerIndex =
      (homepageState.activeBannerIndex + 1) % banners.length;
    hydratePromoBannerFromDb(true);
  }, 6000);
}

function initPromoBannerEffects() {
  const bannerSection = document.querySelector(".editorial-banner");
  if (!bannerSection) return;

  bannerSection.addEventListener("mouseenter", () => {
    promoBannerPaused = true;
  });
  bannerSection.addEventListener("mouseleave", () => {
    promoBannerPaused = false;
  });
  bannerSection.addEventListener("focusin", () => {
    promoBannerPaused = true;
  });
  bannerSection.addEventListener("focusout", (event) => {
    if (!bannerSection.contains(event.relatedTarget)) {
      promoBannerPaused = false;
    }
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          bannerSection.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.18 }
    );
    observer.observe(bannerSection);
  } else {
    bannerSection.classList.add("is-visible");
  }
}

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
      onToggleWishlist: async (item, nextState, wishBtn) => {
        if (!getCachedUser()) {
          const url = new URL(window.location.href);
          url.searchParams.set("pendingAction", "wishlist");
          url.searchParams.set("productId", item.id);
          redirectToAuth(`${url.pathname}${url.search}`);
          return;
        }

        if (wishBtn) wishBtn.disabled = true;
        try {
          if (nextState) {
            await addToWishlist(item.id);
          } else {
            await removeFromWishlist(item.id);
          }
          const currentLang = getLanguage();
          if (wishBtn) {
            wishBtn.setAttribute("aria-pressed", String(nextState));
            wishBtn.setAttribute(
              "aria-label",
              nextState
                ? t("product.removeFromWishlist", currentLang)
                : t("product.addToWishlist", currentLang)
            );
          }
          showToast(
            t(nextState ? "ui.wishlistAdded" : "ui.wishlistRemoved", currentLang),
            nextState ? "success" : "info"
          );
        } catch (err) {
          if (err && err.status === 401) {
            const url = new URL(window.location.href);
            url.searchParams.set("pendingAction", "wishlist");
            url.searchParams.set("productId", item.id);
            redirectToAuth(`${url.pathname}${url.search}`);
            return;
          }
          showToast(
            err?.status === 403 && err?.code === "FORBIDDEN"
              ? t("ui.customerOnlyAction", getLanguage())
              : t("ui.actionFailed", getLanguage()),
            "error"
          );
        } finally {
          if (wishBtn) wishBtn.disabled = false;
        }
      },
    });
    container.appendChild(card);
  });
}

function hydratePromoBannerFromDb(animate = false) {
  const bannerSection = document.querySelector(".editorial-banner");
  const lang = getLanguage();
  const titleEl = document.getElementById("promo-banner-heading");
  const descEl = document.querySelector(".editorial-banner__desc");
  const frameEl = document.querySelector(".editorial-banner__frame");
  const controlsEl = document.getElementById("promo-banner-controls");

  const cfg = homepageState.promoBannerConfig;
  if (bannerSection) {
    bannerSection.hidden = cfg?.enabled === false;
  }
  if (cfg?.enabled === false) return;

  if (animate) setPromoBannerChanging();

  const banners = homepageState.banners || [];
  if (homepageState.activeBannerIndex >= banners.length) {
    homepageState.activeBannerIndex = 0;
  }
  const banner = banners[homepageState.activeBannerIndex] || null;
  const title =
    (banner ? pickLocalized(banner, "title", lang) : "") ||
    (cfg ? pickLocalized(cfg, "title", lang) : "");
  const subtitle =
    (banner ? pickLocalized(banner, "subtitle", lang) : "") ||
    (cfg ? pickLocalized(cfg, "subtitle", lang) : "");

  if (titleEl && title) titleEl.textContent = title;
  if (descEl && subtitle) descEl.textContent = subtitle;
  if (frameEl) {
    frameEl.innerHTML = "";
    if (banner?.imageUrl) {
      const img = document.createElement("img");
      img.src = banner.imageUrl;
      img.alt = title || "MR. ZAIN";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.referrerPolicy = "no-referrer";
      frameEl.appendChild(img);
    } else {
      const label = document.createElement("span");
      label.className = "editorial-banner__frame-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = "MR. ZAIN";
      frameEl.appendChild(label);
    }
  }

  if (controlsEl) {
    controlsEl.replaceChildren();
    controlsEl.hidden = banners.length < 2;
    controlsEl.setAttribute("aria-label", t("home.bannerControls", getLanguage()));
    banners.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editorial-banner__control";
      button.textContent = String(index + 1);
      button.setAttribute("aria-pressed", String(index === homepageState.activeBannerIndex));
      button.setAttribute(
        "aria-label",
        t("home.bannerSlide", getLanguage()).replace("{index}", String(index + 1))
      );
      button.addEventListener("click", () => {
        homepageState.activeBannerIndex = index;
        hydratePromoBannerFromDb(true);
        startPromoBannerAutoplay();
      });
      controlsEl.appendChild(button);
    });
  }

  startPromoBannerAutoplay();
}

function hydrateHeroImage() {
  const image = document.getElementById("home-hero-image");
  const visual = document.getElementById("home-hero-visual");
  if (!image || !visual) return;
  if (heroImageTimer) window.clearInterval(heroImageTimer);
  heroImageTimer = null;

  const products = [
    ...homepageState.featuredProducts,
    ...homepageState.newArrivals,
    ...homepageState.bestSellers,
  ];
  const slides = [];
  const seenImageUrls = new Set();
  products.forEach((product) => {
    const alt = pickLocalized(product, "name", getLanguage());
    const imageUrls = [
      product.imageUrl,
      ...(Array.isArray(product.images)
        ? product.images.map((item) => item.imageUrl || item.url)
        : []),
    ];
    imageUrls.forEach((url) => {
      if (url && !seenImageUrls.has(url)) {
        seenImageUrls.add(url);
        slides.push({ url, alt });
      }
    });
  });

  if (slides.length === 0 && homepageState.banners?.[0]?.imageUrl) {
    slides.push({
      url: homepageState.banners[0].imageUrl,
      alt: pickLocalized(homepageState.banners[0], "title", getLanguage()),
    });
  }
  if (slides.length === 0) return;

  activeHeroImageIndex %= slides.length;

  const showSlide = (index) => {
    const slide = slides[index];
    image.alt = slide.alt;
    image.referrerPolicy = "no-referrer";
    image.loading = "eager";
    image.onload = () => {
      image.hidden = false;
      visual.classList.add("has-image");
    };
    image.onerror = () => {
      image.hidden = true;
      visual.classList.remove("has-image");
    };
    image.src = slide.url;
  };

  showSlide(activeHeroImageIndex);
  heroImageTimer =
    slides.length > 1
      ? window.setInterval(() => {
          if (document.hidden) return;
          activeHeroImageIndex = (activeHeroImageIndex + 1) % slides.length;
          showSlide(activeHeroImageIndex);
        }, 5000)
      : null;
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
  hydrateHeroImage();
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
      activeBannerIndex: homepageState.activeBannerIndex,
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
  } catch (err) {
    showToast(
      err?.status === 403 && err?.code === "FORBIDDEN"
        ? t("ui.customerOnlyAction", getLanguage())
        : err?.message || t("ui.actionFailed", getLanguage()),
      "error"
    );
  }
}

function syncHomeWishlistButtons() {
  const user = getCachedUser();
  const wishlistIds = user?.role === "customer" ? getCachedWishlistIds() : new Set();
  const lang = getLanguage();
  document
    .querySelectorAll(".product-card__wishlist[data-product-id]")
    .forEach((btn) => {
      const pid = btn.dataset.productId;
      const active = Boolean(pid && wishlistIds.has(pid));
      btn.disabled =
        !hasCheckedAuthSession() ||
        (user?.role === "customer" && !hasLoadedWishlist());
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
  initPromoBannerEffects();
  loadHomeData();
  processPendingHomeIntent();

  window.addEventListener("zain:wishlistchange", syncHomeWishlistButtons);
  window.addEventListener("zain:authchange", syncHomeWishlistButtons);
  fetchCurrentUser()
    .then((user) => (user?.role === "customer" ? fetchWishlist() : null))
    .then(syncHomeWishlistButtons)
    .catch((err) => {
      if (err?.status !== 401) {
        showToast(
          err?.status === 403 && err?.code === "FORBIDDEN"
            ? t("ui.customerOnlyAction", getLanguage())
            : err?.message || t("ui.actionFailed", getLanguage()),
          "error"
        );
      }
    });

  window.addEventListener("zain:langchange", () => {
    if (homepageState.loaded || homepageState.error) {
      renderAllHomeSections();
    }
  });
});
