import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret:
    process.env.JWT_SECRET ||
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Missing required environment variable: JWT_SECRET");
      }
      return "mr_zain_fallback_dev_secret_change_me";
    })(),
  sessionSecret:
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Missing required environment variable: SESSION_SECRET");
      }
      return "mr_zain_fallback_dev_session_secret_change_me";
    })(),
  sessionCookieName: "mz_session",
  csrfCookieName: "mz_csrf",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  productImageStorageDir:
    process.env.PRODUCT_IMAGE_STORAGE_DIR || "frontend/uploads/products",
} as const;
