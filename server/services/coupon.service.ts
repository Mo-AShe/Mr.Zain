import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { coupons, couponUsages } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import { roundCurrency } from "./shipping.service.js";

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AppliedCouponDTO {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  discountAmount: number;
  minimumOrderAmount: number;
  maximumDiscount: number | null;
}

export async function validateAndCalculateCoupon(params: {
  userId: string;
  couponCode: string;
  subtotal: number;
  lockForUpdate?: boolean;
  executor?: DbLike;
}): Promise<AppliedCouponDTO> {
  const executor = params.executor ?? db;
  const normalizedCode = params.couponCode.trim();

  if (!normalizedCode) {
    throw new AppError("Please enter a coupon code.", 400, "INVALID_COUPON");
  }

  const baseQuery = executor
    .select()
    .from(coupons)
    .where(sql`LOWER(${coupons.code}) = LOWER(${normalizedCode})`)
    .limit(1);

  const [coupon] = params.lockForUpdate
    ? await baseQuery.for("update")
    : await baseQuery;

  if (!coupon || !coupon.isActive) {
    throw new AppError("This coupon code is invalid or inactive.", 400, "INVALID_COUPON");
  }

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    throw new AppError("This coupon is not active yet.", 400, "COUPON_NOT_STARTED");
  }

  if (coupon.expiresAt && now > coupon.expiresAt) {
    throw new AppError("This coupon has expired.", 400, "COUPON_EXPIRED");
  }

  const minimumOrderAmount = roundCurrency(Number(coupon.minimumOrderAmount));
  const subtotal = roundCurrency(Math.max(0, params.subtotal));
  if (subtotal < minimumOrderAmount) {
    throw new AppError(
      `This coupon requires a minimum order subtotal of ${minimumOrderAmount.toLocaleString("en-US")} EGP.`,
      400,
      "COUPON_MIN_ORDER_NOT_MET"
    );
  }

  if (coupon.usageLimit !== null) {
    const [{ value: totalUsed }] = await executor
      .select({ value: count() })
      .from(couponUsages)
      .where(eq(couponUsages.couponId, coupon.id));

    if (Number(totalUsed) >= coupon.usageLimit) {
      throw new AppError(
        "This coupon has reached its maximum usage limit.",
        400,
        "COUPON_USAGE_LIMIT_REACHED"
      );
    }
  }

  const [{ value: customerUsed }] = await executor
    .select({ value: count() })
    .from(couponUsages)
    .where(
      and(
        eq(couponUsages.couponId, coupon.id),
        eq(couponUsages.userId, params.userId)
      )
    );

  if (Number(customerUsed) >= coupon.usagePerCustomer) {
    throw new AppError(
      "You have already used this coupon the maximum number of times.",
      400,
      "COUPON_CUSTOMER_LIMIT_REACHED"
    );
  }

  const discountValue = Number(coupon.discountValue);
  const maximumDiscount =
    coupon.maximumDiscount !== null ? roundCurrency(Number(coupon.maximumDiscount)) : null;

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = roundCurrency((subtotal * discountValue) / 100);
  } else {
    discountAmount = roundCurrency(discountValue);
  }

  if (maximumDiscount !== null) {
    discountAmount = Math.min(discountAmount, maximumDiscount);
  }
  discountAmount = roundCurrency(Math.min(Math.max(0, discountAmount), subtotal));

  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType as "percentage" | "fixed",
    discountValue,
    discountAmount,
    minimumOrderAmount,
    maximumDiscount,
  };
}
