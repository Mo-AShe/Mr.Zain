/**
 * MR. ZAIN — Customer Authentication Page Controller
 * Handles customer login, registration, validation, password toggles,
 * bilingual error feedback, and safe post-auth redirects.
 */

import { initLayout } from "../components/layout.js";
import { showToast } from "../components/ui.js";
import { getLanguage, t } from "../i18n/i18n.js";
import {
  fetchCurrentUser,
  getSafeRedirectUrl,
  loginUser,
  registerUser,
} from "../services/auth-service.js";

let activeMode = "login";
let lastLoginErrorKey = "";
let lastRegisterErrorKey = "";

function setMode(mode) {
  activeMode = mode === "register" ? "register" : "login";

  const loginTab = document.getElementById("auth-tab-login");
  const registerTab = document.getElementById("auth-tab-register");
  const loginPanel = document.getElementById("auth-panel-login");
  const registerPanel = document.getElementById("auth-panel-register");

  const isRegister = activeMode === "register";
  loginTab?.classList.toggle("is-active", !isRegister);
  registerTab?.classList.toggle("is-active", isRegister);
  loginTab?.setAttribute("aria-selected", String(!isRegister));
  registerTab?.setAttribute("aria-selected", String(isRegister));

  if (loginPanel) loginPanel.hidden = isRegister;
  if (registerPanel) registerPanel.hidden = !isRegister;
}

function setFieldError(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = key ? t(key, getLanguage()) : "";
}

function setStatusBanner(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!key) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = t(key, getLanguage());
}

function updatePasswordToggleLabels() {
  const lang = getLanguage();
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    const isPressed = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute(
      "aria-label",
      t(isPressed ? "auth.hidePassword" : "auth.showPassword", lang)
    );
  });
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-toggle-password");
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;

      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      updatePasswordToggleLabels();
    });
  });
  updatePasswordToggleLabels();
}

function isValidEgyptianPhone(raw) {
  const cleaned = raw.replace(/[\s\-().]/g, "").trim();
  return /^(?:\+20|20|0)1[0125]\d{8}$/.test(cleaned);
}

function mapApiErrorKey(err, context) {
  if (!err) return "auth.genericError";
  if (err.status === 429 || err.code === "RATE_LIMIT_EXCEEDED") {
    return "auth.rateLimited";
  }
  if (err.code === "INVALID_CREDENTIALS" || (context === "login" && err.status === 401)) {
    return "auth.invalidCredentials";
  }
  if (err.code === "EMAIL_ALREADY_EXISTS") {
    return "auth.duplicateEmail";
  }
  if (err.code === "PHONE_ALREADY_EXISTS") {
    return "auth.duplicatePhone";
  }
  return "auth.genericError";
}

function bindLoginForm() {
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const rememberInput = document.getElementById("login-remember");
  const submitBtn = document.getElementById("login-submit-btn");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lang = getLanguage();

    lastLoginErrorKey = "";
    setStatusBanner("login-form-status", "");
    setFieldError("err-login-email", "");
    setFieldError("err-login-password", "");

    const email = emailInput?.value.trim().toLowerCase() || "";
    const password = passwordInput?.value || "";
    const rememberMe = Boolean(rememberInput?.checked);

    let hasError = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("err-login-email", "auth.errEmail");
      hasError = true;
    }
    if (!password) {
      setFieldError("err-login-password", "auth.errPasswordRequired");
      hasError = true;
    }
    if (hasError) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t("auth.signingIn", lang);
    }

    try {
      await loginUser({ email, password, rememberMe });
      showToast(t("auth.welcomeBack", getLanguage()), "success");
      window.location.replace(getSafeRedirectUrl("/pages/account.html"));
    } catch (err) {
      lastLoginErrorKey = mapApiErrorKey(err, "login");
      setStatusBanner("login-form-status", lastLoginErrorKey);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("auth.submitLogin", getLanguage());
      }
    }
  });
}

function bindRegisterForm() {
  const form = document.getElementById("register-form");
  const fullNameInput = document.getElementById("register-full-name");
  const emailInput = document.getElementById("register-email");
  const phoneInput = document.getElementById("register-phone");
  const passwordInput = document.getElementById("register-password");
  const confirmInput = document.getElementById("register-confirm-password");
  const submitBtn = document.getElementById("register-submit-btn");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lang = getLanguage();

    lastRegisterErrorKey = "";
    setStatusBanner("register-form-status", "");
    setFieldError("err-register-full-name", "");
    setFieldError("err-register-email", "");
    setFieldError("err-register-phone", "");
    setFieldError("err-register-password", "");
    setFieldError("err-register-confirm-password", "");

    const fullName = fullNameInput?.value.trim() || "";
    const email = emailInput?.value.trim().toLowerCase() || "";
    const phone = phoneInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const confirmPassword = confirmInput?.value || "";

    let hasError = false;
    if (fullName.length < 2) {
      setFieldError("err-register-full-name", "auth.errFullName");
      hasError = true;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("err-register-email", "auth.errEmail");
      hasError = true;
    }
    if (!phone) {
      setFieldError("err-register-phone", "auth.errPhoneRequired");
      hasError = true;
    } else if (!isValidEgyptianPhone(phone)) {
      setFieldError("err-register-phone", "auth.errPhone");
      hasError = true;
    }
    if (password.length < 8) {
      setFieldError("err-register-password", "auth.errPasswordLength");
      hasError = true;
    } else if (!(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password))) {
      setFieldError("err-register-password", "auth.errPasswordStrength");
      hasError = true;
    }
    if (confirmPassword !== password) {
      setFieldError("err-register-confirm-password", "auth.errPasswordMismatch");
      hasError = true;
    }
    if (hasError) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t("auth.creatingAccount", lang);
    }

    try {
      await registerUser({
        fullName,
        email,
        phone,
        password,
        confirmPassword,
      });
      showToast(t("auth.accountCreated", getLanguage()), "success");
      window.location.replace(getSafeRedirectUrl("/pages/account.html"));
    } catch (err) {
      lastRegisterErrorKey = mapApiErrorKey(err, "register");
      setStatusBanner("register-form-status", lastRegisterErrorKey);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("auth.submitRegister", getLanguage());
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initLayout({ skipAuthCheck: true });

  const params = new URLSearchParams(window.location.search);
  setMode(params.get("mode") === "register" ? "register" : "login");

  document.getElementById("auth-tab-login")?.addEventListener("click", () => setMode("login"));
  document.getElementById("auth-tab-register")?.addEventListener("click", () => setMode("register"));
  document.getElementById("switch-to-register")?.addEventListener("click", () => setMode("register"));
  document.getElementById("switch-to-login")?.addEventListener("click", () => setMode("login"));

  bindPasswordToggles();
  bindLoginForm();
  bindRegisterForm();

  window.addEventListener("zain:langchange", () => {
    updatePasswordToggleLabels();
    if (lastLoginErrorKey) setStatusBanner("login-form-status", lastLoginErrorKey);
    if (lastRegisterErrorKey) setStatusBanner("register-form-status", lastRegisterErrorKey);
  });

  // Redirect authenticated customers directly to intended destination
  try {
    const user = await fetchCurrentUser({ force: true });
    if (user) {
      window.location.replace(getSafeRedirectUrl("/pages/account.html"));
    }
  } catch {
    // Allow guest to stay on auth page
  }
});
