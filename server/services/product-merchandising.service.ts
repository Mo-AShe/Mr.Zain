import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  categories,
  orderItems,
  orders,
  products,
  productVariants,
} from "../db/schema.js";

export const NEW_PRODUCT_WINDOW_DAYS = 15;
const NEW_PRODUCT_WINDOW_MS = NEW_PRODUCT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const BEST_SELLER_PRODUCT_LIMIT = 3;

export function isWithinNewProductWindow(
  createdAt: Date,
  now: Date = new Date()
): boolean {
  const ageMs = now.getTime() - createdAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < NEW_PRODUCT_WINDOW_MS;
}

export async function getBestSellerProductIds(): Promise<Set<string>> {
  const rows = await db
    .select({ productId: products.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(orders.paymentStatus, "paid"),
        ne(orders.orderStatus, "cancelled"),
        eq(products.isPublished, true),
        eq(categories.isActive, true)
      )
    )
    .groupBy(products.id)
    .orderBy(
      desc(sql`SUM(${orderItems.quantity})`),
      desc(sql`SUM(${orderItems.totalPrice})`),
      asc(products.id)
    )
    .limit(BEST_SELLER_PRODUCT_LIMIT);

  return new Set(rows.map((row) => row.productId));
}
