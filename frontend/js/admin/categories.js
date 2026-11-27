/**
 * MR. ZAIN — Admin Categories Management Module
 * Full CRUD over /api/v1/admin/categories with safe in-use deletion protection
 * and EN/AR bilingual RTL support.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import {
  closeModal,
  openConfirmDialog,
  openModal,
  showToast,
} from "../components/ui.js";
import { escapeHtml } from "../utils/formatters.js";
import {
  createAdminCategoryRequest,
  deleteAdminCategoryRequest,
  fetchAdminCategories,
  updateAdminCategoryRequest,
} from "./admin.js";

const catState = {
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

function openCategoryModal({ existing = null, onSaved, onAuthError }) {
  const lang = getLanguage();
  const isEdit = Boolean(existing);

  const formWrap = document.createElement("div");
  formWrap.innerHTML = `
    <form class="admin-form" id="admin-category-form" novalidate>
      <div class="admin-form-error" id="admin-cat-form-error" hidden role="alert"></div>

      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label" for="cat-name-en">${escapeHtml(t("adminCatalog.nameEn", lang))} *</label>
          <input id="cat-name-en" class="input" type="text" maxlength="150" required value="${escapeHtml(existing?.name_en || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="cat-name-ar">${escapeHtml(t("adminCatalog.nameAr", lang))} *</label>
          <input id="cat-name-ar" class="input" type="text" maxlength="150" required dir="rtl" value="${escapeHtml(existing?.name_ar || "")}" />
        </div>

        <div class="field">
          <label class="field__label" for="cat-slug">${escapeHtml(t("adminCatalog.slug", lang))}</label>
          <input id="cat-slug" class="input" type="text" maxlength="160" dir="ltr" placeholder="${escapeHtml(t("adminCatalog.slugPlaceholder", lang))}" value="${escapeHtml(existing?.slug || "")}" />
          <span class="field__hint">${escapeHtml(t("adminCatalog.slugHint", lang))}</span>
        </div>

        <div class="field">
          <label class="field__label" for="cat-order">${escapeHtml(t("adminCatalog.displayOrder", lang))}</label>
          <input id="cat-order" class="input" type="number" min="0" max="10000" step="1" value="${escapeHtml(String(existing?.displayOrder ?? 0))}" />
        </div>

        <div class="field">
          <label class="field__label" for="cat-desc-en">${escapeHtml(t("adminCatalog.descriptionEn", lang))}</label>
          <textarea id="cat-desc-en" class="input admin-textarea" maxlength="2000">${escapeHtml(existing?.description_en || "")}</textarea>
        </div>

        <div class="field">
          <label class="field__label" for="cat-desc-ar">${escapeHtml(t("adminCatalog.descriptionAr", lang))}</label>
          <textarea id="cat-desc-ar" class="input admin-textarea" maxlength="2000" dir="rtl">${escapeHtml(existing?.description_ar || "")}</textarea>
        </div>

        <div class="admin-checkbox-grid admin-form-full">
          <label class="admin-checkbox">
            <input id="cat-active" type="checkbox" ${existing ? (existing.isActive ? "checked" : "") : "checked"} />
            <span>${escapeHtml(t("adminCatalog.isActive", lang))}</span>
          </label>
        </div>
      </div>

      <div class="modal-footer" style="margin-top: 0;">
        <button type="button" class="btn btn--secondary" id="cat-cancel-btn">${escapeHtml(t("adminCatalog.cancel", lang))}</button>
        <button type="submit" class="btn btn--primary" id="cat-submit-btn">
          ${escapeHtml(isEdit ? t("adminCatalog.save", lang) : t("adminCatalog.create", lang))}
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit
      ? t("adminCatalog.categories.editModalTitle", lang)
      : t("adminCatalog.categories.createModalTitle", lang),
    content: formWrap,
    variant: "wide",
  });

  const form = document.getElementById("admin-category-form");
  const errBox = document.getElementById("admin-cat-form-error");
  const submitBtn = document.getElementById("cat-submit-btn");

  document.getElementById("cat-cancel-btn")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curLang = getLanguage();
    errBox.hidden = true;

    const nameEn = document.getElementById("cat-name-en").value.trim();
    const nameAr = document.getElementById("cat-name-ar").value.trim();
    const slug = document.getElementById("cat-slug").value.trim().toLowerCase();
    const displayOrder = Number(document.getElementById("cat-order").value || 0);
    const descriptionEn = document.getElementById("cat-desc-en").value.trim();
    const descriptionAr = document.getElementById("cat-desc-ar").value.trim();
    const isActive = document.getElementById("cat-active").checked;

    if (nameEn.length < 2) {
      errBox.textContent = t("adminCatalog.categories.errNameEn", curLang);
      errBox.hidden = false;
      return;
    }
    if (nameAr.length < 2) {
      errBox.textContent = t("adminCatalog.categories.errNameAr", curLang);
      errBox.hidden = false;
      return;
    }
    const payload = {
      nameEn,
      nameAr,
      ...(slug ? { slug } : {}),
      displayOrder: Number.isFinite(displayOrder) && displayOrder >= 0 ? Math.floor(displayOrder) : 0,
      descriptionEn: descriptionEn || null,
      descriptionAr: descriptionAr || null,
      isActive,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = t("adminCatalog.saving", curLang);

    try {
      if (isEdit) {
        await updateAdminCategoryRequest(existing.id, payload);
        showToast(t("adminCatalog.categories.updatedToast", curLang), "success");
      } else {
        await createAdminCategoryRequest(payload);
        showToast(t("adminCatalog.categories.createdToast", curLang), "success");
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

export async function loadAdminCategories({ onAuthError, onRender } = {}) {
  catState.loading = true;
  catState.error = "";
  if (typeof onRender === "function") onRender();

  try {
    catState.items = await fetchAdminCategories({
      search: catState.search,
      status: catState.status,
    });
    catState.loadedOnce = true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      if (typeof onAuthError === "function") await onAuthError(err);
      return;
    }
    catState.error = err?.message || t("adminCatalog.errorTitle", getLanguage());
  } finally {
    catState.loading = false;
    if (typeof onRender === "function") onRender();
  }
}

export function resetCategoriesLoadState() {
  catState.loadedOnce = false;
}

export function renderCategoriesSection(mainEl, { onAuthError, onRender }) {
  if (!mainEl) return;
  const lang = getLanguage();

  if (!catState.loadedOnce && !catState.loading && !catState.error) {
    void loadAdminCategories({ onAuthError, onRender });
  }

  const refreshAndRender = async () => {
    await loadAdminCategories({ onAuthError, onRender });
  };

  mainEl.innerHTML = `
    <div class="admin-page-head">
      <div>
        <span class="admin-page-head__kicker">${escapeHtml(t("adminCatalog.categories.kicker", lang))}</span>
        <h1 class="admin-page-head__title">${escapeHtml(t("adminCatalog.categories.title", lang))}</h1>
        <p class="admin-page-head__subtitle">${escapeHtml(t("adminCatalog.categories.subtitle", lang))}</p>
      </div>
      <div class="admin-page-head__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="admin-cat-refresh" ${catState.loading ? "disabled" : ""}>
          ${escapeHtml(t("adminCatalog.refresh", lang))}
        </button>
        <button type="button" class="btn btn--primary btn--sm" id="admin-cat-create">
          + ${escapeHtml(t("adminCatalog.categories.addBtn", lang))}
        </button>
      </div>
    </div>

    <section class="admin-panel">
      <form class="admin-toolbar" id="admin-cat-filter-form">
        <div class="admin-toolbar__filters">
          <input
            type="search"
            id="admin-cat-search"
            class="input admin-toolbar__search"
            placeholder="${escapeHtml(t("adminCatalog.categories.searchPlaceholder", lang))}"
            value="${escapeHtml(catState.search)}"
          />
          <select id="admin-cat-status" class="input admin-toolbar__select" aria-label="${escapeHtml(t("adminCatalog.status", lang))}">
            <option value="all" ${catState.status === "all" ? "selected" : ""}>${escapeHtml(t("adminCatalog.categories.statusAll", lang))}</option>
            <option value="active" ${catState.status === "active" ? "selected" : ""}>${escapeHtml(t("adminCatalog.categories.statusActive", lang))}</option>
            <option value="inactive" ${catState.status === "inactive" ? "selected" : ""}>${escapeHtml(t("adminCatalog.categories.statusInactive", lang))}</option>
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">${escapeHtml(t("adminCatalog.search", lang))}</button>
        </div>
      </form>

      ${
        catState.loading
          ? `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;" aria-busy="true">
          <div class="admin-skeleton" style="width: 100%; height: 48px;"></div>
          <div class="admin-skeleton" style="width: 100%; height: 48px;"></div>
          <div class="admin-skeleton" style="width: 100%; height: 48px;"></div>
        </div>
      `
          : catState.error
          ? `
        <div class="admin-state-box admin-state-box--inline" role="alert">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.errorTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(catState.error)}</p>
          <div class="admin-state-actions">
            <button type="button" class="btn btn--primary btn--sm" id="admin-cat-retry">${escapeHtml(t("adminCatalog.retry", lang))}</button>
          </div>
        </div>
      `
          : catState.items.length === 0
          ? `
        <div class="admin-state-box admin-state-box--inline">
          <strong class="admin-state-box__title">${escapeHtml(t("adminCatalog.categories.emptyTitle", lang))}</strong>
          <p class="admin-state-box__desc">${escapeHtml(t("adminCatalog.categories.emptyDesc", lang))}</p>
          <div class="admin-state-actions">
            <button type="button" class="btn btn--primary btn--sm" id="admin-cat-empty-add">
              + ${escapeHtml(t("adminCatalog.categories.addBtn", lang))}
            </button>
          </div>
        </div>
      `
          : `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("adminCatalog.categories.colCategory", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.categories.colSlug", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.categories.colOrder", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.categories.colProducts", lang))}</th>
                <th>${escapeHtml(t("adminCatalog.categories.colStatus", lang))}</th>
                <th class="admin-table__num">${escapeHtml(t("adminCatalog.categories.colActions", lang))}</th>
              </tr>
            </thead>
            <tbody>
              ${catState.items
                .map((cat) => {
                  const primaryName = lang === "ar" ? cat.name_ar || cat.name_en : cat.name_en || cat.name_ar;
                  const secondaryName = lang === "ar" ? cat.name_en : cat.name_ar;
                  return `
                <tr>
                  <td>
                    <div class="admin-table-item">
                      <div class="admin-table-item__meta">
                        <span class="admin-table-item__title">${escapeHtml(primaryName)}</span>
                        <span class="admin-table-item__sub">${escapeHtml(secondaryName || "")}</span>
                      </div>
                    </div>
                  </td>
                  <td dir="ltr" class="text-muted">${escapeHtml(cat.slug)}</td>
                  <td class="admin-table__num tabular-nums">${escapeHtml(formatCount(cat.displayOrder))}</td>
                  <td class="admin-table__num tabular-nums">
                    ${escapeHtml(formatTemplate(t("adminCatalog.productsCount", lang), { count: formatCount(cat.productCount) }))}
                  </td>
                  <td>
                    <span class="admin-status-text ${cat.isActive ? "admin-status-text--success" : "admin-status-text--danger"}">
                      ${escapeHtml(cat.isActive ? t("adminCatalog.active", lang) : t("adminCatalog.inactive", lang))}
                    </span>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button type="button" class="btn btn--secondary btn--sm" data-cat-edit="${escapeHtml(cat.id)}">
                        ${escapeHtml(t("adminCatalog.edit", lang))}
                      </button>
                      <button type="button" class="btn btn--ghost btn--sm" data-cat-delete="${escapeHtml(cat.id)}" style="color: var(--color-danger);">
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

  document.getElementById("admin-cat-refresh")?.addEventListener("click", refreshAndRender);
  document.getElementById("admin-cat-retry")?.addEventListener("click", refreshAndRender);

  const triggerCreate = () =>
    openCategoryModal({
      existing: null,
      onSaved: refreshAndRender,
      onAuthError,
    });

  document.getElementById("admin-cat-create")?.addEventListener("click", triggerCreate);
  document.getElementById("admin-cat-empty-add")?.addEventListener("click", triggerCreate);

  document.getElementById("admin-cat-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    catState.search = document.getElementById("admin-cat-search")?.value.trim() || "";
    catState.status = document.getElementById("admin-cat-status")?.value || "all";
    void refreshAndRender();
  });

  document.getElementById("admin-cat-status")?.addEventListener("change", (e) => {
    catState.status = e.target.value || "all";
    catState.search = document.getElementById("admin-cat-search")?.value.trim() || "";
    void refreshAndRender();
  });

  mainEl.querySelectorAll("[data-cat-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cat-edit");
      const target = catState.items.find((c) => c.id === id);
      if (!target) return;
      openCategoryModal({
        existing: target,
        onSaved: refreshAndRender,
        onAuthError,
      });
    });
  });

  mainEl.querySelectorAll("[data-cat-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cat-delete");
      const target = catState.items.find((c) => c.id === id);
      if (!target) return;
      const curLang = getLanguage();
      const label = curLang === "ar" ? target.name_ar || target.name_en : target.name_en || target.name_ar;

      if (target.productCount > 0) {
        showToast(
          formatTemplate(t("adminCatalog.categories.inUseWarning", curLang), {
            count: formatCount(target.productCount),
          }),
          "warning",
          5000
        );
        return;
      }

      openConfirmDialog({
        title: t("adminCatalog.confirmDeleteTitle", curLang),
        message: formatTemplate(t("adminCatalog.categories.deleteConfirmMsg", curLang), {
          name: label,
        }),
        confirmLabel: t("adminCatalog.delete", curLang),
        cancelLabel: t("adminCatalog.cancel", curLang),
        onConfirm: async () => {
          try {
            await deleteAdminCategoryRequest(target.id);
            showToast(t("adminCatalog.categories.deletedToast", getLanguage()), "success");
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
