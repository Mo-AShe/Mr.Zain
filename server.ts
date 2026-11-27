import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./server/config/env.js";
import { checkDatabaseConnection, pool } from "./server/db/index.js";
import { errorHandler, notFoundApiHandler } from "./server/middleware/errorHandler.js";
import { v1Router } from "./server/routes/v1/index.js";
import { getProductImageStorageDir } from "./server/services/productImageStorage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "frontend");

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Backend REST API under /api/v1
  app.use("/api/v1", v1Router);
  app.use("/api", notFoundApiHandler);

  app.use("/uploads/products", express.static(getProductImageStorageDir()));

  // Serve MR. ZAIN HTML5/CSS3/Vanilla JS frontend on the same port
  app.use(express.static(frontendDir));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.use(errorHandler);
  return app;
}

const app = createApp();

async function startServer() {
  const dbStatus = await checkDatabaseConnection();
  if (!dbStatus.connected) {
    console.error("Failed to connect to Neon PostgreSQL:", dbStatus.error);
  } else {
    console.log("Connected to Neon PostgreSQL (SSL:", dbStatus.sslEnabled, ")");
  }

  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`MR. ZAIN integrated server listening on port ${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
