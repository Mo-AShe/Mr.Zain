import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { roles, sessions, users } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";

const BCRYPT_COST = 12;
// Precomputed valid bcrypt hash used to mitigate user-enumeration timing differences
const DUMMY_PASSWORD_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9S6P1T8u8hZ8nA1Wqf2a0H8P8g4fK6q";

export interface SafeAuthUserDTO {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  isVerified: boolean;
  createdAt: string;
}

export interface SessionAuthContext {
  user: SafeAuthUserDTO;
  sessionId: string;
  expiresAt: Date;
  rememberMe: boolean;
}

function toSafeAuthUser(row: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleName: string;
  isVerified: boolean;
  createdAt: Date;
}): SafeAuthUserDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.roleName,
    isVerified: row.isVerified,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", env.sessionSecret)
    .update(rawToken)
    .digest("hex");
}

export function createCsrfToken(sessionId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const sig = crypto
    .createHmac("sha256", env.sessionSecret)
    .update(`${sessionId}.${nonce}`)
    .digest("hex");
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(
  sessionId: string,
  cookieToken: string | undefined,
  headerToken: string | undefined
): boolean {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  const cookieBuf = Buffer.from(cookieToken, "utf8");
  const headerBuf = Buffer.from(headerToken, "utf8");
  if (!crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    return false;
  }

  const parts = cookieToken.split(".");
  if (parts.length !== 2) return false;
  const [nonce, providedSig] = parts;
  if (!nonce || !providedSig) return false;

  const expectedSig = crypto
    .createHmac("sha256", env.sessionSecret)
    .update(`${sessionId}.${nonce}`)
    .digest("hex");

  if (providedSig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(providedSig, "utf8"),
    Buffer.from(expectedSig, "utf8")
  );
}

export async function registerCustomer(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = input.phone ?? null;

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingEmail) {
    throw new AppError(
      "An account with this email address already exists.",
      409,
      "EMAIL_ALREADY_EXISTS"
    );
  }

  if (normalizedPhone) {
    const [existingPhone] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, normalizedPhone))
      .limit(1);

    if (existingPhone) {
      throw new AppError(
        "An account with this phone number already exists.",
        409,
        "PHONE_ALREADY_EXISTS"
      );
    }
  }

  const [customerRole] = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.name, "customer"))
    .limit(1);

  if (!customerRole) {
    throw new AppError(
      "Customer role configuration is missing.",
      500,
      "ROLE_NOT_CONFIGURED"
    );
  }

  const passwordHash = await hashPassword(input.password);
  const rawSessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawSessionToken);
  const expiresAt = new Date(Date.now() + env.sessionTtlMs);

  try {
    const result = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          fullName: input.fullName.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash,
          roleId: customerRole.id,
          isActive: true,
          isVerified: false,
        })
        .returning({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          isVerified: users.isVerified,
          createdAt: users.createdAt,
        });

      const [createdSession] = await tx
        .insert(sessions)
        .values({
          userId: createdUser.id,
          tokenHash,
          rememberMe: false,
          userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
          ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
          expiresAt,
        })
        .returning({
          id: sessions.id,
          expiresAt: sessions.expiresAt,
          rememberMe: sessions.rememberMe,
        });

      return { createdUser, createdSession };
    });

    return {
      user: toSafeAuthUser({
        ...result.createdUser,
        roleName: customerRole.name,
      }),
      rawSessionToken,
      sessionId: result.createdSession.id,
      expiresAt: result.createdSession.expiresAt,
      rememberMe: result.createdSession.rememberMe,
    };
  } catch (err: unknown) {
    const pgCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (pgCode === "23505") {
      throw new AppError(
        "An account with this email or phone already exists.",
        409,
        "ACCOUNT_ALREADY_EXISTS"
      );
    }
    throw err;
  }
}

export async function loginCustomer(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const rememberMe = Boolean(input.rememberMe);

  const [userRow] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!userRow) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordValid = await bcrypt.compare(input.password, userRow.passwordHash);
  if (!passwordValid || !userRow.isActive) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const ttlMs = rememberMe ? env.rememberMeTtlMs : env.sessionTtlMs;
  const rawSessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawSessionToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  const [createdSession] = await db
    .insert(sessions)
    .values({
      userId: userRow.id,
      tokenHash,
      rememberMe,
      userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
      ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
      expiresAt,
    })
    .returning({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      rememberMe: sessions.rememberMe,
    });

  return {
    user: toSafeAuthUser(userRow),
    rawSessionToken,
    sessionId: createdSession.id,
    expiresAt: createdSession.expiresAt,
    rememberMe: createdSession.rememberMe,
  };
}

export async function getSessionAuthByToken(
  rawToken: string
): Promise<SessionAuthContext | null> {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      rememberMe: sessions.rememberMe,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      isActive: users.isActive,
      isVerified: users.isVerified,
      userCreatedAt: users.createdAt,
      roleName: roles.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    rememberMe: row.rememberMe,
    user: toSafeAuthUser({
      id: row.userId,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      roleName: row.roleName,
      isVerified: row.isVerified,
      createdAt: row.userCreatedAt,
    }),
  };
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}
