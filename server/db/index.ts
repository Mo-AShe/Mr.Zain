import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

/**
 * Neon PostgreSQL connection pool with mandatory TLS/SSL.
 * Never log or expose DATABASE_URL.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: true,
  },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  sslEnabled: boolean;
  serverVersion?: string;
  error?: string;
}> {
  try {
    const client = await pool.connect();
    try {
      const versionResult = await client.query<{ version: string }>(
        "SELECT version()"
      );
      const sslResult = await client.query<{ ssl: boolean }>(
        "SELECT ssl_is_used() AS ssl"
      ).catch(() => ({ rows: [{ ssl: true }] }));

      return {
        connected: true,
        sslEnabled: Boolean(sslResult.rows[0]?.ssl ?? true),
        serverVersion: versionResult.rows[0]?.version,
      };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      connected: false,
      sslEnabled: false,
      error: err instanceof Error ? err.message : "Unknown database connection error",
    };
  }
}
