import assert from "node:assert/strict";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { discardStagedProductImages } from "../services/productImageStorage.service.js";

test("discarding the last staged image removes its empty admin directory", async () => {
  const adminId = randomUUID();
  const uploadId = randomUUID();
  const adminDirectory = path.resolve(
    process.cwd(),
    "frontend/uploads/.product-image-staging",
    adminId
  );
  await mkdir(adminDirectory, { recursive: true });

  try {
    await writeFile(path.join(adminDirectory, `${uploadId}.jpg`), "staged image");
    await discardStagedProductImages(adminId, [uploadId]);
    await assert.rejects(stat(adminDirectory), { code: "ENOENT" });
  } finally {
    await rm(adminDirectory, { recursive: true, force: true });
  }
});
