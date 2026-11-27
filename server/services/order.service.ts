import crypto from "crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  addresses,
  cartItems,
  carts,
  categories,
  couponUsages,
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  productImages,
  products,
  productVariants,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type { PlaceOrderInput } from "../validators/checkout.validators.js";
import type { ListOrdersQuery } from "../validators/order.validators.js";
import { getStoreMaintenanceStatus } from "./adminSettings.service.js";
import { validateAndCalculateCoupon, type AppliedCouponDTO } from "./coupon.service.js";
import {
  calculateShippingQuote,
  getShippingSettings,
  roundCurrency,
} from "./shipping.service.js";
import {
  CANCELLABLE_BY_CUSTOMER_STATUSES,
  type OrderStatus,
} from "./order-status.js";

export {
  ALLOWED_ORDER_TRANSITIONS,
  CANCELLABLE_BY_CUSTOMER_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  isAllowedOrderTransition,
} from "./order-status.js";
export type { OrderStatus, PaymentStatus } from "./order-status.js";

export interface ShippingAddressSnapshotDTO {
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string | null;
  apartment: string | null;
  floor: string | null;
  additionalInformation: string | null;
}

export interface OrderItemDTO {
  id: string;
  variantId: string | null;
  productId: string | null;
  productSlug: string | null;
  productNameSnapshot: string;
  name_en: string;
  name_ar: string;
  imageUrl: string | null;
  sizeSnapshot: string;
  colorSnapshot: string;
  skuSnapshot: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface OrderStatusHistoryDTO {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  note: string | null;
  createdAt: string;
}

export interface OrderPaymentDTO {
  id: string;
  paymentMethod: string;
  amount: number;
  paymentStatus: string;
  transactionReference: string | null;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: "EGP";
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  canCancel: boolean;
  customerNotes: string | null;
  shippingAddressSnapshot: ShippingAddressSnapshotDTO;
  items: OrderItemDTO[];
  itemCount: number;
  statusHistory: OrderStatusHistoryDTO[];
  payment: OrderPaymentDTO | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: "EGP";
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  canCancel: boolean;
  itemCount: number;
  governorate: string;
  city: string;
  previewImageUrl: string | null;
  previewTitleEn: string | null;
  previewTitleAr: string | null;
  createdAt: string;
  updatedAt: string;
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `MZ-${y}${m}${d}-${suffix}`;
}

function normalizeSnapshot(raw: unknown): ShippingAddressSnapshotDTO {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    recipientName: String(obj.recipientName ?? ""),
    phone: String(obj.phone ?? ""),
    governorate: String(obj.governorate ?? ""),
    city: String(obj.city ?? ""),
    street: String(obj.street ?? ""),
    building: obj.building ? String(obj.building) : null,
    apartment: obj.apartment ? String(obj.apartment) : null,
    floor: obj.floor ? String(obj.floor) : null,
    additionalInformation: obj.additionalInformation
      ? String(obj.additionalInformation)
      : null,
  };
}

async function getOrderDetailFromExecutor(
  executor: DbLike,
  orderId: string,
  userId: string
): Promise<OrderDTO> {
  const [order] = await executor
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);

  if (!order) {
    throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
  }

  const [itemRows, historyRows, paymentRows] = await Promise.all([
    executor
      .select({
        id: orderItems.id,
        variantId: orderItems.variantId,
        productNameSnapshot: orderItems.productNameSnapshot,
        sizeSnapshot: orderItems.sizeSnapshot,
        colorSnapshot: orderItems.colorSnapshot,
        skuSnapshot: orderItems.skuSnapshot,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        totalPrice: orderItems.totalPrice,
        productId: products.id,
        productSlug: products.slug,
      })
      .from(orderItems)
      .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .leftJoin(products, eq(products.id, productVariants.productId))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.id)),
    executor
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
    executor
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
  ]);

  const productIds = [
    ...new Set(itemRows.map((i) => i.productId).filter((id): id is string => Boolean(id))),
  ];
  const primaryImageByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const imgRows = await executor
      .select({
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder));

    for (const img of imgRows) {
      if (!primaryImageByProduct.has(img.productId)) {
        primaryImageByProduct.set(img.productId, img.imageUrl);
      }
    }
  }

  const items: OrderItemDTO[] = itemRows.map((item) => ({
    id: item.id,
    variantId: item.variantId,
    productId: item.productId ?? null,
    productSlug: item.productSlug ?? null,
    productNameSnapshot: item.productNameSnapshot,
    name_en: item.productNameSnapshot,
    name_ar: item.productNameSnapshot,
    imageUrl: item.productId ? (primaryImageByProduct.get(item.productId) ?? null) : null,
    sizeSnapshot: item.sizeSnapshot,
    colorSnapshot: item.colorSnapshot,
    skuSnapshot: item.skuSnapshot,
    unitPrice: roundCurrency(Number(item.unitPrice)),
    quantity: item.quantity,
    totalPrice: roundCurrency(Number(item.totalPrice)),
  }));

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const paymentRow = paymentRows[0] ?? null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    subtotal: roundCurrency(Number(order.subtotal)),
    discountAmount: roundCurrency(Number(order.discountAmount)),
    shippingFee: roundCurrency(Number(order.shippingFee)),
    totalAmount: roundCurrency(Number(order.totalAmount)),
    currency: "EGP",
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    canCancel: CANCELLABLE_BY_CUSTOMER_STATUSES.includes(order.orderStatus as OrderStatus),
    customerNotes: order.customerNotes ?? null,
    shippingAddressSnapshot: normalizeSnapshot(order.shippingAddressSnapshot),
    items,
    itemCount,
    statusHistory: historyRows.map((h) => ({
      id: h.id,
      previousStatus: h.previousStatus ?? null,
      newStatus: h.newStatus,
      note: h.note ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    payment: paymentRow
      ? {
          id: paymentRow.id,
          paymentMethod: paymentRow.paymentMethod,
          amount: roundCurrency(Number(paymentRow.amount)),
          paymentStatus: paymentRow.paymentStatus,
          transactionReference: paymentRow.transactionReference ?? null,
          createdAt: paymentRow.createdAt.toISOString(),
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export async function placeCodOrder(
  userId: string,
  input: PlaceOrderInput & { idempotencyKey?: string },
  language: "en" | "ar" = "en"
): Promise<{ order: OrderDTO; alreadyExisted: boolean }> {
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

  const result = await db.transaction(async (tx) => {
    if (idempotencyKey) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${idempotencyKey}`}))`
      );

      const [existingOrder] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.userId, userId),
            eq(orders.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existingOrder) {
        return {
          order: await getOrderDetailFromExecutor(tx, existingOrder.id, userId),
          alreadyExisted: true,
        };
      }
    }

    const maintenance = await getStoreMaintenanceStatus();
    if (maintenance.isMaintenanceMode) {
      throw new AppError(
        language === "ar"
          ? maintenance.maintenanceMessageAr ||
              "تم إيقاف إتمام الطلبات مؤقتاً بسبب تفعيل وضع الصيانة في المتجر."
          : maintenance.maintenanceMessageEn ||
              "Checkout is temporarily paused while the store is in maintenance mode.",
        503,
        "STORE_MAINTENANCE"
      );
    }

    const shippingSettings = await getShippingSettings(tx);
    if (!shippingSettings.isCodEnabled) {
      throw new AppError(
        "Cash on Delivery is currently unavailable.",
        400,
        "COD_DISABLED"
      );
    }

    const [address] = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, userId)))
      .limit(1);

    if (!address) {
      throw new AppError("Selected delivery address not found.", 404, "ADDRESS_NOT_FOUND");
    }
    if (
      !address.recipientName.trim() ||
      !address.governorate.trim() ||
      !address.city.trim() ||
      !address.street.trim() ||
      !address.building?.trim()
    ) {
      throw new AppError(
        "The selected delivery address is incomplete. Please update it before placing your order.",
        400,
        "ADDRESS_INCOMPLETE"
      );
    }
    if (!/^\+201[0125]\d{8}$/.test(address.phone.trim())) {
      throw new AppError(
        "A valid Egyptian mobile number is required for delivery.",
        400,
        "PHONE_REQUIRED"
      );
    }

    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);

    if (!cart) {
      throw new AppError("Your shopping bag is empty.", 400, "CART_EMPTY");
    }

    const rawCartItems = await tx
      .select({
        id: cartItems.id,
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .where(eq(cartItems.cartId, cart.id))
      .orderBy(asc(cartItems.variantId));

    if (rawCartItems.length === 0) {
      throw new AppError("Your shopping bag is empty.", 400, "CART_EMPTY");
    }

    const variantIds = rawCartItems.map((c) => c.variantId);

    // Lock inventory rows in deterministic ascending variantId order to prevent deadlocks and overselling
    const lockedInventoryRows = await tx
      .select()
      .from(inventory)
      .where(inArray(inventory.variantId, variantIds))
      .orderBy(asc(inventory.variantId))
      .for("update");

    const inventoryByVariantId = new Map(
      lockedInventoryRows.map((row) => [row.variantId, row])
    );

    const variantRows = await tx
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        variantIsActive: productVariants.isActive,
        productId: products.id,
        productNameEn: products.nameEn,
        productNameAr: products.nameAr,
        productIsPublished: products.isPublished,
        categoryIsActive: categories.isActive,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(inArray(productVariants.id, variantIds));

    const variantById = new Map(variantRows.map((v) => [v.variantId, v]));

    let subtotal = 0;
    const verifiedItems: Array<{
      variantId: string;
      sku: string;
      size: string;
      color: string;
      productNameSnapshot: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }> = [];

    for (const cartItem of rawCartItems) {
      const variant = variantById.get(cartItem.variantId);
      if (!variant) {
        throw new AppError(
          "One of the items in your bag is no longer available.",
          400,
          "PRODUCT_UNAVAILABLE"
        );
      }
      if (!variant.productIsPublished || !variant.categoryIsActive) {
        throw new AppError(
          `${variant.productNameEn} is no longer published.`,
          400,
          "PRODUCT_UNAVAILABLE"
        );
      }
      if (!variant.variantIsActive) {
        throw new AppError(
          `${variant.productNameEn} (${variant.size} / ${variant.color}) is no longer available.`,
          400,
          "VARIANT_UNAVAILABLE"
        );
      }

      const invRow = inventoryByVariantId.get(cartItem.variantId);
      const availableStock = invRow
        ? Math.max(0, invRow.quantity - invRow.reservedQuantity)
        : 0;

      if (availableStock <= 0) {
        throw new AppError(
          `${variant.productNameEn} (${variant.size} / ${variant.color}) is currently out of stock.`,
          409,
          "OUT_OF_STOCK"
        );
      }

      if (cartItem.quantity > availableStock) {
        throw new AppError(
          `Only ${availableStock} unit(s) available for ${variant.productNameEn} (${variant.size} / ${variant.color}).`,
          409,
          "INSUFFICIENT_STOCK"
        );
      }

      const unitPrice = roundCurrency(Number(variant.price));
      const totalPrice = roundCurrency(unitPrice * cartItem.quantity);
      subtotal = roundCurrency(subtotal + totalPrice);

      verifiedItems.push({
        variantId: variant.variantId,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        productNameSnapshot: variant.productNameEn,
        unitPrice,
        quantity: cartItem.quantity,
        totalPrice,
      });
    }

    let appliedCoupon: AppliedCouponDTO | null = null;
    if (input.couponCode) {
      appliedCoupon = await validateAndCalculateCoupon({
        userId,
        couponCode: input.couponCode,
        subtotal,
        lockForUpdate: true,
        executor: tx,
      });
    }

    const discountAmount = appliedCoupon?.discountAmount ?? 0;

    const shippingQuote = await calculateShippingQuote({
      governorate: address.governorate,
      subtotal,
      discountAmount,
      executor: tx,
    });

    const totalAmount = roundCurrency(
      Math.max(0, subtotal - discountAmount) + shippingQuote.shippingFee
    );

    let orderNumber = generateOrderNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [collision] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);
      if (!collision) break;
      orderNumber = generateOrderNumber();
    }

    const shippingAddressSnapshot: ShippingAddressSnapshotDTO = {
      recipientName: address.recipientName,
      phone: address.phone,
      governorate: shippingQuote.governorate,
      city: address.city,
      street: address.street,
      building: address.building ?? null,
      apartment: address.apartment ?? null,
      floor: address.floor ?? null,
      additionalInformation: address.additionalInformation ?? null,
    };

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        userId,
        orderNumber,
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        shippingFee: shippingQuote.shippingFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        couponId: appliedCoupon?.id ?? null,
        shippingAddressSnapshot,
        paymentMethod: "cod",
        paymentStatus: "pending",
        orderStatus: "pending",
        customerNotes: input.customerNotes ?? null,
        idempotencyKey: idempotencyKey ?? null,
      })
      .returning();

    await tx.insert(orderItems).values(
      verifiedItems.map((item) => ({
        orderId: createdOrder.id,
        variantId: item.variantId,
        productNameSnapshot: item.productNameSnapshot,
        sizeSnapshot: item.size,
        colorSnapshot: item.color,
        skuSnapshot: item.sku,
        unitPrice: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        totalPrice: item.totalPrice.toFixed(2),
      }))
    );

    await tx.insert(payments).values({
      orderId: createdOrder.id,
      paymentMethod: "cod",
      amount: totalAmount.toFixed(2),
      paymentStatus: "pending",
    });

    await tx.insert(orderStatusHistory).values({
      orderId: createdOrder.id,
      previousStatus: null,
      newStatus: "pending",
      changedBy: userId,
      note: "Order placed via Cash on Delivery.",
    });

    for (const item of verifiedItems) {
      const updatedRows = await tx
        .update(inventory)
        .set({
          reservedQuantity: sql`${inventory.reservedQuantity} + ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventory.variantId, item.variantId),
            sql`(${inventory.quantity} - ${inventory.reservedQuantity}) >= ${item.quantity}`
          )
        )
        .returning({ id: inventory.id });

      if (updatedRows.length === 0) {
        throw new AppError(
          `Insufficient stock available for ${item.productNameSnapshot} (${item.size} / ${item.color}).`,
          409,
          "INSUFFICIENT_STOCK"
        );
      }

      await tx.insert(inventoryMovements).values({
        variantId: item.variantId,
        movementType: "reservation",
        quantity: item.quantity,
        referenceId: createdOrder.id,
        reason: `Reserved stock for order ${createdOrder.orderNumber}`,
      });
    }

    if (appliedCoupon) {
      await tx.insert(couponUsages).values({
        couponId: appliedCoupon.id,
        userId,
        orderId: createdOrder.id,
      });
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, cart.id));

    return {
      order: await getOrderDetailFromExecutor(tx, createdOrder.id, userId),
      alreadyExisted: false,
    };
  });

  const { createOrderNotification } = await import("./adminNotifications.service.js");
  try {
    await createOrderNotification(result.order.id);
  } catch (error) {
    console.error(
      "The order was committed, but creating its admin notification failed; the order request will still succeed.",
      error instanceof Error ? error.message : "Unknown notification error."
    );
  }

  return result;
}

export async function listCustomerOrders(
  userId: string,
  query: ListOrdersQuery
): Promise<{
  orders: OrderSummaryDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { page, limit, orderNumber } = query;
  const offset = (page - 1) * limit;

  const whereCondition = orderNumber
    ? and(
        eq(orders.userId, userId),
        sql`UPPER(${orders.orderNumber}) = UPPER(${orderNumber.trim()})`
      )
    : eq(orders.userId, userId);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(orders)
    .where(whereCondition);

  const orderRows = await db
    .select()
    .from(orders)
    .where(whereCondition)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  if (orderRows.length === 0) {
    return {
      orders: [],
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
      },
    };
  }

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = await db
    .select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      productNameSnapshot: orderItems.productNameSnapshot,
      productId: products.id,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.id));

  const productIds = [
    ...new Set(itemRows.map((r) => r.productId).filter((id): id is string => Boolean(id))),
  ];
  const primaryImageByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const imgRows = await db
      .select({
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder));

    for (const img of imgRows) {
      if (!primaryImageByProduct.has(img.productId)) {
        primaryImageByProduct.set(img.productId, img.imageUrl);
      }
    }
  }

  const itemsByOrder = new Map<
    string,
    { count: number; first: (typeof itemRows)[number] | null }
  >();
  for (const row of itemRows) {
    const existing = itemsByOrder.get(row.orderId);
    if (!existing) {
      itemsByOrder.set(row.orderId, { count: row.quantity, first: row });
    } else {
      existing.count += row.quantity;
    }
  }

  const summaries: OrderSummaryDTO[] = orderRows.map((o) => {
    const snap = normalizeSnapshot(o.shippingAddressSnapshot);
    const meta = itemsByOrder.get(o.id);
    const first = meta?.first;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      subtotal: roundCurrency(Number(o.subtotal)),
      discountAmount: roundCurrency(Number(o.discountAmount)),
      shippingFee: roundCurrency(Number(o.shippingFee)),
      totalAmount: roundCurrency(Number(o.totalAmount)),
      currency: "EGP",
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      orderStatus: o.orderStatus,
      canCancel: CANCELLABLE_BY_CUSTOMER_STATUSES.includes(o.orderStatus as OrderStatus),
      itemCount: meta?.count ?? 0,
      governorate: snap.governorate,
      city: snap.city,
      previewImageUrl: first?.productId
        ? (primaryImageByProduct.get(first.productId) ?? null)
        : null,
      previewTitleEn: first?.productNameSnapshot ?? null,
      previewTitleAr: first?.productNameSnapshot ?? null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });

  return {
    orders: summaries,
    pagination: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    },
  };
}

export async function getCustomerOrderById(
  userId: string,
  orderId: string
): Promise<OrderDTO> {
  return getOrderDetailFromExecutor(db, orderId, userId);
}

export async function cancelCustomerOrder(
  userId: string,
  orderId: string,
  reason?: string
): Promise<OrderDTO> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .for("update")
      .limit(1);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    if (order.orderStatus === "cancelled") {
      throw new AppError(
        "This order has already been cancelled.",
        409,
        "ORDER_ALREADY_CANCELLED"
      );
    }

    if (!CANCELLABLE_BY_CUSTOMER_STATUSES.includes(order.orderStatus as OrderStatus)) {
      throw new AppError(
        "This order can no longer be cancelled because fulfillment has already started.",
        409,
        "ORDER_CANNOT_BE_CANCELLED"
      );
    }

    const updatedOrders = await tx
      .update(orders)
      .set({
        orderStatus: "cancelled",
        paymentStatus: order.paymentStatus === "pending" ? "cancelled" : order.paymentStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.userId, userId),
          inArray(orders.orderStatus, [...CANCELLABLE_BY_CUSTOMER_STATUSES])
        )
      )
      .returning({ id: orders.id });

    if (updatedOrders.length === 0) {
      throw new AppError(
        "Order status changed concurrently and could not be cancelled.",
        409,
        "ORDER_CANNOT_BE_CANCELLED"
      );
    }

    const itemsToRelease = await tx
      .select({
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.variantId));

    const variantIds = itemsToRelease
      .map((i) => i.variantId)
      .filter((id): id is string => Boolean(id));

    if (variantIds.length > 0) {
      await tx
        .select({ id: inventory.id })
        .from(inventory)
        .where(inArray(inventory.variantId, variantIds))
        .orderBy(asc(inventory.variantId))
        .for("update");

      for (const item of itemsToRelease) {
        if (!item.variantId) continue;

        const insertedMovements = await tx
          .insert(inventoryMovements)
          .values({
            variantId: item.variantId,
            movementType: "cancellation",
            quantity: item.quantity,
            referenceId: order.id,
            reason: `Released reserved stock for cancelled order ${order.orderNumber}`,
          })
          .onConflictDoNothing()
          .returning({ id: inventoryMovements.id });

        if (insertedMovements.length > 0) {
          await tx
            .update(inventory)
            .set({
              reservedQuantity: sql`GREATEST(0, ${inventory.reservedQuantity} - ${item.quantity})`,
              updatedAt: new Date(),
            })
            .where(eq(inventory.variantId, item.variantId));
        }
      }
    }

    await tx
      .update(payments)
      .set({ paymentStatus: "cancelled" })
      .where(and(eq(payments.orderId, order.id), eq(payments.paymentStatus, "pending")));

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      previousStatus: order.orderStatus,
      newStatus: "cancelled",
      changedBy: userId,
      note: reason ? `Cancelled by customer: ${reason}` : "Cancelled by customer.",
    });

    return getOrderDetailFromExecutor(tx, order.id, userId);
  });
}
