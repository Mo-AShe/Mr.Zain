/**
 * MR. ZAIN — Collections Page Controller
 * Connected to live GET /api/v1/collections endpoint (Neon PostgreSQL).
 */

import { initLayout } from "../components/layout.js";
import { createGarmentPlaceholder, inferGarmentType } from "../components/placeholders.js";
import {
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import { fetchCollections } from "../services/catalog-service.js";
import { pickLocalized } from "../utils/formatters.js";

let collections = [];
let loadError = null;

function renderCollections() {
  const root = document.getElementById("collections-list");
  if (!root) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");
  root.innerHTML = "";

  if (loadError) {
    renderErrorState(root, {
      onRetry: loadCollections,
    });
    return;
  }

  if (!collections || collections.length === 0) {
    renderEmptyState(root, {
      title: t("collections.emptyTitle", lang),
      description: t("collections.emptyDesc", lang),
      actionLabel: t("home.heroCtaPrimary", lang),
      onAction: () => {
        window.location.href = "/shop.html";
      },
    });
    return;
  }

  collections.forEach((col, index) => {
    const title = pickLocalized(col, "name", lang);
    const desc = pickLocalized(col, "description", lang);
    const countLabel =
      col.productCount === 1
        ? t("collections.pieceCountSingle", lang)
        : t("collections.pieceCountPlural", lang).replace(
            "{count}",
            String(col.productCount ?? 0)
          );

    const card = document.createElement("article");
    card.className = `collection-feature ${index % 2 === 1 ? "collection-feature--reverse" : ""}`.trim();

    const media = document.createElement("div");
    media.className = "collection-feature__media";
    if (col.imageUrl) {
      const img = document.createElement("img");
      img.src = col.imageUrl;
      img.alt = title;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        media.innerHTML = "";
        media.appendChild(createGarmentPlaceholder(inferGarmentType(col), title));
      });
      media.appendChild(img);
    } else {
      media.appendChild(createGarmentPlaceholder(inferGarmentType(col), title));
    }

    const body = document.createElement("div");
    body.className = "collection-feature__body";

    const kickerEl = document.createElement("span");
    kickerEl.className = "section-kicker";
    kickerEl.textContent = countLabel;

    const headingEl = document.createElement("h2");
    headingEl.textContent = title;

    body.append(kickerEl, headingEl);

    if (desc) {
      const descEl = document.createElement("p");
      descEl.className = "text-muted";
      descEl.textContent = desc;
      body.appendChild(descEl);
    }

    const ctaEl = document.createElement("a");
    ctaEl.href = `/shop.html?collection=${encodeURIComponent(col.slug)}`;
    ctaEl.className = "btn btn--primary";
    ctaEl.textContent = t("collections.exploreCollection", lang);
    body.appendChild(ctaEl);

    card.append(media, body);
    root.appendChild(card);
  });
}

async function loadCollections() {
  const root = document.getElementById("collections-list");
  loadError = null;
  renderLoadingState(root, 3);

  try {
    collections = await fetchCollections();
  } catch (err) {
    collections = [];
    loadError = err;
  }

  renderCollections();
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  loadCollections();
  window.addEventListener("zain:langchange", renderCollections);
});
