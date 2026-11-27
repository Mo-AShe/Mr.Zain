import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Admin Console Layout Shell
 * Renders responsive Jet Black sidebar, bilingual LTR/RTL top bar,
 * access-denied views, and upcoming-module placeholders.
 */

import { applyDocumentLanguage, getLanguage, t, toggleLanguage } from "../i18n/i18n.js";
import { escapeHtml } from "../utils/formatters.js";
import { api } from "../api.js";
import { createNotificationPoller } from "./notification-poller.js";

export const ADMIN_NAV_ITEMS = [
  { key: "overview", i18nKey: "admin.navOverview", functional: true, icon: "grid" },
  { key: "products", i18nKey: "admin.navProducts", functional: true, icon: "box" },
  { key: "categories", i18nKey: "admin.navCategories", functional: true, icon: "layers" },
  { key: "collections", i18nKey: "admin.navCollections", functional: true, icon: "tag" },
  { key: "inventory", i18nKey: "admin.navInventory", functional: true, icon: "archive" },
  { key: "orders", i18nKey: "admin.navOrders", functional: true, icon: "receipt" },
  { key: "customers", i18nKey: "admin.navCustomers", functional: true, icon: "users" },
  { key: "coupons", i18nKey: "admin.navCoupons", functional: true, icon: "percent" },
  { key: "shipping", i18nKey: "admin.navShipping", functional: true, icon: "truck" },
  { key: "settings", i18nKey: "admin.navSettings", functional: true, icon: "sliders" },
];

function renderNavIcon(iconName) {
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />',
    tag: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41Z" /><circle cx="7.5" cy="7.5" r="1.5" />',
    archive: '<rect x="2" y="4" width="20" height="5" /><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M10 13h4" />',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2Z" /><path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" />',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
    percent: '<line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />',
    truck: '<path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />',
    sliders: '<line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[iconName] || icons.grid}</svg>`;
}

export function getNavItemMeta(sectionKey) {
  return ADMIN_NAV_ITEMS.find((item) => item.key === sectionKey) || ADMIN_NAV_ITEMS[0];
}

export function renderAdminAuthLoading(rootEl) {
  stopAdminNotificationPolling();
  const lang = getLanguage();
  applyDocumentLanguage(lang);
  document.title = t("admin.pageTitle", lang);
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem;">
      <div class="admin-state-box" style="max-width: 440px; width: 100%;" aria-busy="true">
        <div class="admin-skeleton" style="width: 140px; height: 22px;"></div>
        <p class="admin-state-box__desc">${escapeHtml(t("admin.checkingAccess", lang))}</p>
        <div class="admin-skeleton" style="width: 100%; height: 14px;"></div>
      </div>
    </div>
  `;
}

export function renderAdminAccessDenied(rootEl, { onSignOut }) {
  stopAdminNotificationPolling();
  const lang = getLanguage();
  applyDocumentLanguage(lang);
  document.title = t("admin.pageTitle", lang);
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem;">
      <div class="admin-state-box" style="max-width: 480px; width: 100%;">
        <h1 class="admin-state-box__title">${escapeHtml(t("admin.accessDeniedTitle", lang))}</h1>
        <p class="admin-state-box__desc">${escapeHtml(t("admin.accessDeniedDesc", lang))}</p>
        <div class="admin-state-actions">
          <a href=appUrl("/index.html") class="btn btn--primary">${escapeHtml(t("admin.returnToStorefront", lang))}</a>
          <button type="button" class="btn btn--secondary" id="admin-denied-signout">
            ${escapeHtml(t("admin.signOutSwitch", lang))}
          </button>
        </div>
      </div>
    </div>
  `;

  const signOutBtn = document.getElementById("admin-denied-signout");
  signOutBtn?.addEventListener("click", async () => {
    signOutBtn.disabled = true;
    await onSignOut();
  });
}

let escListenerBound = false;
let notificationPoller = null;
let notificationPollerAdminId = null;
let activeNotificationView = null;
let notificationAuthRecovery = null;

function stopAdminNotificationPolling() {
  notificationPoller?.stop();
  notificationPoller = null;
  notificationPollerAdminId = null;
  activeNotificationView = null;
  notificationAuthRecovery = null;
}

function startAdminNotificationPolling(adminId, view, onAuthError) {
  activeNotificationView = view;
  notificationAuthRecovery = onAuthError;
  if (notificationPoller && notificationPollerAdminId === adminId) return;

  stopAdminNotificationPolling();
  activeNotificationView = view;
  notificationAuthRecovery = onAuthError;
  notificationPollerAdminId = adminId;
  notificationPoller = createNotificationPoller({
    fetchNotifications: () => api.get(appUrl("/admin/notifications?limit=50")),
    onSuccess: (response) => {
      activeNotificationView?.render(
        response?.notifications || [],
        Number(response?.unreadCount || 0)
      );
    },
    onError: () => activeNotificationView?.showError(),
    onUnauthorized: () => {
      const recoverAuthentication = notificationAuthRecovery;
      stopAdminNotificationPolling();
      if (typeof recoverAuthentication === "function") {
        void (async () => {
          try {
            await recoverAuthentication();
          } catch (error) {
            console.error("Could not revalidate the admin session after notification authorization failed.", error);
          }
        })();
      }
    },
  });
  notificationPoller.start();
}

export function renderAdminShell(
  rootEl,
  { admin, activeSection, onSelectSection, onSignOut, onOpenNotification, onAuthError }
) {
  const lang = getLanguage();
  applyDocumentLanguage(lang);
  document.title = t("admin.pageTitle", lang);
  if (!rootEl) return null;

  const activeMeta = getNavItemMeta(activeSection);
  const sectionTitle = t(activeMeta.i18nKey, lang);
  const adminName = admin?.fullName || admin?.email || t("admin.roleAdmin", lang);

  rootEl.innerHTML = `
    <a href="#admin-main-content" class="skip-link">${escapeHtml(t("admin.skipToContent", lang))}</a>
    <div class="admin-shell">
      <div class="admin-drawer-backdrop" id="admin-drawer-backdrop"></div>
      <aside class="admin-sidebar" id="admin-sidebar" aria-label="${escapeHtml(t("admin.brandConsole", lang))}">
        <div class="admin-sidebar__top">
          <div class="admin-sidebar__brand">
            <a href=appUrl("/admin/index.html") class="admin-brand-link">
              <span class="admin-brand-logo-wrap">
                <img src=appUrl("/assets/images/mr-zain-logo.png") alt="MR. ZAIN" referrerpolicy="no-referrer" />
              </span>
              <span class="admin-brand-wordmark">MR. ZAIN</span>
            </a>
            <button
              type="button"
              class="admin-sidebar__close"
              id="admin-sidebar-close"
              aria-label="${escapeHtml(t("admin.closeMenu", lang))}"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav class="admin-nav" aria-label="${escapeHtml(t("admin.brandConsole", lang))}">
            ${ADMIN_NAV_ITEMS.map((item) => {
              const isActive = item.key === activeSection;
              return `
                <button
                  type="button"
                  class="admin-nav__link ${isActive ? "is-active" : ""}"
                  data-admin-nav="${escapeHtml(item.key)}"
                  aria-current="${isActive ? "page" : "false"}"
                >
                  <span class="admin-nav__label">
                    ${renderNavIcon(item.icon)}
                    <span>${escapeHtml(t(item.i18nKey, lang))}</span>
                  </span>
                </button>
              `;
            }).join("")}
          </nav>
        </div>

        <div class="admin-sidebar__footer">
          <a href=appUrl("/index.html") class="admin-sidebar__store-link">
            <span>${escapeHtml(t("admin.viewStorefront", lang))}</span>
            <span aria-hidden="true">&nearr;</span>
          </a>
        </div>
      </aside>

      <div class="admin-workspace">
        <header class="admin-topbar">
          <div class="admin-topbar__left">
            <button
              type="button"
              class="admin-mobile-menu-btn"
              id="admin-mobile-menu-btn"
              aria-label="${escapeHtml(t("admin.openMenu", lang))}"
              aria-expanded="false"
              aria-controls="admin-sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div class="admin-breadcrumb">
              <span>${escapeHtml(t("admin.breadcrumbPrefix", lang))}</span>
              <span aria-hidden="true">/</span>
              <span class="admin-breadcrumb__current">${escapeHtml(sectionTitle)}</span>
            </div>
          </div>

          <div class="admin-topbar__actions">
            <div class="admin-notifications" id="admin-notifications">
              <button
                type="button"
                class="admin-notification-trigger"
                id="admin-notification-trigger"
                aria-label="${escapeHtml(t("admin.notificationsLabel", lang))}"
                aria-expanded="false"
                aria-controls="admin-notification-dropdown"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span class="admin-notification-badge" id="admin-notification-badge" hidden>0</span>
              </button>
              <div class="admin-notification-dropdown" id="admin-notification-dropdown" hidden>
                <div class="admin-notification-head">
                  <strong>${escapeHtml(t("admin.notificationsTitle", lang))}</strong>
                  <button type="button" id="admin-notifications-read-all" class="admin-notification-read-all">
                    ${escapeHtml(t("admin.notificationsMarkAllRead", lang))}
                  </button>
                </div>
                <div class="admin-notification-list" id="admin-notification-list">
                  <div class="admin-notification-empty">${escapeHtml(t("admin.notificationsLoading", lang))}</div>
                </div>
              </div>
            </div>
            <div class="admin-user-summary">
              <span class="admin-user-summary__name">${escapeHtml(adminName)}</span>
              <span class="admin-user-summary__sep" aria-hidden="true">·</span>
              <span class="admin-user-summary__role">${escapeHtml(t("admin.roleAdmin", lang))}</span>
            </div>
            <button type="button" class="admin-lang-btn" id="admin-lang-toggle">
              ${escapeHtml(t("nav.langSwitch", lang))}
            </button>
            <button type="button" class="btn btn--secondary btn--sm" id="admin-signout-btn">
              ${escapeHtml(t("admin.signOut", lang))}
            </button>
          </div>
        </header>

        <main class="admin-main" id="admin-main-content"></main>
      </div>
    </div>
  `;

  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-drawer-backdrop");
  const openBtn = document.getElementById("admin-mobile-menu-btn");
  const closeBtn = document.getElementById("admin-sidebar-close");

  const openDrawer = () => {
    sidebar?.classList.add("is-open");
    backdrop?.classList.add("is-open");
    openBtn?.setAttribute("aria-expanded", "true");
    closeBtn?.focus();
  };

  const closeDrawer = () => {
    sidebar?.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    openBtn?.setAttribute("aria-expanded", "false");
  };

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  backdrop?.addEventListener("click", closeDrawer);

  if (!escListenerBound) {
    escListenerBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const currentSidebar = document.getElementById("admin-sidebar");
        const currentBackdrop = document.getElementById("admin-drawer-backdrop");
        const currentOpenBtn = document.getElementById("admin-mobile-menu-btn");
        if (currentSidebar?.classList.contains("is-open")) {
          currentSidebar.classList.remove("is-open");
          currentBackdrop?.classList.remove("is-open");
          currentOpenBtn?.setAttribute("aria-expanded", "false");
          currentOpenBtn?.focus();
        }
      }
    });
  }

  rootEl.querySelectorAll("[data-admin-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-admin-nav") || "overview";
      closeDrawer();
      onSelectSection(target);
    });
  });

  document.getElementById("admin-lang-toggle")?.addEventListener("click", () => {
    toggleLanguage();
  });

  const signOutBtn = document.getElementById("admin-signout-btn");
  signOutBtn?.addEventListener("click", async () => {
    signOutBtn.disabled = true;
    signOutBtn.textContent = t("admin.signingOut", getLanguage());
    stopAdminNotificationPolling();
    await onSignOut();
  });

  const trigger = document.getElementById("admin-notification-trigger");
  const dropdown = document.getElementById("admin-notification-dropdown");
  const badge = document.getElementById("admin-notification-badge");
  const list = document.getElementById("admin-notification-list");

  trigger?.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isOpen));
    if (dropdown) dropdown.hidden = isOpen;
  });

  const formatNotificationTime = (iso) => {
    const lang = getLanguage();
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const renderNotifications = (notifications, unreadCount) => {
    if (badge) {
      badge.textContent = String(unreadCount);
      badge.hidden = unreadCount === 0;
    }
    if (!list) return;

    const lang = getLanguage();
    if (!Array.isArray(notifications) || notifications.length === 0) {
      list.innerHTML = `<div class="admin-notification-empty">${escapeHtml(t("admin.notificationsEmpty", lang))}</div>`;
      return;
    }

    list.innerHTML = notifications.map((item) => `
      <button
        type="button"
        class="admin-notification-item ${item.isRead ? "is-read" : "is-unread"}"
        data-notification-id="${escapeHtml(item.id)}"
        data-notification-order="${escapeHtml(item.orderId)}"
      >
        <span class="admin-notification-item__dot" aria-hidden="true"></span>
        <span class="admin-notification-item__body">
          <strong>${escapeHtml(t("admin.notificationNewOrder", lang))} #${escapeHtml(item.orderNumber)}</strong>
          <span>${escapeHtml(item.customerName)} · ${escapeHtml(`${Number(item.totalAmount).toFixed(2)} EGP`)}</span>
          <small>${escapeHtml(formatNotificationTime(item.createdAt))} · ${escapeHtml(item.orderStatus)}</small>
        </span>
      </button>
    `).join("");

    list.querySelectorAll("[data-notification-id]").forEach((item) => {
      item.addEventListener("click", async () => {
        const notificationId = item.getAttribute("data-notification-id");
        const orderId = item.getAttribute("data-notification-order");
        if (notificationId) {
          try {
            await api.post(`/admin/notifications/${encodeURIComponent(notificationId)}/read`, {});
          } catch {
            // The order navigation remains available even if marking read fails.
          }
        }
        if (typeof onOpenNotification === "function" && orderId) {
          onOpenNotification(orderId);
        }
        notificationPoller?.refresh();
        if (dropdown) dropdown.hidden = true;
        trigger?.setAttribute("aria-expanded", "false");
      });
    });
  };

  const notificationView = {
    render: renderNotifications,
    showError: () => {
      if (list) {
        list.innerHTML = `<div class="admin-notification-empty">${escapeHtml(t("admin.notificationsError", getLanguage()))}</div>`;
      }
    },
  };
  if (admin?.id) {
    startAdminNotificationPolling(admin.id, notificationView, onAuthError);
  } else {
    stopAdminNotificationPolling();
  }

  document.getElementById("admin-notifications-read-all")?.addEventListener("click", async () => {
    try {
      await api.post(appUrl("/admin/notifications/read-all"), {});
      notificationPoller?.refresh();
    } catch {
      // Keep the current list visible when the mutation fails.
    }
  });

  return document.getElementById("admin-main-content");
}

export function renderUpcomingSection(mainEl, sectionKey, { onBackToOverview }) {
  if (!mainEl) return;
  const lang = getLanguage();
  const meta = getNavItemMeta(sectionKey);
  const title = t(meta.i18nKey, lang);

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("admin.upcomingKicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(title)}</h1>
      </div>
    </div>

    <div class="admin-state-box">
      <h2 class="admin-state-box__title">${escapeHtml(title)}</h2>
      <p class="admin-state-box__desc">${escapeHtml(t("admin.upcomingDesc", lang))}</p>
      <div class="admin-state-actions">
        <button type="button" class="btn btn--primary" id="admin-upcoming-back">
          ${escapeHtml(t("admin.backToOverview", lang))}
        </button>
      </div>
    </div>
  `;

  document.getElementById("admin-upcoming-back")?.addEventListener("click", () => {
    onBackToOverview();
  });
}
