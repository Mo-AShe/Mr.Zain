/**
 * MR. ZAIN — Shared UI Primitives
 * Toast notifications, accessible modals, confirmation dialogs, search dialog,
 * loading skeletons, and empty states.
 */

import { getLanguage, t } from "../i18n/i18n.js";

let lastFocusedElement = null;
let activeEscHandler = null;

function ensureToastRegion() {
  let region = document.getElementById("zain-toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "zain-toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    document.body.appendChild(region);
  }
  return region;
}

function ensureModalRoot() {
  let root = document.getElementById("zain-modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "zain-modal-root";
    root.className = "modal-backdrop";
    root.hidden = true;
    document.body.appendChild(root);
  }
  return root;
}

export function showToast(message, type = "info", duration = 3500) {
  const region = ensureToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "status");

  const prefixMap = {
    info: t("ui.toastNotice"),
    success: t("ui.toastSuccess"),
    warning: t("ui.toastWarning"),
    error: t("ui.toastError"),
  };

  const body = document.createElement("div");
  const prefix = document.createElement("span");
  prefix.className = "toast__prefix";
  prefix.textContent = prefixMap[type] || prefixMap.info;

  const text = document.createElement("span");
  text.textContent = message;

  body.append(prefix, text);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t("ui.close"));
  closeBtn.textContent = "×";
  closeBtn.style.fontSize = "1.125rem";
  closeBtn.style.lineHeight = "1";
  closeBtn.addEventListener("click", () => toast.remove());

  toast.append(body, closeBtn);
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, duration);
}

export function closeModal() {
  const root = document.getElementById("zain-modal-root");
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
  if (activeEscHandler) {
    document.removeEventListener("keydown", activeEscHandler);
    activeEscHandler = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

export function openModal({ title, content, footerActions = [], variant = "" }) {
  const root = ensureModalRoot();
  lastFocusedElement = document.activeElement;
  root.innerHTML = "";

  const dialog = document.createElement("div");
  dialog.className = `modal-dialog ${variant ? `modal-dialog--${variant}` : ""}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "zain-modal-title");

  const header = document.createElement("div");
  header.className = "modal-header";

  const heading = document.createElement("h3");
  heading.id = "zain-modal-title";
  heading.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal-close";
  closeBtn.setAttribute("aria-label", t("ui.close"));
  closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  closeBtn.addEventListener("click", closeModal);

  header.append(heading, closeBtn);

  const body = document.createElement("div");
  body.className = "modal-body";
  if (typeof content === "string") {
    const p = document.createElement("p");
    p.textContent = content;
    body.appendChild(p);
  } else if (content instanceof Node) {
    body.appendChild(content);
  }

  dialog.append(header, body);

  if (footerActions.length > 0) {
    const footer = document.createElement("div");
    footer.className = "modal-footer";
    footerActions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${action.className || "btn--secondary"}`;
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        if (typeof action.onClick === "function") action.onClick();
      });
      footer.appendChild(btn);
    });
    dialog.appendChild(footer);
  }

  root.appendChild(dialog);
  root.hidden = false;

  root.onclick = (event) => {
    if (event.target === root) closeModal();
  };

  activeEscHandler = (event) => {
    if (event.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", activeEscHandler);
  closeBtn.focus();
}

export function openConfirmDialog({
  title,
  message,
  confirmLabel = t("ui.confirm"),
  cancelLabel = t("ui.cancel"),
  onConfirm,
}) {
  openModal({
    title,
    content: message,
    footerActions: [
      {
        label: cancelLabel,
        className: "btn--secondary",
        onClick: () => closeModal(),
      },
      {
        label: confirmLabel,
        className: "btn--primary",
        onClick: () => {
          closeModal();
          if (typeof onConfirm === "function") onConfirm();
        },
      },
    ],
  });
}

export function openSearchModal() {
  const lang = getLanguage();
  const wrapper = document.createElement("div");

  const form = document.createElement("form");
  form.className = "search-form";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "input";
  input.name = "q";
  input.placeholder = t("search.placeholder", lang);
  input.setAttribute("aria-label", t("search.title", lang));

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn btn--primary";
  submitBtn.textContent = t("search.submit", lang);

  form.append(input, submitBtn);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    closeModal();
    if (query) {
      window.location.href = `/shop.html?q=${encodeURIComponent(query)}`;
    } else {
      window.location.href = "/shop.html";
    }
  });

  const suggestions = document.createElement("div");
  suggestions.className = "search-suggestions";

  const label = document.createElement("span");
  label.className = "text-muted";
  label.style.fontSize = "12px";
  label.style.width = "100%";
  label.textContent = t("search.quickLinks", lang);
  suggestions.appendChild(label);

  const quickQueries = [
    { key: "search.tagHoodies", q: "hoodie" },
    { key: "search.tagSweatshirts", q: "sweatshirt" },
    { key: "search.tagJackets", q: "jacket" },
    { key: "search.tagFleece", q: "cotton" },
  ];

  quickQueries.forEach((item) => {
    const link = document.createElement("a");
    link.href = `/shop.html?q=${encodeURIComponent(item.q)}`;
    link.className = "search-suggestion-link";
    link.textContent = t(item.key, lang);
    suggestions.appendChild(link);
  });

  wrapper.append(form, suggestions);

  openModal({
    title: t("search.title", lang),
    content: wrapper,
    variant: "search",
  });

  window.setTimeout(() => input.focus(), 20);
}

export function renderLoadingState(container, count = 3) {
  if (!container) return;
  container.innerHTML = "";
  container.setAttribute("aria-busy", "true");
  container.setAttribute("aria-label", t("ui.loadingLabel"));

  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.innerHTML = `
      <div class="skeleton-block skeleton-block--media"></div>
      <div class="skeleton-block skeleton-block--line"></div>
      <div class="skeleton-block skeleton-block--price"></div>
    `;
    container.appendChild(card);
  }
}

export function renderEmptyState(
  container,
  {
    title = t("ui.emptyTitle"),
    description = t("ui.emptyDesc"),
    actionLabel = t("ui.emptyAction"),
    onAction,
  } = {}
) {
  if (!container) return;
  container.removeAttribute("aria-busy");
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "empty-state";
  box.style.gridColumn = "1 / -1";

  const heading = document.createElement("h3");
  heading.className = "empty-state__title";
  heading.textContent = title;

  const desc = document.createElement("p");
  desc.className = "empty-state__desc";
  desc.textContent = description;

  box.append(heading, desc);

  if (typeof onAction === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--secondary btn--sm";
    btn.textContent = actionLabel;
    btn.addEventListener("click", onAction);
    box.appendChild(btn);
  }

  container.appendChild(box);
}

export function renderErrorState(
  container,
  {
    title = t("ui.errorTitle"),
    description = t("ui.errorDesc"),
    retryLabel = t("ui.retry"),
    onRetry,
  } = {}
) {
  if (!container) return;
  container.removeAttribute("aria-busy");
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "empty-state";
  box.setAttribute("role", "alert");
  box.style.gridColumn = "1 / -1";

  const heading = document.createElement("h3");
  heading.className = "empty-state__title";
  heading.textContent = title;

  const desc = document.createElement("p");
  desc.className = "empty-state__desc";
  desc.textContent = description;

  box.append(heading, desc);

  if (typeof onRetry === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--primary btn--sm";
    btn.textContent = retryLabel;
    btn.addEventListener("click", onRetry);
    box.appendChild(btn);
  }

  container.appendChild(box);
}
