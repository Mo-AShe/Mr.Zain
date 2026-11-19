/**
 * MR. ZAIN — Admin Products, Variants & Image Gallery Controller
 * Backed by /api/v1/admin/products, /variants, /images, and /categories.
 * Zero inventory quantity adjustments (initialized at 0; Stage 7.4 handles stock).
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
  addAdminProductImageRequest,
  createAdminProductRequest,
  createAdminVariantRequest,
  deleteAdminProductImageRequest,
  deleteAdminProductRequest,
  deleteAdminVariantRequest,
  fetchAdminCategories,
  fetchAdminProductDetail,
  fetchAdminProducts,
  reorderAdminProductImagesRequest,
  updateAdminProductImageRequest,
  updateAdminProductRequest,
  updateAdminVariantRequest,
} from "./admin.js";

const SKU_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;

const prodState = {
  loading: false,
  error: "",
  loadedOnce: false,
  items: [],
  categories: [],
  pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
  filters: {
    search: "",
    categoryId: "",
    published: "all",
    sort: "newest",
  },
  selectedProductId: null,
  detailLoading: false,
  detailError: "",
  detail: null,
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
  if (!trimmed || /\s/.test(trimmed)) return false;
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

function bindLivePreview(inputEl, previewWrapEl, lang, required = true) {
  if (!inputEl || !previewWrapEl) return;

  const update = () => {
    const val = inputEl.value.trim();
    if (!val) {
      previewWrapEl.innerHTML = `<span>${escapeHtml(
        required ? t("adminCatalog.noImage", lang) : t("adminCatalog.noImage", lang)
      )}</span>`;
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

export async function loadAdminProductsList({ onAuthError, onRender } = {}) {
  prodState.loading = true;
  prodState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    const [listRes, cats] = await Promise.all([
      fetchAdminProducts({
        search: prodState.filters.search,
        categoryId: prodState.filters.categoryId,
        published: prodState.filters.published,
        sort: prodState.filters.sort,
        page: prodState.pagination.page,
        limit: prodState.pagination.limit,
      }),
      fetchAdminCategories({ status: "all" }),
    ]);

    prodState.items = Array.isArray(listRes?.items) ? listRes.items : [];
    prodState.pagination = listRes?.pagination || {
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 1,
    };
    prodState.categories = Array.isArray(cats) ? cats : [];
    prodState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    prodState.error = err?.message || t("adminCatalog.errorTitle", getLanguage());
  } finally {
    prodState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

export async function loadAdminProductDetail(productId, { onAuthError, onRender } = {}) {
  prodState.selectedProductId = productId;
  prodState.detailLoading = true;
  prodState.detailError = "";
  if (typeof onRender === "function") onRender();

  try {
    const [detail, cats] = await Promise.all([
      fetchAdminProductDetail(productId),
      prodState.categories.length > 0
        ? Promise.resolve(prodState.categories)
        : fetchAdminCategories({ status: "all" }),
    ]);
    prodState.detail = detail;
    prodState.categories = Array.isArray(cats) ? cats : [];
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    prodState.detailError = err?.message || t("adminCatalog.errorTitle", getLanguage());
  } finally {
    prodState.detailLoading = false;
    if (typeof onRender === "function") onRender();
  }
}

function buildCategoryOptionsHtml(categoriesList, selectedId, lang) {
  return categoriesList
    .map((c) => {
      const label = lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar;
      const inactiveNote = c.isActive ? "" : ` (${t("adminCatalog.inactive", lang)})`;
      return `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(
        `${label}${inactiveNote}`
      )}</option>`;
    })
    .join("");
}

function openCreateProductModal({ onCreated, onAuthError }) {
  const lang = getLanguage();
  const formWrap = document.createElement("div");

  formWrap.innerHTML = `
    <form class="admin-form" id="admin-create-product-form" novalidate>
      <div class="admin-form-error" id="admin-prod-create-err" hidden role="alert"></div>

      <div class="admin-form-grid">
        <div class="field admin-form-full">
          <label class="field__label" for="cp-category">${escapeHtml(t("adminCatalog.products.categoryLabel", lang))} *</label>
          <select id="cp-category" class="input" required>
            <option value="">${escapeHtml(t("adminCatalog.products.selectCategory", lang))}</option>
            ${buildCategoryOptionsHtml(prodState.categories, "", lang)}
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="cp-name-en">${escapeHtml(t("adminCatalog.nameEn", lang))} *</label>
          <input id="cp-name-en" class="input" type="text" maxlength="200" required />
        </div>

        <div class="field">
          <label class="field__label" for="cp-name-ar">${escapeHtml(t("adminCatalog.nameAr", lang))} *</label>
          <input id="cp-name-ar" class="input" type="text" maxlength="200" dir="rtl" required />
        </div>

        <div class="field admin-form-full">
          <label class="field__label" for="cp-slug">${escapeHtml(t("adminCatalog.slug", lang))}</label>
          <input id="cp-slug" class="input" type="text" maxlength="220" dir="ltr" placeholder="${escapeHtml(t("adminCatalog.slugPlaceholder", lang))}" />
          <span class="field__hint">${escapeHtml(t("adminCatalog.slugHint", lang))}</span>
        </div>

        <div class="field">
          <label class="field__label" for="cp-base-price">${escapeHtml(t("adminCatalog.products.basePrice", lang))} *</label>
          <input id="cp-base-price" class="input" type="number" min="0" step="0.01" required />
        </div>

        <div class="field">
          <label class="field__label" for="cp-compare-price">${escapeHtml(t("adminCatalog.products.compareAtPrice", lang))}</label>
          <input id="cp-compare-price" class="input" type="number" min="0" step="0.01" placeholder="${escapeHtml(t("adminCatalog.products.compareAtPricePlaceholder", lang))}" />
        </div>

        <div class="field">
          <label class="field__label" for="cp-desc-en">${escapeHtml(t("adminCatalog.descriptionEn", lang))}</label>
          <textarea id="cp-desc-en" class="input admin-textarea" maxlength="5000"></textarea>
        </div>

        <div class="field">
          <label class="field__label" for="cp-desc-ar">${escapeHtml(t("adminCatalog.descriptionAr", lang))}</label>
          <textarea id="cp-desc-ar" class="input admin-textarea" maxlength="5000" dir="rtl"></textarea>
        </div>

        <div class="admin-checkbox-grid admin-form-full">
          <label class="admin-checkbox">
            <input id="cp-published" type="checkbox" />
            <span>${escapeHtml(t("adminCatalog.products.publishImmediately", lang))}</span>
          </label>
          <label class="admin-checkbox">
            <input id="cp-featured" type="checkbox" />
            <span>${escapeHtml(t("adminCatalog.products.flagFeatured", lang))}</span>
          </label>
          <label class="admin-checkbox">
            <input id="cp-new" type="checkbox" checked />
            <span>${escapeHtml(t("adminCatalog.products.flagNew", lang))}</span>
          </label>
          <label class="admin-checkbox">
            <input id="cp-bestseller" type="checkbox" />
            <span>${escapeHtml(t("adminCatalog.products.flagBestSeller", lang))}</span>
          </label>
        </div>
      </div>

      <div class="modal-footer" style="margin-top: 0;">
        <button type="button" class="btn btn--secondary" id="cp-cancel-btn">${escapeHtml(t("adminCatalog.cancel", lang))}</button>
        <button type="submit" class="btn btn--primary" id="cp-submit-btn">${escapeHtml(t("adminCatalog.create", lang))}</button>
      </div>
    </form>
  `;

  openModal({
    title: t("adminCatalog.products.createModalTitle", lang),
    content: formWrap,
    variant: "wide",
  });

  const form = document.getElementById("admin-create-product-form");
  const errBox = document.getElementById("admin-prod-create-err");
  const submitBtn = document.getElementById("cp-submit-btn");

  document.getElementById("cp-cancel-btn")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    errBox.hidden = true;

    const categoryId = document.getElementById("cp-category").value;
    const nameEn = document.getElementById("cp-name-en").value.trim();
    const nameAr = document.getElementById("cp-name-ar").value.trim();
    const slug = document.getElementById("cp-slug").value.trim().toLowerCase();
    const basePriceRaw = document.getElementById("cp-base-price").value;
    const compareRaw = document.getElementById("cp-compare-price").value;
    const descriptionEn = document.getElementById("cp-desc-en").value.trim();
    const descriptionAr = document.getElementById("cp-desc-ar").value.trim();
    const isPublished = document.getElementById("cp-published").checked;
    const isFeatured = document.getElementById("cp-featured").checked;
    const isNew = document.getElementById("cp-new").checked;
    const isBestSeller = document.getElementById("cp-bestseller").checked;

    const basePrice = Number(basePriceRaw);
    const compareAtPrice = compareRaw.trim() !== "" ? Number(compareRaw) : null;

    if (!categoryId) {
      errBox.textContent = t("adminCatalog.products.errCategory", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameEn.length < 2) {
      errBox.textContent = t("adminCatalog.products.errNameEn", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameAr.length < 2) {
      errBox.textContent = t("adminCatalog.products.errNameAr", curLang);
      errBox.hidden = false;
      return;
    }
    if (basePriceRaw.trim() === "" || !Number.isFinite(basePrice) || basePrice < 0) {
      errBox.textContent = t("adminCatalog.products.errBasePrice", curLang);
      errBox.hidden = false;
      return;
    }
    if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < basePrice)) {
      errBox.textContent = t("adminCatalog.products.errComparePrice", curLang);
      errBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      const created = await createAdminProductRequest({
        categoryId,
        nameEn,
        nameAr,
        ...(slug ? { slug } : {}),
        basePrice,
        compareAtPrice,
        descriptionEn: descriptionEn || null,
        descriptionAr: descriptionAr || null,
        isPublished,
        isFeatured,
        isNew,
        isBestSeller,
      });
      closeModal();
      showToast(t("adminCatalog.products.createdToast", getLanguage()), "success");
      await onCreated(created);
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        closeModal();
        await onAuthError(err);
        return;
      }
      errBox.textContent = err?.message || t("adminCatalog.errorTitle", getLanguage());
      errBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = t("adminCatalog.create", getLanguage());
    }
  });
}

function openVariantModal({ product, existing = null, onSaved, onAuthError }) {
  const lang = getLanguage();
  const isEdit = Boolean(existing);

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <form class="admin-form" id="admin-variant-form" novalidate>
      <div class="admin-form-error" id="admin-var-err" hidden role="alert"></div>

      <div class="admin-notice">${escapeHtml(t("adminCatalog.variants.stockNotice", lang))}</div>

      <div class="admin-form-grid">
        <div class="field admin-form-full">
          <label class="field__label" for="var-sku">${escapeHtml(t("adminCatalog.variants.sku", lang))} *</label>
          <input id="var-sku" class="input" type="text" maxlength="100" dir="ltr" required placeholder="${escapeHtml(t("adminCatalog.variants.skuPlaceholder", lang))}" value="${escapeHtml(existing?.sku || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="var-size">${escapeHtml(t("adminCatalog.variants.size", lang))} *</label>
          <input id="var-size" class="input" type="text" maxlength="40" required placeholder="${escapeHtml(t("adminCatalog.variants.sizePlaceholder", lang))}" value="${escapeHtml(existing?.size || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="var-color">${escapeHtml(t("adminCatalog.variants.color", lang))} *</label>
          <input id="var-color" class="input" type="text" maxlength="60" required placeholder="${escapeHtml(t("adminCatalog.variants.colorPlaceholder", lang))}" value="${escapeHtml(existing?.color || "")}" />
        </div>

        <div class="field admin-form-full">
          <label class="field__label" for="var-price">${escapeHtml(t("adminCatalog.variants.price", lang))}</label>
          <input id="var-price" class="input" type="number" min="0" step="0.01" value="${escapeHtml(String(existing ? existing.price : product.basePrice))}" />
          <span class="field__hint">${escapeHtml(t("adminCatalog.variants.priceHint", lang))}</span>
        </div>

        <div class="admin-checkbox-grid admin-form-full">
          <label class="admin-checkbox">
            <input id="var-active" type="checkbox" ${existing ? (existing.isActive ? "checked" : "") : "checked"} />
            <span>${escapeHtml(t("adminCatalog.variants.activeLabel", lang))}</span>
          </label>
        </div>
      </div>

      <div class="modal-footer" style="margin-top: 0;">
        <button type="button" class="btn btn--secondary" id="var-cancel-btn">${escapeHtml(t("adminCatalog.cancel", lang))}</button>
        <button type="submit" class="btn btn--primary" id="var-submit-btn">
          ${escapeHtml(isEdit ? t("adminCatalog.save", lang) : t("adminCatalog.create", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? t("adminCatalog.variants.editTitle", lang)
      : t("adminCatalog.variants.addTitle", lang),
    content: wrap,
  });

  const form = document.getElementById("admin-variant-form");
  const errBox = document.getElementById("admin-var-err");
  const submitBtn = document.getElementById("var-submit-btn");

  document.getElementById("var-cancel-btn")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    errBox.hidden = true;

    const sku = document.getElementById("var-sku").value.trim().toUpperCase();
    const size = document.getElementById("var-size").value.trim();
    const color = document.getElementById("var-color").value.trim();
    const priceRaw = document.getElementById("var-price").value.trim();
    const isActive = document.getElementById("var-active").checked;

    if (!SKU_REGEX.test(sku)) {
      errBox.textContent = t("adminCatalog.variants.errSku", curLang);
      errBox.hidden = false;
      return;
    }
    if (!size) {
      errBox.textContent = t("adminCatalog.variants.errSize", curLang);
      errBox.hidden = false;
      return;
    }
    if (!color) {
      errBox.textContent = t("adminCatalog.variants.errColor", curLang);
      errBox.hidden = false;
      return;
    }

    let price;
    if (priceRaw !== "") {
      price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) {
        errBox.textContent = t("adminCatalog.variants.errPrice", curLang);
        errBox.hidden = false;
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      const payload = {
        sku,
        size,
        color,
        ...(price !== undefined ? { price } : {}),
        isActive,
      };
      if (isEdit) {
        await updateAdminVariantRequest(product.id, existing.id, payload);
        showToast(t("adminCatalog.variants.updatedToast", curLang), "success");
      } else {
        await createAdminVariantRequest(product.id, payload);
        showToast(t("adminCatalog.variants.createdToast", curLang), "success");
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

function openProductImageModal({ productId, existing = null, onSaved, onAuthError }) {
  const lang = getLanguage();
  const isEdit = Boolean(existing);

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <form class="admin-form" id="admin-prod-image-form" novalidate>
      <div class="admin-form-error" id="admin-img-err" hidden role="alert"></div>

      <div class="admin-notice">${escapeHtml(t("adminCatalog.images.uploadNotice", lang))}</div>

      <div class="field">
        <label class="field__label" for="pimg-url">${escapeHtml(t("adminCatalog.images.urlLabel", lang))} *</label>
        <input id="pimg-url" class="input" type="text" maxlength="2000" dir="ltr" required placeholder="${escapeHtml(t("adminCatalog.images.urlPlaceholder", lang))}" value="${escapeHtml(existing?.imageUrl || "")}" />
      </div>

      <div class="admin-preview-box">
        <div class="admin-preview-box__frame" id="pimg-preview"></div>
        <div class="admin-preview-box__meta">
          <strong>${escapeHtml(t("adminCatalog.previewLabel", lang))}</strong>
        </div>
      </div>

      <div class="field">
        <label class="field__label" for="pimg-alt">${escapeHtml(t("adminCatalog.images.altLabel", lang))}</label>
        <input id="pimg-alt" class="input" type="text" maxlength="255" placeholder="${escapeHtml(t("adminCatalog.images.altPlaceholder", lang))}" value="${escapeHtml(existing?.altText || "")}" />
      </div>

      <div class="admin-checkbox-grid">
        <label class="admin-checkbox">
          <input id="pimg-primary" type="checkbox" ${existing?.isPrimary ? "checked" : ""} />
          <span>${escapeHtml(t("adminCatalog.images.setPrimary", lang))}</span>
        </label>
      </div>

      <div class="modal-footer" style="margin-top: 0;">
        <button type="button" class="btn btn--secondary" id="pimg-cancel-btn">${escapeHtml(t("adminCatalog.cancel", lang))}</button>
        <button type="submit" class="btn btn--primary" id="pimg-submit-btn">
          ${escapeHtml(isEdit ? t("adminCatalog.save", lang) : t("adminCatalog.create", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? t("adminCatalog.images.editModalTitle", lang)
      : t("adminCatalog.images.addBtn", lang),
    content: wrap,
  });

  const form = document.getElementById("admin-prod-image-form");
  const errBox = document.getElementById("admin-img-err");
  const submitBtn = document.getElementById("pimg-submit-btn");
  const urlInput = document.getElementById("pimg-url");
  const previewWrap = document.getElementById("pimg-preview");

  bindLivePreview(urlInput, previewWrap, lang, true);
  document.getElementById("pimg-cancel-btn")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    errBox.hidden = true;

    const imageUrl = urlInput.value.trim();
    const altText = document.getElementById("pimg-alt").value.trim();
    const isPrimary = document.getElementById("pimg-primary").checked;

    if (!isValidImageUrlInput(imageUrl)) {
      errBox.textContent = t("adminCatalog.images.errUrl", curLang);
      errBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      const payload = {
        imageUrl,
        altText: altText || null,
        ...(isEdit ? (isPrimary ? { isPrimary: true } : {}) : { isPrimary }),
      };

      if (isEdit) {
        await updateAdminProductImageRequest(productId, existing.id, payload);
        showToast(t("adminCatalog.images.updatedToast", curLang), "success");
      } else {
        await addAdminProductImageRequest(productId, payload);
        showToast(t("adminCatalog.images.addedToast", curLang), "success");
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

function triggerProductDeleteOrArchive(productSummary, { onDone, onAuthError }) {
  const lang = getLanguage();
  const title =
    lang === "ar"
      ? productSummary.name_ar || productSummary.name_en
      : productSummary.name_en || productSummary.name_ar;

  const hasRefs = Boolean(productSummary.hasOrderReferences);
  openConfirmDialog({
    title: t("adminCatalog.confirmDeleteTitle", lang),
    message: formatTemplate(
      hasRefs
        ? t("adminCatalog.products.archiveConfirmMsg", lang)
        : t("adminCatalog.products.deleteConfirmMsg", lang),
      { name: title }
    ),
    confirmLabel: t("adminCatalog.delete", lang),
    cancelLabel: t("adminCatalog.cancel", lang),
    onConfirm: async () => {
      try {
        const res = await deleteAdminProductRequest(productSummary.id);
        if (res?.action === "archived") {
          showToast(t("adminCatalog.products.archivedToast", getLanguage()), "warning", 5000);
        } else {
          showToast(t("adminCatalog.products.deletedToast", getLanguage()), "success");
        }
        await onDone(res);
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error", 5000);
      }
    },
  });
}

function renderProductDetailEditor(mainEl, { onAuthError, onRender }) {
  const lang = getLanguage();

  if (prodState.detailLoading && !prodState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <button type="button" class="btn btn--secondary btn--sm" id="prod-back-btn">
            &larr; ${escapeHtml(t("adminCatalog.backToList", lang))}
          </button>
        </div>
      </div>
      <div class="admin-panel" aria-busy="true">
        <div class="admin-skeleton" style="width: 240px; height: 24px;"></div>
        <div class="admin-skeleton" style="width: 100%; height: 220px;"></div>
      </div>
    `;
    document.getElementById("prod-back-btn")?.addEventListener("click", () => {
      prodState.selectedProductId = null;
      prodState.detail = null;
      onRender();
    });
    return;
  }

  if (prodState.detailError || !prodState.detail) {
    mainEl.innerHTML = `
      <div class="admin-page-head">
        <div>
          <button type="button" class="btn btn--secondary btn--sm" id="prod-back-btn">
            &larr; ${escapeHtml(t("adminCatalog.backToList", lang))}
          </button>
        </div>
      </div>
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("adminCatalog.errorTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(prodState.detailError || t("adminCatalog.errorTitle", lang))}</p>
        <div class="admin-state-actions">
          <button type="button" class="btn btn--primary btn--sm" id="prod-detail-retry">${escapeHtml(t("adminCatalog.retry", lang))}</button>
        </div>
      </div>
    `;
    document.getElementById("prod-back-btn")?.addEventListener("click", () => {
      prodState.selectedProductId = null;
      prodState.detail = null;
      onRender();
    });
    document.getElementById("prod-detail-retry")?.addEventListener("click", () => {
      void loadAdminProductDetail(prodState.selectedProductId, { onAuthError, onRender });
    });
    return;
  }

  const product = prodState.detail;
  const displayName =
    lang === "ar" ? product.name_ar || product.name_en : product.name_en || product.name_ar;

  const reloadDetailAndList = async () => {
    await Promise.all([
      loadAdminProductDetail(product.id, { onAuthError, onRender }),
      loadAdminProductsList({ onAuthError }),
    ]);
    onRender();
  };

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminCatalog.products.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(displayName)}</h1>
        <p class="admin-page-head__subtitle">
          <span dir="ltr">${escapeHtml(product.slug)}</span> ·
          <span class="admin-status-text ${product.isPublished ? "admin-status-text--success" : "admin-status-text--pending"}">
            ${escapeHtml(product.isPublished ? t("adminCatalog.published", lang) : t("adminCatalog.draft", lang))}
          </span>
        </p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="prod-back-btn">
          ${escapeHtml(t("adminCatalog.backToList", lang))}
        </button>
        <button type="button" class="btn btn--secondary btn--sm" id="prod-toggle-publish">
          ${escapeHtml(
            product.isPublished
              ? t("adminCatalog.products.unpublishBtn", lang)
              : t("adminCatalog.products.publishBtn", lang)
          )}
        </button>
        <button type="button" class="btn btn--danger btn--sm" id="prod-delete-btn">
          ${escapeHtml(t("adminCatalog.products.deleteBtn", lang))}
        </button>
      </div>
    </div>

    ${
      product.hasOrderReferences
        ? `<div class="admin-notice admin-notice--warn">${escapeHtml(t("adminCatalog.products.archiveNotice", lang))}</div>`
        : ""
    }

    <div class="admin-editor-stack">
      <!-- Core Details Panel -->
      <section class="admin-panel">
        <div class="admin-panel__head">
          <h2 class="admin-panel__title">${escapeHtml(t("adminCatalog.products.editSectionTitle", lang))}</h2>
        </div>

        <form class="admin-form" id="admin-edit-product-form" novalidate>
          <div class="admin-form-error" id="ep-form-err" hidden role="alert"></div>

          <div class="admin-form-grid">
            <div class="field">
              <label class="field__label" for="ep-category">${escapeHtml(t("adminCatalog.products.categoryLabel", lang))} *</label>
              <select id="ep-category" class="input" required>
                ${buildCategoryOptionsHtml(prodState.categories, product.category.id, lang)}
              </select>
            </div>

            <div class="field">
              <label class="field__label" for="ep-slug">${escapeHtml(t("adminCatalog.slug", lang))} *</label>
              <input id="ep-slug" class="input" type="text" maxlength="220" dir="ltr" required value="${escapeHtml(product.slug)}" />
            </div>

            <div class="field">
              <label class="field__label" for="ep-name-en">${escapeHtml(t("adminCatalog.nameEn", lang))} *</label>
              <input id="ep-name-en" class="input" type="text" maxlength="200" required value="${escapeHtml(product.name_en)}" />
            </div>

            <div class="field">
              <label class="field__label" for="ep-name-ar">${escapeHtml(t("adminCatalog.nameAr", lang))} *</label>
              <input id="ep-name-ar" class="input" type="text" maxlength="200" dir="rtl" required value="${escapeHtml(product.name_ar)}" />
            </div>

            <div class="field">
              <label class="field__label" for="ep-base-price">${escapeHtml(t("adminCatalog.products.basePrice", lang))} *</label>
              <input id="ep-base-price" class="input" type="number" min="0" step="0.01" required value="${escapeHtml(String(product.basePrice))}" />
            </div>

            <div class="field">
              <label class="field__label" for="ep-compare-price">${escapeHtml(t("adminCatalog.products.compareAtPrice", lang))}</label>
              <input id="ep-compare-price" class="input" type="number" min="0" step="0.01" value="${escapeHtml(product.compareAtPrice !== null ? String(product.compareAtPrice) : "")}" />
            </div>

            <div class="field">
              <label class="field__label" for="ep-desc-en">${escapeHtml(t("adminCatalog.descriptionEn", lang))}</label>
              <textarea id="ep-desc-en" class="input admin-textarea" maxlength="5000">${escapeHtml(product.description_en || "")}</textarea>
            </div>

            <div class="field">
              <label class="field__label" for="ep-desc-ar">${escapeHtml(t("adminCatalog.descriptionAr", lang))}</label>
              <textarea id="ep-desc-ar" class="input admin-textarea" maxlength="5000" dir="rtl">${escapeHtml(product.description_ar || "")}</textarea>
            </div>

            <div class="admin-checkbox-grid admin-form-full">
              <label class="admin-checkbox">
                <input id="ep-published" type="checkbox" ${product.isPublished ? "checked" : ""} />
                <span>${escapeHtml(t("adminCatalog.isPublished", lang))}</span>
              </label>
              <label class="admin-checkbox">
                <input id="ep-featured" type="checkbox" ${product.isFeatured ? "checked" : ""} />
                <span>${escapeHtml(t("adminCatalog.products.flagFeatured", lang))}</span>
              </label>
              <label class="admin-checkbox">
                <input id="ep-new" type="checkbox" ${product.isNew ? "checked" : ""} />
                <span>${escapeHtml(t("adminCatalog.products.flagNew", lang))}</span>
              </label>
              <label class="admin-checkbox">
                <input id="ep-bestseller" type="checkbox" ${product.isBestSeller ? "checked" : ""} />
                <span>${escapeHtml(t("adminCatalog.products.flagBestSeller", lang))}</span>
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn--primary" id="ep-save-btn">
              ${escapeHtml(t("adminCatalog.products.saveChanges", lang))}
            </button>
          </div>
        </form>
      </section>

      <!-- Variants Panel (Zero stock adjustment controls in Stage 7.3) -->
      <section class="admin-panel">
        <div class="admin-panel__head">
          <div>
            <h2 class="admin-panel__title">${escapeHtml(t("adminCatalog.variants.heading", lang))}</h2>
            <p class="admin-panel__subtitle">${escapeHtml(t("adminCatalog.variants.subtitle", lang))}</p>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="var-add-btn">
            + ${escapeHtml(t("adminCatalog.variants.addBtn", lang))}
          </button>
        </div>

        <div class="admin-notice">${escapeHtml(t("adminCatalog.variants.stockNotice", lang))}</div>

        ${
          product.variants.length === 0
            ? `
          <div class="admin-state-box admin-state-box--inline">
            <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.variants.emptyTitle", lang))}</strong>
            <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.variants.emptyDesc", lang))}</p>
          </div>
        `
            : `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t("adminCatalog.variants.colSku", lang))}</th>
                  <th>${escapeHtml(t("adminCatalog.variants.colSize", lang))}</th>
                  <th>${escapeHtml(t("adminCatalog.variants.colColor", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminCatalog.variants.colPrice", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminCatalog.variants.colStock", lang))}</th>
                  <th>${escapeHtml(t("adminCatalog.variants.colStatus", lang))}</th>
                  <th class="admin-table__num">${escapeHtml(t("adminCatalog.variants.colActions", lang))}</th>
                </tr>
              </thead>
              <tbody>
                ${product.variants
                  .map(
                    (v) => `
                  <tr>
                    <td dir="ltr"><strong>${escapeHtml(v.sku)}</strong></td>
                    <td>${escapeHtml(v.size)}</td>
                    <td>${escapeHtml(v.color)}</td>
                    <td class="admin-table__num tabular-nums">${escapeHtml(formatPriceEGP(v.price, lang))}</td>
                    <td class="admin-table__num tabular-nums text-muted">
                      ${escapeHtml(
                        formatTemplate(t("adminCatalog.variants.stockReadonly", lang), {
                          available: formatCount(v.availableStock),
                          qty: formatCount(v.quantity),
                        })
                      )}
                    </td>
                    <td>
                      <span class="admin-status-text ${v.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                        ${escapeHtml(v.isActive ? t("adminCatalog.active", lang) : t("adminCatalog.inactive", lang))}
                      </span>
                    </td>
                    <td>
                      <div class="admin-row-actions">
                        <button type="button" class="btn btn--secondary btn--sm" data-var-edit="${escapeHtml(v.id)}">
                          ${escapeHtml(t("adminCatalog.edit", lang))}
                        </button>
                        <button type="button" class="btn btn--ghost btn--sm" data-var-delete="${escapeHtml(v.id)}" style="color: var(--color-danger);">
                          ${escapeHtml(t("adminCatalog.delete", lang))}
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        }
      </section>

      <!-- Product Images Gallery Panel (URL-based) -->
      <section class="admin-panel">
        <div class="admin-panel__head">
          <div>
            <h2 class="admin-panel__title">${escapeHtml(t("adminCatalog.images.heading", lang))}</h2>
            <p class="admin-panel__subtitle">${escapeHtml(t("adminCatalog.images.subtitle", lang))}</p>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="img-add-btn">
            + ${escapeHtml(t("adminCatalog.images.addBtn", lang))}
          </button>
        </div>

        <div class="admin-notice">${escapeHtml(t("adminCatalog.images.uploadNotice", lang))}</div>

        ${
          product.images.length === 0
            ? `
          <div class="admin-state-box admin-state-box--inline">
            <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.images.emptyTitle", lang))}</strong>
            <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.images.emptyDesc", lang))}</p>
          </div>
        `
            : `
          <div class="admin-gallery-grid">
            ${product.images
              .map(
                (img, idx) => `
              <article class="admin-gallery-card ${img.isPrimary ? "is-primary" : ""}">
                <div class="admin-gallery-card__media">
                  <img
                    src="${escapeHtml(img.imageUrl)}"
                    alt="${escapeHtml(img.altText || displayName)}"
                    referrerpolicy="no-referrer"
                    onerror="this.style.display='none'; this.nextElementSibling.hidden=false;"
                  />
                  <span hidden style="color: var(--color-danger);">${escapeHtml(t("adminCatalog.imageBroken", lang))}</span>
                  ${
                    img.isPrimary
                      ? `<span class="admin-gallery-card__badge">${escapeHtml(t("adminCatalog.images.primaryBadge", lang))}</span>`
                      : ""
                  }
                </div>
                <div class="admin-gallery-card__body">
                  <div class="admin-gallery-card__alt">${escapeHtml(img.altText || displayName)}</div>
                  <div class="admin-gallery-card__url" dir="ltr" title="${escapeHtml(img.imageUrl)}">${escapeHtml(img.imageUrl)}</div>
                  <div class="admin-gallery-card__actions">
                    ${
                      !img.isPrimary
                        ? `<button type="button" class="btn btn--secondary btn--sm" data-img-main="${escapeHtml(img.id)}">${escapeHtml(
                            t("adminCatalog.images.setMainBtn", lang)
                          )}</button>`
                        : ""
                    }
                    ${
                      product.images.length > 1 && idx > 0
                        ? `<button type="button" class="btn btn--ghost btn--sm" data-img-move="${escapeHtml(img.id)}" data-dir="-1" title="${escapeHtml(
                            t("adminCatalog.images.moveUp", lang)
                          )}">&uarr;</button>`
                        : ""
                    }
                    ${
                      product.images.length > 1 && idx < product.images.length - 1
                        ? `<button type="button" class="btn btn--ghost btn--sm" data-img-move="${escapeHtml(img.id)}" data-dir="1" title="${escapeHtml(
                            t("adminCatalog.images.moveDown", lang)
                          )}">&darr;</button>`
                        : ""
                    }
                    <button type="button" class="btn btn--secondary btn--sm" data-img-edit="${escapeHtml(img.id)}">
                      ${escapeHtml(t("adminCatalog.edit", lang))}
                    </button>
                    <button type="button" class="btn btn--ghost btn--sm" data-img-delete="${escapeHtml(img.id)}" style="color: var(--color-danger);">
                      ${escapeHtml(t("adminCatalog.delete", lang))}
                    </button>
                  </div>
                </div>
              </article>
            `
              )
              .join("")}
          </div>
        `
        }
      </section>
    </div>
  `;

  document.getElementById("prod-back-btn")?.addEventListener("click", () => {
    prodState.selectedProductId = null;
    prodState.detail = null;
    void loadAdminProductsList({ onAuthError, onRender });
  });

  document.getElementById("prod-toggle-publish")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateAdminProductRequest(product.id, { isPublished: !product.isPublished });
      showToast(
        product.isPublished
          ? t("adminCatalog.products.unpublishedToast", getLanguage())
          : t("adminCatalog.products.publishedToast", getLanguage()),
        "success"
      );
      await reloadDetailAndList();
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        await onAuthError(err);
        return;
      }
      showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
      btn.disabled = false;
    }
  });

  document.getElementById("prod-delete-btn")?.addEventListener("click", () => {
    triggerProductDeleteOrArchive(product, {
      onAuthError,
      onDone: async (res) => {
        if (res?.action === "archived") {
          await reloadDetailAndList();
        } else {
          prodState.selectedProductId = null;
          prodState.detail = null;
          await loadAdminProductsList({ onAuthError, onRender });
        }
      },
    });
  });

  document.getElementById("admin-edit-product-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    const errBox = document.getElementById("ep-form-err");
    const saveBtn = document.getElementById("ep-save-btn");
    errBox.hidden = true;

    const categoryId = document.getElementById("ep-category").value;
    const slug = document.getElementById("ep-slug").value.trim().toLowerCase();
    const nameEn = document.getElementById("ep-name-en").value.trim();
    const nameAr = document.getElementById("ep-name-ar").value.trim();
    const basePriceRaw = document.getElementById("ep-base-price").value;
    const compareRaw = document.getElementById("ep-compare-price").value;
    const descriptionEn = document.getElementById("ep-desc-en").value.trim();
    const descriptionAr = document.getElementById("ep-desc-ar").value.trim();
    const isPublished = document.getElementById("ep-published").checked;
    const isFeatured = document.getElementById("ep-featured").checked;
    const isNew = document.getElementById("ep-new").checked;
    const isBestSeller = document.getElementById("ep-bestseller").checked;

    const basePrice = Number(basePriceRaw);
    const compareAtPrice = compareRaw.trim() !== "" ? Number(compareRaw) : null;

    if (!categoryId) {
      errBox.textContent = t("adminCatalog.products.errCategory", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameEn.length < 2) {
      errBox.textContent = t("adminCatalog.products.errNameEn", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameAr.length < 2) {
      errBox.textContent = t("adminCatalog.products.errNameAr", curLang);
      errBox.hidden = false;
      return;
    }
    if (basePriceRaw.trim() === "" || !Number.isFinite(basePrice) || basePrice < 0) {
      errBox.textContent = t("adminCatalog.products.errBasePrice", curLang);
      errBox.hidden = false;
      return;
    }
    if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < basePrice)) {
      errBox.textContent = t("adminCatalog.products.errComparePrice", curLang);
      errBox.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      await updateAdminProductRequest(product.id, {
        categoryId,
        ...(slug ? { slug } : {}),
        nameEn,
        nameAr,
        basePrice,
        compareAtPrice,
        descriptionEn: descriptionEn || null,
        descriptionAr: descriptionAr || null,
        isPublished,
        isFeatured,
        isNew,
        isBestSeller,
      });
      showToast(t("adminCatalog.products.updatedToast", getLanguage()), "success");
      await reloadDetailAndList();
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        await onAuthError(err);
        return;
      }
      errBox.textContent = err?.message || t("adminCatalog.errorTitle", getLanguage());
      errBox.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = t("adminCatalog.products.saveChanges", getLanguage());
    }
  });

  // Variant actions
  document.getElementById("var-add-btn")?.addEventListener("click", () => {
    openVariantModal({
      product,
      existing: null,
      onSaved: reloadDetailAndList,
      onAuthError,
    });
  });

  mainEl.querySelectorAll("[data-var-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-var-edit");
      const target = product.variants.find((v) => v.id === id);
      if (!target) return;
      openVariantModal({
        product,
        existing: target,
        onSaved: reloadDetailAndList,
        onAuthError,
      });
    });
  });

  mainEl.querySelectorAll("[data-var-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-var-delete");
      const target = product.variants.find((v) => v.id === id);
      if (!target) return;
      const curLang = getLanguage();

      openConfirmDialog({
        title: t("adminCatalog.variants.deleteConfirmTitle", curLang),
        message: formatTemplate(t("adminCatalog.variants.deleteConfirmMsg", curLang), {
          sku: target.sku,
        }),
        confirmLabel: t("adminCatalog.delete", curLang),
        cancelLabel: t("adminCatalog.cancel", curLang),
        onConfirm: async () => {
          try {
            const res = await deleteAdminVariantRequest(product.id, target.id);
            if (res?.action === "deactivated") {
              showToast(t("adminCatalog.variants.deactivatedToast", getLanguage()), "warning", 5000);
            } else {
              showToast(t("adminCatalog.variants.deletedToast", getLanguage()), "success");
            }
            await reloadDetailAndList();
          } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
              await onAuthError(err);
              return;
            }
            showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
          }
        },
      });
    });
  });

  // Image actions
  document.getElementById("img-add-btn")?.addEventListener("click", () => {
    openProductImageModal({
      productId: product.id,
      existing: null,
      onSaved: reloadDetailAndList,
      onAuthError,
    });
  });

  mainEl.querySelectorAll("[data-img-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-img-edit");
      const target = product.images.find((i) => i.id === id);
      if (!target) return;
      openProductImageModal({
        productId: product.id,
        existing: target,
        onSaved: reloadDetailAndList,
        onAuthError,
      });
    });
  });

  mainEl.querySelectorAll("[data-img-main]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-img-main");
      if (!id) return;
      btn.disabled = true;
      try {
        await updateAdminProductImageRequest(product.id, id, { isPrimary: true });
        showToast(t("adminCatalog.images.updatedToast", getLanguage()), "success");
        await reloadDetailAndList();
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
        btn.disabled = false;
      }
    });
  });

  mainEl.querySelectorAll("[data-img-move]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-img-move");
      const dir = Number(btn.getAttribute("data-dir") || 0);
      const idx = product.images.findIndex((i) => i.id === id);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= product.images.length) return;

      const reorderedIds = product.images.map((i) => i.id);
      const [moved] = reorderedIds.splice(idx, 1);
      reorderedIds.splice(nextIdx, 0, moved);

      btn.disabled = true;
      try {
        await reorderAdminProductImagesRequest(product.id, reorderedIds);
        showToast(t("adminCatalog.images.reorderedToast", getLanguage()), "success");
        await reloadDetailAndList();
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
        btn.disabled = false;
      }
    });
  });

  mainEl.querySelectorAll("[data-img-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-img-delete");
      if (!id) return;
      const curLang = getLanguage();
      openConfirmDialog({
        title: t("adminCatalog.images.deleteConfirmTitle", curLang),
        message: t("adminCatalog.images.deleteConfirmMsg", curLang),
        confirmLabel: t("adminCatalog.delete", curLang),
        cancelLabel: t("adminCatalog.cancel", curLang),
        onConfirm: async () => {
          try {
            await deleteAdminProductImageRequest(product.id, id);
            showToast(t("adminCatalog.images.deletedToast", getLanguage()), "success");
            await reloadDetailAndList();
          } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
              await onAuthError(err);
              return;
            }
            showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
          }
        },
      });
    });
  });
}

export function resetProductsLoadState() {
  prodState.loadedOnce = false;
  prodState.selectedProductId = null;
  prodState.detail = null;
}

export function renderProductsSection(
  mainEl,
  { onAuthError, onRender, onNavigateSection }
) {
  if (!mainEl) return;

  if (prodState.selectedProductId) {
    renderProductDetailEditor(mainEl, { onAuthError, onRender });
    return;
  }

  const lang = getLanguage();

  if (!prodState.loadedOnce && !prodState.loading && !prodState.error) {
    void loadAdminProductsList({ onAuthError, onRender });
  }

  const refreshList = async () => {
    await loadAdminProductsList({ onAuthError, onRender });
  };

  const hasCategories = prodState.categories.length > 0;

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminCatalog.products.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminCatalog.products.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminCatalog.products.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="admin-prod-refresh" ${prodState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminCatalog.refresh", lang))}
        </button>
        <button type="button" class="btn btn--primary btn--sm" id="admin-prod-create" ${!hasCategories ? "disabled" : ""}>
          + ${escapeHtml(t("adminCatalog.products.addBtn", lang))}
        </button>
      </div>
    </div>

    ${
      prodState.loadedOnce && !hasCategories
        ? `
      <div class="admin-state-box">
        <h2 class="admin-state-box__title">${escapeHtml(t("adminCatalog.products.noCategoryNoticeTitle", lang))}</h2>
        <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.products.noCategoryNoticeDesc", lang))}</p>
        <div class="admin-state-actions">
          <button type="button" class="btn btn--primary" id="admin-prod-go-cats">
            ${escapeHtml(t("adminCatalog.products.goToCategories", lang))}
          </button>
        </div>
      </div>
    `
        : ""
    }

    <section class="admin-panel">
      <form class="admin-toolbar" id="admin-prod-filter-form">
        <div class="admin-toolbar__filters">
          <input
            type="search"
            id="admin-prod-search"
            class="input admin-toolbar__search"
            placeholder="${escapeHtml(t("adminCatalog.products.searchPlaceholder", lang))}"
            value="${escapeHtml(prodState.filters.search)}"
          />
          <select id="admin-prod-cat-filter" class="input admin-toolbar__select" aria-label="${escapeHtml(t("adminCatalog.products.categoryLabel", lang))}">
            <option value="">${escapeHtml(t("adminCatalog.products.allCategories", lang))}</option>
            ${buildCategoryOptionsHtml(prodState.categories, prodState.filters.categoryId, lang)}
          </select>
          <select id="admin-prod-pub-filter" class="input admin-toolbar__select" aria-label="${escapeHtml(t("adminCatalog.status", lang))}">
            <option value="all" ${prodState.filters.published === "all" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.statusAll", lang))}</option>
            <option value="published" ${prodState.filters.published === "published" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.statusPublished", lang))}</option>
            <option value="unpublished" ${prodState.filters.published === "unpublished" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.statusUnpublished", lang))}</option>
          </select>
          <select id="admin-prod-sort" class="input admin-toolbar__select">
            <option value="newest" ${prodState.filters.sort === "newest" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.sortNewest", lang))}</option>
            <option value="oldest" ${prodState.filters.sort === "oldest" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.sortOldest", lang))}</option>
            <option value="name_asc" ${prodState.filters.sort === "name_asc" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.sortNameAsc", lang))}</option>
            <option value="price_asc" ${prodState.filters.sort === "price_asc" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.sortPriceAsc", lang))}</option>
            <option value="price_desc" ${prodState.filters.sort === "price_desc" ? "selected" : ""}>${escapeHtml(t("adminCatalog.products.sortPriceDesc", lang))}</option>
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">${escapeHtml(t("adminCatalog.search", lang))}</button>
        </div>
      </form>

      ${
        prodState.loading
          ? `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;" aria-busy="true">
          <div class="admin-skeleton" style="width: 100%; height: 52px;"></div>
          <div class="admin-skeleton" style="width: 100%; height: 52px;"></div>
          <div class="admin-skeleton" style="width: 100%; height: 52px;"></div>
        </div>
      `
          : prodState.error
          ? `
        <div class="admin-state-box admin-state-box--inline" role="alert">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.errorTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(prodState.error)}</p>
          <div class="admin-state-actions">
            <button type="button" class="btn btn--primary btn--sm" id="admin-prod-retry">${escapeHtml(t("adminCatalog.retry", lang))}</button>
          </div>
        </div>
      `
          : prodState.items.length === 0
          ? `
        <div class="admin-state-box admin-state-box--inline">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.products.emptyTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.products.emptyDesc", lang))}</p>
          ${
            hasCategories
              ? `
            <div class="admin-state-actions">
              <button type="button" class="btn btn--primary btn--sm" id="admin-prod-empty-add">
                + ${escapeHtml(t("adminCatalog.products.addBtn", lang))}
              </button>
            </div>
          `
              : ""
          }
        </div>
      `
          : `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("adminCatalog.products.colProduct", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.products.colCategory", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.products.colPrice", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.products.colVariants", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.products.colFlags", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.products.colStatus", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.products.colActions", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${prodState.items
                .map((p) => {
                  const title = lang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar;
                  const catTitle =
                    lang === "ar"
                      ? p.category.name_ar || p.category.name_en
                      : p.category.name_en || p.category.name_ar;

                  const flags = [];
                  if (p.isFeatured) flags.push(`<span class="admin-tag admin-tag--gold">${escapeHtml(t("adminCatalog.products.flagFeatured", lang))}</span>`);
                  if (p.isNew) flags.push(`<span class="admin-tag">${escapeHtml(t("adminCatalog.products.flagNew", lang))}</span>`);
                  if (p.isBestSeller) flags.push(`<span class="admin-tag">${escapeHtml(t("adminCatalog.products.flagBestSeller", lang))}</span>`);

                  return `
                <tr>
                  <td>
                    <div class="admin-table-item">
                      <span class="admin-thumb">
                        ${
                          p.primaryImageUrl
                            ? `<img src="${escapeHtml(p.primaryImageUrl)}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
                            : `<span style="font-size: 10px;">—</span>`
                        }
                      </span>
                      <div class="admin-table-item__meta">
                        <span class="admin-table-item__title">${escapeHtml(title)}</span>
                        <span class="admin-table-item__sub" dir="ltr">${escapeHtml(p.slug)}</span>
                      </div>
                    </div>
                  </td>
                  <td>${escapeHtml(catTitle)}</td>
                  <td class="admin-table__num tabular-nums">
                    <div>${escapeHtml(formatPriceEGP(p.basePrice, lang))}</div>
                    ${
                      p.compareAtPrice !== null
                        ? `<div class="text-muted" style="font-size: 11px; text-decoration: line-through;">${escapeHtml(
                            formatPriceEGP(p.compareAtPrice, lang)
                          )}</div>`
                        : ""
                    }
                  </td>
                  <td class="admin-table__num tabular-nums">
                    ${escapeHtml(
                      formatTemplate(t("adminCatalog.products.variantsActiveCount", lang), {
                        active: formatCount(p.activeVariantCount),
                        total: formatCount(p.variantCount),
                      })
                    )}
                  </td>
                  <td>
                    <div class="admin-flags-list">${flags.join("") || '<span class="text-muted">—</span>'}</div>
                  </td>
                  <td>
                    <span class="admin-status-text ${p.isPublished ? "admin-status-text--success" : "admin-status-text--pending"}">
                      ${escapeHtml(p.isPublished ? t("adminCatalog.published", lang) : t("adminCatalog.draft", lang))}
                    </span>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button type="button" class="btn btn--secondary btn--sm" data-prod-edit="${escapeHtml(p.id)}">
                        ${escapeHtml(t("adminCatalog.edit", lang))}
                      </button>
                      <button type="button" class="btn btn--ghost btn--sm" data-prod-toggle-pub="${escapeHtml(p.id)}">
                        ${escapeHtml(
                          p.isPublished
                            ? t("adminCatalog.products.unpublishBtn", lang)
                            : t("adminCatalog.products.publishBtn", lang)
                        )}
                      </button>
                      <button type="button" class="btn btn--ghost btn--sm" data-prod-delete="${escapeHtml(p.id)}" style="color: var(--color-danger);">
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

        <div class="admin-pagination">
          <span class="admin-pagination__info tabular-nums">
            ${escapeHtml(
              formatTemplate(t("adminCatalog.pageInfo", lang), {
                page: formatCount(prodState.pagination.page),
                total: formatCount(prodState.pagination.totalPages),
              })
            )} (${escapeHtml(formatTemplate(t("adminCatalog.productsCount", lang), { count: formatCount(prodState.pagination.total) }))})
          </span>
          <div class="admin-pagination__controls">
            <button type="button" class="btn btn--secondary btn--sm" id="admin-prod-prev" ${
              prodState.pagination.page <= 1 ? "disabled" : ""
            }>${escapeHtml(t("adminCatalog.prevPage", lang))}</button>
            <button type="button" class="btn btn--secondary btn--sm" id="admin-prod-next" ${
              prodState.pagination.page >= prodState.pagination.totalPages ? "disabled" : ""
            }>${escapeHtml(t("adminCatalog.nextPage", lang))}</button>
          </div>
        </div>
      `
      }
    </section>
  `;

  document.getElementById("admin-prod-go-cats")?.addEventListener("click", () => {
    if (typeof onNavigateSection === "function") onNavigateSection("categories");
  });

  document.getElementById("admin-prod-refresh")?.addEventListener("click", refreshList);
  document.getElementById("admin-prod-retry")?.addEventListener("click", refreshList);

  const triggerCreate = () => {
    if (!hasCategories) return;
    openCreateProductModal({
      onAuthError,
      onCreated: async (created) => {
        await loadAdminProductsList({ onAuthError });
        if (created?.id) {
          prodState.detail = created;
          prodState.selectedProductId = created.id;
        }
        onRender();
      },
    });
  };

  document.getElementById("admin-prod-create")?.addEventListener("click", triggerCreate);
  document.getElementById("admin-prod-empty-add")?.addEventListener("click", triggerCreate);

  const applyFilterValues = () => {
    prodState.filters.search = document.getElementById("admin-prod-search")?.value.trim() || "";
    prodState.filters.categoryId = document.getElementById("admin-prod-cat-filter")?.value || "";
    prodState.filters.published = document.getElementById("admin-prod-pub-filter")?.value || "all";
    prodState.filters.sort = document.getElementById("admin-prod-sort")?.value || "newest";
    prodState.pagination.page = 1;
    void refreshList();
  };

  document.getElementById("admin-prod-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilterValues();
  });

  document.getElementById("admin-prod-cat-filter")?.addEventListener("change", applyFilterValues);
  document.getElementById("admin-prod-pub-filter")?.addEventListener("change", applyFilterValues);
  document.getElementById("admin-prod-sort")?.addEventListener("change", applyFilterValues);

  document.getElementById("admin-prod-prev")?.addEventListener("click", () => {
    if (prodState.pagination.page > 1) {
      prodState.pagination.page -= 1;
      void refreshList();
    }
  });

  document.getElementById("admin-prod-next")?.addEventListener("click", () => {
    if (prodState.pagination.page < prodState.pagination.totalPages) {
      prodState.pagination.page += 1;
      void refreshList();
    }
  });

  mainEl.querySelectorAll("[data-prod-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-prod-edit");
      if (!id) return;
      void loadAdminProductDetail(id, { onAuthError, onRender });
    });
  });

  mainEl.querySelectorAll("[data-prod-toggle-pub]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-prod-toggle-pub");
      const target = prodState.items.find((p) => p.id === id);
      if (!target) return;
      btn.disabled = true;
      try {
        await updateAdminProductRequest(target.id, { isPublished: !target.isPublished });
        showToast(
          target.isPublished
            ? t("adminCatalog.products.unpublishedToast", getLanguage())
            : t("adminCatalog.products.publishedToast", getLanguage()),
          "success"
        );
        await refreshList();
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          await onAuthError(err);
          return;
        }
        showToast(err?.message || t("adminCatalog.errorTitle", getLanguage()), "error");
        btn.disabled = false;
      }
    });
  });

  mainEl.querySelectorAll("[data-prod-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-prod-delete");
      const target = prodState.items.find((p) => p.id === id);
      if (!target) return;
      triggerProductDeleteOrArchive(target, {
        onAuthError,
        onDone: refreshList,
      });
    });
  });
}
