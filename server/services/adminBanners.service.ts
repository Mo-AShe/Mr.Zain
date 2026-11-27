import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { banners } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  consumeStagedProductImage,
  discardStagedProductImages,
  removeStoredProductImage,
  removeStoredProductImageFile,
} from "./productImageStorage.service.js";
import type {
  CreateAdminBannerInput,
  UpdateAdminBannerInput,
} from "../validators/adminBanners.validators.js";

function toAdminBanner(row: typeof banners.$inferSelect) {
  return {
    id: row.id,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    subtitleEn: row.subtitleEn,
    subtitleAr: row.subtitleAr,
    imageUrl: row.imageUrl,
    targetUrl: row.targetUrl,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
  };
}

async function removeBannerImage(bannerId: string, imageUrl: string) {
  if (!imageUrl.startsWith(`/uploads/products/${bannerId}/`)) return;
  await removeStoredProductImage(imageUrl);
}

export async function listAdminBanners() {
  const rows = await db
    .select()
    .from(banners)
    .orderBy(asc(banners.displayOrder), asc(banners.id));
  return rows.map(toAdminBanner);
}

export async function createAdminBanner(
  adminId: string,
  input: CreateAdminBannerInput
) {
  const id = randomUUID();
  const uploadedImage = input.imageUploadId
    ? await consumeStagedProductImage(adminId, input.imageUploadId, id)
    : null;
  const imageUrl = uploadedImage?.imageUrl ?? input.imageUrl!;

  try {
    const [row] = await db
      .insert(banners)
      .values({
        id,
        titleEn: input.titleEn,
        titleAr: input.titleAr,
        subtitleEn: input.subtitleEn ?? null,
        subtitleAr: input.subtitleAr ?? null,
        imageUrl,
        targetUrl: input.targetUrl ?? null,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
      })
      .returning();
    return toAdminBanner(row);
  } catch (error) {
    if (uploadedImage) {
      await removeStoredProductImageFile(uploadedImage.absolutePath).catch((cleanupError) => {
        console.error("Could not clean up an incomplete banner image upload.", cleanupError);
      });
    }
    if (input.imageUploadId) {
      await discardStagedProductImages(adminId, [input.imageUploadId]).catch((cleanupError) => {
        console.error("Could not clean up a staged banner image upload.", cleanupError);
      });
    }
    throw error;
  }
}

export async function updateAdminBanner(
  bannerId: string,
  adminId: string,
  input: UpdateAdminBannerInput
) {
  const [existing] = await db
    .select()
    .from(banners)
    .where(eq(banners.id, bannerId))
    .limit(1);
  if (!existing) {
    throw new AppError("Banner not found.", 404, "BANNER_NOT_FOUND");
  }

  let replacementImage: Awaited<ReturnType<typeof consumeStagedProductImage>> | null =
    null;
  if (input.imageUploadId) {
    replacementImage = await consumeStagedProductImage(
      adminId,
      input.imageUploadId,
      bannerId
    );
  }

  let updatedRow: typeof banners.$inferSelect | null = null;
  try {
    const [row] = await db
      .update(banners)
      .set({
        ...(input.titleEn !== undefined ? { titleEn: input.titleEn } : {}),
        ...(input.titleAr !== undefined ? { titleAr: input.titleAr } : {}),
        ...(input.subtitleEn !== undefined ? { subtitleEn: input.subtitleEn } : {}),
        ...(input.subtitleAr !== undefined ? { subtitleAr: input.subtitleAr } : {}),
        ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(replacementImage ? { imageUrl: replacementImage.imageUrl } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      })
      .where(eq(banners.id, bannerId))
      .returning();
    if (!row) {
      throw new AppError("Banner not found.", 404, "BANNER_NOT_FOUND");
    }
    updatedRow = row;
  } catch (error) {
    if (replacementImage) {
      await removeStoredProductImageFile(replacementImage.absolutePath).catch(
        (cleanupError) => {
          console.error("Could not clean up an incomplete banner image replacement.", cleanupError);
        }
      );
    }
    if (input.imageUploadId) {
      await discardStagedProductImages(adminId, [input.imageUploadId]).catch(
        (cleanupError) => {
          console.error("Could not clean up a staged banner image upload.", cleanupError);
        }
      );
    }
    throw error;
  }

  if (!updatedRow) {
    throw new AppError("Banner not found.", 404, "BANNER_NOT_FOUND");
  }
  if (replacementImage || input.imageUrl) {
    await removeBannerImage(bannerId, existing.imageUrl);
  }
  return toAdminBanner(updatedRow);
}

export async function deleteAdminBanner(bannerId: string) {
  const [deleted] = await db
    .delete(banners)
    .where(eq(banners.id, bannerId))
    .returning({ id: banners.id, imageUrl: banners.imageUrl });
  if (!deleted) {
    throw new AppError("Banner not found.", 404, "BANNER_NOT_FOUND");
  }
  await removeBannerImage(deleted.id, deleted.imageUrl);
}
