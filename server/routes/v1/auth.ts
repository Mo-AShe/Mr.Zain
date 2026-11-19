import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  clearSessionCookies,
  ensureCsrfCookie,
  requireAuth,
  requireCsrf,
  setSessionCookies,
  verifySameOriginIfPresent,
} from "../../middleware/auth.js";
import {
  loginCustomer,
  registerCustomer,
  revokeSessionById,
} from "../../services/auth.service.js";
import { loginSchema, registerSchema } from "../../validators/auth.validators.js";

export const authRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many login attempts. Please wait a few minutes and try again.",
      },
    });
  },
});

const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many registration attempts. Please try again later.",
      },
    });
  },
});

authRouter.post(
  "/register",
  registerRateLimiter,
  verifySameOriginIfPresent,
  async (req, res, next) => {
    try {
      const payload = registerSchema.parse(req.body);
      const session = await registerCustomer({
        fullName: payload.fullName,
        email: payload.email,
        password: payload.password,
        phone: payload.phone ?? null,
        userAgent: req.get("user-agent") ?? null,
        ipAddress: req.ip ?? null,
      });

      setSessionCookies(req, res, session);
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({
        success: true,
        user: session.user,
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  "/login",
  loginRateLimiter,
  verifySameOriginIfPresent,
  async (req, res, next) => {
    try {
      const payload = loginSchema.parse(req.body);
      const session = await loginCustomer({
        email: payload.email,
        password: payload.password,
        rememberMe: payload.rememberMe,
        userAgent: req.get("user-agent") ?? null,
        ipAddress: req.ip ?? null,
      });

      setSessionCookies(req, res, session);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        success: true,
        user: session.user,
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post("/logout", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    if (req.auth) {
      await revokeSessionById(req.auth.sessionId);
    }
    clearSessionCookies(req, res);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  if (req.auth) {
    ensureCsrfCookie(req, res, req.auth);
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({
    success: true,
    user: req.auth!.user,
  });
});
