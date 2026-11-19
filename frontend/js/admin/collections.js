/**
 * MR. ZAIN — Admin Collections Management Module
 * Full CRUD over /api/v1/admin/collections and product-to-collection associations.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import {
  closeModal,
  openConfirmDialog,
  openModal,
  showToast,
} from "../components/ui.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import {
  addProductToCollectionRequest,
  createAdminCollectionRequest,
  deleteAdminCollectionRequest,
  fetchAdminCollectionDetail,
  fetchAdminCollections,
  fetchAdminProducts,
  removeProductFromCollectionRequest,
  updateAdminCollectionRequest,
} from "./admin.js";

const colState = {
  loading: false,
  error: "",
  loadedOnce: false,
  items: [],
  search: "",
  status: "all", // all | active | inactive
};

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function formatTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template
  );
}

function isValidImageUrlInput(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;
  if (trimmed.startsWith("/")) {
    return /^\/[A-Za-z0-9/_\-.~%?&=+#]+$/.test(trimmed) && !trimmed.startsWith("//");
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function bindLivePreview(inputEl, previewWrapEl, lang) {
  if (!inputEl || !previewWrapEl) return;

  const update = () => {
    const val = inputEl.value.trim();
    if (!val) {
      previewWrapEl.innerHTML = `<span>${escapeHtml(t("adminCatalog.noImage", lang))}</span>`;
      return;
    }
    if (!isValidImageUrlInput(val)) {
      previewWrapEl.innerHTML = `<span style="color: var(--color-danger);">${escapeHtml(
        t("adminCatalog.imageBroken", lang)
      )}</span>`;
      return;
    }

    const img = document.createElement("img");
    img.src = val;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      previewWrapEl.innerHTML = `<span style="color: var(--color-danger);">${escapeHtml(
        t("adminCatalog.imageBroken", lang)
      )}</span>`;
    });
    previewWrapEl.innerHTML = "";
    previewWrapEl.appendChild(img);
  };

  inputEl.addEventListener("input", update);
  update();
}

function openCollectionModal({ existing = null, onSaved, onAuthError }) {
  const lang = getLanguage();
  const isEdit = Boolean(existing);

  const formWrap = document.createElement("div");
  formWrap.innerHTML = `
    <form class="admin-form" id="admin-collection-form" novalidate>
      <div class="admin-form-error" id="admin-col-form-error" hidden role="alert"></div>

      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label" for="col-name-en">${escapeHtml(t("adminCatalog.nameEn", lang))} *</label>
          <input id="col-name-en" class="input" type="text" maxlength="150" required value="${escapeHtml(existing?.name_en || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="col-name-ar">${escapeHtml(t("adminCatalog.nameAr", lang))} *</label>
          <input id="col-name-ar" class="input" type="text" maxlength="150" required dir="rtl" value="${escapeHtml(existing?.name_ar || "")}" />
        </div>

        <div class="field admin-form-full">
          <label class="field__label" for="col-slug">${escapeHtml(t("adminCatalog.slug", lang))}</label>
          <input id="col-slug" class="input" type="text" maxlength="220" dir="ltr" placeholder="${escapeHtml(t("adminCatalog.slugPlaceholder", lang))}" value="${escapeHtml(existing?.slug || "")}" />
          <span class="field__hint">${escapeHtml(t("adminCatalog.slugHint", lang))}</span>
        </div>

        <div class="field admin-form-full">
          <label class="field__label" for="col-image-url">${escapeHtml(t("adminCatalog.imageUrl", lang))}</label>
          <input id="col-image-url" class="input" type="text" maxlength="2000" dir="ltr" placeholder="${escapeHtml(t("adminCatalog.imageUrlPlaceholder", lang))}" value="${escapeHtml(existing?.imageUrl || "")}" />
          <span class="field__hint">${escapeHtml(t("adminCatalog.imageUrlHint", lang))}</span>
        </div>

        <div class="admin-preview-box admin-form-full">
          <div class="admin-preview-box__frame" id="col-image-preview"></div>
          <div class="admin-preview-box__meta">
            <strong>${escapeHtml(t("adminCatalog.previewLabel", lang))}</strong>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="col-desc-en">${escapeHtml(t("adminCatalog.descriptionEn", lang))}</label>
          <textarea id="col-desc-en" class="input admin-textarea" maxlength="2000">${escapeHtml(existing?.description_en || "")}</textarea>
        </div>

        <div class="field">
          <label class="field__label" for="col-desc-ar">${escapeHtml(t("adminCatalog.descriptionAr", lang))}</label>
          <textarea id="col-desc-ar" class="input admin-textarea" maxlength="2000" dir="rtl">${escapeHtml(existing?.description_ar || "")}</textarea>
        </div>

        <div class="admin-checkbox-grid admin-form-full">
          <label class="admin-checkbox">
            <input id="col-active" type="checkbox" ${existing ? (existing.isActive ? "checked" : "") : "checked"} />
            <span>${escapeHtml(t("adminCatalog.isPublished", lang))}</span>
          </label>
        </div>
      </div>

      <div class="modal-footer" style="margin-top: 0;">
        <button type="button" class="btn btn--secondary" id="col-cancel-btn">${escapeHtml(t("adminCatalog.cancel", lang))}</button>
        <button type="submit" class="btn btn--primary" id="col-submit-btn">
          ${escapeHtml(isEdit ? t("adminCatalog.save", lang) : t("adminCatalog.create", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? t("adminCatalog.collections.editModalTitle", lang)
      : t("adminCatalog.collections.createModalTitle", lang),
    content: formWrap,
    variant: "wide",
  });

  const form = document.getElementById("admin-collection-form");
  const errBox = document.getElementById("admin-col-form-error");
  const submitBtn = document.getElementById("col-submit-btn");
  const imgInput = document.getElementById("col-image-url");
  const imgPreview = document.getElementById("col-image-preview");

  bindLivePreview(imgInput, imgPreview, lang);

  document.getElementById("col-cancel-btn")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    errBox.hidden = true;

    const nameEn = document.getElementById("col-name-en").value.trim();
    const nameAr = document.getElementById("col-name-ar").value.trim();
    const slug = document.getElementById("col-slug").value.trim().toLowerCase();
    const imageUrl = imgInput.value.trim();
    const descriptionEn = document.getElementById("col-desc-en").value.trim();
    const descriptionAr = document.getElementById("col-desc-ar").value.trim();
    const isActive = document.getElementById("col-active").checked;

    if (nameEn.length < 2) {
      errBox.textContent = t("adminCatalog.collections.errNameEn", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameAr.length < 2) {
      errBox.textContent = t("adminCatalog.collections.errNameAr", curLang);
      errBox.hidden = false;
      return;
    }
    if (imageUrl && !isValidImageUrlInput(imageUrl)) {
      errBox.textContent = t("adminCatalog.collections.errImageUrl", curLang);
      errBox.hidden = false;
      return;
    }

    const payload = {
      nameEn,
      nameAr,
      ...(slug ? { slug } : {}),
      imageUrl: imageUrl || null,
      descriptionEn: descriptionEn || null,
      descriptionAr: descriptionAr || null,
      isActive,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      if (isEdit) {
        await updateAdminCollectionRequest(existing.id, payload);
        showToast(t("adminCatalog.collections.updatedToast", curLang), "success");
      } else {
        await createAdminCollectionRequest(payload);
        showToast(t("adminCatalog.collections.createdToast", curLang), "success");
      }
      closeModal();
      await onSaved();
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        closeModal();
        await onAuthError(err);
        return;
      }
      errBox.textContent = err?.message || t("adminCatalog.errorTitle", curLang);
      errBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit
        ? t("adminCatalog.save", curLang)
        : t("adminCatalog.create", curLang);
    }
  });
}

async function openManageCollectionProductsModal(collectionSummary, { onSaved, onAuthError }) {
  const lang = getLanguage();
  const titleName =
    lang === "ar"
      ? collectionSummary.name_ar || collectionSummary.name_en
      : collectionSummary.name_en || collectionSummary.name_ar;

  const container = document.createElement("div");
  container.innerHTML = `<div class="admin-skeleton" style="width: 100%; height: 140px;"></div>`;

  openModal({
    title: formatTemplate(t("adminCatalog.collections.manageProductsTitle", lang), {
      name: titleName,
    }),
    content: container,
    variant: "wide",
  });

  let detail = null;
  let allProducts = [];

  const loadBoth = async () => {
    const [colDetail, prodListRes] = await Promise.all([
      fetchAdminCollectionDetail(collectionSummary.id),
      fetchAdminProducts({ limit: 50, page: 1, sort: "name_asc" }),
    ]);
    detail = colDetail;
    allProducts = Array.isArray(prodListRes?.items) ? prodListRes.items : [];
  };

  const renderModalBody = () => {
    const curLang = getLanguage();
    const assignedIds = new Set((detail?.products || []).map((p) => p.id));
    const availableProducts = allProducts.filter((p) => !assignedIds.has(p.id));

    container.innerHTML = `
      <div class="admin-form-error" id="col-products-error" hidden role="alert"></div>

      <form class="admin-collection-assign-form" id="col-add-product-form">
        <div class="field">
          <label class="field__label" for="col-product-select">${escapeHtml(
            t("adminCatalog.collections.addProductLabel", curLang)
          )}</label>
          <select id="col-product-select" class="input" ${availableProducts.length === 0 ? "disabled" : ""}>
            <option value="">${escapeHtml(
              availableProducts.length === 0
                ? t("adminCatalog.collections.noAvailableProducts", curLang)
                : t("adminCatalog.collections.selectProductPlaceholder", curLang)
            )}</option>
            ${availableProducts
              .map((p) => {
                const pTitle = curLang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar;
                return `<option value="${escapeHtml(p.id)}">${escapeHtml(pTitle)} (${escapeHtml(
                  formatPriceEGP(p.basePrice, curLang)
                )})</option>`;
              })
              .join("")}
          </select>
        </div>
        <button type="submit" class="btn btn--primary btn--sm" id="col-add-product-btn" ${
          availableProducts.length === 0 ? "disabled" : ""
        }>
          ${escapeHtml(t("adminCatalog.collections.addProductBtn", curLang))}
        </button>
      </form>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h4 style="font-size: var(--text-sm); font-weight: 600;">${escapeHtml(
          t("adminCatalog.collections.assignedHeading", curLang)
        )} (${escapeHtml(formatCount(detail?.products?.length || 0))})</h4>

        ${
          !detail?.products?.length
            ? `<p class="text-muted" style="font-size: var(--text-sm);">${escapeHtml(
                t("adminCatalog.collections.noAssignedProducts", curLang)
              )}</p>`
            : `
          <div class="admin-collection-product-list">
            ${detail.products
              .map((p) => {
                const pTitle = curLang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar;
                return `
                  <div class="admin-collection-product-row">
                    <div class="admin-table-item">
                      <span class="admin-thumb admin-thumb--square">
                        ${
                          p.imageUrl
                            ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(pTitle)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
                            : `<span style="font-size: 10px;">—</span>`
                        }
                      </span>
                      <div class="admin-table-item__meta">
                        <span class="admin-table-item__title">${escapeHtml(pTitle)}</span>
                        <span class="admin-table-item__sub tabular-nums">
                          ${escapeHtml(formatPriceEGP(p.basePrice, curLang))} · ${escapeHtml(
                  p.isPublished
                    ? t("adminCatalog.published", curLang)
                    : t("adminCatalog.draft", curLang)
                )}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      data-col-remove-prod="${escapeHtml(p.id)}"
                      style="color: var(--color-danger);"
                    >
                      ${escapeHtml(t("adminCatalog.collections.removeProductBtn", curLang))}
                    </button>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
        }
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn--secondary" id="col-products-close">${escapeHtml(
          t("adminCatalog.close", curLang)
        )}</button>
      </div>
    `;

    document.getElementById("col-products-close")?.addEventListener("click", closeModal);

    document.getElementById("col-add-product-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const selectEl = document.getElementById("col-product-select");
      const errEl = document.getElementById("col-products-error");
      const addBtn = document.getElementById("col-add-product-btn");
      const productId = selectEl?.value;
      if (!productId) return;

      errEl.hidden = true;
      addBtn.disabled = true;

      try {
        detail = await addProductToCollectionRequest(collectionSummary.id, productId);
        showToast(t("adminCatalog.collections.productAddedToast", getLanguage()), "success");
        renderModalBody();
        await onSaved();
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          closeModal();
          await onAuthError(err);
          return;
        }
        errEl.textContent = err?.message || t("adminCatalog.errorTitle", getLanguage());
        errEl.hidden = false;
        addBtn.disabled = false;
      }
    });

    container.querySelectorAll("[data-col-remove-prod]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const productId = btn.getAttribute("data-col-remove-prod");
        if (!productId) return;
        btn.disabled = true;
        try {
          detail = await removeProductFromCollectionRequest(collectionSummary.id, productId);
          showToast(t("adminCatalog.collections.productRemovedToast", getLanguage()), "success");
          renderModalBody();
          await onSaved();
        } catch (err) {
          if (err && (err.status === 401 || err.status === 403)) {
            closeModal();
            await onAuthError(err);
            return;
          }
          const errEl = document.getElementById("col-products-error");
          if (errEl) {
            errEl.textContent = err?.message || t("adminCatalog.errorTitle", getLanguage());
            errEl.hidden = false;
          }
          btn.disabled = false;
        }
      });
    });
  };

  try {
    await loadBoth();
    renderModalBody();
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      closeModal();
      await onAuthError(err);
      return;
    }
    container.innerHTML = `<div class="admin-form-error" role="alert">${escapeHtml(
      err?.message || t("adminCatalog.errorTitle", getLanguage())
    )}</div>`;
  }
}

export async function loadAdminCollections({ onAuthError, onRender } = {}) {
  colState.loading = true;
  colState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    colState.items = await fetchAdminCollections({
      search: colState.search,
      status: colState.status,
    });
    colState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    colState.error = err?.message || t("adminCatalog.errorTitle", getLanguage());
  } finally {
    colState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

export function resetCollectionsLoadState() {
  colState.loadedOnce = false;
}

export function renderCollectionsSection(mainEl, { onAuthError, onRender }) {
  if (!mainEl) return;
  const lang = getLanguage();

  if (!colState.loadedOnce && !colState.loading && !colState.error) {
    void loadAdminCollections({ onAuthError, onRender });
  }

  const refreshAndRender = async () => {
    await loadAdminCollections({ onAuthError, onRender });
  };

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminCatalog.collections.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminCatalog.collections.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminCatalog.collections.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="admin-col-refresh" ${colState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminCatalog.refresh", lang))}
        </button>
        <button type="button" class="btn btn--primary btn--sm" id="admin-col-create">
          + ${escapeHtml(t("adminCatalog.collections.addBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-panel">
      <form class="admin-toolbar" id="admin-col-filter-form">
        <div class="admin-toolbar__filters">
          <input
            type="search"
            id="admin-col-search"
            class="input admin-toolbar__search"
            placeholder="${escapeHtml(t("adminCatalog.collections.searchPlaceholder", lang))}"
            value="${escapeHtml(colState.search)}"
          />
          <select id="admin-col-status" class="input admin-toolbar__select" aria-label="${escapeHtml(t("adminCatalog.status", lang))}">
            <option value="all" ${colState.status === "all" ? "selected" : ""}>${escapeHtml(t("adminCatalog.collections.statusAll", lang))}</option>
            <option value="active" ${colState.status === "active" ? "selected" : ""}>${escapeHtml(t("adminCatalog.collections.statusActive", lang))}</option>
            <option value="inactive" ${colState.status === "inactive" ? "selected" : ""}>${escapeHtml(t("adminCatalog.collections.statusInactive", lang))}</option>
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">${escapeHtml(t("adminCatalog.search", lang))}</button>
        </div>
      </form>

      ${
        colState.loading
          ? `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;" aria-busy="true">
          <div class="admin-skeleton" style="width: 100%; height: 48px;"></div>
          <div class="admin-skeleton" style="width: 100%; height: 48px;"></div>
        </div>
      `
          : colState.error
          ? `
        <div class="admin-state-box admin-state-box--inline" role="alert">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.errorTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(colState.error)}</p>
          <div class="admin-state-actions">
            <button type="button" class="btn btn--primary btn--sm" id="admin-col-retry">${escapeHtml(t("adminCatalog.retry", lang))}</button>
          </div>
        </div>
      `
          : colState.items.length === 0
          ? `
        <div class="admin-state-box admin-state-box--inline">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.collections.emptyTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.collections.emptyDesc", lang))}</p>
          <div class="admin-state-actions">
            <button type="button" class="btn btn--primary btn--sm" id="admin-col-empty-add">
              + ${escapeHtml(t("adminCatalog.collections.addBtn", lang))}
            </button>
          </div>
        </div>
      `
          : `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("adminCatalog.collections.colCollection", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.collections.colSlug", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.collections.colProducts", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.collections.colStatus", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.collections.colActions", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${colState.items
                .map((col) => {
                  const primaryName = lang === "ar" ? col.name_ar || col.name_en : col.name_en || col.name_ar;
                  const secondaryName = lang === "ar" ? col.name_en : col.name_ar;
                  return `
                <tr>
                  <td>
                    <div class="admin-table-item">
                      <span class="admin-thumb admin-thumb--square">
                        ${
                          col.imageUrl
                            ? `<img src="${escapeHtml(col.imageUrl)}" alt="${escapeHtml(primaryName)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
                            : `<span style="font-size: 10px;">—</span>`
                        }
                      </span>
                      <div class="admin-table-item__meta">
                        <span class="admin-table-item__title">${escapeHtml(primaryName)}</span>
                        <span class="admin-table-item__sub">${escapeHtml(secondaryName || "")}</span>
                      </div>
                    </div>
                  </td>
                  <td dir="ltr" class="text-muted">${escapeHtml(col.slug)}</td>
                  <td class="admin-table__num tabular-nums">
                    ${escapeHtml(formatTemplate(t("adminCatalog.productsCount", lang), { count: formatCount(col.productCount) }))}
                  </td>
                  <td>
                    <span class="admin-status-text ${col.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                      ${escapeHtml(col.isActive ? t("adminCatalog.published", lang) : t("adminCatalog.draft", lang))}
                    </span>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button type="button" class="btn btn--secondary btn--sm" data-col-manage="${escapeHtml(col.id)}">
                        ${escapeHtml(
                          formatTemplate(t("adminCatalog.collections.manageProductsBtn", lang), {
                            count: formatCount(col.productCount),
                          })
                        )}
                      </button>
                      <button type="button" class="btn btn--secondary btn--sm" data-col-edit="${escapeHtml(col.id)}">
                        ${escapeHtml(t("adminCatalog.edit", lang))}
                      </button>
                      <button type="button" class="btn btn--ghost btn--sm" data-col-delete="${escapeHtml(col.id)}" style="color: var(--color-danger);">
                        ${escapeHtml(t("adminCatalog.delete", lang))}
                      </button>
                    </div>
                  </td>
                </tr>
              `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `
      }
    </section>
  `;

  document.getElementById("admin-col-refresh")?.addEventListener("click", refreshAndRender);
  document.getElementById("admin-col-retry")?.addEventListener("click", refreshAndRender);

  const triggerCreate = () =>
    openCollectionModal({
      existing: null,
      onSaved: refreshAndRender,
      onAuthError,
    });

  document.getElementById("admin-col-create")?.addEventListener("click", triggerCreate);
  document.getElementById("admin-col-empty-add")?.addEventListener("click", triggerCreate);

  document.getElementById("admin-col-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    colState.search = document.getElementById("admin-col-search")?.value.trim() || "";
    colState.status = document.getElementById("admin-col-status")?.value || "all";
    void refreshAndRender();
  });

  document.getElementById("admin-col-status")?.addEventListener("change", (e) => {
    colState.status = e.target.value || "all";
    colState.search = document.getElementById("admin-col-search")?.value.trim() || "";
    void refreshAndRender();
  });

  mainEl.querySelectorAll("[data-col-manage]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-col-manage");
      const target = colState.items.find((c) => c.id === id);
      if (!target) return;
      void openManageCollectionProductsModal(target, {
        onSaved: refreshAndRender,
        onAuthError,
      });
    });
  });

  mainEl.querySelectorAll("[data-col-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-col-edit");
      const target = colState.items.find((c) => c.id === id);
      if (!target) return;
      openCollectionModal({
        existing: target,
        onSaved: refreshAndRender,
        onAuthError,
      });
    });
  });

  mainEl.querySelectorAll("[data-col-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-col-delete");
      const target = colState.items.find((c) => c.id === id);
      if (!target) return;
      const curLang = getLanguage();
      const label = curLang === "ar" ? target.name_ar || target.name_en : target.name_en || target.name_ar;

      openConfirmDialog({
        title: t("adminCatalog.confirmDeleteTitle", curLang),
        message: formatTemplate(t("adminCatalog.collections.deleteConfirmMsg", curLang), {
          name: label,
        }),
        confirmLabel: t("adminCatalog.delete", curLang),
        cancelLabel: t("adminCatalog.cancel", curLang),
        onConfirm: async () => {
          try {
            await deleteAdminCollectionRequest(target.id);
            showToast(t("adminCatalog.collections.deletedToast", getLanguage()), "success");
            await refreshAndRender();
          } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
              await onAuthError(err);
              return;
            }
            showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error", 5000);
          }
        },
      });
    });
  });
}
