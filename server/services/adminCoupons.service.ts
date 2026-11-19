import { and, asc, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { couponUsages, coupons, orders, users } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  AdminCouponsQuery,
  CreateAdminCouponInput,
  UpdateAdminCouponInput,
} from "../validators/adminCoupons.validators.js";

export type AdminCouponStatus =
  | "active"
  | "inactive"
  | "scheduled"
  | "expired"
  | "exhausted";

export interface AdminCouponDTO {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscount: number | null;
  usageLimit: number | null;
  usagePerCustomer: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usedCount: number;
  totalDiscountGranted: number;
  derivedStatus: AdminCouponStatus;
}

function roundCurrency(val: number): number {
  return Math.round(val * 100) / 100;
}

function computeDerivedStatus(row: {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
}): AdminCouponStatus {
  const now = new Date();
  if (!row.isActive) return "inactive";
  if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) return "expired";
  if (row.startsAt && row.startsAt.getTime() > now.getTime()) return "scheduled";
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return "exhausted";
  return "active";
}

function mapCouponRow(row: {
  id: string;
  code: string;
  discountType: string;
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscount: string | null;
  usageLimit: number | null;
  usagePerCustomer: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  usedCount: number;
  totalDiscountGranted: string | number;
}): AdminCouponDTO {
  const usedCount = Number(row.usedCount ?? 0);
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: roundCurrency(Number(row.discountValue)),
    minimumOrderAmount: roundCurrency(Number(row.minimumOrderAmount)),
    maximumDiscount:
      row.maximumDiscount !== null ? roundCurrency(Number(row.maximumDiscount)) : null,
    usageLimit: row.usageLimit,
    usagePerCustomer: Number(row.usagePerCustomer ?? 1),
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: Boolean(row.isActive),
    usedCount,
    totalDiscountGranted: roundCurrency(Number(row.totalDiscountGranted ?? 0)),
    derivedStatus: computeDerivedStatus({
      isActive: Boolean(row.isActive),
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      usageLimit: row.usageLimit,
      usedCount,
    }),
  };
}

export async function listAdminCoupons(query: AdminCouponsQuery) {
  const conditions = [];
  const now = new Date();

  if (query.search) {
    conditions.push(ilike(coupons.code, `%${query.search}%`));
  }

  if (query.discountType !== "all") {
    conditions.push(eq(coupons.discountType, query.discountType));
  }

  if (query.status === "inactive") {
    conditions.push(eq(coupons.isActive, false));
  } else if (query.status === "active") {
    conditions.push(
      and(
        eq(coupons.isActive, true),
        sql`(${coupons.startsAt} IS NULL OR ${coupons.startsAt} <= ${now})`,
        sql`(${coupons.expiresAt} IS NULL OR ${coupons.expiresAt} >= ${now})`
      )
    );
  } else if (query.status === "scheduled") {
    conditions.push(
      and(
        eq(coupons.isActive, true),
        sql`${coupons.startsAt} IS NOT NULL AND ${coupons.startsAt} > ${now}`
      )
    );
  } else if (query.status === "expired") {
    conditions.push(
      sql`${coupons.expiresAt} IS NOT NULL AND ${coupons.expiresAt} < ${now}`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const usedCountExpr = sql<number>`COUNT(${couponUsages.id})::int`;
  const discountSumExpr = sql<string>`COALESCE(SUM(${orders.discountAmount}), 0)::numeric(12,2)`;

  let orderByClause = [asc(coupons.code)];
  if (query.sort === "code_desc") {
    orderByClause = [desc(coupons.code)];
  } else if (query.sort === "value_desc") {
    orderByClause = [desc(coupons.discountValue), asc(coupons.code)];
  } else if (query.sort === "value_asc") {
    orderByClause = [asc(coupons.discountValue), asc(coupons.code)];
  } else if (query.sort === "used_desc") {
    orderByClause = [desc(usedCountExpr), asc(coupons.code)];
  } else if (query.sort === "expires_asc") {
    orderByClause = [sql`${coupons.expiresAt} ASC NULLS LAST`, asc(coupons.code)];
  }

  const offset = (query.page - 1) * query.limit;

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(coupons)
      .where(whereClause),
    db
      .select({
        id: coupons.id,
        code: coupons.code,
        discountType: coupons.discountType,
        discountValue: coupons.discountValue,
        minimumOrderAmount: coupons.minimumOrderAmount,
        maximumDiscount: coupons.maximumDiscount,
        usageLimit: coupons.usageLimit,
        usagePerCustomer: coupons.usagePerCustomer,
        startsAt: coupons.startsAt,
        expiresAt: coupons.expiresAt,
        isActive: coupons.isActive,
        usedCount: usedCountExpr,
        totalDiscountGranted: discountSumExpr,
      })
      .from(coupons)
      .leftJoin(couponUsages, eq(couponUsages.couponId, coupons.id))
      .leftJoin(orders, eq(orders.id, couponUsages.orderId))
      .where(whereClause)
      .groupBy(coupons.id)
      .orderBy(...orderByClause)
      .limit(query.limit)
      .offset(offset),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.limit));

  return {
    coupons: rows.map(mapCouponRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    },
  };
}

export async function getAdminCouponDetail(couponId: string) {
  const [couponRow] = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      minimumOrderAmount: coupons.minimumOrderAmount,
      maximumDiscount: coupons.maximumDiscount,
      usageLimit: coupons.usageLimit,
      usagePerCustomer: coupons.usagePerCustomer,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
      isActive: coupons.isActive,
      usedCount: sql<number>`COUNT(${couponUsages.id})::int`,
      totalDiscountGranted: sql<string>`COALESCE(SUM(${orders.discountAmount}), 0)::numeric(12,2)`,
    })
    .from(coupons)
    .leftJoin(couponUsages, eq(couponUsages.couponId, coupons.id))
    .leftJoin(orders, eq(orders.id, couponUsages.orderId))
    .where(eq(coupons.id, couponId))
    .groupBy(coupons.id)
    .limit(1);

  if (!couponRow) {
    throw new AppError("Coupon not found.", 404, "COUPON_NOT_FOUND");
  }

  const [usageRows, uniqueRows] = await Promise.all([
    db
      .select({
        id: couponUsages.id,
        usedAt: couponUsages.usedAt,
        userId: users.id,
        customerName: users.fullName,
        customerEmail: users.email,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.orderStatus,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        totalAmount: orders.totalAmount,
      })
      .from(couponUsages)
      .innerJoin(users, eq(users.id, couponUsages.userId))
      .innerJoin(orders, eq(orders.id, couponUsages.orderId))
      .where(eq(couponUsages.couponId, couponId))
      .orderBy(desc(couponUsages.usedAt))
      .limit(100),
    db
      .select({
        uniqueCustomersCount: sql<number>`COUNT(DISTINCT ${couponUsages.userId})::int`,
      })
      .from(couponUsages)
      .where(eq(couponUsages.couponId, couponId)),
  ]);

  const mappedCoupon = mapCouponRow(couponRow);
  const remainingUses =
    mappedCoupon.usageLimit !== null
      ? Math.max(0, mappedCoupon.usageLimit - mappedCoupon.usedCount)
      : null;

  return {
    coupon: mappedCoupon,
    stats: {
      usedCount: mappedCoupon.usedCount,
      uniqueCustomersCount: Number(uniqueRows[0]?.uniqueCustomersCount ?? 0),
      remainingUses,
      totalDiscountGranted: mappedCoupon.totalDiscountGranted,
    },
    usages: usageRows.map((row) => ({
      id: row.id,
      usedAt: row.usedAt.toISOString(),
      userId: row.userId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      orderStatus: row.orderStatus,
      subtotal: roundCurrency(Number(row.subtotal)),
      discountAmount: roundCurrency(Number(row.discountAmount)),
      totalAmount: roundCurrency(Number(row.totalAmount)),
    })),
  };
}

export async function createAdminCoupon(input: CreateAdminCouponInput) {
  const normalizedCode = input.code.trim().toUpperCase();

  const [duplicate] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(sql`LOWER(${coupons.code}) = LOWER(${normalizedCode})`)
    .limit(1);

  if (duplicate) {
    throw new AppError(
      `A coupon with code "${normalizedCode}" already exists.`,
      409,
      "COUPON_CODE_EXISTS"
    );
  }

  const maxDiscount =
    input.discountType === "percentage" && input.maximumDiscount !== undefined
      ? input.maximumDiscount
      : null;

  const [created] = await db
    .insert(coupons)
    .values({
      code: normalizedCode,
      discountType: input.discountType,
      discountValue: roundCurrency(input.discountValue).toFixed(2),
      minimumOrderAmount: roundCurrency(input.minimumOrderAmount).toFixed(2),
      maximumDiscount: maxDiscount !== null ? roundCurrency(maxDiscount).toFixed(2) : null,
      usageLimit: input.usageLimit ?? null,
      usagePerCustomer: input.usagePerCustomer,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: input.isActive,
    })
    .returning();

  return mapCouponRow({
    ...created,
    usedCount: 0,
    totalDiscountGranted: 0,
  });
}

export async function updateAdminCoupon(
  couponId: string,
  input: UpdateAdminCouponInput
) {
  const [existing] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, couponId))
    .limit(1);

  if (!existing) {
    throw new AppError("Coupon not found.", 404, "COUPON_NOT_FOUND");
  }

  const [usageStatsRows, maxPerUserRows] = await Promise.all([
    db
      .select({
        usedCount: sql<number>`COUNT(${couponUsages.id})::int`,
        totalDiscountGranted: sql<string>`COALESCE(SUM(${orders.discountAmount}), 0)::numeric(12,2)`,
      })
      .from(couponUsages)
      .leftJoin(orders, eq(orders.id, couponUsages.orderId))
      .where(eq(couponUsages.couponId, couponId)),
    db.execute(sql`
      SELECT COALESCE(MAX(per_user_cnt), 0)::int AS max_customer_usage
      FROM (
        SELECT COUNT(*) AS per_user_cnt
        FROM coupon_usages
        WHERE coupon_id = ${couponId}
        GROUP BY user_id
      ) counts
    `),
  ]);

  const usedCount = Number(usageStatsRows[0]?.usedCount ?? 0);
  const totalDiscountGranted = Number(
    usageStatsRows[0]?.totalDiscountGranted ?? 0
  );
  const maxCustomerUsage = Number(
    (maxPerUserRows.rows?.[0] as { max_customer_usage?: number } | undefined)
      ?.max_customer_usage ?? 0
  );

  const nextCode =
    input.code !== undefined ? input.code.trim().toUpperCase() : existing.code;

  if (nextCode.toLowerCase() !== existing.code.toLowerCase()) {
    const [duplicate] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(
          ne(coupons.id, couponId),
          sql`LOWER(${coupons.code}) = LOWER(${nextCode})`
        )
      )
      .limit(1);

    if (duplicate) {
      throw new AppError(
        `A coupon with code "${nextCode}" already exists.`,
        409,
        "COUPON_CODE_EXISTS"
      );
    }
  }

  const nextType = input.discountType ?? (existing.discountType as "percentage" | "fixed");
  const nextValue =
    input.discountValue !== undefined
      ? roundCurrency(input.discountValue)
      : roundCurrency(Number(existing.discountValue));

  if (nextType === "percentage" && nextValue > 100) {
    throw new AppError(
      "Percentage discount cannot exceed 100%.",
      400,
      "INVALID_DISCOUNT_VALUE"
    );
  }

  const nextMinOrder =
    input.minimumOrderAmount !== undefined
      ? roundCurrency(input.minimumOrderAmount)
      : roundCurrency(Number(existing.minimumOrderAmount));

  let nextMaxDiscount: number | null;
  if (nextType === "fixed") {
    nextMaxDiscount = null;
  } else if (input.maximumDiscount !== undefined) {
    nextMaxDiscount = input.maximumDiscount;
  } else {
    nextMaxDiscount =
      existing.maximumDiscount !== null
        ? roundCurrency(Number(existing.maximumDiscount))
        : null;
  }

  const nextUsageLimit =
    input.usageLimit !== undefined ? input.usageLimit : existing.usageLimit;

  if (nextUsageLimit !== null && nextUsageLimit < usedCount) {
    throw new AppError(
      `Global usage limit (${nextUsageLimit}) cannot be lower than current usage count (${usedCount}).`,
      409,
      "USAGE_LIMIT_BELOW_USED"
    );
  }

  const nextPerCustomer =
    input.usagePerCustomer !== undefined
      ? input.usagePerCustomer
      : existing.usagePerCustomer;

  if (nextPerCustomer < maxCustomerUsage) {
    throw new AppError(
      `Per-customer limit (${nextPerCustomer}) cannot be lower than the highest existing per-customer redemption count (${maxCustomerUsage}).`,
      409,
      "PER_CUSTOMER_LIMIT_BELOW_USED"
    );
  }

  const nextStartsAt =
    input.startsAt !== undefined ? input.startsAt : existing.startsAt;
  const nextExpiresAt =
    input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt;

  if (
    nextStartsAt instanceof Date &&
    nextExpiresAt instanceof Date &&
    nextExpiresAt.getTime() <= nextStartsAt.getTime()
  ) {
    throw new AppError(
      "Expiration date must be after the start date.",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  const nextIsActive =
    input.isActive !== undefined ? input.isActive : existing.isActive;

  const [updated] = await db
    .update(coupons)
    .set({
      code: nextCode,
      discountType: nextType,
      discountValue: nextValue.toFixed(2),
      minimumOrderAmount: nextMinOrder.toFixed(2),
      maximumDiscount:
        nextMaxDiscount !== null ? nextMaxDiscount.toFixed(2) : null,
      usageLimit: nextUsageLimit,
      usagePerCustomer: nextPerCustomer,
      startsAt: nextStartsAt,
      expiresAt: nextExpiresAt,
      isActive: nextIsActive,
    })
    .where(eq(coupons.id, couponId))
    .returning();

  return mapCouponRow({
    ...updated,
    usedCount,
    totalDiscountGranted,
  });
}

export async function deleteAdminCoupon(couponId: string) {
  const [existing] = await db
    .select({ id: coupons.id, code: coupons.code })
    .from(coupons)
    .where(eq(coupons.id, couponId))
    .limit(1);

  if (!existing) {
    throw new AppError("Coupon not found.", 404, "COUPON_NOT_FOUND");
  }

  const [usageRows, orderRows] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(couponUsages)
      .where(eq(couponUsages.couponId, couponId)),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(orders)
      .where(eq(orders.couponId, couponId)),
  ]);

  const usageCount = Number(usageRows[0]?.count ?? 0);
  const orderCount = Number(orderRows[0]?.count ?? 0);

  if (usageCount > 0 || orderCount > 0) {
    throw new AppError(
      "Coupons with existing order or usage history cannot be deleted. Deactivate the coupon instead.",
      409,
      "COUPON_IN_USE"
    );
  }

  await db.delete(coupons).where(eq(coupons.id, couponId));

  return {
    deleted: true,
    couponId: existing.id,
    code: existing.code,
  };
}
