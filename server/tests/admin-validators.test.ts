import assert from "node:assert/strict";
import test from "node:test";
import {
  adminOrdersQuerySchema,
  updateAdminOrderStatusSchema,
} from "../validators/adminOrders.validators.js";
import { createAdminCouponSchema } from "../validators/adminCoupons.validators.js";
import { salesQuerySchema } from "../validators/adminDashboard.validators.js";
import {
  createShippingZoneSchema,
  updateShippingSettingsSchema,
} from "../validators/adminShipping.validators.js";
import { isAllowedOrderTransition } from "../services/order-status.js";

test("dashboard date ranges require valid calendar dates in ascending order", () => {
  assert.equal(
    salesQuerySchema.safeParse({
      startDate: "2026-11-01",
      endDate: "2026-11-23",
    }).success,
    true
  );
  assert.equal(
    salesQuerySchema.safeParse({
      startDate: "2026-02-30",
      endDate: "2026-03-01",
    }).success,
    false
  );
  assert.equal(
    salesQuerySchema.safeParse({
      startDate: "2026-11-24",
      endDate: "2026-11-23",
    }).success,
    false
  );
});

test("admin order filters reject invalid and reversed date ranges", () => {
  assert.equal(
    adminOrdersQuerySchema.safeParse({
      startDate: "2026-11-24",
      endDate: "2026-11-23",
    }).success,
    false
  );
  assert.equal(
    adminOrdersQuerySchema.safeParse({
      startDate: "2026-02-30",
      endDate: "2026-03-01",
    }).success,
    false
  );
});

test("coupon validation enforces percentage and date constraints", () => {
  const validCoupon = {
    code: "fall_sale",
    discountType: "percentage",
    discountValue: 100,
    startsAt: "2026-11-01T00:00:00.000Z",
    expiresAt: "2026-11-30T23:59:59.000Z",
    usagePerCustomer: 2,
  };
  const parsedCoupon = createAdminCouponSchema.safeParse(validCoupon);
  assert.equal(parsedCoupon.success, true);
  if (parsedCoupon.success) {
    assert.equal(parsedCoupon.data.code, "FALL_SALE");
  }
  assert.equal(
    createAdminCouponSchema.safeParse({
      ...validCoupon,
      discountValue: 100.01,
    }).success,
    false
  );
  assert.equal(
    createAdminCouponSchema.safeParse({
      ...validCoupon,
      startsAt: "2026-11-30T23:59:59.000Z",
      expiresAt: "2026-11-30T23:59:59.000Z",
    }).success,
    false
  );
  assert.equal(
    createAdminCouponSchema.safeParse({
      ...validCoupon,
      usagePerCustomer: 0,
    }).success,
    false
  );
});

test("shipping validation requires maximum delivery days to cover minimum days", () => {
  const zone = {
    governorate: "Cairo",
    shippingFee: 50,
    estimatedDeliveryDays: 2,
    estimatedDeliveryMaxDays: 5,
  };
  assert.equal(createShippingZoneSchema.safeParse(zone).success, true);
  assert.equal(
    createShippingZoneSchema.safeParse({
      ...zone,
      estimatedDeliveryMaxDays: 1,
    }).success,
    false
  );
});

test("shipping settings accept COD toggles and reject negative free-shipping thresholds", () => {
  assert.equal(
    updateShippingSettingsSchema.safeParse({
      isCodEnabled: false,
      freeShippingThreshold: 2500,
    }).success,
    true
  );
  assert.equal(
    updateShippingSettingsSchema.safeParse({
      freeShippingThreshold: -1,
    }).success,
    false
  );
});

test("order status transitions prohibit skipping, reversing, and leaving terminal states", () => {
  assert.equal(isAllowedOrderTransition("pending", "confirmed"), true);
  assert.equal(isAllowedOrderTransition("confirmed", "processing"), true);
  assert.equal(isAllowedOrderTransition("processing", "shipped"), true);
  assert.equal(isAllowedOrderTransition("shipped", "delivered"), true);
  assert.equal(isAllowedOrderTransition("pending", "shipped"), false);
  assert.equal(isAllowedOrderTransition("shipped", "processing"), false);
  assert.equal(isAllowedOrderTransition("delivered", "cancelled"), false);
  assert.equal(isAllowedOrderTransition("cancelled", "pending"), false);
  assert.equal(updateAdminOrderStatusSchema.safeParse({ status: "pending" }).success, false);
  assert.equal(updateAdminOrderStatusSchema.safeParse({ status: "delivered" }).success, true);
});
