import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

const imageTypes = {
  "image/jpeg": { extension: "jpg", matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  "image/png": { extension: "png", matches: (data: Buffer) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: "webp", matches: (data: Buffer) => data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storageRoot = path.resolve(process.cwd(), env.productImageStorageDir);
const stagingRoot = path.resolve(storageRoot, "..", ".product-image-staging");
const stagedFileMaxAgeMs = 24 * 60 * 60 * 1000;
let lastStagingCleanupAt = 0;

async function removeEmptyDirectory(directoryPath: string): Promise<void> {
  await rmdir(directoryPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
  });
}

export interface StoredProductImage {
  imageUrl: string;
  absolutePath: string;
}

export function validateProductImageUpload(
  data: Buffer,
  declaredMimeType: string
): keyof typeof imageTypes {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new AppError("Choose a non-empty image file.", 422, "IMAGE_REQUIRED");
  }
  if (data.length > env.maxUploadBytes) {
    throw new AppError(
      `Image files must be ${Math.floor(env.maxUploadBytes / (1024 * 1024))} MB or smaller.`,
      413,
      "IMAGE_TOO_LARGE"
    );
  }

  const mimeType = declaredMimeType.split(";")[0].trim().toLowerCase();
  const type = imageTypes[mimeType as keyof typeof imageTypes];
  if (!type || !type.matches(data)) {
    throw new AppError(
      "Upload a valid JPEG, PNG, or WebP image.",
      415,
      "INVALID_IMAGE_TYPE"
    );
  }
  return mimeType as keyof typeof imageTypes;
}

async function cleanupExpiredStagedImages(): Promise<void> {
  if (Date.now() - lastStagingCleanupAt < 60 * 60 * 1000) return;
  lastStagingCleanupAt = Date.now();

  let adminDirectories;
  try {
    adminDirectories = await readdir(stagingRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const directory of adminDirectories) {
    if (!directory.isDirectory() || !uuidPattern.test(directory.name)) continue;
    const adminDirectory = path.join(stagingRoot, directory.name);
    for (const fileName of await readdir(adminDirectory)) {
      const filePath = path.join(adminDirectory, fileName);
      const fileInfo = await stat(filePath);
      if (Date.now() - fileInfo.mtimeMs > stagedFileMaxAgeMs) {
        await rm(filePath, { force: true });
      }
    }
    const remaining = await readdir(adminDirectory);
    if (remaining.length === 0) await removeEmptyDirectory(adminDirectory);
  }
}

export async function stageProductImage(
  adminId: string,
  data: Buffer,
  declaredMimeType: string
): Promise<string> {
  const mimeType = validateProductImageUpload(data, declaredMimeType);
  const uploadId = randomUUID();
  const adminDirectory = path.join(stagingRoot, adminId);
  await cleanupExpiredStagedImages();
  await mkdir(adminDirectory, { recursive: true, mode: 0o750 });
  await writeFile(
    path.join(adminDirectory, `${uploadId}.${imageTypes[mimeType].extension}`),
    data,
    { flag: "wx", mode: 0o640 }
  );
  return uploadId;
}

export async function consumeStagedProductImage(
  adminId: string,
  uploadId: string,
  productId: string
): Promise<StoredProductImage> {
  if (!uuidPattern.test(uploadId) || !uuidPattern.test(adminId)) {
    throw new AppError("Invalid image upload reference.", 422, "INVALID_IMAGE_UPLOAD");
  }

  const adminDirectory = path.join(stagingRoot, adminId);
  let stagedFiles: string[];
  try {
    stagedFiles = await readdir(adminDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(
        "An uploaded image is missing or has expired. Upload it again.",
        422,
        "IMAGE_UPLOAD_EXPIRED"
      );
    }
    throw error;
  }
  const stagedName = stagedFiles.find((name) =>
    new RegExp(`^${uploadId}\\.(jpg|png|webp)$`, "i").test(name)
  );
  if (!stagedName) {
    throw new AppError(
      "An uploaded image is missing or has expired. Upload it again.",
      422,
      "IMAGE_UPLOAD_EXPIRED"
    );
  }

  const productDirectory = path.join(storageRoot, productId);
  await mkdir(productDirectory, { recursive: true, mode: 0o750 });
  const finalName = `${randomUUID()}${path.extname(stagedName).toLowerCase()}`;
  const absolutePath = path.join(productDirectory, finalName);
  await rename(path.join(adminDirectory, stagedName), absolutePath);

  return {
    imageUrl: `/uploads/products/${productId}/${finalName}`,
    absolutePath,
  };
}

export async function removeStoredProductImage(imageUrl: string): Promise<void> {
  if (!imageUrl.startsWith("/uploads/products/")) return;
  const relativePath = imageUrl.slice("/uploads/products/".length);
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(relativePath)) {
    return;
  }
  const absolutePath = path.resolve(storageRoot, relativePath);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) return;
  await rm(absolutePath, { force: true });
}

export async function removeStoredProductImageFile(
  absolutePath: string
): Promise<void> {
  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new AppError("Invalid stored image path.", 500, "INVALID_IMAGE_PATH");
  }
  await rm(resolvedPath, { force: true });
}

export async function discardStagedProductImages(
  adminId: string,
  uploadIds: string[]
): Promise<void> {
  if (!uuidPattern.test(adminId)) return;
  const adminDirectory = path.join(stagingRoot, adminId);
  for (const uploadId of uploadIds) {
    if (!uuidPattern.test(uploadId)) continue;
    for (const extension of ["jpg", "png", "webp"]) {
      await rm(path.join(adminDirectory, `${uploadId}.${extension}`), {
        force: true,
      });
    }
  }
  const remaining = await readdir(adminDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (remaining.length === 0) {
    await removeEmptyDirectory(adminDirectory);
  }
}

export function getProductImageStorageDir(): string {
  return storageRoot;
}
