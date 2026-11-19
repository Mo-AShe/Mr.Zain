import { z } from "zod";

export function normalizeEgyptianPhone(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return raw as string;
  const cleaned = raw.replace(/[\s\-().]/g, "").trim();
  if (!cleaned) return null;

  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return `+20${cleaned.slice(1)}`;
  }
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^\+201[0125]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

export const registerSchema = z
  .object({
    fullName: z
      .string({ error: "Full name is required." })
      .trim()
      .min(2, "Full name must be at least 2 characters.")
      .max(150, "Full name must be at most 150 characters."),
    email: z
      .string({ error: "Email address is required." })
      .trim()
      .toLowerCase()
      .email("Please enter a valid email address.")
      .max(255, "Email address must be at most 255 characters."),
    password: z
      .string({ error: "Password is required." })
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be at most 128 characters.")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
      .regex(/[a-z]/, "Password must include at least one lowercase letter.")
      .regex(/\d/, "Password must include at least one number."),
    confirmPassword: z.string().optional(),
    phone: z.preprocess(
      (val) => normalizeEgyptianPhone(val),
      z
        .string()
        .regex(
          /^\+201[0125]\d{8}$/,
          "Please enter a valid Egyptian mobile number (e.g. +20 100 123 4567 or 01001234567)."
        )
        .nullable()
        .optional()
    ),
  })
  .refine(
    (data) => data.confirmPassword === undefined || data.confirmPassword === data.password,
    {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    }
  );

export const loginSchema = z.object({
  email: z
    .string({ error: "Email address is required." })
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address.")
    .max(255),
  password: z
    .string({ error: "Password is required." })
    .min(1, "Password is required.")
    .max(128),
  rememberMe: z.boolean().optional().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
