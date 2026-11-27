import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  coupons,
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  productImages,
  products,
  productVariants,
  users,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  AdminOrdersQueryInput,
  UpdateAdminOrderPaymentInput,
  UpdateAdminOrderShipmentInput,
  UpdateAdminOrderStatusInput,
} from "../validators/adminOrders.validators.js";
import {
  ALLOWED_ORDER_TRANSITIONS,
  isAllowedOrderTransition,
  type OrderStatus,
} from "./order-status.js";
import type { ShippingAddressSnapshotDTO } from "./order.service.js";
import { roundCurrency } from "./shipping.service.js";

export interface AdminOrderSummaryDTO {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  recipientPhone: string;
  governorate: string;
  city: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: "EGP";
  itemCount: number;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderStatusHistoryDTO {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminOrderInventoryMovementDTO {
  id: string;
  variantId: string;
  size: string;
  color: string;
  movementType: string;
  quantity: number;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  reason: string | null;
  performedByName: string | null;
  createdAt: string;
}

export interface AdminOrderItemDTO {
  id: string;
  variantId: string | null;
  productId: string | null;
  productSlug: string | null;
  productNameSnapshot: string;
  sizeSnapshot: string;
  colorSnapshot: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl: string | null;
}

export interface AdminOrderDetailDTO {
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
  allowedNextStatuses: readonly OrderStatus[];
  customerNotes: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  customer: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    isActive: boolean;
  };
  coupon: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
  } | null;
  shippingAddressSnapshot: ShippingAddressSnapshotDTO;
  items: AdminOrderItemDTO[];
  itemCount: number;
  payment: {
    id: string;
    paymentMethod: string;
    amount: number;
    paymentStatus: string;
    transactionReference: string | null;
    createdAt: string;
  } | null;
  statusHistory: AdminOrderStatusHistoryDTO[];
  inventoryMovements: AdminOrderInventoryMovementDTO[];
  createdAt: string;
  updatedAt: string;
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function toIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(String(val));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

export async function listAdminOrders(
  query: AdminOrdersQueryInput
): Promise<{
  orders: AdminOrderSummaryDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw new AppError(
      "Start date cannot be after end date.",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  const conditions = [sql`1 = 1`];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(sql`(
      o.order_number ILIKE ${pattern}
      OR u.full_name ILIKE ${pattern}
      OR u.email ILIKE ${pattern}
      OR COALESCE(u.phone, '') ILIKE ${pattern}
      OR COALESCE(o.shipping_address_snapshot->>'recipientName', '') ILIKE ${pattern}
      OR COALESCE(o.shipping_address_snapshot->>'phone', '') ILIKE ${pattern}
    )`);
  }

  if (query.orderStatus !== "all") {
    conditions.push(sql`o.order_status = ${query.orderStatus}`);
  }

  if (query.paymentStatus !== "all") {
    conditions.push(sql`o.payment_status = ${query.paymentStatus}`);
  }

  if (query.startDate) {
    conditions.push(
      sql`(o.created_at AT TIME ZONE 'Africa/Cairo')::date >= ${query.startDate}::date`
    );
  }

  if (query.endDate) {
    conditions.push(
      sql`(o.created_at AT TIME ZONE 'Africa/Cairo')::date <= ${query.endDate}::date`
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  let orderBySql = sql`o.created_at DESC`;
  if (query.sort === "oldest") {
    orderBySql = sql`o.created_at ASC`;
  } else if (query.sort === "total_desc") {
    orderBySql = sql`o.total_amount DESC, o.created_at DESC`;
  } else if (query.sort === "total_asc") {
    orderBySql = sql`o.total_amount ASC, o.created_at DESC`;
  }

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM orders o
    INNER JOIN users u ON u.id = o.user_id
    WHERE ${whereClause}
  `);

  const total = Number((countRes.rows[0] as Record<string, unknown> | undefined)?.total ?? 0);
  const offset = (query.page - 1) * query.limit;

  const listRes = await db.execute(sql`
    SELECT
      o.id,
      o.order_number,
      o.user_id,
      u.full_name AS customer_name,
      u.email AS customer_email,
      u.phone AS customer_phone,
      COALESCE(o.shipping_address_snapshot->>'recipientName', u.full_name) AS recipient_name,
      COALESCE(o.shipping_address_snapshot->>'phone', u.phone, '') AS recipient_phone,
      COALESCE(o.shipping_address_snapshot->>'governorate', '') AS governorate,
      COALESCE(o.shipping_address_snapshot->>'city', '') AS city,
      o.order_status,
      o.payment_status,
      o.payment_method,
      o.subtotal::numeric(12, 2)::text AS subtotal,
      o.discount_amount::numeric(12, 2)::text AS discount_amount,
      o.shipping_fee::numeric(12, 2)::text AS shipping_fee,
      o.total_amount::numeric(12, 2)::text AS total_amount,
      o.shipping_carrier,
      o.tracking_number,
      (
        SELECT COALESCE(SUM(oi.quantity), 0)::int
        FROM order_items oi
        WHERE oi.order_id = o.id
      ) AS item_count,
      o.created_at,
      o.updated_at
    FROM orders o
    INNER JOIN users u ON u.id = o.user_id
    WHERE ${whereClause}
    ORDER BY ${orderBySql}
    LIMIT ${query.limit}
    OFFSET ${offset}
  `);

  const mapped: AdminOrderSummaryDTO[] = listRes.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      orderNumber: String(r.order_number),
      customerId: String(r.user_id),
      customerName: String(r.customer_name || r.recipient_name || ""),
      customerEmail: String(r.customer_email ?? ""),
      customerPhone: r.customer_phone ? String(r.customer_phone) : null,
      recipientPhone: String(r.recipient_phone ?? ""),
      governorate: String(r.governorate ?? ""),
      city: String(r.city ?? ""),
      orderStatus: String(r.order_status),
      paymentStatus: String(r.payment_status),
      paymentMethod: String(r.payment_method),
      subtotal: roundCurrency(Number(r.subtotal ?? 0)),
      discountAmount: roundCurrency(Number(r.discount_amount ?? 0)),
      shippingFee: roundCurrency(Number(r.shipping_fee ?? 0)),
      totalAmount: roundCurrency(Number(r.total_amount ?? 0)),
      currency: "EGP",
      itemCount: Number(r.item_count ?? 0),
      shippingCarrier: r.shipping_carrier ? String(r.shipping_carrier) : null,
      trackingNumber: r.tracking_number ? String(r.tracking_number) : null,
      createdAt: toIsoStringOrNull(r.created_at) || new Date().toISOString(),
      updatedAt: toIsoStringOrNull(r.updated_at) || new Date().toISOString(),
    };
  });

  return {
    orders: mapped,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

async function getAdminOrderDetailFromExecutor(
  executor: DbLike,
  orderId: string
): Promise<AdminOrderDetailDTO> {
  const [orderRow] = await executor
    .select({
      order: orders,
      customerId: users.id,
      customerFullName: users.fullName,
      customerEmail: users.email,
      customerPhone: users.phone,
      customerIsActive: users.isActive,
      couponCode: coupons.code,
      couponDiscountType: coupons.discountType,
      couponDiscountValue: coupons.discountValue,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(coupons, eq(coupons.id, orders.couponId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) {
    throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
  }

  const order = orderRow.order;

  const [itemRows, historyRows, paymentRows, movementRows] = await Promise.all([
    executor
      .select({
        id: orderItems.id,
        variantId: orderItems.variantId,
        productNameSnapshot: orderItems.productNameSnapshot,
        sizeSnapshot: orderItems.sizeSnapshot,
        colorSnapshot: orderItems.colorSnapshot,
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
      .select({
        id: orderStatusHistory.id,
        previousStatus: orderStatusHistory.previousStatus,
        newStatus: orderStatusHistory.newStatus,
        changedBy: orderStatusHistory.changedBy,
        changedByName: users.fullName,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
    executor
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
    executor
      .select({
        id: inventoryMovements.id,
        variantId: inventoryMovements.variantId,
        size: productVariants.size,
        color: productVariants.color,
        movementType: inventoryMovements.movementType,
        quantity: inventoryMovements.quantity,
        previousQuantity: inventoryMovements.previousQuantity,
        resultingQuantity: inventoryMovements.resultingQuantity,
        reason: inventoryMovements.reason,
        performedByName: users.fullName,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
      .leftJoin(users, eq(users.id, inventoryMovements.performedBy))
      .where(eq(inventoryMovements.referenceId, order.id))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id)),
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

  const items: AdminOrderItemDTO[] = itemRows.map((item) => ({
    id: item.id,
    variantId: item.variantId,
    productId: item.productId ?? null,
    productSlug: item.productSlug ?? null,
    productNameSnapshot: item.productNameSnapshot,
    sizeSnapshot: item.sizeSnapshot,
    colorSnapshot: item.colorSnapshot,
    unitPrice: roundCurrency(Number(item.unitPrice)),
    quantity: item.quantity,
    totalPrice: roundCurrency(Number(item.totalPrice)),
    imageUrl: item.productId ? (primaryImageByProduct.get(item.productId) ?? null) : null,
  }));

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
    allowedNextStatuses:
      ALLOWED_ORDER_TRANSITIONS[order.orderStatus as OrderStatus] ?? [],
    customerNotes: order.customerNotes ?? null,
    shippingCarrier: order.shippingCarrier ?? null,
    trackingNumber: order.trackingNumber ?? null,
    shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
    customer: {
      id: orderRow.customerId,
      fullName: orderRow.customerFullName,
      email: orderRow.customerEmail,
      phone: orderRow.customerPhone ?? null,
      isActive: orderRow.customerIsActive,
    },
    coupon: order.couponId && orderRow.couponCode
      ? {
          id: order.couponId,
          code: orderRow.couponCode,
          discountType: orderRow.couponDiscountType ?? "fixed",
          discountValue: roundCurrency(Number(orderRow.couponDiscountValue ?? 0)),
        }
      : null,
    shippingAddressSnapshot: normalizeSnapshot(order.shippingAddressSnapshot),
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
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
    statusHistory: historyRows.map((h) => ({
      id: h.id,
      previousStatus: h.previousStatus ?? null,
      newStatus: h.newStatus,
      changedBy: h.changedBy ?? null,
      changedByName: h.changedByName ?? null,
      note: h.note ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    inventoryMovements: movementRows.map((m) => ({
      id: m.id,
      variantId: m.variantId,
      size: m.size,
      color: m.color,
      movementType: m.movementType,
      quantity: m.quantity,
      previousQuantity: m.previousQuantity ?? null,
      resultingQuantity: m.resultingQuantity ?? null,
      reason: m.reason ?? null,
      performedByName: m.performedByName ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export async function getAdminOrderById(
  orderId: string
): Promise<AdminOrderDetailDTO> {
  return getAdminOrderDetailFromExecutor(db, orderId);
}

export async function updateAdminOrderStatus(
  orderId: string,
  adminUserId: string,
  input: UpdateAdminOrderStatusInput
): Promise<AdminOrderDetailDTO> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    const currentStatus = order.orderStatus as OrderStatus;
    if (currentStatus === input.status) {
      throw new AppError(
        `Order is already in "${currentStatus}" status.`,
        409,
        "INVALID_STATUS_TRANSITION"
      );
    }

    if (!isAllowedOrderTransition(currentStatus, input.status)) {
      throw new AppError(
        `Transition from "${currentStatus}" to "${input.status}" is not allowed.`,
        409,
        "INVALID_STATUS_TRANSITION"
      );
    }

    const now = new Date();
    const updateValues: Partial<typeof orders.$inferInsert> = {
      orderStatus: input.status,
      updatedAt: now,
    };

    if (input.status === "shipped") {
      updateValues.shippedAt = order.shippedAt ?? now;
      if (input.shippingCarrier !== undefined) {
        updateValues.shippingCarrier = input.shippingCarrier;
      }
      if (input.trackingNumber !== undefined) {
        updateValues.trackingNumber = input.trackingNumber;
      }
    }

    if (input.status === "cancelled" && order.paymentStatus === "pending") {
      updateValues.paymentStatus = "cancelled";
    }

    const updatedOrders = await tx
      .update(orders)
      .set(updateValues)
      .where(and(eq(orders.id, order.id), eq(orders.orderStatus, currentStatus)))
      .returning({ id: orders.id });

    if (updatedOrders.length === 0) {
      throw new AppError(
        "Order status changed concurrently. Please refresh and try again.",
        409,
        "CONCURRENT_ORDER_UPDATE"
      );
    }

    if (input.status === "cancelled" || input.status === "delivered") {
      const rawItems = await tx
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
        .orderBy(asc(orderItems.variantId));

      const qtyByVariant = new Map<string, number>();
      for (const item of rawItems) {
        if (!item.variantId) continue;
        qtyByVariant.set(
          item.variantId,
          (qtyByVariant.get(item.variantId) ?? 0) + item.quantity
        );
      }

      const sortedVariantIds = [...qtyByVariant.keys()].sort();
      if (sortedVariantIds.length > 0) {
        const lockedInv = await tx
          .select()
          .from(inventory)
          .where(inArray(inventory.variantId, sortedVariantIds))
          .orderBy(asc(inventory.variantId))
          .for("update");

        const invByVariant = new Map(lockedInv.map((row) => [row.variantId, row]));

        for (const variantId of sortedVariantIds) {
          const qty = qtyByVariant.get(variantId) ?? 0;
          if (qty <= 0) continue;
          const invRow = invByVariant.get(variantId);

          if (input.status === "cancelled") {
            const inserted = await tx
              .insert(inventoryMovements)
              .values({
                variantId,
                movementType: "cancellation",
                quantity: qty,
                previousQuantity: invRow ? invRow.quantity : null,
                resultingQuantity: invRow ? invRow.quantity : null,
                referenceId: order.id,
                performedBy: adminUserId,
                reason: `Released reserved stock for cancelled order ${order.orderNumber}`,
              })
              .onConflictDoNothing()
              .returning({ id: inventoryMovements.id });

            if (inserted.length > 0 && invRow) {
              await tx
                .update(inventory)
                .set({
                  reservedQuantity: sql`GREATEST(0, ${inventory.reservedQuantity} - ${qty})`,
                  updatedAt: now,
                })
                .where(eq(inventory.variantId, variantId));
            }
          } else if (input.status === "delivered") {
            const prevQty = invRow ? invRow.quantity : 0;
            const nextQty = Math.max(0, prevQty - qty);

            const inserted = await tx
              .insert(inventoryMovements)
              .values({
                variantId,
                movementType: "reduction",
                quantity: -qty,
                previousQuantity: invRow ? prevQty : null,
                resultingQuantity: invRow ? nextQty : null,
                referenceId: order.id,
                performedBy: adminUserId,
                reason: `Settled dispatched stock on delivery for order ${order.orderNumber}`,
              })
              .onConflictDoNothing()
              .returning({ id: inventoryMovements.id });

            if (inserted.length > 0 && invRow) {
              await tx
                .update(inventory)
                .set({
                  quantity: sql`GREATEST(0, ${inventory.quantity} - ${qty})`,
                  reservedQuantity: sql`LEAST(GREATEST(0, ${inventory.quantity} - ${qty}), GREATEST(0, ${inventory.reservedQuantity} - ${qty}))`,
                  updatedAt: now,
                })
                .where(eq(inventory.variantId, variantId));
            }
          }
        }
      }

      if (input.status === "cancelled") {
        await tx
          .update(payments)
          .set({ paymentStatus: "cancelled" })
          .where(and(eq(payments.orderId, order.id), eq(payments.paymentStatus, "pending")));
      }
    }

    const defaultNote =
      input.status === "cancelled"
        ? "Cancelled by admin."
        : input.status === "shipped" && input.shippingCarrier
        ? `Marked as shipped via ${input.shippingCarrier}${input.trackingNumber ? ` (${input.trackingNumber})` : ""}.`
        : `Order status updated from ${currentStatus} to ${input.status}.`;

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      previousStatus: currentStatus,
      newStatus: input.status,
      changedBy: adminUserId,
      note: input.note ? input.note : defaultNote,
    });

    return getAdminOrderDetailFromExecutor(tx, order.id);
  });
}

export async function updateAdminOrderPayment(
  orderId: string,
  adminUserId: string,
  input: UpdateAdminOrderPaymentInput
): Promise<AdminOrderDetailDTO> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    if (order.orderStatus === "cancelled") {
      throw new AppError(
        "Cannot update payment status for a cancelled order.",
        409,
        "ORDER_CANCELLED_PAYMENT_FORBIDDEN"
      );
    }

    if (order.paymentStatus === input.paymentStatus) {
      throw new AppError(
        `Payment status is already "${order.paymentStatus}".`,
        409,
        "PAYMENT_STATUS_UNCHANGED"
      );
    }

    if (input.paymentStatus === "paid") {
      if (order.paymentStatus !== "pending" && order.paymentStatus !== "failed") {
        throw new AppError(
          `Cannot mark payment as paid from "${order.paymentStatus}" status.`,
          409,
          "INVALID_PAYMENT_TRANSITION"
        );
      }
    } else if (input.paymentStatus === "failed") {
      if (order.paymentStatus !== "pending") {
        throw new AppError(
          `Only pending payments can be marked as failed.`,
          409,
          "INVALID_PAYMENT_TRANSITION"
        );
      }
    } else if (input.paymentStatus === "refunded") {
      if (order.paymentStatus !== "paid") {
        throw new AppError(
          "Only paid orders can be marked as refunded.",
          409,
          "INVALID_PAYMENT_TRANSITION"
        );
      }
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({
        paymentStatus: input.paymentStatus,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    const existingPayments = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    if (existingPayments.length > 0) {
      const paymentUpdate: Partial<typeof payments.$inferInsert> = {
        paymentStatus: input.paymentStatus,
      };
      if (input.transactionReference !== undefined) {
        paymentUpdate.transactionReference = input.transactionReference;
      }
      await tx
        .update(payments)
        .set(paymentUpdate)
        .where(eq(payments.id, existingPayments[0].id));
    } else {
      await tx.insert(payments).values({
        orderId: order.id,
        paymentMethod: order.paymentMethod,
        amount: order.totalAmount,
        paymentStatus: input.paymentStatus,
        transactionReference: input.transactionReference ?? null,
      });
    }

    const paymentNote =
      input.note ||
      (input.paymentStatus === "paid"
        ? `COD payment confirmed as paid${input.transactionReference ? ` (Ref: ${input.transactionReference})` : ""}.`
        : `Payment status updated to ${input.paymentStatus}${input.transactionReference ? ` (Ref: ${input.transactionReference})` : ""}.`);

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      previousStatus: order.orderStatus,
      newStatus: order.orderStatus,
      changedBy: adminUserId,
      note: paymentNote,
    });

    return getAdminOrderDetailFromExecutor(tx, order.id);
  });
}

export async function updateAdminOrderShipment(
  orderId: string,
  adminUserId: string,
  input: UpdateAdminOrderShipmentInput
): Promise<AdminOrderDetailDTO> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    if (order.orderStatus === "cancelled") {
      throw new AppError(
        "Cannot update shipment tracking for a cancelled order.",
        409,
        "ORDER_CANCELLED_SHIPMENT_FORBIDDEN"
      );
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({
        shippingCarrier: input.shippingCarrier,
        trackingNumber: input.trackingNumber,
        shippedAt:
          order.orderStatus === "shipped" && !order.shippedAt ? now : order.shippedAt,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      previousStatus: order.orderStatus,
      newStatus: order.orderStatus,
      changedBy: adminUserId,
      note: `Shipment details updated: ${input.shippingCarrier} — Tracking ${input.trackingNumber}.`,
    });

    return getAdminOrderDetailFromExecutor(tx, order.id);
  });
}
