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
import { logoutUser, redirectToAuth, requireCustomerAuth } from "../services/auth-service.js";
import { cancelOrder, fetchOrderById, fetchOrders } from "../services/order-service.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";

let activeUser = null;
let addressesList = [];
let governoratesList = [];
let ordersData = { orders: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } };
let currentOrdersPage = 1;
const busyOrderIds = new Set();

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
  const [addrs, govs] = await Promise.all([
    fetchAddresses(),
    governoratesList.length > 0 ? Promise.resolve(governoratesList) : fetchGovernorates(),
  ]);
  addressesList = addrs;
  governoratesList = govs;
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

  const addressesHtml =
    addressesList.length === 0
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
                    <button type="button" class="btn btn--ghost btn--sm" data-acct-addr-edit="${escapeHtml(addr.id)}">${escapeHtml(t("address.editBtn", lang))}</button>
                    <button type="button" class="btn btn--ghost btn--sm checkout-addr-delete" data-acct-addr-delete="${escapeHtml(addr.id)}">${escapeHtml(t("address.deleteBtn", lang))}</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;

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

          <div style="padding-top: 0.5rem;">
            <a href="/shop.html" class="btn btn--primary">${escapeHtml(t("account.browseShop", lang))}</a>
          </div>
        </article>

        <article class="account-card">
          <div class="account-card__header">
            <h2 style="font-size: 1.25rem;">${escapeHtml(t("account.ordersHeading", lang))}</h2>
            <a href="/pages/order-tracking.html" class="btn btn--ghost btn--sm">
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
            <button type="button" id="account-add-address-btn" class="btn btn--secondary btn--sm">
              ${escapeHtml(t("account.addAddressBtn", lang))}
            </button>
          </div>
          ${addressesHtml}
        </article>
      </div>
    </div>
  `;

  bindAccountEvents();
}

function bindAccountEvents() {
  const signOutBtn = document.getElementById("account-signout-btn");
  signOutBtn?.addEventListener("click", async () => {
    const currentLang = getLanguage();
    signOutBtn.disabled = true;
    signOutBtn.textContent = t("account.signingOut", currentLang);
    try {
      await logoutUser();
      showToast(t("account.signedOutSuccess", getLanguage()), "info");
      window.location.replace("/pages/auth.html");
    } catch {
      signOutBtn.disabled = false;
      signOutBtn.textContent = t("account.signOut", getLanguage());
      showToast(t("auth.genericError", getLanguage()), "error");
    }
  });

  const addressById = new Map(addressesList.map((a) => [a.id, a]));
  const ordersById = new Map((ordersData?.orders || []).map((o) => [o.id, o]));

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
          redirectToAuth("/pages/account.html");
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
              redirectToAuth("/pages/account.html");
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
          redirectToAuth("/pages/account.html");
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
              redirectToAuth("/pages/account.html");
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
      redirectToAuth("/pages/account.html");
      return;
    }
    showToast(t("ui.actionFailed", getLanguage()), "error");
  }

  if (root) root.style.paddingBlock = "";
  renderAccountView();

  window.addEventListener("zain:langchange", renderAccountView);
});
