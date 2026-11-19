/**
 * MR. ZAIN — Shared Egyptian Delivery Address Form Modal & Helpers
 * Reused across Checkout and My Account pages with EN/AR governorate localization.
 */

import { getLanguage, t } from "../i18n/i18n.js";
import { createAddress, updateAddress } from "../services/address-service.js";
import { redirectToAuth } from "../services/auth-service.js";
import { escapeHtml, formatPriceEGP } from "../utils/formatters.js";
import { closeModal, openModal, showToast } from "./ui.js";

const GOVERNORATE_AR_MAP = {
  Cairo: "القاهرة",
  Giza: "الجيزة",
  Alexandria: "الإسكندرية",
  Qalyubia: "القليوبية",
  Sharqia: "الشرقية",
  Dakahlia: "الدقهلية",
  Gharbia: "الغربية",
  Monufia: "المنوفية",
  Beheira: "البحيرة",
  "Kafr El Sheikh": "كفر الشيخ",
  Damietta: "دمياط",
  "Port Said": "بورسعيد",
  Ismailia: "الإسماعيلية",
  Suez: "السويس",
  Faiyum: "الفيوم",
  "Beni Suef": "بني سويف",
  Minya: "المنيا",
  Asyut: "أسيوط",
  Sohag: "سوهاج",
  Qena: "قنا",
  Luxor: "الأقصر",
  Aswan: "أسوان",
  "Red Sea": "البحر الأحمر",
  "New Valley": "الوادي الجديد",
  Matrouh: "مطروح",
  "North Sinai": "شمال سيناء",
  "South Sinai": "جنوب سيناء",
};

export function localizeGovernorate(governorate, lang = getLanguage()) {
  if (!governorate) return "";
  if (lang === "ar") {
    return GOVERNORATE_AR_MAP[governorate] || governorate;
  }
  return governorate;
}

export function formatAddressLines(addr, lang = getLanguage()) {
  if (!addr) return [];
  const line1 = `${addr.street}${addr.building ? `, ${t("address.buildingShort", lang)} ${addr.building}` : ""}`;
  const subParts = [];
  if (addr.floor) subParts.push(`${t("address.floorShort", lang)} ${addr.floor}`);
  if (addr.apartment) subParts.push(`${t("address.aptShort", lang)} ${addr.apartment}`);
  const line2 = subParts.join(" · ");
  const line3 = `${addr.city}, ${localizeGovernorate(addr.governorate, lang)}`;
  return [line1, line2, line3].filter(Boolean);
}

function isValidEgyptianMobile(raw) {
  const cleaned = String(raw || "").replace(/[\s\-().]/g, "").trim();
  return /^(?:\+?20)?0?1[0125]\d{8}$/.test(cleaned);
}

export function openAddressFormModal({
  address = null,
  governorates = [],
  defaultFullName = "",
  defaultPhone = "",
  onSaved,
}) {
  const lang = getLanguage();
  const isEdit = Boolean(address?.id);

  const form = document.createElement("form");
  form.className = "address-modal-form";
  form.noValidate = true;

  const selectedGov = address?.governorate || "";

  const govOptions = governorates
    .map((zone) => {
      const govName = zone.governorate;
      const label = localizeGovernorate(govName, lang);
      const feeText = formatPriceEGP(zone.shippingFee, lang);
      const selected = govName === selectedGov ? "selected" : "";
      return `<option value="${escapeHtml(govName)}" ${selected}>${escapeHtml(label)} (${escapeHtml(feeText)})</option>`;
    })
    .join("");

  form.innerHTML = `
    <div id="addr-form-status" class="form-status" role="alert" hidden></div>

    <div class="address-form-grid">
      <div class="field">
        <label class="field__label" for="addr-recipient-name">${escapeHtml(t("address.fullName", lang))} *</label>
        <input
          type="text"
          id="addr-recipient-name"
          name="recipientName"
          class="input"
          required
          maxlength="150"
          value="${escapeHtml(address?.recipientName || defaultFullName || "")}"
          placeholder="${escapeHtml(t("address.fullNamePlaceholder", lang))}"
        />
        <span class="field__error" id="err-addr-recipientName"></span>
      </div>

      <div class="field">
        <label class="field__label" for="addr-phone">${escapeHtml(t("address.phone", lang))} *</label>
        <input
          type="tel"
          id="addr-phone"
          name="phone"
          class="input"
          dir="ltr"
          required
          maxlength="30"
          value="${escapeHtml(address?.phone || defaultPhone || "")}"
          placeholder="${escapeHtml(t("address.phonePlaceholder", lang))}"
        />
        <span class="field__error" id="err-addr-phone"></span>
      </div>

      <div class="field">
        <label class="field__label" for="addr-governorate">${escapeHtml(t("address.governorate", lang))} *</label>
        <select id="addr-governorate" name="governorate" class="select" required>
          <option value="">${escapeHtml(t("address.selectGovernorate", lang))}</option>
          ${govOptions}
        </select>
        <span class="field__error" id="err-addr-governorate"></span>
      </div>

      <div class="field">
        <label class="field__label" for="addr-city">${escapeHtml(t("address.city", lang))} *</label>
        <input
          type="text"
          id="addr-city"
          name="city"
          class="input"
          required
          maxlength="100"
          value="${escapeHtml(address?.city || "")}"
          placeholder="${escapeHtml(t("address.cityPlaceholder", lang))}"
        />
        <span class="field__error" id="err-addr-city"></span>
      </div>

      <div class="field address-form-grid__full">
        <label class="field__label" for="addr-street">${escapeHtml(t("address.street", lang))} *</label>
        <input
          type="text"
          id="addr-street"
          name="street"
          class="input"
          required
          maxlength="255"
          value="${escapeHtml(address?.street || "")}"
          placeholder="${escapeHtml(t("address.streetPlaceholder", lang))}"
        />
        <span class="field__error" id="err-addr-street"></span>
      </div>

      <div class="field">
        <label class="field__label" for="addr-building">${escapeHtml(t("address.building", lang))} *</label>
        <input
          type="text"
          id="addr-building"
          name="building"
          class="input"
          required
          maxlength="100"
          value="${escapeHtml(address?.building || "")}"
          placeholder="${escapeHtml(t("address.buildingPlaceholder", lang))}"
        />
        <span class="field__error" id="err-addr-building"></span>
      </div>

      <div class="address-form-pair">
        <div class="field">
          <label class="field__label" for="addr-floor">${escapeHtml(t("address.floor", lang))}</label>
          <input
            type="text"
            id="addr-floor"
            name="floor"
            class="input"
            maxlength="40"
            value="${escapeHtml(address?.floor || "")}"
            placeholder="${escapeHtml(t("address.floorPlaceholder", lang))}"
          />
        </div>

        <div class="field">
          <label class="field__label" for="addr-apartment">${escapeHtml(t("address.apartment", lang))}</label>
          <input
            type="text"
            id="addr-apartment"
            name="apartment"
            class="input"
            maxlength="50"
            value="${escapeHtml(address?.apartment || "")}"
            placeholder="${escapeHtml(t("address.apartmentPlaceholder", lang))}"
          />
        </div>
      </div>

      <div class="field address-form-grid__full">
        <label class="field__label" for="addr-notes">${escapeHtml(t("address.instructions", lang))}</label>
        <textarea
          id="addr-notes"
          name="additionalInformation"
          class="textarea"
          rows="2"
          maxlength="500"
          placeholder="${escapeHtml(t("address.instructionsPlaceholder", lang))}"
        >${escapeHtml(address?.additionalInformation || "")}</textarea>
      </div>

      <label class="auth-check-row address-form-grid__full">
        <input
          type="checkbox"
          id="addr-is-default"
          name="isDefault"
          ${address?.isDefault ? "checked" : ""}
        />
        <span>${escapeHtml(t("address.setDefault", lang))}</span>
      </label>
    </div>

    <div class="address-modal-actions">
      <button type="button" class="btn btn--secondary" id="addr-cancel-btn">
        ${escapeHtml(t("ui.cancel", lang))}
      </button>
      <button type="submit" class="btn btn--primary" id="addr-save-btn">
        ${escapeHtml(isEdit ? t("address.saveChanges", lang) : t("address.saveAddress", lang))}
      </button>
    </div>
  `;

  openModal({
    title: isEdit ? t("address.editTitle", lang) : t("address.addTitle", lang),
    content: form,
  });

  const statusEl = form.querySelector("#addr-form-status");
  const saveBtn = form.querySelector("#addr-save-btn");
  const cancelBtn = form.querySelector("#addr-cancel-btn");
  cancelBtn?.addEventListener("click", closeModal);

  const setFieldError = (field, msg) => {
    const errEl = form.querySelector(`#err-addr-${field}`);
    if (errEl) errEl.textContent = msg || "";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentLang = getLanguage();
    ["recipientName", "phone", "governorate", "city", "street", "building"].forEach((k) =>
      setFieldError(k, "")
    );
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }

    const recipientName = form.recipientName.value.trim();
    const phone = form.phone.value.trim();
    const governorate = form.governorate.value.trim();
    const city = form.city.value.trim();
    const street = form.street.value.trim();
    const building = form.building.value.trim();
    const floor = form.floor.value.trim();
    const apartment = form.apartment.value.trim();
    const additionalInformation = form.additionalInformation.value.trim();
    const isDefault = Boolean(form.isDefault.checked);

    let hasError = false;
    if (recipientName.length < 2) {
      setFieldError("recipientName", t("address.errFullName", currentLang));
      hasError = true;
    }
    if (!isValidEgyptianMobile(phone)) {
      setFieldError("phone", t("address.errPhone", currentLang));
      hasError = true;
    }
    if (!governorate) {
      setFieldError("governorate", t("address.errGovernorate", currentLang));
      hasError = true;
    }
    if (city.length < 2) {
      setFieldError("city", t("address.errCity", currentLang));
      hasError = true;
    }
    if (street.length < 3) {
      setFieldError("street", t("address.errStreet", currentLang));
      hasError = true;
    }
    if (building.length < 1) {
      setFieldError("building", t("address.errBuilding", currentLang));
      hasError = true;
    }

    if (hasError) return;

    const payload = {
      recipientName,
      phone,
      governorate,
      city,
      street,
      building,
      floor: floor || null,
      apartment: apartment || null,
      additionalInformation: additionalInformation || null,
      isDefault,
    };

    saveBtn.disabled = true;
    saveBtn.textContent = t("address.saving", currentLang);

    try {
      const saved = isEdit
        ? await updateAddress(address.id, payload)
        : await createAddress(payload);

      closeModal();
      showToast(
        isEdit ? t("address.updatedSuccess", getLanguage()) : t("address.addedSuccess", getLanguage()),
        "success"
      );
      if (typeof onSaved === "function") {
        await onSaved(saved);
      }
    } catch (err) {
      if (err && err.status === 401) {
        closeModal();
        redirectToAuth();
        return;
      }
      if (statusEl) {
        statusEl.className = "form-status form-status--error";
        statusEl.textContent = err?.message || t("ui.actionFailed", getLanguage());
        statusEl.hidden = false;
      }
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit
        ? t("address.saveChanges", getLanguage())
        : t("address.saveAddress", getLanguage());
    }
  });
}
