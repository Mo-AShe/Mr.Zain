import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../db/index.js";
import { roles, users } from "../db/schema.js";
import { hashPassword } from "../services/auth.service.js";

const BOOTSTRAP_LOCK_NS = 71001;
const BOOTSTRAP_LOCK_ID = 1;

export interface BootstrapAdminEnvInput {
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_FULL_NAME?: string;
}

export interface ValidatedBootstrapAdminInput {
  email: string;
  password: string;
  fullName: string;
}

export interface SafeBootstrappedAdminDTO {
  id: string;
  fullName: string;
  email: string;
  role: "admin";
  isVerified: boolean;
  createdAt: string;
}

export interface BootstrapAdminResult {
  status: "created" | "already_exists";
  admin: SafeBootstrappedAdminDTO;
}

export class BootstrapAdminError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "BootstrapAdminError";
    this.code = code;
  }
}

const WEAK_PASSWORD_PATTERNS = [
  "password",
  "admin123",
  "123456",
  "qwerty",
  "mr.zain",
  "mrzain",
];

const bootstrapSchema = z
  .object({
    email: z
      .string({ error: "ADMIN_EMAIL is required." })
      .trim()
      .toLowerCase()
      .email("ADMIN_EMAIL must be a valid email address.")
      .max(255, "ADMIN_EMAIL must be at most 255 characters."),
    fullName: z
      .string({ error: "ADMIN_FULL_NAME is required." })
      .trim()
      .min(2, "ADMIN_FULL_NAME must be at least 2 characters.")
      .max(150, "ADMIN_FULL_NAME must be at most 150 characters."),
    password: z
      .string({ error: "ADMIN_PASSWORD is required." })
      .refine((val) => val === val.trim(), {
        message: "ADMIN_PASSWORD must not contain leading or trailing spaces.",
      })
      .refine((val) => val.length >= 12, {
        message: "ADMIN_PASSWORD must be at least 12 characters long.",
      })
      .refine((val) => val.length <= 128, {
        message: "ADMIN_PASSWORD must be at most 128 characters long.",
      })
      .refine((val) => /[A-Z]/.test(val), {
        message: "ADMIN_PASSWORD must include at least one uppercase letter.",
      })
      .refine((val) => /[a-z]/.test(val), {
        message: "ADMIN_PASSWORD must include at least one lowercase letter.",
      })
      .refine((val) => /\d/.test(val), {
        message: "ADMIN_PASSWORD must include at least one number.",
      })
      .refine((val) => /[^A-Za-z0-9\s]/.test(val), {
        message: "ADMIN_PASSWORD must include at least one special character.",
      }),
  })
  .superRefine((data, ctx) => {
    const lowerPassword = data.password.toLowerCase();
    const emailLocalPart = data.email.split("@")[0] || "";
    if (emailLocalPart.length >= 3 && lowerPassword.includes(emailLocalPart)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "ADMIN_PASSWORD must not contain the email local-part.",
      });
    }
    for (const weakPattern of WEAK_PASSWORD_PATTERNS) {
      if (lowerPassword.includes(weakPattern)) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: "ADMIN_PASSWORD contains a disallowed weak sequence.",
        });
        break;
      }
    }
  });

export function validateBootstrapEnv(
  envSource: BootstrapAdminEnvInput = process.env
): ValidatedBootstrapAdminInput {
  const missing: string[] = [];
  if (!envSource.ADMIN_EMAIL || !envSource.ADMIN_EMAIL.trim()) {
    missing.push("ADMIN_EMAIL");
  }
  if (!envSource.ADMIN_PASSWORD || envSource.ADMIN_PASSWORD.length === 0) {
    missing.push("ADMIN_PASSWORD");
  }
  if (!envSource.ADMIN_FULL_NAME || !envSource.ADMIN_FULL_NAME.trim()) {
    missing.push("ADMIN_FULL_NAME");
  }

  if (missing.length > 0) {
    throw new BootstrapAdminError(
      `Missing required environment variable(s): ${missing.join(", ")}`,
      "MISSING_ENV"
    );
  }

  const parsed = bootstrapSchema.safeParse({
    email: envSource.ADMIN_EMAIL,
    password: envSource.ADMIN_PASSWORD,
    fullName: envSource.ADMIN_FULL_NAME,
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new BootstrapAdminError(details, "INVALID_ENV");
  }

  return parsed.data;
}

export async function bootstrapInitialAdmin(
  envSource: BootstrapAdminEnvInput = process.env
): Promise<BootstrapAdminResult> {
  const input = validateBootstrapEnv(envSource);

  return db.transaction(async (tx) => {
    // Serialize concurrent bootstrap invocations across processes/connections
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_NS}, ${BOOTSTRAP_LOCK_ID})`
    );

    const [adminRole] = await tx
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.name, "admin"))
      .limit(1);

    if (!adminRole) {
      throw new BootstrapAdminError(
        "Admin role does not exist in Neon roles table. Run foundational seed first.",
        "ROLE_NOT_CONFIGURED"
      );
    }

    const [existingAdmin] = await tx
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.roleId, adminRole.id))
      .limit(1);

    if (existingAdmin) {
      return {
        status: "already_exists",
        admin: {
          id: existingAdmin.id,
          fullName: existingAdmin.fullName,
          email: existingAdmin.email,
          role: "admin",
          isVerified: existingAdmin.isVerified,
          createdAt: existingAdmin.createdAt.toISOString(),
        },
      };
    }

    const [existingEmailUser] = await tx
      .select({
        id: users.id,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingEmailUser) {
      throw new BootstrapAdminError(
        "Configured ADMIN_EMAIL already belongs to an existing account. Refusing to promote or overwrite credentials.",
        "CUSTOMER_PROMOTION_FORBIDDEN"
      );
    }

    const passwordHash = await hashPassword(input.password);

    const [createdAdmin] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email,
        phone: null,
        passwordHash,
        roleId: adminRole.id,
        isActive: true,
        isVerified: true,
      })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      });

    return {
      status: "created",
      admin: {
        id: createdAdmin.id,
        fullName: createdAdmin.fullName,
        email: createdAdmin.email,
        role: "admin",
        isVerified: createdAdmin.isVerified,
        createdAt: createdAdmin.createdAt.toISOString(),
      },
    };
  });
}

async function runCli(): Promise<void> {
  try {
    const result = await bootstrapInitialAdmin(process.env);
    if (result.status === "already_exists") {
      console.log(
        `[admin:bootstrap] Administrator already exists (id=${result.admin.id}, email=${result.admin.email}). No changes applied.`
      );
      return;
    }

    console.log(
      `[admin:bootstrap] Initial administrator created (id=${result.admin.id}, email=${result.admin.email}, role=${result.admin.role}).`
    );
  } catch (err: unknown) {
    if (err instanceof BootstrapAdminError) {
      console.error(`[admin:bootstrap] Error (${err.code}): ${err.message}`);
    } else {
      const msg = err instanceof Error ? err.message : "Unexpected bootstrap failure.";
      console.error(`[admin:bootstrap] Failed: ${msg}`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  void runCli();
}
