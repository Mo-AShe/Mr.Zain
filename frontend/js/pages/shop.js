/**
 * MR. ZAIN — Shop Catalog Page Controller
 * Connected to live /api/v1/products, /api/v1/categories, and /api/v1/collections endpoints.
 */

import { initLayout } from "../components/layout.js";
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
import {
  fetchCategories,
  fetchCollections,
  fetchProducts,
} from "../services/catalog-service.js";
import {
  addToWishlist,
  fetchWishlist,
  hasLoadedWishlist,
  getCachedWishlistIds,
  removeFromWishlist,
} from "../services/wishlist-service.js";
import { pickLocalized, resolveColorMeta } from "../utils/formatters.js";

const PAGE_SIZE = 6;

const state = {
  q: "",
  category: "",
  collection: "",
  minPrice: "",
  maxPrice: "",
  size: "",
  color: "",
  inStockOnly: false,
  sort: "newest",
  page: 1,
};

let categoriesList = [];
let collectionsList = [];
let facets = { sizes: [], colors: [] };
let loadedProducts = [];
let lastPagination = { total: 0, hasMore: false };
let lastError = null;

function hasActiveFilters() {
  return Boolean(
    state.q ||
      state.category ||
      state.collection ||
      state.minPrice ||
      state.maxPrice ||
      state.size ||
      state.color ||
      state.inStockOnly
  );
}

function readUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  state.q = params.get("q") || params.get("search") || "";
  state.category = params.get("category") || "";
  state.collection = params.get("collection") || "";
  state.minPrice = params.get("minPrice") || "";
  state.maxPrice = params.get("maxPrice") || "";
  state.size = params.get("size") || "";
  state.color = params.get("color") || "";
  state.inStockOnly = params.get("inStock") === "true";
  state.sort = params.get("sort") || "newest";
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  if (state.collection) params.set("collection", state.collection);
  if (state.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.size) params.set("size", state.size);
  if (state.color) params.set("color", state.color);
  if (state.inStockOnly) params.set("inStock", "true");
  if (state.sort && state.sort !== "newest") params.set("sort", state.sort);

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function syncInputsFromState() {
  const searchInput = document.getElementById("shop-search-input");
  const minInput = document.getElementById("filter-min-price");
  const maxInput = document.getElementById("filter-max-price");
  const stockCheck = document.getElementById("filter-in-stock");
  const sortSelect = document.getElementById("shop-sort-select");

  if (searchInput) searchInput.value = state.q;
  if (minInput) minInput.value = state.minPrice;
  if (maxInput) maxInput.value = state.maxPrice;
  if (stockCheck) stockCheck.checked = state.inStockOnly;
  if (sortSelect) sortSelect.value = state.sort;
}

function resetAllFilters() {
  state.q = "";
  state.category = "";
  state.collection = "";
  state.minPrice = "";
  state.maxPrice = "";
  state.size = "";
  state.color = "";
  state.inStockOnly = false;
  state.sort = "newest";
  state.page = 1;

  syncInputsFromState();
  renderSidebarControls();
  refreshCatalog(false);
}

function renderSidebarControls() {
  const lang = getLanguage();

  // Categories
  const catContainer = document.getElementById("filter-categories");
  if (catContainer) {
    catContainer.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = `filter-radio-btn ${state.category === "" ? "is-active" : ""}`;
    allBtn.textContent = t("shop.allCategories", lang);
    allBtn.addEventListener("click", () => {
      state.category = "";
      state.page = 1;
      renderSidebarControls();
      refreshCatalog(false);
    });
    catContainer.appendChild(allBtn);

    categoriesList.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-radio-btn ${state.category === cat.slug ? "is-active" : ""}`;
      btn.textContent = pickLocalized(cat, "name", lang);
      btn.addEventListener("click", () => {
        state.category = state.category === cat.slug ? "" : cat.slug;
        state.page = 1;
        renderSidebarControls();
        refreshCatalog(false);
      });
      catContainer.appendChild(btn);
    });
  }

  // Sizes (from API facets)
  const sizeContainer = document.getElementById("filter-sizes");
  if (sizeContainer) {
    sizeContainer.innerHTML = "";
    if (!facets.sizes || facets.sizes.length === 0) {
      const hint = document.createElement("span");
      hint.className = "text-muted";
      hint.style.fontSize = "0.75rem";
      hint.style.gridColumn = "1 / -1";
      hint.textContent = t("shop.noSizeFacets", lang);
      sizeContainer.appendChild(hint);
    } else {
      facets.sizes.forEach((size) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `filter-choice-btn ${state.size === size ? "is-active" : ""}`;
        btn.textContent = size;
        btn.setAttribute("aria-pressed", String(state.size === size));
        btn.addEventListener("click", () => {
          state.size = state.size === size ? "" : size;
          state.page = 1;
          renderSidebarControls();
          refreshCatalog(false);
        });
        sizeContainer.appendChild(btn);
      });
    }
  }

  // Colors (from API facets)
  const colorContainer = document.getElementById("filter-colors");
  if (colorContainer) {
    colorContainer.innerHTML = "";
    if (!facets.colors || facets.colors.length === 0) {
      const hint = document.createElement("span");
      hint.className = "text-muted";
      hint.style.fontSize = "0.75rem";
      hint.textContent = t("shop.noColorFacets", lang);
      colorContainer.appendChild(hint);
    } else {
      facets.colors.forEach((colorName) => {
        const color = resolveColorMeta(colorName);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `filter-color-btn ${state.color === color.name_en ? "is-active" : ""}`;
        btn.setAttribute("aria-pressed", String(state.color === color.name_en));

        const dot = document.createElement("span");
        dot.className = "color-dot";
        dot.style.backgroundColor = color.hex;

        const labelSpan = document.createElement("span");
        labelSpan.textContent = pickLocalized(color, "name", lang);

        btn.append(dot, labelSpan);
        btn.addEventListener("click", () => {
          state.color = state.color === color.name_en ? "" : color.name_en;
          state.page = 1;
          renderSidebarControls();
          refreshCatalog(false);
        });
        colorContainer.appendChild(btn);
      });
    }
  }
}

function renderActiveFilters() {
  const bar = document.getElementById("shop-active-filters");
  if (!bar) return;

  const lang = getLanguage();
  const chips = [];

  if (state.q) {
    chips.push({ label: `"${state.q}"`, clear: () => (state.q = "") });
  }
  if (state.category) {
    const match = categoriesList.find((c) => c.slug === state.category);
    chips.push({
      label: match ? pickLocalized(match, "name", lang) : state.category,
      clear: () => (state.category = ""),
    });
  }
  if (state.collection) {
    const match = collectionsList.find((c) => c.slug === state.collection);
    chips.push({
      label: match ? pickLocalized(match, "name", lang) : state.collection,
      clear: () => (state.collection = ""),
    });
  }
  if (state.size) {
    chips.push({
      label: `${t("shop.sizeLabel", lang)}: ${state.size}`,
      clear: () => (state.size = ""),
    });
  }
  if (state.color) {
    const color = resolveColorMeta(state.color);
    chips.push({
      label: pickLocalized(color, "name", lang),
      clear: () => (state.color = ""),
    });
  }
  if (state.minPrice || state.maxPrice) {
    chips.push({
      label: `${state.minPrice || "0"} – ${state.maxPrice || "∞"} EGP`,
      clear: () => {
        state.minPrice = "";
        state.maxPrice = "";
        const minEl = document.getElementById("filter-min-price");
        const maxEl = document.getElementById("filter-max-price");
        if (minEl) minEl.value = "";
        if (maxEl) maxEl.value = "";
      },
    });
  }
  if (state.inStockOnly) {
    chips.push({
      label: t("shop.inStockOnly", lang),
      clear: () => {
        state.inStockOnly = false;
        const cb = document.getElementById("filter-in-stock");
        if (cb) cb.checked = false;
      },
    });
  }

  if (chips.length === 0) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }

  bar.hidden = false;
  bar.innerHTML = "";

  const headingSpan = document.createElement("span");
  headingSpan.className = "text-muted";
  headingSpan.textContent = t("shop.activeFilters", lang);
  bar.appendChild(headingSpan);

  chips.forEach((chip) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "active-filter-btn";

    const textSpan = document.createElement("span");
    textSpan.textContent = chip.label;

    const closeSpan = document.createElement("span");
    closeSpan.setAttribute("aria-hidden", "true");
    closeSpan.textContent = "×";

    btn.append(textSpan, closeSpan);
    btn.addEventListener("click", () => {
      chip.clear();
      state.page = 1;
      if (!state.q) {
        const searchEl = document.getElementById("shop-search-input");
        if (searchEl) searchEl.value = "";
      }
      renderSidebarControls();
      refreshCatalog(false);
    });
    bar.appendChild(btn);
  });
}

function renderCatalogView() {
  const grid = document.getElementById("shop-product-grid");
  const countEl = document.getElementById("shop-result-count");
  const paginationEl = document.getElementById("shop-pagination");
  const showingEl = document.getElementById("shop-showing-text");
  const loadMoreBtn = document.getElementById("shop-load-more");
  const lang = getLanguage();

  if (lastError) {
    if (countEl) countEl.textContent = "";
    if (paginationEl) paginationEl.hidden = true;
    renderErrorState(grid, {
      onRetry: () => refreshCatalog(false),
    });
    return;
  }

  const total = Number(lastPagination.total || 0);
  if (countEl) {
    countEl.textContent =
      total === 1
        ? t("shop.resultsSingle", lang)
        : t("shop.resultsPlural", lang).replace("{count}", String(total));
  }

  if (loadedProducts.length === 0) {
    if (paginationEl) paginationEl.hidden = true;
    if (hasActiveFilters()) {
      renderEmptyState(grid, {
        title: t("ui.emptyTitle", lang),
        description: t("ui.emptyDesc", lang),
        actionLabel: t("ui.emptyAction", lang),
        onAction: resetAllFilters,
      });
    } else {
      renderEmptyState(grid, {
        title: t("shop.emptyCatalogTitle", lang),
        description: t("shop.emptyCatalogDesc", lang),
      });
    }
    return;
  }

  grid.removeAttribute("aria-busy");
  grid.innerHTML = "";
  const wishlistIds = getCachedUser() ? getCachedWishlistIds() : new Set();

  loadedProducts.forEach((product) => {
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
    grid.appendChild(card);
  });

  if (paginationEl && showingEl && loadMoreBtn) {
    paginationEl.hidden = false;
    showingEl.textContent = t("shop.showingCount", lang)
      .replace("{shown}", String(loadedProducts.length))
      .replace("{total}", String(total));
    loadMoreBtn.hidden = !lastPagination.hasMore;
    loadMoreBtn.disabled = false;
  }
}

async function refreshCatalog(append = false) {
  syncUrl();
  renderActiveFilters();

  const grid = document.getElementById("shop-product-grid");
  const loadMoreBtn = document.getElementById("shop-load-more");

  if (!append) {
    state.page = 1;
    loadedProducts = [];
    renderLoadingState(grid, 6);
  } else if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
  }

  lastError = null;

  try {
    const result = await fetchProducts({
      search: state.q,
      category: state.category,
      collection: state.collection,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      size: state.size,
      color: state.color,
      inStock: state.inStockOnly,
      sort: state.sort,
      page: state.page,
      limit: PAGE_SIZE,
    });

    if (result.facets) {
      facets = result.facets;
      renderSidebarControls();
    }

    loadedProducts = append
      ? [...loadedProducts, ...(result.items || [])]
      : result.items || [];
    lastPagination = result.pagination || {
      total: loadedProducts.length,
      hasMore: false,
    };

    renderCatalogView();
  } catch (err) {
    if (append) {
      state.page = Math.max(1, state.page - 1);
      if (loadMoreBtn) loadMoreBtn.disabled = false;
      showToast(t("ui.errorTitle", getLanguage()), "error");
      return;
    }
    lastError = err;
    renderCatalogView();
  }
}

function bindShopEvents() {
  const searchForm = document.getElementById("shop-search-form");
  const searchInput = document.getElementById("shop-search-input");
  const minInput = document.getElementById("filter-min-price");
  const maxInput = document.getElementById("filter-max-price");
  const stockCheck = document.getElementById("filter-in-stock");
  const sortSelect = document.getElementById("shop-sort-select");
  const clearAllBtn = document.getElementById("shop-clear-all");
  const loadMoreBtn = document.getElementById("shop-load-more");

  // Mobile Filter Drawer
  const sidebar = document.getElementById("shop-filter-sidebar");
  const backdrop = document.getElementById("shop-filter-backdrop");
  const mobileOpen = document.getElementById("shop-mobile-filter-btn");
  const mobileClose = document.getElementById("shop-drawer-close");
  const mobileApply = document.getElementById("shop-drawer-apply");

  const closeFilterDrawer = () => {
    sidebar?.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
  };

  mobileOpen?.addEventListener("click", () => {
    sidebar?.classList.add("is-open");
    backdrop?.classList.add("is-open");
  });
  mobileClose?.addEventListener("click", closeFilterDrawer);
  mobileApply?.addEventListener("click", closeFilterDrawer);
  backdrop?.addEventListener("click", closeFilterDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar?.classList.contains("is-open")) {
      closeFilterDrawer();
    }
  });

  syncInputsFromState();

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.q = searchInput?.value.trim() || "";
    refreshCatalog(false);
  });

  const handlePriceChange = () => {
    const minVal = minInput?.value.trim() || "";
    const maxVal = maxInput?.value.trim() || "";
    if (minVal && maxVal && Number(minVal) > Number(maxVal)) {
      state.minPrice = maxVal;
      state.maxPrice = minVal;
      if (minInput) minInput.value = state.minPrice;
      if (maxInput) maxInput.value = state.maxPrice;
    } else {
      state.minPrice = minVal;
      state.maxPrice = maxVal;
    }
    refreshCatalog(false);
  };

  minInput?.addEventListener("change", handlePriceChange);
  maxInput?.addEventListener("change", handlePriceChange);

  stockCheck?.addEventListener("change", () => {
    state.inStockOnly = Boolean(stockCheck.checked);
    refreshCatalog(false);
  });

  sortSelect?.addEventListener("change", () => {
    state.sort = sortSelect.value;
    refreshCatalog(false);
  });

  clearAllBtn?.addEventListener("click", resetAllFilters);

  loadMoreBtn?.addEventListener("click", () => {
    state.page += 1;
    refreshCatalog(true);
  });
}

function syncShopWishlistButtons() {
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

async function processPendingShopIntent(pendingProductId) {
  if (!pendingProductId) return;
  try {
    const user = await fetchCurrentUser();
    if (!user) return;
    await addToWishlist(pendingProductId);
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

async function bootstrapShop() {
  const initialParams = new URLSearchParams(window.location.search);
  const pendingAction = initialParams.get("pendingAction");
  const pendingProductId =
    pendingAction === "wishlist" ? initialParams.get("productId") : null;

  if (pendingAction === "wishlist") {
    initialParams.delete("pendingAction");
    initialParams.delete("productId");
    const cleanSearch = initialParams.toString();
    window.history.replaceState(
      {},
      "",
      cleanSearch ? `${window.location.pathname}?${cleanSearch}` : window.location.pathname
    );
  }

  initLayout();
  readUrlFilters();
  bindShopEvents();
  renderSidebarControls();

  try {
    const [cats, cols] = await Promise.all([fetchCategories(), fetchCollections()]);
    categoriesList = cats;
    collectionsList = cols;
    renderSidebarControls();
  } catch {
    // Non-fatal; product catalog fetch below handles primary error UI if backend is unreachable
  }

  refreshCatalog(false);
  processPendingShopIntent(pendingProductId);

  window.addEventListener("zain:wishlistchange", syncShopWishlistButtons);
  window.addEventListener("zain:authchange", syncShopWishlistButtons);
  fetchCurrentUser()
    .then((user) => (user?.role === "customer" ? fetchWishlist() : null))
    .then(syncShopWishlistButtons)
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
    renderSidebarControls();
    renderActiveFilters();
    renderCatalogView();
  });
}

document.addEventListener("DOMContentLoaded", bootstrapShop);
