import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  cartItems,
  carts,
  categories,
  inventory,
  productImages,
  products,
  productVariants,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type { AddCartItemInput } from "../validators/cart.validators.js";

export interface CartItemDTO {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name_en: string;
  name_ar: string;
  imageUrl: string | null;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  availableStock: number;
  inStock: boolean;
  exceedsStock: boolean;
  itemSubtotal: number;
  variant: {
    id: string;
    sku: string;
    size: string;
    color: string;
    price: number;
    isActive: boolean;
  };
}

export interface CartDTO {
  id: string | null;
  items: CartItemDTO[];
  totalItemCount: number;
  subtotal: number;
  currency: "EGP";
  hasStockIssues: boolean;
}

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function computeAvailableStock(
  quantity: number | null | undefined,
  reservedQuantity: number | null | undefined
): number {
  return Math.max(0, Number(quantity ?? 0) - Number(reservedQuantity ?? 0));
}

function emptyCartDTO(id: string | null = null): CartDTO {
  return {
    id,
    items: [],
    totalItemCount: 0,
    subtotal: 0,
    currency: "EGP",
    hasStockIssues: false,
  };
}

export async function getCustomerCart(userId: string): Promise<CartDTO> {
  const [cart] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (!cart) {
    return emptyCartDTO(null);
  }

  const rows = await db
    .select({
      itemId: cartItems.id,
      itemQuantity: cartItems.quantity,
      variantId: productVariants.id,
      sku: productVariants.sku,
      size: productVariants.size,
      color: productVariants.color,
      variantPrice: productVariants.price,
      variantIsActive: productVariants.isActive,
      productId: products.id,
      productSlug: products.slug,
      nameEn: products.nameEn,
      nameAr: products.nameAr,
      compareAtPrice: products.compareAtPrice,
      invQuantity: inventory.quantity,
      invReservedQuantity: inventory.reservedQuantity,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        eq(products.isPublished, true),
        eq(categories.isActive, true),
        eq(productVariants.isActive, true)
      )
    )
    .orderBy(asc(cartItems.id));

  if (rows.length === 0) {
    return emptyCartDTO(cart.id);
  }

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const imageRows = await db
    .select({
      productId: productImages.productId,
      imageUrl: productImages.imageUrl,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder));

  const primaryImageByProduct = new Map<string, string>();
  for (const img of imageRows) {
    if (!primaryImageByProduct.has(img.productId)) {
      primaryImageByProduct.set(img.productId, img.imageUrl);
    }
  }

  let totalItemCount = 0;
  let subtotal = 0;
  let hasStockIssues = false;

  const items: CartItemDTO[] = rows.map((row) => {
    const unitPrice = Number(row.variantPrice);
    const quantity = Number(row.itemQuantity);
    const availableStock = computeAvailableStock(
      row.invQuantity,
      row.invReservedQuantity
    );
    const itemSubtotal = roundCurrency(unitPrice * quantity);
    const exceedsStock = quantity > availableStock || availableStock <= 0;

    totalItemCount += quantity;
    subtotal = roundCurrency(subtotal + itemSubtotal);
    if (exceedsStock) {
      hasStockIssues = true;
    }

    return {
      id: row.itemId,
      variantId: row.variantId,
      productId: row.productId,
      slug: row.productSlug,
      name_en: row.nameEn,
      name_ar: row.nameAr,
      imageUrl: primaryImageByProduct.get(row.productId) ?? null,
      sku: row.sku,
      size: row.size,
      color: row.color,
      unitPrice,
      compareAtPrice:
        row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
      quantity,
      availableStock,
      inStock: availableStock > 0,
      exceedsStock,
      itemSubtotal,
      variant: {
        id: row.variantId,
        sku: row.sku,
        size: row.size,
        color: row.color,
        price: unitPrice,
        isActive: row.variantIsActive,
      },
    };
  });

  return {
    id: cart.id,
    items,
    totalItemCount,
    subtotal,
    currency: "EGP",
    hasStockIssues,
  };
}

export async function addCartItem(
  userId: string,
  input: AddCartItemInput
): Promise<CartDTO> {
  await db.transaction(async (tx) => {
    const [variant] = await tx
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        isActive: productVariants.isActive,
        productIsPublished: products.isPublished,
        categoryIsActive: categories.isActive,
        invQuantity: inventory.quantity,
        invReservedQuantity: inventory.reservedQuantity,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.id, input.variantId))
      .limit(1);

    if (!variant) {
      throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
    }

    if (input.productId && variant.productId !== input.productId) {
      throw new AppError(
        "The selected variant does not belong to the requested product.",
        400,
        "VARIANT_PRODUCT_MISMATCH"
      );
    }

    if (!variant.productIsPublished || !variant.categoryIsActive) {
      throw new AppError(
        "This product is currently unavailable.",
        400,
        "PRODUCT_UNAVAILABLE"
      );
    }

    if (!variant.isActive) {
      throw new AppError(
        "This product variant is currently unavailable.",
        400,
        "VARIANT_UNAVAILABLE"
      );
    }

    const availableStock = computeAvailableStock(
      variant.invQuantity,
      variant.invReservedQuantity
    );

    if (availableStock <= 0) {
      throw new AppError(
        "This variant is currently out of stock.",
        409,
        "OUT_OF_STOCK"
      );
    }

    await tx
      .insert(carts)
      .values({ userId })
      .onConflictDoNothing({ target: carts.userId });

    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);

    if (!cart) {
      throw new AppError("Unable to initialize shopping cart.", 500, "CART_INIT_FAILED");
    }

    const [existingItem] = await tx
      .select({
        id: cartItems.id,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.variantId, variant.id)
        )
      )
      .limit(1);

    const nextQuantity = (existingItem?.quantity ?? 0) + input.quantity;
    if (nextQuantity > availableStock) {
      throw new AppError(
        `Only ${availableStock} unit(s) available in stock for this variant.`,
        409,
        "INSUFFICIENT_STOCK"
      );
    }

    if (existingItem) {
      await tx
        .update(cartItems)
        .set({ quantity: nextQuantity })
        .where(eq(cartItems.id, existingItem.id));
    } else {
      await tx.insert(cartItems).values({
        cartId: cart.id,
        variantId: variant.id,
        quantity: nextQuantity,
      });
    }

    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, cart.id));
  });

  return getCustomerCart(userId);
}

export async function updateCartItemQuantity(
  userId: string,
  itemId: string,
  quantity: number
): Promise<CartDTO> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        itemId: cartItems.id,
        cartId: cartItems.cartId,
        variantId: cartItems.variantId,
        cartUserId: carts.userId,
        variantIsActive: productVariants.isActive,
        productIsPublished: products.isPublished,
        categoryIsActive: categories.isActive,
        invQuantity: inventory.quantity,
        invReservedQuantity: inventory.reservedQuantity,
      })
      .from(cartItems)
      .innerJoin(carts, eq(carts.id, cartItems.cartId))
      .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(cartItems.id, itemId), eq(carts.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError("Cart item not found.", 404, "CART_ITEM_NOT_FOUND");
    }

    if (!existing.productIsPublished || !existing.categoryIsActive) {
      throw new AppError(
        "This product is no longer available.",
        400,
        "PRODUCT_UNAVAILABLE"
      );
    }

    if (!existing.variantIsActive) {
      throw new AppError(
        "This product variant is no longer available.",
        400,
        "VARIANT_UNAVAILABLE"
      );
    }

    const availableStock = computeAvailableStock(
      existing.invQuantity,
      existing.invReservedQuantity
    );

    if (availableStock <= 0) {
      throw new AppError(
        "This variant is currently out of stock.",
        409,
        "OUT_OF_STOCK"
      );
    }

    if (quantity > availableStock) {
      throw new AppError(
        `Only ${availableStock} unit(s) available in stock for this variant.`,
        409,
        "INSUFFICIENT_STOCK"
      );
    }

    await tx
      .update(cartItems)
      .set({ quantity })
      .where(
        and(
          eq(cartItems.id, existing.itemId),
          eq(cartItems.cartId, existing.cartId)
        )
      );

    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, existing.cartId));
  });

  return getCustomerCart(userId);
}

export async function removeCartItem(
  userId: string,
  itemId: string
): Promise<CartDTO> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        itemId: cartItems.id,
        cartId: cartItems.cartId,
      })
      .from(cartItems)
      .innerJoin(carts, eq(carts.id, cartItems.cartId))
      .where(and(eq(cartItems.id, itemId), eq(carts.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError("Cart item not found.", 404, "CART_ITEM_NOT_FOUND");
    }

    await tx
      .delete(cartItems)
      .where(
        and(
          eq(cartItems.id, existing.itemId),
          eq(cartItems.cartId, existing.cartId)
        )
      );

    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, existing.cartId));
  });

  return getCustomerCart(userId);
}

export async function clearCustomerCart(userId: string): Promise<CartDTO> {
  await db.transaction(async (tx) => {
    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);

    if (!cart) {
      return;
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, cart.id));
  });

  return getCustomerCart(userId);
}
