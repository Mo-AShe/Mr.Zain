import { appUrl } from "../utils/paths.js";
/**
 * MR. ZAIN — Protected Customer Account Page Controller
 * Guards access via GET /api/v1/auth/me and renders:
 * 1. Customer Profile & Sign Out
 * 2. Saved Egyptian Delivery Addresses CRUD
 * 3. Paginated Order History with Detail Modal & Safe Self-Cancellation
 */

import {
  formatAddressLines,
  localizeGovernorate,
  openAddressFormModal,
} from "../components/address-form.js";
import { initLayout } from "../components/layout.js";
import {
  buildOrderDetailElement,
  formatOrderDate,
  getOrderStatusClass,
  localizePaymentStatus,
  localizeOrderStatus,
} from "../components/order-view.js";
import {
  openConfirmDialog,
  openModal,
  renderLoadingState,
  showToast,
} from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import {
  deleteAddress,
  fetchAddresses,
  fetchGovernorates,
  updateAddress,
} from "../services/address-service.js";
import {
  logoutUser,
  redirectToAuth,
  requireCustomerAuth,
  updateCurrentUser,
} from "../services/auth-service.js";
import { cancelOrder, fetchOrderById, fetchOrders } from "../services/order-service.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";

let activeUser = null;
let addressesList = [];
let governoratesList = [];
let addressLoadFailed = false;
let governoratesLoadFailed = false;
let ordersData = { orders: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } };
let currentOrdersPage = 1;
const busyOrderIds = new Set();

function isValidEgyptianPhone(raw) {
  const cleaned = String(raw || "").replace(/[\s\-().]/g, "").trim();
  return /^(?:\+20|20|0)1[0125]\d{8}$/.test(cleaned);
}

function formatMemberDate(isoDate, lang) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

async function refreshAddresses() {
  const [addressesResult, governoratesResult] = await Promise.allSettled([
    fetchAddresses(),
    governoratesList.length > 0 ? Promise.resolve(governoratesList) : fetchGovernorates(),
  ]);

  addressLoadFailed = addressesResult.status === "rejected";
  governoratesLoadFailed = governoratesResult.status === "rejected";

  if (addressesResult.status === "fulfilled") {
    addressesList = addressesResult.value;
  }
  if (governoratesResult.status === "fulfilled") {
    governoratesList = governoratesResult.value;
  }

  const authError = [addressesResult, governoratesResult].find(
    (result) => result.status === "rejected" && result.reason?.status === 401
  );
  if (authError) {
    redirectToAuth(appUrl("/pages/account.html"));
  }
}

async function refreshOrders(page = currentOrdersPage) {
  currentOrdersPage = page;
  ordersData = await fetchOrders({ page, limit: 5 });
}

async function loadAccountData() {
  await Promise.all([refreshAddresses(), refreshOrders(1)]);
}

function renderAccountView() {
  const root = document.getElementById("account-root");
  if (!root || !activeUser) return;

  const lang = getLanguage();
  root.removeAttribute("aria-busy");

  const phoneDisplay = activeUser.phone || t("account.notProvided", lang);
  const roleDisplay =
    activeUser.role === "customer"
      ? t("account.roleCustomer", lang)
      : activeUser.role;
  const memberSince = formatMemberDate(activeUser.createdAt, lang);

  const addressesHtml = addressLoadFailed
    ? `
        <div class="account-empty-inline" role="alert">
          <p><strong>${escapeHtml(t("account.addressLoadError", lang))}</strong></p>
          <button type="button" class="btn btn--ghost btn--sm" id="account-retry-addresses">
            ${escapeHtml(t("account.retryAddresses", lang))}
          </button>
        </div>
      `
    : addressesList.length === 0
      ? `
        <div class="account-empty-inline">
          <p><strong>${escapeHtml(t("account.noAddressesTitle", lang))}</strong></p>
          <p class="text-muted" style="font-size: 0.875rem;">${escapeHtml(t("account.noAddressesDesc", lang))}</p>
        </div>
      `
      : `
        <div class="account-address-list">
          ${addressesList
            .map((addr) => {
              const lines = formatAddressLines(addr, lang);
              return `
                <div class="account-address-item">
                  <div class="account-address-item__top">
                    <div>
                      <strong>${escapeHtml(addr.recipientName)}</strong>
                      ${
                        addr.isDefault
                          ? `<span class="checkout-meta-label">${escapeHtml(t("address.defaultBadge", lang))}</span>`
                          : ""
                      }
                    </div>
                    <span class="tabular-nums text-muted" style="font-size: 0.8125rem;" dir="ltr">${escapeHtml(addr.phone)}</span>
                  </div>
                  <p class="account-address-item__lines">${lines.map(escapeHtml).join(" · ")}</p>
                  ${
                    addr.additionalInformation
                      ? `<p class="text-muted" style="font-size: 0.8125rem;">${escapeHtml(addr.additionalInformation)}</p>`
                      : ""
                  }
                  <div class="account-address-item__actions">
                    ${
                      !addr.isDefault
                        ? `<button type="button" class="btn btn--ghost btn--sm" data-acct-addr-default="${escapeHtml(addr.id)}">${escapeHtml(t("address.setDefaultBtn", lang))}</button>`
                        : ""
                    }
                    <button type="button" class="btn btn--ghost btn--sm" data-acct-addr-edit="${escapeHtml(addr.id)}" ${governoratesList.length === 0 ? "disabled" : ""}>${escapeHtml(t("address.editBtn", lang))}</button>
                    <button type="button" class="btn btn--ghost btn--sm checkout-addr-delete" data-acct-addr-delete="${escapeHtml(addr.id)}">${escapeHtml(t("address.deleteBtn", lang))}</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
  const governoratesNotice =
    (governoratesLoadFailed || governoratesList.length === 0) && !addressLoadFailed
      ? `
        <div class="account-empty-inline" role="status">
          <p class="form-error">${escapeHtml(t("account.governoratesLoadError", lang))}</p>
          <button type="button" class="btn btn--ghost btn--sm" id="account-retry-addresses">
            ${escapeHtml(t("account.retryAddresses", lang))}
          </button>
        </div>
      `
      : "";

  const orders = Array.isArray(ordersData?.orders) ? ordersData.orders : [];
  const pagination = ordersData?.pagination || { page: 1, totalPages: 1 };

  const ordersHtml =
    orders.length === 0
      ? `
        <div class="account-empty-inline">
          <p><strong>${escapeHtml(t("account.noOrdersTitle", lang))}</strong></p>
          <p class="text-muted" style="font-size: 0.875rem;">${escapeHtml(t("account.noOrdersDesc", lang))}</p>
          <a href="/shop.html" class="btn btn--secondary btn--sm" style="margin-top: 0.5rem;">${escapeHtml(t("account.shopNowBtn", lang))}</a>
        </div>
      `
      : `
        <div class="account-orders-list">
          ${orders
            .map((ord) => {
              const isBusy = busyOrderIds.has(ord.id);
              const itemText =
                ord.itemCount === 1
                  ? t("cart.itemCountSingle", lang)
                  : t("cart.itemCountPlural", lang).replace("{count}", String(ord.itemCount));

              return `
                <div class="account-order-item">
                  <div class="account-order-item__head">
                    <div>
                      <strong class="tabular-nums">${escapeHtml(ord.orderNumber)}</strong>
                      <div class="account-order-item__sub">
                        <span class="${escapeHtml(getOrderStatusClass(ord.orderStatus))}">${escapeHtml(localizeOrderStatus(ord.orderStatus, lang))}</span>
                        <span aria-hidden="true">·</span>
                        <span class="tabular-nums">${escapeHtml(formatOrderDate(ord.createdAt, lang))}</span>
                        <span aria-hidden="true">·</span>
                        <span>${escapeHtml(localizePaymentStatus(ord.paymentStatus, lang))}</span>
                      </div>
                    </div>
                    <strong class="tabular-nums">${escapeHtml(formatPriceEGP(ord.totalAmount, lang))}</strong>
                  </div>

                  <div class="account-order-item__meta text-muted">
                    <span>${escapeHtml(itemText)}</span>
                    <span aria-hidden="true">·</span>
                    <span>${escapeHtml(ord.city)}, ${escapeHtml(localizeGovernorate(ord.governorate, lang))}</span>
                    <span aria-hidden="true">·</span>
                    <span>${escapeHtml(t("orders.methodCod", lang))}</span>
                  </div>

                  <div class="account-order-item__actions">
                    <button type="button" class="btn btn--secondary btn--sm" data-acct-order-view="${escapeHtml(ord.id)}" ${isBusy ? "disabled" : ""}>
                      ${escapeHtml(t("account.viewOrderBtn", lang))}
                    </button>
                    ${
                      ord.canCancel
                        ? `<button type="button" class="btn btn--ghost btn--sm checkout-addr-delete" data-acct-order-cancel="${escapeHtml(ord.id)}" ${isBusy ? "disabled" : ""}>
                            ${escapeHtml(t("account.cancelOrderBtn", lang))}
                          </button>`
                        : ""
                    }
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>

        ${
          pagination.totalPages > 1
            ? `
            <div class="account-pagination">
              <button type="button" class="btn btn--ghost btn--sm" id="acct-orders-prev" ${pagination.page <= 1 ? "disabled" : ""}>
                ${escapeHtml(t("orders.prevPage", lang))}
              </button>
              <span class="text-muted tabular-nums" style="font-size: 0.8125rem;">
                ${escapeHtml(
                  t("orders.pageInfo", lang)
                    .replace("{page}", String(pagination.page))
                    .replace("{total}", String(pagination.totalPages))
                )}
              </span>
              <button type="button" class="btn btn--ghost btn--sm" id="acct-orders-next" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>
                ${escapeHtml(t("orders.nextPage", lang))}
              </button>
            </div>
          `
            : ""
        }
      `;

  root.innerHTML = `
    <div class="account-layout account-layout--expanded">
      <div class="account-main-stack">
        <article class="account-card">
          <div class="account-card__header">
            <div>
              <h2 style="font-size: 1.25rem;">${escapeHtml(t("account.profileHeading", lang))}</h2>
              <p class="text-muted" style="font-size: 0.875rem; margin-top: 0.25rem;">
                ${escapeHtml(t("account.sessionNote", lang))}
              </p>
            </div>
            <button type="button" id="account-signout-btn" class="btn btn--secondary btn--sm">
              ${escapeHtml(t("account.signOut", lang))}
            </button>
          </div>

          <dl class="account-profile-list">
            <div class="account-profile-item">
              <dt class="account-profile-item__label">${escapeHtml(t("account.nameLabel", lang))}</dt>
              <dd class="account-profile-item__value">${escapeHtml(activeUser.fullName)}</dd>
            </div>

            <div class="account-profile-item">
              <dt class="account-profile-item__label">${escapeHtml(t("account.emailLabel", lang))}</dt>
              <dd class="account-profile-item__value">${escapeHtml(activeUser.email)}</dd>
            </div>

            <div class="account-profile-item">
              <dt class="account-profile-item__label">${escapeHtml(t("account.phoneLabel", lang))}</dt>
              <dd class="account-profile-item__value" dir="ltr">${escapeHtml(phoneDisplay)}</dd>
            </div>

            <div class="account-profile-item">
              <dt class="account-profile-item__label">${escapeHtml(t("account.roleLabel", lang))}</dt>
              <dd class="account-profile-item__value">${escapeHtml(roleDisplay)}</dd>
            </div>

            <div class="account-profile-item">
              <dt class="account-profile-item__label">${escapeHtml(t("account.memberSinceLabel", lang))}</dt>
              <dd class="account-profile-item__value">${escapeHtml(memberSince)}</dd>
            </div>
          </dl>

          <form id="account-profile-form" class="account-profile-edit-form" novalidate>
            <div class="field">
              <label class="field__label" for="account-name-input">${escapeHtml(t("account.nameLabel", lang))} *</label>
              <input
                id="account-name-input"
                name="fullName"
                type="text"
                autocomplete="name"
                class="input"
                maxlength="150"
                value="${escapeHtml(activeUser.fullName || "")}"
                required
              />
              <span id="err-account-name" class="form-error" aria-live="polite"></span>
            </div>
            <div class="field">
              <label class="field__label" for="account-email-input">${escapeHtml(t("account.emailLabel", lang))} *</label>
              <input
                id="account-email-input"
                name="email"
                type="email"
                autocomplete="email"
                class="input"
                maxlength="255"
                value="${escapeHtml(activeUser.email || "")}"
                required
              />
              <span id="err-account-email" class="form-error" aria-live="polite"></span>
            </div>
            <div class="field">
              <label class="field__label" for="account-phone-input">${escapeHtml(t("account.phoneLabel", lang))} *</label>
              <input
                id="account-phone-input"
                name="phone"
                type="tel"
                autocomplete="tel"
                class="input"
                dir="ltr"
                maxlength="30"
                value="${escapeHtml(activeUser.phone || "")}"
                required
              />
              <span id="err-account-phone" class="form-error" aria-live="polite"></span>
            </div>
            <div class="field" id="account-current-password-field" hidden>
              <label class="field__label" for="account-current-password">${escapeHtml(t("account.currentPasswordLabel", lang))} *</label>
              <input
                id="account-current-password"
                name="currentPassword"
                type="password"
                autocomplete="current-password"
                class="input"
              />
              <span id="err-account-current-password" class="form-error" aria-live="polite"></span>
            </div>
            <button type="submit" id="account-profile-save-btn" class="btn btn--secondary btn--sm">
              ${escapeHtml(t("account.saveProfileBtn", lang))}
            </button>
          </form>

          <div style="padding-top: 0.5rem;">
            <a href="/shop.html" class="btn btn--primary">${escapeHtml(t("account.browseShop", lang))}</a>
          </div>
        </article>

        <article class="account-card">
          <div class="account-card__header">
            <h2 style="font-size: 1.25rem;">${escapeHtml(t("account.ordersHeading", lang))}</h2>
            <a href="${appUrl("/pages/order-tracking.html")}" class="btn btn--ghost btn--sm">
              ${escapeHtml(t("footer.trackOrder", lang))}
            </a>
          </div>
          ${ordersHtml}
        </article>
      </div>

      <div class="account-side-stack">
        <article class="account-card account-card--ivory">
          <div class="account-card__header">
            <h3 style="font-size: 1.125rem;">${escapeHtml(t("account.addressesHeading", lang))}</h3>
            <button type="button" id="account-add-address-btn" class="btn btn--secondary btn--sm" ${governoratesList.length === 0 ? "disabled" : ""}>
              ${escapeHtml(t("account.addAddressBtn", lang))}
            </button>
          </div>
          ${governoratesNotice}
          ${addressesHtml}
        </article>
      </div>
    </div>
  `;

  bindAccountEvents();
}

function bindAccountEvents() {
  const profileForm = document.getElementById("account-profile-form");
  const emailInput = document.getElementById("account-email-input");
  const currentPasswordField = document.getElementById("account-current-password-field");
  const currentPasswordInput = document.getElementById("account-current-password");
  const updatePasswordVisibility = () => {
    const emailChanged =
      emailInput?.value.trim().toLowerCase() !== activeUser?.email?.toLowerCase();
    if (currentPasswordField) currentPasswordField.hidden = !emailChanged;
    if (currentPasswordInput) currentPasswordInput.required = Boolean(emailChanged);
  };
  emailInput?.addEventListener("input", updatePasswordVisibility);
  updatePasswordVisibility();

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = document.getElementById("account-name-input");
    const emailField = document.getElementById("account-email-input");
    const phoneInput = document.getElementById("account-phone-input");
    const nameError = document.getElementById("err-account-name");
    const emailError = document.getElementById("err-account-email");
    const phoneError = document.getElementById("err-account-phone");
    const passwordError = document.getElementById("err-account-current-password");
    const saveBtn = document.getElementById("account-profile-save-btn");
    const fullName = nameInput?.value.trim() || "";
    const email = emailField?.value.trim().toLowerCase() || "";
    const phone = phoneInput?.value.trim() || "";
    const currentPassword = currentPasswordInput?.value || "";
    const emailChanged = email !== activeUser?.email?.toLowerCase();

    [nameError, emailError, phoneError, passwordError].forEach((el) => {
      if (el) el.textContent = "";
    });
    if (fullName.length < 2) {
      if (nameError) nameError.textContent = t("account.errFullName", getLanguage());
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (emailError) emailError.textContent = t("account.errEmail", getLanguage());
      return;
    }
    if (!phone) {
      if (phoneError) phoneError.textContent = t("account.errPhoneRequired", getLanguage());
      return;
    }
    if (!isValidEgyptianPhone(phone)) {
      if (phoneError) phoneError.textContent = t("account.errPhone", getLanguage());
      return;
    }
    if (emailChanged && !currentPassword) {
      if (passwordError) {
        passwordError.textContent = t("account.errCurrentPassword", getLanguage());
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = t("account.savingProfileBtn", getLanguage());
    }
    try {
      activeUser = await updateCurrentUser({
        fullName,
        email,
        phone,
        ...(emailChanged ? { currentPassword } : {}),
      });
      showToast(
        t(emailChanged ? "account.emailProfileSaved" : "account.profileSaved", getLanguage()),
        "success"
      );
      renderAccountView();
    } catch (err) {
      if (err?.status === 401) {
        redirectToAuth(appUrl("/pages/account.html"));
        return;
      }
      if (emailError && err?.code === "EMAIL_ALREADY_EXISTS") {
        emailError.textContent = t("account.errDuplicateEmail", getLanguage());
      } else if (phoneError && err?.code === "PHONE_ALREADY_EXISTS") {
        phoneError.textContent = t("account.errDuplicatePhone", getLanguage());
      } else if (passwordError && err?.code === "CURRENT_PASSWORD_INVALID") {
        passwordError.textContent = t("account.errCurrentPasswordInvalid", getLanguage());
      } else {
        showToast(t("account.profileUpdateFailed", getLanguage()), "error");
      }
    } finally {
      if (saveBtn && document.body.contains(saveBtn)) {
        saveBtn.disabled = false;
        saveBtn.textContent = t("account.saveProfileBtn", getLanguage());
      }
    }
  });

  const signOutBtn = document.getElementById("account-signout-btn");
  signOutBtn?.addEventListener("click", async () => {
    const currentLang = getLanguage();
    signOutBtn.disabled = true;
    signOutBtn.textContent = t("account.signingOut", currentLang);
    try {
      await logoutUser();
      showToast(t("account.signedOutSuccess", getLanguage()), "info");
      window.location.replace(appUrl("/pages/auth.html"));
    } catch {
      signOutBtn.disabled = false;
      signOutBtn.textContent = t("account.signOut", getLanguage());
      showToast(t("auth.genericError", getLanguage()), "error");
    }
  });

  const addressById = new Map(addressesList.map((a) => [a.id, a]));
  const ordersById = new Map((ordersData?.orders || []).map((o) => [o.id, o]));

  document.getElementById("account-retry-addresses")?.addEventListener("click", async (event) => {
    const retryButton = event.currentTarget;
    retryButton.disabled = true;
    try {
      await refreshAddresses();
      renderAccountView();
    } finally {
      if (document.body.contains(retryButton)) retryButton.disabled = false;
    }
  });

  document.getElementById("account-add-address-btn")?.addEventListener("click", () => {
    openAddressFormModal({
      governorates: governoratesList,
      defaultFullName: activeUser?.fullName || "",
      defaultPhone: activeUser?.phone || "",
      onSaved: async () => {
        await refreshAddresses();
        renderAccountView();
      },
    });
  });

  document.querySelectorAll("[data-acct-addr-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addr = addressById.get(btn.getAttribute("data-acct-addr-edit"));
      if (!addr) return;
      openAddressFormModal({
        address: addr,
        governorates: governoratesList,
        onSaved: async () => {
          await refreshAddresses();
          renderAccountView();
        },
      });
    });
  });

  document.querySelectorAll("[data-acct-addr-default]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-acct-addr-default");
      if (!id) return;
      btn.disabled = true;
      try {
        await updateAddress(id, { isDefault: true });
        await refreshAddresses();
        showToast(t("address.updatedSuccess", getLanguage()), "success");
        renderAccountView();
      } catch (err) {
        if (err && err.status === 401) {
          redirectToAuth(appUrl("/pages/account.html"));
          return;
        }
        showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-acct-addr-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-acct-addr-delete");
      if (!id) return;
      const lang = getLanguage();
      openConfirmDialog({
        title: t("address.deleteConfirmTitle", lang),
        message: t("address.deleteConfirmMessage", lang),
        confirmLabel: t("address.deleteBtn", lang),
        cancelLabel: t("ui.cancel", lang),
        onConfirm: async () => {
          try {
            await deleteAddress(id);
            await refreshAddresses();
            showToast(t("address.deletedSuccess", getLanguage()), "info");
            renderAccountView();
          } catch (err) {
            if (err && err.status === 401) {
              redirectToAuth(appUrl("/pages/account.html"));
              return;
            }
            showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
          }
        },
      });
    });
  });

  document.querySelectorAll("[data-acct-order-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-acct-order-view");
      if (!id || busyOrderIds.has(id)) return;
      busyOrderIds.add(id);
      renderAccountView();
      try {
        const order = await fetchOrderById(id);
        const lang = getLanguage();
        openModal({
          title: `${t("orders.orderNumberLabel", lang)}: ${order.orderNumber}`,
          content: buildOrderDetailElement(order, lang),
          variant: "wide",
        });
      } catch (err) {
        if (err && err.status === 401) {
          redirectToAuth(appUrl("/pages/account.html"));
          return;
        }
        showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
      } finally {
        busyOrderIds.delete(id);
        renderAccountView();
      }
    });
  });

  document.querySelectorAll("[data-acct-order-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-acct-order-cancel");
      const ord = ordersById.get(id);
      if (!ord || busyOrderIds.has(id)) return;

      const lang = getLanguage();
      openConfirmDialog({
        title: t("account.cancelConfirmTitle", lang),
        message: t("account.cancelConfirmMessage", lang).replace(
          "{orderNumber}",
          ord.orderNumber
        ),
        confirmLabel: t("account.cancelOrderBtn", lang),
        cancelLabel: t("ui.cancel", lang),
        onConfirm: async () => {
          busyOrderIds.add(id);
          renderAccountView();
          try {
            await cancelOrder(id);
            await refreshOrders(currentOrdersPage);
            showToast(
              t("account.cancelSuccess", getLanguage()).replace(
                "{orderNumber}",
                ord.orderNumber
              ),
              "info"
            );
          } catch (err) {
            if (err && err.status === 401) {
              redirectToAuth(appUrl("/pages/account.html"));
              return;
            }
            showToast(err?.message || t("ui.actionFailed", getLanguage()), "error");
          } finally {
            busyOrderIds.delete(id);
            renderAccountView();
          }
        },
      });
    });
  });

  document.getElementById("acct-orders-prev")?.addEventListener("click", async () => {
    if (currentOrdersPage > 1) {
      await refreshOrders(currentOrdersPage - 1);
      renderAccountView();
    }
  });

  document.getElementById("acct-orders-next")?.addEventListener("click", async () => {
    if (currentOrdersPage < (ordersData?.pagination?.totalPages || 1)) {
      await refreshOrders(currentOrdersPage + 1);
      renderAccountView();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const root = document.getElementById("account-root");
  if (root) {
    root.style.paddingBlock = "var(--space-7)";
    renderLoadingState(root, 2);
  }

  activeUser = await requireCustomerAuth();
  if (!activeUser) return;

  try {
    await loadAccountData();
  } catch (err) {
    if (err && err.status === 401) {
      redirectToAuth(appUrl("/pages/account.html"));
      return;
    }
    showToast(t("ui.actionFailed", getLanguage()), "error");
  }

  if (root) root.style.paddingBlock = "";
  renderAccountView();

  window.addEventListener("zain:langchange", renderAccountView);
});
