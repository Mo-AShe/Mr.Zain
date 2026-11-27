import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  categories,
  inventory,
  productImages,
  products,
  productVariants,
  wishlistItems,
  wishlists,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";

export interface WishlistVariantDTO {
  id: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  availableStock: number;
  inStock: boolean;
}

export interface WishlistItemDTO {
  id: string;
  productId: string;
  slug: string;
  name_en: string;
  name_ar: string;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  totalAvailableStock: number;
  availabilityStatus: "in_stock" | "low_stock" | "out_of_stock";
  defaultVariantId: string | null;
  variants: WishlistVariantDTO[];
  category: {
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
  };
  addedAt: string;
}

export interface WishlistDTO {
  id: string | null;
  items: WishlistItemDTO[];
  totalCount: number;
  productIds: string[];
}

function emptyWishlistDTO(id: string | null = null): WishlistDTO {
  return {
    id,
    items: [],
    totalCount: 0,
    productIds: [],
  };
}

export async function getCustomerWishlist(userId: string): Promise<WishlistDTO> {
  const [wishlist] = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .limit(1);

  if (!wishlist) {
    return emptyWishlistDTO(null);
  }

  const rows = await db
    .select({
      itemId: wishlistItems.id,
      addedAt: wishlistItems.createdAt,
      productId: products.id,
      slug: products.slug,
      nameEn: products.nameEn,
      nameAr: products.nameAr,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryNameEn: categories.nameEn,
      categoryNameAr: categories.nameAr,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(wishlistItems.wishlistId, wishlist.id),
        eq(products.isPublished, true),
        eq(categories.isActive, true)
      )
    )
    .orderBy(desc(wishlistItems.createdAt));

  if (rows.length === 0) {
    return emptyWishlistDTO(wishlist.id);
  }

  const productIds = rows.map((r) => r.productId);

  const [imageRows, variantRows] = await Promise.all([
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
        id: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        invQuantity: inventory.quantity,
        invReservedQuantity: inventory.reservedQuantity,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          inArray(productVariants.productId, productIds),
          eq(productVariants.isActive, true)
        )
      )
      .orderBy(asc(productVariants.createdAt)),
  ]);

  const primaryImageByProduct = new Map<string, string>();
  for (const img of imageRows) {
    if (!primaryImageByProduct.has(img.productId)) {
      primaryImageByProduct.set(img.productId, img.imageUrl);
    }
  }

  const variantsByProduct = new Map<string, WishlistVariantDTO[]>();
  for (const v of variantRows) {
    const availableStock = Math.max(
      0,
      Number(v.invQuantity ?? 0) - Number(v.invReservedQuantity ?? 0)
    );
    const bucket = variantsByProduct.get(v.productId) ?? [];
    bucket.push({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: Number(v.price),
      availableStock,
      inStock: availableStock > 0,
    });
    variantsByProduct.set(v.productId, bucket);
  }

  const items: WishlistItemDTO[] = rows.map((row) => {
    const variants = variantsByProduct.get(row.productId) ?? [];
    const totalAvailableStock = variants.reduce(
      (sum, v) => sum + v.availableStock,
      0
    );
    const maxVariantStock = variants.reduce(
      (max, v) => Math.max(max, v.availableStock),
      0
    );
    const inStock = totalAvailableStock > 0;
    const defaultVariant = variants.find((v) => v.inStock) ?? null;

    let availabilityStatus: WishlistItemDTO["availabilityStatus"] = "out_of_stock";
    if (inStock) {
      availabilityStatus = maxVariantStock <= 5 ? "low_stock" : "in_stock";
    }

    return {
      id: row.itemId,
      productId: row.productId,
      slug: row.slug,
      name_en: row.nameEn,
      name_ar: row.nameAr,
      imageUrl: primaryImageByProduct.get(row.productId) ?? null,
      price: Number(row.basePrice),
      compareAtPrice:
        row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
      inStock,
      totalAvailableStock,
      availabilityStatus,
      defaultVariantId: defaultVariant?.id ?? null,
      variants,
      category: {
        id: row.categoryId,
        slug: row.categorySlug,
        name_en: row.categoryNameEn,
        name_ar: row.categoryNameAr,
      },
      addedAt: row.addedAt.toISOString(),
    };
  });

  return {
    id: wishlist.id,
    items,
    totalCount: items.length,
    productIds: items.map((item) => item.productId),
  };
}

export async function addWishlistItem(
  userId: string,
  productId: string
): Promise<WishlistDTO> {
  await db.transaction(async (tx) => {
    const [product] = await tx
      .select({
        id: products.id,
        isPublished: products.isPublished,
        categoryIsActive: categories.isActive,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }

    if (!product.isPublished || !product.categoryIsActive) {
      throw new AppError(
        "This product is currently unavailable.",
        400,
        "PRODUCT_UNAVAILABLE"
      );
    }

    await tx
      .insert(wishlists)
      .values({ userId })
      .onConflictDoNothing({ target: wishlists.userId });

    const [wishlist] = await tx
      .select({ id: wishlists.id })
      .from(wishlists)
      .where(eq(wishlists.userId, userId))
      .limit(1);

    if (!wishlist) {
      throw new AppError(
        "Unable to initialize wishlist.",
        500,
        "WISHLIST_INIT_FAILED"
      );
    }

    await tx
      .insert(wishlistItems)
      .values({
        wishlistId: wishlist.id,
        productId: product.id,
      })
      .onConflictDoNothing({
        target: [wishlistItems.wishlistId, wishlistItems.productId],
      });
  });

  return getCustomerWishlist(userId);
}

export async function removeWishlistItem(
  userId: string,
  productId: string
): Promise<WishlistDTO> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        itemId: wishlistItems.id,
        wishlistId: wishlistItems.wishlistId,
      })
      .from(wishlistItems)
      .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
      .where(
        and(
          eq(wishlists.userId, userId),
          eq(wishlistItems.productId, productId)
        )
      )
      .limit(1);

    if (existing) {
      await tx
        .delete(wishlistItems)
        .where(
          and(
            eq(wishlistItems.id, existing.itemId),
            eq(wishlistItems.wishlistId, existing.wishlistId)
          )
        );
    }
  });

  return getCustomerWishlist(userId);
}
