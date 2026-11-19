/**
 * MR. ZAIN — Frontend Configuration
 * Centralizes API base URLs, currency formatting, Egyptian governorate constants,
 * and client-side storage keys.
 */

export const CONFIG = Object.freeze({
  BRAND_NAME: "MR. ZAIN",
  API_BASE_URL: "/api/v1",
  CURRENCY: {
    CODE: "EGP",
    SYMBOL: "EGP",
    LOCALE: "en-EG",
  },
  AUTH: {
    CSRF_COOKIE_NAME: "mz_csrf",
  },
  STORAGE_KEYS: {
    USER_PREFS: "mr_zain_user_prefs",
  },
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 12,
  },
  EGYPT_GOVERNORATES: [
    "Cairo",
    "Giza",
    "Alexandria",
    "Qalyubia",
    "Sharqia",
    "Dakahlia",
    "Gharbia",
    "Monufia",
    "Beheira",
    "Kafr El Sheikh",
    "Damietta",
    "Port Said",
    "Ismailia",
    "Suez",
    "Faiyum",
    "Beni Suef",
    "Minya",
    "Asyut",
    "Sohag",
    "Qena",
    "Luxor",
    "Aswan",
    "Red Sea",
    "New Valley",
    "Matrouh",
    "North Sinai",
    "South Sinai",
  ],
});
