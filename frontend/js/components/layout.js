/**
 * MR. ZAIN — Global Layout Loader
 * Initializes i18n, announcement bar, navbar (including live session, cart, and wishlist counts),
 * footer, and reactive language/auth/cart/wishlist updates.
 */

import { applyDocumentLanguage } from "../i18n/i18n.js";
import { fetchCurrentUser, getCachedUser } from "../services/auth-service.js";
import {
  clearCartState,
  fetchCart,
  getCachedBagCount,
} from "../services/cart-service.js";
import {
  clearWishlistState,
  fetchWishlist,
  getCachedWishlistCount,
} from "../services/wishlist-service.js";
import { fetchPublicStoreSettings } from "../services/settings-service.js";
import { renderAnnouncementBar } from "./announcement-bar.js";
import { renderFooter } from "./footer.js";
import { renderNavbar, updateHeaderCounts } from "./navbar.js";

let layoutEventsBound = false;
let currentLayoutOptions = {};

function buildHeaderState() {
  const user = getCachedUser();
  return {
    wishlistCount: user ? getCachedWishlistCount() : 0,
    bagCount: user ? getCachedBagCount() : 0,
    user,
    ...(currentLayoutOptions.headerState || {}),
  };
}

function renderSharedChrome() {
  applyDocumentLanguage();
  renderAnnouncementBar(document.getElementById("site-announcement"));
  renderNavbar(document.getElementById("site-header"), buildHeaderState());
  renderFooter(document.getElementById("site-footer"));
}

function syncCountsForSession(user) {
  if (!user) {
    clearCartState();
    clearWishlistState();
    updateHeaderCounts({ wishlistCount: 0, bagCount: 0 });
    return;
  }

  Promise.allSettled([fetchCart(), fetchWishlist()]).catch(() => {
    // Non-fatal on header hydration
  });
}

export function initLayout(options = {}) {
  currentLayoutOptions = options;
  renderSharedChrome();

  if (!layoutEventsBound) {
    layoutEventsBound = true;

    window.addEventListener("zain:langchange", renderSharedChrome);
    window.addEventListener("zain:settingsloaded", () => {
      renderAnnouncementBar(document.getElementById("site-announcement"));
      renderFooter(document.getElementById("site-footer"));
    });

    window.addEventListener("zain:authchange", () => {
      const user = getCachedUser();
      renderNavbar(document.getElementById("site-header"), buildHeaderState());
      syncCountsForSession(user);
    });

    const refreshCounts = () => {
      const user = getCachedUser();
      updateHeaderCounts({
        wishlistCount: user ? getCachedWishlistCount() : 0,
        bagCount: user ? getCachedBagCount() : 0,
      });
    };

    window.addEventListener("zain:cartchange", refreshCounts);
    window.addEventListener("zain:wishlistchange", refreshCounts);
  }

  fetchPublicStoreSettings().catch(() => {
    // Non-fatal on public pages
  });

  if (!options.skipAuthCheck) {
    fetchCurrentUser()
      .then((user) => {
        if (user) {
          syncCountsForSession(user);
        }
      })
      .catch(() => {
        // Non-fatal on public pages; navbar remains in guest state
      });
  }
}
