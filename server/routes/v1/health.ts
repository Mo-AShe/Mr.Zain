import { Router } from "express";
import { checkDatabaseConnection } from "../../db/index.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const dbStatus = await checkDatabaseConnection();
  const statusCode = dbStatus.connected ? 200 : 503;

  res.status(statusCode).json({
    success: dbStatus.connected,
    service: "mr-zain-api",
    timestamp: new Date().toISOString(),
    database: {
      provider: "neon-postgresql",
      connected: dbStatus.connected,
      sslEnabled: dbStatus.sslEnabled,
      ...(dbStatus.connected
        ? { serverVersion: dbStatus.serverVersion?.split(" on ")[0] }
        : { error: "Database connection unavailable" }),
    },
  });
});
