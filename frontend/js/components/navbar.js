import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Shared Storefront Navbar & Accessible Mobile Drawer
 */

import { getLanguage, t, toggleLanguage } from "../i18n/i18n.js";
import { logoutUser } from "../services/auth-service.js";
import { escapeHtml } from "../utils/formatters.js";
import { openSearchModal, showToast } from "./ui.js";

function isCurrentPath(targetPath) {
  const pathname = window.location.pathname;
  if (targetPath === appUrl("/index.html")) {
    return pathname === "/" || pathname === appUrl("/index.html");
  }
  return pathname === targetPath;
}

function getFirstName(user) {
  const full = typeof user?.fullName === "string" ? user.fullName.trim() : "";
  if (!full) return "";
  return full.split(/\s+/)[0].slice(0, 18);
}

export function renderNavbar(container, state = {}) {
  if (!container) return;

  const lang = getLanguage();
  const wishlistCount = Number(state.wishlistCount ?? 0);
  const bagCount = Number(state.bagCount ?? 0);
  const user = state.user || null;
  const firstName = getFirstName(user);

  const navLinks = [
    { href: "/shop.html", label: t("nav.shop", lang) },
    { href: "/collections.html", label: t("nav.collections", lang) },
    { href: "/about.html", label: t("nav.about", lang) },
  ];

  const accountHref = user ? appUrl("/pages/account.html") : appUrl("/pages/auth.html");
  const accountLabel = user
    ? firstName || t("nav.myAccount", lang)
    : t("nav.signIn", lang);
  const accountTitle = user ? t("nav.myAccount", lang) : t("nav.signIn", lang);

  container.className = "site-header";
  container.innerHTML = `
    <a href="#app-main" class="skip-link">${t("nav.skipToContent", lang)}</a>
    <div class="container site-header__inner">
      <div class="site-header__left">
        <button
          type="button"
          class="mobile-menu-btn"
          id="zain-mobile-open"
          aria-label="${t("nav.menuOpen", lang)}"
          aria-expanded="false"
          aria-controls="zain-mobile-drawer"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <a href="${appUrl("/index.html")}" class="brand-link" aria-label="MR. ZAIN">
          <img
            src="${appUrl("/assets/images/mr-zain-logo.png")}"
            alt="MR. ZAIN"
            class="brand-logo-img"
            referrerPolicy="no-referrer"
          />
          <span class="brand-wordmark">MR. ZAIN</span>
        </a>
      </div>

      <nav class="main-nav" aria-label="${t("nav.primaryLabel", lang)}">
        ${navLinks
          .map(
            (link) => `
            <a
              href="${link.href}"
              class="main-nav__link"
              ${isCurrentPath(link.href) ? 'aria-current="page"' : ""}
            >${link.label}</a>`
          )
          .join("")}
      </nav>

      <div class="header-actions">
        <button
          type="button"
          class="header-icon-btn"
          id="zain-search-trigger"
          aria-label="${t("nav.search", lang)}"
          title="${t("nav.search", lang)}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>

        <a
          href="${accountHref}"
          class="header-account-link ${user ? "is-authenticated" : ""}"
          id="zain-account-link"
          aria-label="${escapeHtml(accountTitle)}"
          title="${escapeHtml(accountTitle)}"
          ${isCurrentPath(accountHref) ? 'aria-current="page"' : ""}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
          <span class="header-account-link__text">${escapeHtml(accountLabel)}</span>
        </a>

        ${
          user
            ? `
          <button
            type="button"
            class="header-icon-btn header-logout-btn"
            id="zain-nav-logout"
            aria-label="${escapeHtml(t("nav.signOut", lang))}"
            title="${escapeHtml(t("nav.signOut", lang))}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>`
            : ""
        }

        <a
          href="${appUrl("/pages/wishlist.html")}"
          class="header-icon-btn"
          id="zain-wishlist-trigger"
          aria-label="${t("nav.wishlist", lang)}"
          title="${t("nav.wishlist", lang)}"
          ${isCurrentPath(appUrl("/pages/wishlist.html")) ? 'aria-current="page"' : ""}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M12 20.5s-7.5-4.7-9.2-9.2C1.7 8.4 3.4 5 6.8 5c2 0 3.6 1 5.2 2.8C13.6 6 15.2 5 17.2 5c3.4 0 5.1 3.4 4 6.3-1.7 4.5-9.2 9.2-9.2 9.2Z" />
          </svg>
          <span class="header-count" id="zain-wishlist-count" data-count="${wishlistCount}">${wishlistCount}</span>
        </a>

        <a
          href="${appUrl("/pages/cart.html")}"
          class="header-icon-btn"
          id="zain-bag-trigger"
          aria-label="${t("nav.bag", lang)}"
          title="${t("nav.bag", lang)}"
          ${isCurrentPath(appUrl("/pages/cart.html")) ? 'aria-current="page"' : ""}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M6 8h12l1 12H5L6 8Z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
          <span class="header-count" id="zain-bag-count" data-count="${bagCount}">${bagCount}</span>
        </a>

        <button
          type="button"
          class="lang-toggle"
          id="zain-lang-toggle"
          aria-label="${t("nav.langSwitchAria", lang)}"
        >${t("nav.langSwitch", lang)}</button>
      </div>
    </div>
  `;

  mountMobileDrawer(navLinks, lang, user);
  bindNavbarEvents();
}

function mountMobileDrawer(navLinks, lang, user) {
  let backdrop = document.getElementById("zain-mobile-backdrop");
  let drawer = document.getElementById("zain-mobile-drawer");

  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "zain-mobile-backdrop";
    backdrop.className = "mobile-drawer-backdrop";
    document.body.appendChild(backdrop);
  }

  if (!drawer) {
    drawer = document.createElement("aside");
    drawer.id = "zain-mobile-drawer";
    drawer.className = "mobile-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", t("nav.primaryLabel", lang));
    drawer.hidden = true;
    document.body.appendChild(drawer);
  }

  drawer.innerHTML = `
    <div>
      <div class="mobile-drawer__header">
        <a href="${appUrl("/index.html")}" class="brand-link">
          <img src="${appUrl("/assets/images/mr-zain-logo.png")}" alt="MR. ZAIN" class="brand-logo-img" referrerPolicy="no-referrer" />
        </a>
        <button type="button" class="header-icon-btn" id="zain-mobile-close" aria-label="${t("nav.menuClose", lang)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav class="mobile-drawer__nav" aria-label="${t("nav.primaryLabel", lang)}">
        ${navLinks
          .map(
            (link) => `
            <a href="${link.href}" class="mobile-drawer__link">
              <span>${link.label}</span>
              <span aria-hidden="true">›</span>
            </a>`
          )
          .join("")}
      </nav>
    </div>

    <div class="mobile-drawer__footer">
      <a href="${appUrl("/pages/wishlist.html")}" class="btn btn--secondary">${escapeHtml(t("nav.wishlist", lang))}</a>
      <a href="${appUrl("/pages/cart.html")}" class="btn btn--secondary">${escapeHtml(t("nav.bag", lang))}</a>
      ${
        user
          ? `
          <a href="${appUrl("/pages/account.html")}" class="btn btn--secondary">${escapeHtml(t("nav.myAccount", lang))}</a>
          <button type="button" class="btn btn--secondary" id="zain-mobile-logout-btn">
            ${escapeHtml(t("nav.signOut", lang))}
          </button>
        `
          : `
          <a href="${appUrl("/pages/auth.html")}" class="btn btn--secondary">${escapeHtml(t("nav.signIn", lang))}</a>
        `
      }
      <button type="button" class="btn btn--primary" id="zain-mobile-lang-btn">
        ${t("nav.langSwitch", lang)}
      </button>
    </div>
  `;
}

let drawerKeydownBound = false;

async function handleSignOutClick() {
  const lang = getLanguage();
  try {
    await logoutUser();
    showToast(t("account.signedOutSuccess", lang), "info");
    if (
      window.location.pathname === appUrl("/pages/account.html") ||
      window.location.pathname === appUrl("/pages/cart.html") ||
      window.location.pathname === appUrl("/pages/wishlist.html") ||
      window.location.pathname === appUrl("/pages/checkout.html") ||
      window.location.pathname === appUrl("/pages/order-confirmation.html") ||
      window.location.pathname === appUrl("/pages/order-tracking.html")
    ) {
      window.location.replace(appUrl("/pages/auth.html"));
    }
  } catch {
    showToast(t("auth.genericError", lang), "error");
  }
}

function bindNavbarEvents() {
  const openBtn = document.getElementById("zain-mobile-open");
  const closeBtn = document.getElementById("zain-mobile-close");
  const backdrop = document.getElementById("zain-mobile-backdrop");
  const drawer = document.getElementById("zain-mobile-drawer");
  const searchBtn = document.getElementById("zain-search-trigger");
  const langBtn = document.getElementById("zain-lang-toggle");
  const mobileLangBtn = document.getElementById("zain-mobile-lang-btn");
  const navLogoutBtn = document.getElementById("zain-nav-logout");
  const mobileLogoutBtn = document.getElementById("zain-mobile-logout-btn");

  const openDrawer = () => {
    if (!drawer || !backdrop || !openBtn) return;
    drawer.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      backdrop.classList.add("is-open");
    });
    openBtn.setAttribute("aria-expanded", "true");
    closeBtn?.focus();
  };

  const closeDrawer = () => {
    if (!drawer || !backdrop || !openBtn) return;
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    openBtn.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!drawer.classList.contains("is-open")) {
        drawer.hidden = true;
      }
    }, 200);
    openBtn.focus();
  };

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  if (backdrop) {
    backdrop.onclick = closeDrawer;
  }

  drawer?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      drawer.classList.remove("is-open");
      backdrop?.classList.remove("is-open");
      drawer.hidden = true;
    });
  });

  if (!drawerKeydownBound) {
    drawerKeydownBound = true;
    document.addEventListener("keydown", (event) => {
      const currentDrawer = document.getElementById("zain-mobile-drawer");
      const currentBackdrop = document.getElementById("zain-mobile-backdrop");
      const currentOpenBtn = document.getElementById("zain-mobile-open");
      if (event.key === "Escape" && currentDrawer?.classList.contains("is-open")) {
        currentDrawer.classList.remove("is-open");
        currentBackdrop?.classList.remove("is-open");
        currentOpenBtn?.setAttribute("aria-expanded", "false");
        window.setTimeout(() => {
          if (!currentDrawer.classList.contains("is-open")) {
            currentDrawer.hidden = true;
          }
        }, 200);
        currentOpenBtn?.focus();
      }
    });
  }

  searchBtn?.addEventListener("click", openSearchModal);

  navLogoutBtn?.addEventListener("click", handleSignOutClick);
  mobileLogoutBtn?.addEventListener("click", () => {
    closeDrawer();
    handleSignOutClick();
  });

  langBtn?.addEventListener("click", toggleLanguage);
  mobileLangBtn?.addEventListener("click", toggleLanguage);
}

export function updateHeaderCounts({ wishlistCount, bagCount } = {}) {
  if (typeof wishlistCount === "number") {
    const el = document.getElementById("zain-wishlist-count");
    if (el) {
      el.dataset.count = String(wishlistCount);
      el.textContent = String(wishlistCount);
    }
  }
  if (typeof bagCount === "number") {
    const el = document.getElementById("zain-bag-count");
    if (el) {
      el.dataset.count = String(bagCount);
      el.textContent = String(bagCount);
    }
  }
}
