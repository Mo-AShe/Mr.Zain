import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import {
  createCsrfToken,
  getSessionAuthByToken,
  verifyCsrfToken,
  type SessionAuthContext,
} from "../services/auth.service.js";
import { AppError } from "./errorHandler.js";

declare global {
  namespace Express {
    interface Request {
      auth?: SessionAuthContext;
    }
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

function shouldUseSecureCookies(req: Request): boolean {
  return env.nodeEnv === "production" || req.secure;
}

export function setSessionCookies(
  req: Request,
  res: Response,
  session: {
    rawSessionToken: string;
    sessionId: string;
    rememberMe: boolean;
  }
): string {
  const secure = shouldUseSecureCookies(req);
  const csrfToken = createCsrfToken(session.sessionId);
  const maxAgeOption = session.rememberMe
    ? { maxAge: env.rememberMeTtlMs }
    : {};

  res.cookie(env.sessionCookieName, session.rawSessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...maxAgeOption,
  });

  res.cookie(env.csrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    ...maxAgeOption,
  });

  return csrfToken;
}

export function ensureCsrfCookie(
  req: Request,
  res: Response,
  session: { sessionId: string; rememberMe: boolean }
): void {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[env.csrfCookieName];
  if (existing && verifyCsrfToken(session.sessionId, existing, existing)) {
    return;
  }

  const secure = shouldUseSecureCookies(req);
  const csrfToken = createCsrfToken(session.sessionId);
  res.cookie(env.csrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    ...(session.rememberMe ? { maxAge: env.rememberMeTtlMs } : {}),
  });
}

export function clearSessionCookies(req: Request, res: Response): void {
  const secure = shouldUseSecureCookies(req);

  res.clearCookie(env.sessionCookieName, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });

  res.clearCookie(env.csrfCookieName, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

export async function authenticateSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[env.sessionCookieName];
    if (!rawToken) {
      req.auth = undefined;
      next();
      return;
    }

    const auth = await getSessionAuthByToken(rawToken);
    req.auth = auth ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      const cookies = parseCookies(req.headers.cookie);
      const rawToken = cookies[env.sessionCookieName];
      if (rawToken) {
        const auth = await getSessionAuthByToken(rawToken);
        if (auth) {
          req.auth = auth;
        }
      }
    }

    if (!req.auth) {
      res.setHeader("Cache-Control", "no-store");
      throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (err?: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      });

      if (!req.auth || !allowedRoles.includes(req.auth.user.role)) {
        res.setHeader("Cache-Control", "no-store");
        throw new AppError(
          "You do not have permission to perform this action.",
          403,
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAdmin = requireRole("admin");

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.auth) {
      throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[env.csrfCookieName];
    const headerRaw = req.headers["x-csrf-token"];
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!verifyCsrfToken(req.auth.sessionId, cookieToken, headerToken)) {
      throw new AppError(
        "Invalid or missing CSRF token.",
        403,
        "CSRF_TOKEN_INVALID"
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireMutatingCsrf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  verifySameOriginIfPresent(req, res, (originErr?: unknown) => {
    if (originErr) {
      next(originErr);
      return;
    }
    requireCsrf(req, res, next);
  });
}

export function verifySameOriginIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const originHeader = req.headers.origin;
    if (!originHeader) {
      next();
      return;
    }

    const host = req.get("host");
    if (!host) {
      next();
      return;
    }

    let originHost = "";
    try {
      originHost = new URL(originHeader).host;
    } catch {
      throw new AppError("Invalid request origin.", 403, "FORBIDDEN_ORIGIN");
    }

    const allowedCors =
      env.corsOrigin !== "*"
        ? env.corsOrigin.split(",").map((item) => item.trim())
        : [];

    if (originHost !== host && !allowedCors.includes(originHeader)) {
      throw new AppError("Cross-origin request denied.", 403, "FORBIDDEN_ORIGIN");
    }

    next();
  } catch (err) {
    next(err);
  }
}
