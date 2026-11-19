import "dotenv/config";
import { eq } from "drizzle-orm";
import { checkDatabaseConnection, db, pool } from "./index.js";
import { websiteSettings } from "./schema.js";
import { seedFoundationalData } from "./seed.js";

async function verifyDatabase() {
  const conn = await checkDatabaseConnection();
  if (!conn.connected) {
    throw new Error(`Neon connection failed: ${conn.error}`);
  }

  await seedFoundationalData();

  const tablesRes = await pool.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );

  const fkRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM information_schema.table_constraints
     WHERE constraint_schema = 'public'
       AND constraint_type = 'FOREIGN KEY'`
  );

  const idxRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM pg_indexes
     WHERE schemaname = 'public'`
  );

  const checkRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM information_schema.table_constraints
     WHERE constraint_schema = 'public'
       AND constraint_type = 'CHECK'`
  );

  const migRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM drizzle.__drizzle_migrations`
  );

  // Test inserting, retrieving, and cleaning up a verification record
  const testKey = "__neon_verification_probe__";
  const testValue = `verified_${Date.now()}`;

  await db
    .insert(websiteSettings)
    .values({ settingKey: testKey, settingValue: testValue })
    .onConflictDoUpdate({
      target: websiteSettings.settingKey,
      set: { settingValue: testValue },
    });

  const [fetched] = await db
    .select()
    .from(websiteSettings)
    .where(eq(websiteSettings.settingKey, testKey));

  if (!fetched || fetched.settingValue !== testValue) {
    throw new Error("Insert/retrieve verification check failed.");
  }

  await db.delete(websiteSettings).where(eq(websiteSettings.settingKey, testKey));

  const postConn = await checkDatabaseConnection();

  console.log(
    JSON.stringify(
      {
        connection: {
          connected: conn.connected,
          sslEnabled: conn.sslEnabled,
          poolMax: pool.options.max,
          serverVersion: conn.serverVersion?.split(" on ")[0],
        },
        migrationsApplied: Number(migRes.rows[0]?.count ?? 0),
        tableCount: tablesRes.rows.length,
        tables: tablesRes.rows.map((r) => r.tablename),
        foreignKeysCount: Number(fkRes.rows[0]?.count ?? 0),
        indexesCount: Number(idxRes.rows[0]?.count ?? 0),
        checkConstraintsCount: Number(checkRes.rows[0]?.count ?? 0),
        insertRetrieveRoundTrip: "passed",
        postTestConnectionHealthy: postConn.connected,
      },
      null,
      2
    )
  );
}

verifyDatabase()
  .catch((err) => {
    console.error("Database verification failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
