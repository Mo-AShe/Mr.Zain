import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  categories,
  collections,
  inventory,
  inventoryMovements,
  orderItems,
  productCollections,
  productImages,
  products,
  productVariants,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import { getProductPublicationReadiness } from "./product-publication.js";
import {
  getBestSellerProductIds,
  isWithinNewProductWindow,
} from "./product-merchandising.service.js";
import {
  consumeStagedProductImage,
  discardStagedProductImages,
  removeStoredProductImage,
  removeStoredProductImageFile,
} from "./productImageStorage.service.js";
import {
  slugifyText,
  type AdminCategoriesQuery,
  type AdminCollectionsQuery,
  type AdminProductsQuery,
  type CreateAdminCategoryInput,
  type CreateAdminCollectionInput,
  type CreateAdminProductInput,
  type CreateVariantInput,
  type UpdateAdminCategoryInput,
  type UpdateAdminCollectionInput,
  type UpdateAdminProductInput,
  type UpdateProductImageInput,
  type UpdateVariantInput,
} from "../validators/adminCatalog.validators.js";

export interface AdminVariantDTO {
  id: string;
  productId: string;
  size: string;
  color: string;
  price: number;
  isActive: boolean;
  quantity: number;
  reservedQuantity: number;
  availableStock: number;
  createdAt: string;
}

export interface AdminProductImageDTO {
  id: string;
  productId: string;
  imageUrl: string;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
}

export interface AdminProductSummaryDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  basePrice: number;
  compareAtPrice: number | null;
  isPublished: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  category: {
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
    isActive: boolean;
  };
  primaryImageUrl: string | null;
  variantCount: number;
  activeVariantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductDetailDTO extends AdminProductSummaryDTO {
  description_en: string | null;
  description_ar: string | null;
  variants: AdminVariantDTO[];
  images: AdminProductImageDTO[];
  collections: Array<{
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
    isActive: boolean;
  }>;
  hasOrderReferences: boolean;
  publicationReadiness: ReturnType<typeof getProductPublicationReadiness>;
}

export interface AdminCategoryDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  isActive: boolean;
  displayOrder: number;
  productCount: number;
  publishedProductCount: number;
}

export interface AdminCollectionDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  isActive: boolean;
  productCount: number;
  publishedProductCount: number;
}

export interface AdminCollectionDetailDTO extends AdminCollectionDTO {
  products: Array<{
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
    basePrice: number;
    isPublished: boolean;
    imageUrl: string | null;
  }>;
}

function getPgErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code?: unknown }).code ?? "");
  }
  return "";
}

function formatMoneyStr(val: number): string {
  return (Math.round((val + Number.EPSILON) * 100) / 100).toFixed(2);
}

function resolveSlugOrThrow(
  explicitSlug: string | undefined,
  fallbackName: string,
  maxLength = 220
): string {
  const candidate =
    explicitSlug ||
    slugifyText(fallbackName).slice(0, maxLength).replace(/-+$/g, "");
  if (!candidate || candidate.length < 2) {
    throw new AppError(
      "Unable to generate a valid URL slug. Please provide an explicit lowercase slug.",
      422,
      "INVALID_SLUG"
    );
  }
  if (candidate.length > maxLength) {
    throw new AppError(
      `Slug must be at most ${maxLength} characters.`,
      422,
      "INVALID_SLUG"
    );
  }
  return candidate;
}

// ============================================================================
// Products
// ============================================================================

export async function listAdminProducts(query: AdminProductsQuery) {
  const conditions = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      sql`(${products.nameEn} ILIKE ${pattern} OR ${products.nameAr} ILIKE ${pattern} OR ${products.slug} ILIKE ${pattern})`
    );
  }

  if (query.categoryId) {
    conditions.push(eq(products.categoryId, query.categoryId));
  }

  if (query.published === "published") {
    conditions.push(eq(products.isPublished, true));
  } else if (query.published === "unpublished") {
    conditions.push(eq(products.isPublished, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRes] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(whereClause);

  const total = Number(countRes?.total ?? 0);
  const offset = (query.page - 1) * query.limit;

  let orderByClauses;
  switch (query.sort) {
    case "oldest":
      orderByClauses = [asc(products.createdAt)];
      break;
    case "name_asc":
      orderByClauses = [asc(products.nameEn), desc(products.createdAt)];
      break;
    case "price_asc":
      orderByClauses = [asc(products.basePrice), desc(products.createdAt)];
      break;
    case "price_desc":
      orderByClauses = [desc(products.basePrice), desc(products.createdAt)];
      break;
    case "newest":
    default:
      orderByClauses = [desc(products.createdAt)];
      break;
  }

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      nameEn: products.nameEn,
      nameAr: products.nameAr,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      isPublished: products.isPublished,
      isFeatured: products.isFeatured,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryNameEn: categories.nameEn,
      categoryNameAr: categories.nameAr,
      categoryIsActive: categories.isActive,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(whereClause)
    .orderBy(...orderByClauses)
    .limit(query.limit)
    .offset(offset);

  if (rows.length === 0) {
    return {
      items: [] as AdminProductSummaryDTO[],
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  const productIds = rows.map((r) => r.id);

  const [imgRows, varRows, bestSellerProductIds] = await Promise.all([
    db
      .select({
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder)),
    db
      .select({
        productId: productVariants.productId,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds))
      .orderBy(asc(productVariants.createdAt)),
    getBestSellerProductIds(),
  ]);

  const primaryImageMap = new Map<string, string>();
  for (const img of imgRows) {
    if (!primaryImageMap.has(img.productId)) {
      primaryImageMap.set(img.productId, img.imageUrl);
    }
  }

  const variantMetaMap = new Map<
    string,
    { total: number; active: number }
  >();
  for (const v of varRows) {
    const cur = variantMetaMap.get(v.productId) ?? {
      total: 0,
      active: 0,
    };
    cur.total += 1;
    if (v.isActive) cur.active += 1;
    variantMetaMap.set(v.productId, cur);
  }

  const items: AdminProductSummaryDTO[] = rows.map((row) => {
    const vMeta = variantMetaMap.get(row.id) ?? {
      total: 0,
      active: 0,
    };
    return {
      id: row.id,
      slug: row.slug,
      name_en: row.nameEn,
      name_ar: row.nameAr,
      basePrice: Number(row.basePrice),
      compareAtPrice:
        row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
      isPublished: row.isPublished,
      isFeatured: row.isFeatured,
      isNew: isWithinNewProductWindow(row.createdAt),
      isBestSeller: bestSellerProductIds.has(row.id),
      category: {
        id: row.categoryId,
        slug: row.categorySlug,
        name_en: row.categoryNameEn,
        name_ar: row.categoryNameAr,
        isActive: row.categoryIsActive,
      },
      primaryImageUrl: primaryImageMap.get(row.id) ?? null,
      variantCount: vMeta.total,
      activeVariantCount: vMeta.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAdminProductById(
  productId: string
): Promise<AdminProductDetailDTO | null> {
  const [row] = await db
    .select({
      id: products.id,
      slug: products.slug,
      nameEn: products.nameEn,
      nameAr: products.nameAr,
      descriptionEn: products.descriptionEn,
      descriptionAr: products.descriptionAr,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      isPublished: products.isPublished,
      isFeatured: products.isFeatured,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryNameEn: categories.nameEn,
      categoryNameAr: categories.nameAr,
      categoryIsActive: categories.isActive,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) return null;

  const [variantRows, imageRows, colRows, bestSellerProductIds] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        isActive: productVariants.isActive,
        createdAt: productVariants.createdAt,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, row.id))
      .orderBy(asc(productVariants.createdAt)),
    db
      .select({
        id: productImages.id,
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
        altText: productImages.altText,
        displayOrder: productImages.displayOrder,
        isPrimary: productImages.isPrimary,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder)),
    db
      .select({
        id: collections.id,
        slug: collections.slug,
        nameEn: collections.nameEn,
        nameAr: collections.nameAr,
        isActive: collections.isActive,
      })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(eq(productCollections.productId, row.id))
      .orderBy(asc(collections.nameEn)),
    getBestSellerProductIds(),
  ]);

  let hasOrderReferences = false;
  if (variantRows.length > 0) {
    const variantIds = variantRows.map((v) => v.id);
    const [orderRef] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(inArray(orderItems.variantId, variantIds))
      .limit(1);
    if (orderRef) {
      hasOrderReferences = true;
    } else {
      const [movRef] = await db
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(inArray(inventoryMovements.variantId, variantIds))
        .limit(1);
      hasOrderReferences = Boolean(movRef);
    }
  }

  const variants: AdminVariantDTO[] = variantRows.map((v) => {
    const qty = Number(v.quantity ?? 0);
    const reserved = Number(v.reservedQuantity ?? 0);
    return {
      id: v.id,
      productId: v.productId,
      size: v.size,
      color: v.color,
      price: Number(v.price),
      isActive: v.isActive,
      quantity: qty,
      reservedQuantity: reserved,
      availableStock: Math.max(0, qty - reserved),
      createdAt: v.createdAt.toISOString(),
    };
  });
  const publicationReadiness = getProductPublicationReadiness(
    row.categoryIsActive,
    variantRows.map((variant) => ({
      isActive: variant.isActive,
      quantity: Number(variant.quantity ?? 0),
      reservedQuantity: Number(variant.reservedQuantity ?? 0),
    })),
    imageRows.some((image) => image.imageUrl.trim() !== "")
  );

  const images: AdminProductImageDTO[] = imageRows.map((img) => ({
    id: img.id,
    productId: img.productId,
    imageUrl: img.imageUrl,
    altText: img.altText,
    displayOrder: img.displayOrder,
    isPrimary: img.isPrimary,
  }));

  return {
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    basePrice: Number(row.basePrice),
    compareAtPrice:
      row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
    isPublished: row.isPublished,
    isFeatured: row.isFeatured,
    isNew: isWithinNewProductWindow(row.createdAt),
    isBestSeller: bestSellerProductIds.has(row.id),
    category: {
      id: row.categoryId,
      slug: row.categorySlug,
      name_en: row.categoryNameEn,
      name_ar: row.categoryNameAr,
      isActive: row.categoryIsActive,
    },
    primaryImageUrl: images[0]?.imageUrl ?? null,
    variantCount: variants.length,
    activeVariantCount: variants.filter((v) => v.isActive).length,
    variants,
    images,
    collections: colRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name_en: c.nameEn,
      name_ar: c.nameAr,
      isActive: c.isActive,
    })),
    hasOrderReferences,
    publicationReadiness,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createAdminProduct(
  input: CreateAdminProductInput,
  adminId: string
): Promise<AdminProductDetailDTO> {
  const uploadIds = input.imageUploadIds ?? [];
  const imageUrls = input.imageUrls ?? [];
  if (uploadIds.length === 0 && imageUrls.length === 0) {
    throw new AppError("At least one product image is required.", 422, "IMAGE_REQUIRED");
  }
  if (input.isPublished) {
    throw new AppError(
      "Create the product as a draft, then add an active variant and available stock before publishing.",
      409,
      "PRODUCT_NOT_READY"
    );
  }

  const slug = resolveSlugOrThrow(input.slug, input.nameEn);
  const productId = randomUUID();
  const storedImages: Array<{ imageUrl: string; absolutePath: string }> = [];

  try {
    await db.transaction(async (tx) => {
      const [category] = await tx
        .select({ id: categories.id, isActive: categories.isActive })
        .from(categories)
        .where(eq(categories.id, input.categoryId))
        .for("update")
        .limit(1);
      if (!category) {
        throw new AppError("Selected category does not exist.", 404, "CATEGORY_NOT_FOUND");
      }
      if (!category.isActive) {
        throw new AppError("Products must be assigned to an active category.", 409, "CATEGORY_INACTIVE");
      }

      const [existingSlug] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1);
      if (existingSlug) {
        throw new AppError(
          "A product with this slug already exists.",
          409,
          "SLUG_ALREADY_EXISTS"
        );
      }

      await tx
        .insert(products)
        .values({
          id: productId,
          categoryId: input.categoryId,
          nameEn: input.nameEn,
          nameAr: input.nameAr,
          slug,
          descriptionEn: input.descriptionEn ?? null,
          descriptionAr: input.descriptionAr ?? null,
          basePrice: formatMoneyStr(input.basePrice),
          compareAtPrice:
            input.compareAtPrice !== undefined && input.compareAtPrice !== null
              ? formatMoneyStr(input.compareAtPrice)
              : null,
          isPublished: false,
          isFeatured: Boolean(input.isFeatured),
        });

      const sourceUrls = uploadIds.length
        ? await Promise.all(
            uploadIds.map(async (uploadId) => {
              const stored = await consumeStagedProductImage(adminId, uploadId, productId);
              storedImages.push(stored);
              return stored.imageUrl;
            })
          )
        : imageUrls;

      for (const [displayOrder, imageUrl] of sourceUrls.entries()) {
        await tx.insert(productImages).values({
          productId,
          imageUrl,
          altText: input.nameEn,
          displayOrder,
          isPrimary: displayOrder === 0,
        });
      }
    });
  } catch (err) {
    const cleanupResults = await Promise.allSettled([
      ...storedImages.map((image) =>
        removeStoredProductImageFile(image.absolutePath)
      ),
      discardStagedProductImages(adminId, uploadIds),
    ]);
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        console.error("Could not clean up an incomplete product image upload.", result.reason);
      }
    }
    if (err instanceof AppError) throw err;
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A product with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }

  await discardStagedProductImages(adminId, uploadIds).catch((cleanupError) => {
    console.error("Could not remove the consumed product image staging directory.", cleanupError);
  });
  const detail = await getAdminProductById(productId);
  if (!detail) {
    throw new AppError("Failed to load created product.", 500, "INTERNAL_SERVER_ERROR");
  }
  return detail;
}

export async function updateAdminProduct(
  productId: string,
  input: UpdateAdminProductInput
): Promise<AdminProductDetailDTO> {
  const [existing] = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!existing) {
    throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  }

  const nextBasePrice =
    input.basePrice !== undefined ? input.basePrice : Number(existing.basePrice);
  const nextCompareAtPrice =
    input.compareAtPrice !== undefined
      ? input.compareAtPrice
      : existing.compareAtPrice !== null
      ? Number(existing.compareAtPrice)
      : null;

  if (nextCompareAtPrice !== null && nextCompareAtPrice < nextBasePrice) {
    throw new AppError(
      "Compare-at price must be greater than or equal to base price.",
      422,
      "VALIDATION_ERROR"
    );
  }

  if (input.slug !== undefined) {
    const [dup] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.slug, input.slug), ne(products.id, productId)))
      .limit(1);
    if (dup) {
      throw new AppError(
        "A product with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
  }

  const updateValues: Partial<typeof products.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.categoryId !== undefined) updateValues.categoryId = input.categoryId;
  if (input.nameEn !== undefined) updateValues.nameEn = input.nameEn;
  if (input.nameAr !== undefined) updateValues.nameAr = input.nameAr;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.descriptionEn !== undefined) updateValues.descriptionEn = input.descriptionEn;
  if (input.descriptionAr !== undefined) updateValues.descriptionAr = input.descriptionAr;
  if (input.basePrice !== undefined) updateValues.basePrice = formatMoneyStr(input.basePrice);
  if (input.compareAtPrice !== undefined) {
    updateValues.compareAtPrice =
      input.compareAtPrice !== null ? formatMoneyStr(input.compareAtPrice) : null;
  }
  if (input.isPublished !== undefined) updateValues.isPublished = input.isPublished;
  if (input.isFeatured !== undefined) updateValues.isFeatured = input.isFeatured;

  try {
    await db.transaction(async (tx) => {
      const [lockedProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .for("update")
        .limit(1);
      if (!lockedProduct) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
      }

      if (
        input.categoryId !== undefined &&
        input.categoryId !== existing.categoryId &&
        input.isPublished !== true
      ) {
        const [category] = await tx
          .select({ isActive: categories.isActive })
          .from(categories)
          .where(eq(categories.id, input.categoryId))
          .for("update")
          .limit(1);
        if (!category) {
          throw new AppError("Selected category does not exist.", 404, "CATEGORY_NOT_FOUND");
        }
        if (!category.isActive) {
          throw new AppError("Products must be assigned to an active category.", 409, "CATEGORY_INACTIVE");
        }
      }

      if (input.isPublished === true) {
        const categoryId = input.categoryId ?? existing.categoryId;
        const [category] = await tx
          .select({ isActive: categories.isActive })
          .from(categories)
          .where(eq(categories.id, categoryId))
          .for("update")
          .limit(1);
        if (!category) {
          throw new AppError("Selected category does not exist.", 404, "CATEGORY_NOT_FOUND");
        }

        const activeVariants = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isActive, true)
            )
          )
          .orderBy(asc(productVariants.id))
          .for("update");
        const stockRows =
          activeVariants.length > 0
            ? await tx
                .select({
                  variantId: inventory.variantId,
                  quantity: inventory.quantity,
                  reservedQuantity: inventory.reservedQuantity,
                })
                .from(inventory)
                .where(inArray(inventory.variantId, activeVariants.map((v) => v.id)))
                .orderBy(asc(inventory.variantId))
                .for("update")
            : [];
        const stockByVariantId = new Map(
          stockRows.map((row) => [row.variantId, row])
        );
        const [productImage] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(eq(productImages.productId, productId))
          .limit(1);
        const readiness = getProductPublicationReadiness(
          category.isActive,
          activeVariants.map((variant) => {
            const stock = stockByVariantId.get(variant.id);
            return {
              isActive: true,
              quantity: stock?.quantity ?? 0,
              reservedQuantity: stock?.reservedQuantity ?? 0,
            };
          }),
          Boolean(productImage)
        );
        if (!readiness.canPublish) {
          throw new AppError(
            "Product is not ready to publish. Add a product image, choose an active category, and add an active variant with available stock.",
            409,
            "PRODUCT_NOT_READY"
          );
        }
      }

      await tx
        .update(products)
        .set(updateValues)
        .where(eq(products.id, productId));
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A product with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }

  const detail = await getAdminProductById(productId);
  if (!detail) {
    throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  }
  return detail;
}

export async function deleteOrArchiveAdminProduct(productId: string) {
  const actionResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!existing) {
      throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }
    const images = await tx
      .select({ imageUrl: productImages.imageUrl })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    const varRows = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, productId));

    let isReferenced = false;
    if (varRows.length > 0) {
      const variantIds = varRows.map((v) => v.id);
      const [orderRef] = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(inArray(orderItems.variantId, variantIds))
        .limit(1);
      if (orderRef) {
        isReferenced = true;
      } else {
        const [movRef] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(inArray(inventoryMovements.variantId, variantIds))
          .limit(1);
        isReferenced = Boolean(movRef);
      }
    }

    if (isReferenced) {
      await tx
        .update(products)
        .set({
          isPublished: false,
          isFeatured: false,
          isNew: false,
          isBestSeller: false,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await tx
        .update(productVariants)
        .set({ isActive: false })
        .where(eq(productVariants.productId, productId));

      return { action: "archived" as const };
    }

    await tx.delete(products).where(eq(products.id, productId));
    return { action: "deleted" as const, imageUrls: images.map((image) => image.imageUrl) };
  });

  if (actionResult.action === "archived") {
    const product = await getAdminProductById(productId);
    return { action: "archived" as const, product };
  }

  const cleanupResults = await Promise.allSettled(
    actionResult.imageUrls.map((imageUrl) => removeStoredProductImage(imageUrl))
  );
  for (const result of cleanupResults) {
    if (result.status === "rejected") {
      console.error("Could not remove a product image after deleting the product.", result.reason);
    }
  }
  return { action: "deleted" as const, productId };
}

// ============================================================================
// Product Variants (Zero stock adjustments in Stage 7.3)
// ============================================================================

export async function createProductVariant(
  productId: string,
  input: CreateVariantInput
): Promise<AdminVariantDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [prod] = await tx
        .select({ id: products.id, basePrice: products.basePrice })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!prod) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
      }

      const [comboDup] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, productId),
            sql`lower(btrim(${productVariants.size})) = lower(${input.size})`,
            sql`lower(btrim(${productVariants.color})) = lower(${input.color})`
          )
        )
        .limit(1);

      if (comboDup) {
        throw new AppError(
          "A variant with this size and color already exists for this product.",
          409,
          "VARIANT_DUPLICATE"
        );
      }

      const variantPrice =
        input.price !== undefined
          ? formatMoneyStr(input.price)
          : formatMoneyStr(Number(prod.basePrice));
      const internalSku = `MZ-${randomUUID().replaceAll("-", "").toUpperCase()}`;

      const [created] = await tx
        .insert(productVariants)
        .values({
          productId,
          sku: internalSku,
          size: input.size,
          color: input.color,
          price: variantPrice,
          isActive: Boolean(input.isActive),
        })
        .returning();

      // Initialize inventory safely at 0 available stock for Stage 7.4 stock management
      await tx
        .insert(inventory)
        .values({
          variantId: created.id,
          quantity: 0,
          reservedQuantity: 0,
          lowStockThreshold: 5,
        })
        .onConflictDoNothing({ target: inventory.variantId });

      return {
        id: created.id,
        productId: created.productId,
        size: created.size,
        color: created.color,
        price: Number(created.price),
        isActive: created.isActive,
        quantity: 0,
        reservedQuantity: 0,
        availableStock: 0,
        createdAt: created.createdAt.toISOString(),
      };
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A variant with this size and color already exists for this product.",
        409,
        "VARIANT_CONFLICT"
      );
    }
    throw err;
  }
}

export async function updateProductVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantInput
): Promise<AdminVariantDTO> {
  const [existing] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
  }

  const nextSize = input.size ?? existing.size;
  const nextColor = input.color ?? existing.color;
  if (input.size !== undefined || input.color !== undefined) {
    const [comboDup] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          sql`lower(btrim(${productVariants.size})) = lower(${nextSize})`,
          sql`lower(btrim(${productVariants.color})) = lower(${nextColor})`,
          ne(productVariants.id, variantId)
        )
      )
      .limit(1);
    if (comboDup) {
      throw new AppError(
        "A variant with this size and color already exists for this product.",
        409,
        "VARIANT_DUPLICATE"
      );
    }
  }

  const updates: Partial<typeof productVariants.$inferInsert> = {};
  if (input.size !== undefined) updates.size = input.size;
  if (input.color !== undefined) updates.color = input.color;
  if (input.price !== undefined) updates.price = formatMoneyStr(input.price);
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  try {
    await db
      .update(productVariants)
      .set(updates)
      .where(eq(productVariants.id, variantId));
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A variant with this size and color already exists for this product.",
        409,
        "VARIANT_CONFLICT"
      );
    }
    throw err;
  }

  const [hydrated] = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      size: productVariants.size,
      color: productVariants.color,
      price: productVariants.price,
      isActive: productVariants.isActive,
      createdAt: productVariants.createdAt,
      quantity: inventory.quantity,
      reservedQuantity: inventory.reservedQuantity,
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);

  const qty = Number(hydrated.quantity ?? 0);
  const reserved = Number(hydrated.reservedQuantity ?? 0);

  return {
    id: hydrated.id,
    productId: hydrated.productId,
    size: hydrated.size,
    color: hydrated.color,
    price: Number(hydrated.price),
    isActive: hydrated.isActive,
    quantity: qty,
    reservedQuantity: reserved,
    availableStock: Math.max(0, qty - reserved),
    createdAt: hydrated.createdAt.toISOString(),
  };
}

export async function deleteOrDeactivateProductVariant(
  productId: string,
  variantId: string
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
    }

    const [orderRef] = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.variantId, variantId))
      .limit(1);

    const [movRef] = !orderRef
      ? await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(eq(inventoryMovements.variantId, variantId))
          .limit(1)
      : [undefined];

    if (orderRef || movRef) {
      const [updated] = await tx
        .update(productVariants)
        .set({ isActive: false })
        .where(eq(productVariants.id, variantId))
        .returning();

      return {
        action: "deactivated" as const,
        variantId: updated.id,
      };
    }

    await tx.delete(productVariants).where(eq(productVariants.id, variantId));
    return {
      action: "deleted" as const,
      variantId,
    };
  });
}

// ============================================================================
// Product Images
// ============================================================================

export async function addProductImage(
  productId: string,
  adminId: string,
  uploadId: string
): Promise<AdminProductImageDTO> {
  let storedImage: Awaited<ReturnType<typeof consumeStagedProductImage>> | undefined;
  try {
    const newImage = await consumeStagedProductImage(adminId, uploadId, productId);
    storedImage = newImage;
    const created = await db.transaction(async (tx) => {
      const [prod] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .for("update")
        .limit(1);
      if (!prod) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
      }

      const [lastImage] = await tx
        .select({ displayOrder: productImages.displayOrder })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(desc(productImages.displayOrder))
        .limit(1);
      const currentImages = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, productId));
      if (currentImages.length >= 10) {
        throw new AppError("A product can have at most 10 images.", 422, "IMAGE_LIMIT_EXCEEDED");
      }
      const [image] = await tx
        .insert(productImages)
        .values({
          productId,
          imageUrl: newImage.imageUrl,
          altText: null,
          displayOrder: lastImage ? lastImage.displayOrder + 1 : 0,
          isPrimary: !lastImage,
        })
        .returning();
      return image;
    });
    await discardStagedProductImages(adminId, [uploadId]).catch((cleanupError) => {
      console.error("Could not remove the consumed product image staging directory.", cleanupError);
    });
    return {
      id: created.id,
      productId: created.productId,
      imageUrl: created.imageUrl,
      altText: created.altText,
      displayOrder: created.displayOrder,
      isPrimary: created.isPrimary,
    };
  } catch (error) {
    const cleanupResults = await Promise.allSettled([
      ...(storedImage ? [removeStoredProductImageFile(storedImage.absolutePath)] : []),
      discardStagedProductImages(adminId, [uploadId]),
    ]);
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        console.error("Could not clean up an incomplete product image upload.", result.reason);
      }
    }
    throw error;
  }
}

export async function replaceProductImage(
  productId: string,
  imageId: string,
  adminId: string,
  uploadId: string
): Promise<AdminProductImageDTO> {
  let storedImage: Awaited<ReturnType<typeof consumeStagedProductImage>> | undefined;
  try {
    storedImage = await consumeStagedProductImage(adminId, uploadId, productId);
  } catch (error) {
    await discardStagedProductImages(adminId, [uploadId]).catch((cleanupError) => {
      console.error("Could not clean up a staged replacement image.", cleanupError);
    });
    throw error;
  }

  let result: {
    existing: typeof productImages.$inferSelect;
    updated: typeof productImages.$inferSelect;
  };
  try {
    result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .for("update")
        .limit(1);
      if (!product) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
      }

      const [existing] = await tx
        .select()
        .from(productImages)
        .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
        .for("update")
        .limit(1);
      if (!existing) {
        throw new AppError("Product image not found.", 404, "IMAGE_NOT_FOUND");
      }

      const [updated] = await tx
        .update(productImages)
        .set({ imageUrl: storedImage.imageUrl })
        .where(eq(productImages.id, imageId))
        .returning();
      return { existing, updated };
    });
  } catch (error) {
    await removeStoredProductImageFile(storedImage.absolutePath).catch((cleanupError) => {
      console.error("Could not clean up a failed replacement image.", cleanupError);
    });
    await discardStagedProductImages(adminId, [uploadId]).catch((cleanupError) => {
      console.error("Could not clean up a staged replacement image.", cleanupError);
    });
    throw error;
  }

  await discardStagedProductImages(adminId, [uploadId]).catch((cleanupError) => {
    console.error("Could not remove the consumed replacement image staging directory.", cleanupError);
  });
  try {
    await removeStoredProductImage(result.existing.imageUrl);
  } catch (error) {
    console.error("The replacement image was saved, but the previous file could not be removed.", error);
    throw error;
  }
  return {
    id: result.updated.id,
    productId: result.updated.productId,
    imageUrl: result.updated.imageUrl,
    altText: result.updated.altText,
    displayOrder: result.updated.displayOrder,
    isPrimary: result.updated.isPrimary,
  };
}

export async function updateProductImage(
  productId: string,
  imageId: string,
  input: UpdateProductImageInput
): Promise<AdminProductImageDTO> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productImages)
      .where(
        and(eq(productImages.id, imageId), eq(productImages.productId, productId))
      )
      .limit(1);

    if (!existing) {
      throw new AppError("Product image not found.", 404, "IMAGE_NOT_FOUND");
    }

    if (input.isPrimary === true) {
      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(
          and(eq(productImages.productId, productId), ne(productImages.id, imageId))
        );
    }

    const updates: Partial<typeof productImages.$inferInsert> = {};
    if (input.altText !== undefined) updates.altText = input.altText;
    if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder;
    if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;

    const [updated] = await tx
      .update(productImages)
      .set(updates)
      .where(eq(productImages.id, imageId))
      .returning();

    return {
      id: updated.id,
      productId: updated.productId,
      imageUrl: updated.imageUrl,
      altText: updated.altText,
      displayOrder: updated.displayOrder,
      isPrimary: updated.isPrimary,
    };
  });
}

export async function reorderProductImages(
  productId: string,
  imageIds: string[]
): Promise<AdminProductImageDTO[]> {
  return db.transaction(async (tx) => {
    const existingRows = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    const existingSet = new Set(existingRows.map((r) => r.id));
    if (imageIds.length !== existingRows.length) {
      throw new AppError(
        "Reorder payload must include all images belonging to the product.",
        422,
        "INVALID_IMAGE_ORDER"
      );
    }

    for (const id of imageIds) {
      if (!existingSet.has(id)) {
        throw new AppError(
          "One or more image IDs do not belong to this product.",
          422,
          "INVALID_IMAGE_ORDER"
        );
      }
    }

    for (let idx = 0; idx < imageIds.length; idx++) {
      await tx
        .update(productImages)
        .set({ displayOrder: idx })
        .where(
          and(
            eq(productImages.id, imageIds[idx]),
            eq(productImages.productId, productId)
          )
        );
    }

    const reordered = await tx
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder));

    return reordered.map((img) => ({
      id: img.id,
      productId: img.productId,
      imageUrl: img.imageUrl,
      altText: img.altText,
      displayOrder: img.displayOrder,
      isPrimary: img.isPrimary,
    }));
  });
}

export async function deleteProductImage(productId: string, imageId: string) {
  const deleted = await db.transaction(async (tx) => {
    const [product] = await tx
      .select({ isPublished: products.isPublished })
      .from(products)
      .where(eq(products.id, productId))
      .for("update")
      .limit(1);
    if (!product) {
      throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }

    const [existing] = await tx
      .select()
      .from(productImages)
      .where(
        and(eq(productImages.id, imageId), eq(productImages.productId, productId))
      )
      .limit(1);

    if (!existing) {
      throw new AppError("Product image not found.", 404, "IMAGE_NOT_FOUND");
    }

    const imageCount = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    if (product.isPublished && imageCount.length <= 1) {
      throw new AppError(
        "Unpublish the product or add a replacement image before removing its last image.",
        409,
        "LAST_PUBLISHED_PRODUCT_IMAGE"
      );
    }

    await tx.delete(productImages).where(eq(productImages.id, imageId));

    if (existing.isPrimary) {
      const [nextImg] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(asc(productImages.displayOrder))
        .limit(1);

      if (nextImg) {
        await tx
          .update(productImages)
          .set({ isPrimary: true })
          .where(eq(productImages.id, nextImg.id));
      }
    }

    return { deletedImageId: imageId, imageUrl: existing.imageUrl };
  });
  await removeStoredProductImage(deleted.imageUrl);
  return { deletedImageId: deleted.deletedImageId };
}

// ============================================================================
// Categories
// ============================================================================

export async function listAdminCategories(
  query: AdminCategoriesQuery
): Promise<AdminCategoryDTO[]> {
  const conditions = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(categories.nameEn, pattern),
        ilike(categories.nameAr, pattern),
        ilike(categories.slug, pattern)
      )
    );
  }

  if (query.status === "active") {
    conditions.push(eq(categories.isActive, true));
  } else if (query.status === "inactive") {
    conditions.push(eq(categories.isActive, false));
  }

  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameEn: categories.nameEn,
      nameAr: categories.nameAr,
      descriptionEn: categories.descriptionEn,
      descriptionAr: categories.descriptionAr,
      isActive: categories.isActive,
      displayOrder: categories.displayOrder,
      productCount: sql<number>`COUNT(${products.id})::int`,
      publishedProductCount: sql<number>`COUNT(${products.id}) FILTER (WHERE ${products.isPublished} = true)::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(categories.id)
    .orderBy(asc(categories.displayOrder), asc(categories.nameEn));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    productCount: Number(row.productCount ?? 0),
    publishedProductCount: Number(row.publishedProductCount ?? 0),
  }));
}

export async function getAdminCategoryById(
  categoryId: string
): Promise<AdminCategoryDTO | null> {
  const [row] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameEn: categories.nameEn,
      nameAr: categories.nameAr,
      descriptionEn: categories.descriptionEn,
      descriptionAr: categories.descriptionAr,
      isActive: categories.isActive,
      displayOrder: categories.displayOrder,
      productCount: sql<number>`COUNT(${products.id})::int`,
      publishedProductCount: sql<number>`COUNT(${products.id}) FILTER (WHERE ${products.isPublished} = true)::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(eq(categories.id, categoryId))
    .groupBy(categories.id)
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    productCount: Number(row.productCount ?? 0),
    publishedProductCount: Number(row.publishedProductCount ?? 0),
  };
}

export async function createAdminCategory(
  input: CreateAdminCategoryInput
): Promise<AdminCategoryDTO> {
  const slug = resolveSlugOrThrow(input.slug, input.nameEn, 160);

  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (dup) {
    throw new AppError(
      "A category with this slug already exists.",
      409,
      "SLUG_ALREADY_EXISTS"
    );
  }

  try {
    const [created] = await db
      .insert(categories)
      .values({
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        slug,
        descriptionEn: input.descriptionEn ?? null,
        descriptionAr: input.descriptionAr ?? null,
        isActive: Boolean(input.isActive),
        displayOrder: input.displayOrder ?? 0,
      })
      .returning({ id: categories.id });

    const cat = await getAdminCategoryById(created.id);
    if (!cat) {
      throw new AppError("Failed to load category.", 500, "INTERNAL_SERVER_ERROR");
    }
    return cat;
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A category with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }
}

export async function updateAdminCategory(
  categoryId: string,
  input: UpdateAdminCategoryInput
): Promise<AdminCategoryDTO> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!existing) {
    throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  if (input.slug !== undefined) {
    const [dup] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, input.slug), ne(categories.id, categoryId)))
      .limit(1);
    if (dup) {
      throw new AppError(
        "A category with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
  }

  const updates: Partial<typeof categories.$inferInsert> = {};
  if (input.nameEn !== undefined) updates.nameEn = input.nameEn;
  if (input.nameAr !== undefined) updates.nameAr = input.nameAr;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.descriptionEn !== undefined) updates.descriptionEn = input.descriptionEn;
  if (input.descriptionAr !== undefined) updates.descriptionAr = input.descriptionAr;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder;

  try {
    await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, categoryId));
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A category with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }

  const cat = await getAdminCategoryById(categoryId);
  if (!cat) {
    throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }
  return cat;
}

export async function deleteAdminCategory(categoryId: string) {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!existing) {
    throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  const [linkedProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);

  if (linkedProduct) {
    throw new AppError(
      "Cannot delete this category while products are still assigned to it.",
      409,
      "CATEGORY_IN_USE"
    );
  }

  try {
    await db.delete(categories).where(eq(categories.id, categoryId));
  } catch (err) {
    if (getPgErrorCode(err) === "23503") {
      throw new AppError(
        "Cannot delete this category while products are still assigned to it.",
        409,
        "CATEGORY_IN_USE"
      );
    }
    throw err;
  }

  return { deletedCategoryId: categoryId };
}

// ============================================================================
// Collections
// ============================================================================

export async function listAdminCollections(
  query: AdminCollectionsQuery
): Promise<AdminCollectionDTO[]> {
  const conditions = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(collections.nameEn, pattern),
        ilike(collections.nameAr, pattern),
        ilike(collections.slug, pattern)
      )
    );
  }

  if (query.status === "active") {
    conditions.push(eq(collections.isActive, true));
  } else if (query.status === "inactive") {
    conditions.push(eq(collections.isActive, false));
  }

  const rows = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      nameEn: collections.nameEn,
      nameAr: collections.nameAr,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
      isActive: collections.isActive,
      productCount: sql<number>`COUNT(${products.id})::int`,
      publishedProductCount: sql<number>`COUNT(${products.id}) FILTER (WHERE ${products.isPublished} = true)::int`,
    })
    .from(collections)
    .leftJoin(
      productCollections,
      eq(productCollections.collectionId, collections.id)
    )
    .leftJoin(products, eq(products.id, productCollections.productId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(collections.id)
    .orderBy(asc(collections.nameEn));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    isActive: row.isActive,
    productCount: Number(row.productCount ?? 0),
    publishedProductCount: Number(row.publishedProductCount ?? 0),
  }));
}

export async function getAdminCollectionById(
  collectionId: string
): Promise<AdminCollectionDetailDTO | null> {
  const [colRow] = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      nameEn: collections.nameEn,
      nameAr: collections.nameAr,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
      isActive: collections.isActive,
    })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  if (!colRow) return null;

  const prodRows = await db
    .select({
      id: products.id,
      slug: products.slug,
      nameEn: products.nameEn,
      nameAr: products.nameAr,
      basePrice: products.basePrice,
      isPublished: products.isPublished,
    })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .where(eq(productCollections.collectionId, collectionId))
    .orderBy(desc(products.createdAt), asc(products.nameEn));

  const primaryImages = new Map<string, string>();
  if (prodRows.length > 0) {
    const imgRows = await db
      .select({
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          prodRows.map((p) => p.id)
        )
      )
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder));

    for (const img of imgRows) {
      if (!primaryImages.has(img.productId)) {
        primaryImages.set(img.productId, img.imageUrl);
      }
    }
  }

  const associatedProducts = prodRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name_en: p.nameEn,
    name_ar: p.nameAr,
    basePrice: Number(p.basePrice),
    isPublished: p.isPublished,
    imageUrl: primaryImages.get(p.id) ?? null,
  }));

  return {
    id: colRow.id,
    slug: colRow.slug,
    name_en: colRow.nameEn,
    name_ar: colRow.nameAr,
    description_en: colRow.descriptionEn,
    description_ar: colRow.descriptionAr,
    isActive: colRow.isActive,
    productCount: associatedProducts.length,
    publishedProductCount: associatedProducts.filter((p) => p.isPublished).length,
    products: associatedProducts,
  };
}

export async function createAdminCollection(
  input: CreateAdminCollectionInput
): Promise<AdminCollectionDetailDTO> {
  const slug = resolveSlugOrThrow(input.slug, input.nameEn, 160);

  const [dup] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);

  if (dup) {
    throw new AppError(
      "A collection with this slug already exists.",
      409,
      "SLUG_ALREADY_EXISTS"
    );
  }

  try {
    const [created] = await db
      .insert(collections)
      .values({
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        slug,
        descriptionEn: input.descriptionEn ?? null,
        descriptionAr: input.descriptionAr ?? null,
        isActive: Boolean(input.isActive),
      })
      .returning({ id: collections.id });

    const detail = await getAdminCollectionById(created.id);
    if (!detail) {
      throw new AppError("Failed to load collection.", 500, "INTERNAL_SERVER_ERROR");
    }
    return detail;
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A collection with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }
}

export async function updateAdminCollection(
  collectionId: string,
  input: UpdateAdminCollectionInput
): Promise<AdminCollectionDetailDTO> {
  const [existing] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  if (!existing) {
    throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }

  if (input.slug !== undefined) {
    const [dup] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.slug, input.slug), ne(collections.id, collectionId)))
      .limit(1);
    if (dup) {
      throw new AppError(
        "A collection with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
  }

  const updates: Partial<typeof collections.$inferInsert> = {};
  if (input.nameEn !== undefined) updates.nameEn = input.nameEn;
  if (input.nameAr !== undefined) updates.nameAr = input.nameAr;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.descriptionEn !== undefined) updates.descriptionEn = input.descriptionEn;
  if (input.descriptionAr !== undefined) updates.descriptionAr = input.descriptionAr;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  try {
    await db
      .update(collections)
      .set(updates)
      .where(eq(collections.id, collectionId));
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "A collection with this slug already exists.",
        409,
        "SLUG_ALREADY_EXISTS"
      );
    }
    throw err;
  }

  const detail = await getAdminCollectionById(collectionId);
  if (!detail) {
    throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }
  return detail;
}

export async function deleteAdminCollection(collectionId: string) {
  const [deleted] = await db
    .delete(collections)
    .where(eq(collections.id, collectionId))
    .returning({ id: collections.id });

  if (!deleted) {
    throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }

  return { deletedCollectionId: deleted.id };
}

export async function addProductToCollection(
  collectionId: string,
  productId: string
): Promise<AdminCollectionDetailDTO> {
  try {
    await db.transaction(async (tx) => {
      const [collection] = await tx
        .select({ id: collections.id, isActive: collections.isActive })
        .from(collections)
        .where(eq(collections.id, collectionId))
        .for("update")
        .limit(1);
      if (!collection) {
        throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
      }
      if (!collection.isActive) {
        throw new AppError(
          "Products cannot be added to an inactive collection.",
          409,
          "COLLECTION_INACTIVE"
        );
      }

      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product) {
        throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
      }

      await tx.insert(productCollections).values({ collectionId, productId });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (getPgErrorCode(err) === "23505") {
      throw new AppError(
        "This product is already assigned to the collection.",
        409,
        "COLLECTION_PRODUCT_EXISTS"
      );
    }
    throw err;
  }

  const detail = await getAdminCollectionById(collectionId);
  if (!detail) {
    throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }
  return detail;
}

export async function removeProductFromCollection(
  collectionId: string,
  productId: string
): Promise<AdminCollectionDetailDTO> {
  const [deleted] = await db
    .delete(productCollections)
    .where(
      and(
        eq(productCollections.collectionId, collectionId),
        eq(productCollections.productId, productId)
      )
    )
    .returning({ productId: productCollections.productId });

  if (!deleted) {
    throw new AppError(
      "Product association not found in this collection.",
      404,
      "COLLECTION_PRODUCT_NOT_FOUND"
    );
  }

  const detail = await getAdminCollectionById(collectionId);
  if (!detail) {
    throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }
  return detail;
}
