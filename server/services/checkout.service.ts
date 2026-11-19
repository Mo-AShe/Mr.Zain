import { getCustomerAddressById, listActiveGovernorates, listCustomerAddresses } from "./address.service.js";
import { getStoreMaintenanceStatus, type StoreAvailabilityDTO } from "./adminSettings.service.js";
import { getCustomerCart, type CartDTO } from "./cart.service.js";
import { validateAndCalculateCoupon, type AppliedCouponDTO } from "./coupon.service.js";
import {
  calculateShippingQuote,
  getShippingSettings,
  roundCurrency,
  type ShippingQuoteDTO,
  type ShippingSettingsDTO,
} from "./shipping.service.js";
import type {
  CheckoutPreviewQuery,
  ShippingQuoteInput,
} from "../validators/checkout.validators.js";

export interface CheckoutSummaryDTO {
  subtotal: number;
  discountAmount: number;
  shippingFee: number | null;
  totalAmount: number;
  currency: "EGP";
  qualifiesForFreeShipping: boolean;
  freeShippingThreshold: number;
  amountToFreeShipping: number;
  estimatedDeliveryDays: number | null;
  estimatedDeliveryMaxDays: number | null;
}

export interface CheckoutPreviewDTO {
  cart: CartDTO;
  addresses: Awaited<ReturnType<typeof listCustomerAddresses>>;
  selectedAddressId: string | null;
  selectedGovernorate: string | null;
  shippingZones: Awaited<ReturnType<typeof listActiveGovernorates>>;
  shippingSettings: ShippingSettingsDTO;
  availability: StoreAvailabilityDTO;
  shipping: ShippingQuoteDTO | null;
  appliedCoupon: AppliedCouponDTO | null;
  couponError: string | null;
  paymentMethods: Array<{
    code: "cod";
    enabled: boolean;
  }>;
  summary: CheckoutSummaryDTO;
}

export async function getCheckoutPreview(
  userId: string,
  query: CheckoutPreviewQuery = {}
): Promise<CheckoutPreviewDTO> {
  const [cart, addresses, shippingZones, shippingSettings, availability] =
    await Promise.all([
      getCustomerCart(userId),
      listCustomerAddresses(userId),
      listActiveGovernorates(),
      getShippingSettings(),
      getStoreMaintenanceStatus(),
    ]);

  let selectedAddress = null;
  if (query.addressId) {
    selectedAddress = await getCustomerAddressById(userId, query.addressId);
  } else if (!query.governorate) {
    selectedAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  }

  const targetGovernorate = query.governorate ?? selectedAddress?.governorate ?? null;

  let appliedCoupon: AppliedCouponDTO | null = null;
  let couponError: string | null = null;
  if (query.couponCode && cart.subtotal > 0) {
    try {
      appliedCoupon = await validateAndCalculateCoupon({
        userId,
        couponCode: query.couponCode,
        subtotal: cart.subtotal,
      });
    } catch (err) {
      couponError =
        err instanceof Error ? err.message : "Coupon code could not be applied.";
    }
  }

  const discountAmount = appliedCoupon?.discountAmount ?? 0;

  let shipping: ShippingQuoteDTO | null = null;
  if (targetGovernorate) {
    shipping = await calculateShippingQuote({
      governorate: targetGovernorate,
      subtotal: cart.subtotal,
      discountAmount,
    });
  }

  const eligibleSubtotal = roundCurrency(Math.max(0, cart.subtotal - discountAmount));
  const amountToFreeShipping = shipping
    ? shipping.amountToFreeShipping
    : shippingSettings.isFreeShippingEnabled
      ? roundCurrency(Math.max(0, shippingSettings.freeShippingThreshold - eligibleSubtotal))
      : 0;

  const totalAmount = shipping
    ? roundCurrency(eligibleSubtotal + shipping.shippingFee)
    : eligibleSubtotal;

  return {
    cart,
    addresses,
    selectedAddressId: selectedAddress?.id ?? null,
    selectedGovernorate: shipping?.governorate ?? targetGovernorate,
    shippingZones,
    shippingSettings,
    availability,
    shipping,
    appliedCoupon,
    couponError,
    paymentMethods: [
      {
        code: "cod",
        enabled: shippingSettings.isCodEnabled,
      },
    ],
    summary: {
      subtotal: cart.subtotal,
      discountAmount,
      shippingFee: shipping ? shipping.shippingFee : null,
      totalAmount,
      currency: "EGP",
      qualifiesForFreeShipping: shipping
        ? shipping.qualifiesForFreeShipping
        : shippingSettings.isFreeShippingEnabled &&
          eligibleSubtotal >= shippingSettings.freeShippingThreshold,
      freeShippingThreshold: shippingSettings.freeShippingThreshold,
      amountToFreeShipping,
      estimatedDeliveryDays: shipping?.estimatedDeliveryDays ?? null,
      estimatedDeliveryMaxDays: shipping?.estimatedDeliveryMaxDays ?? null,
    },
  };
}

export async function calculateCheckoutShippingQuote(
  userId: string,
  input: ShippingQuoteInput
) {
  const [cart, targetGovernorate] = await Promise.all([
    getCustomerCart(userId),
    (async () => {
      if (input.addressId) {
        const address = await getCustomerAddressById(userId, input.addressId);
        return address.governorate;
      }
      return input.governorate!;
    })(),
  ]);

  let appliedCoupon: AppliedCouponDTO | null = null;
  if (input.couponCode) {
    appliedCoupon = await validateAndCalculateCoupon({
      userId,
      couponCode: input.couponCode,
      subtotal: cart.subtotal,
    });
  }

  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const quote = await calculateShippingQuote({
    governorate: targetGovernorate,
    subtotal: cart.subtotal,
    discountAmount,
  });

  const totalAmount = roundCurrency(
    Math.max(0, cart.subtotal - discountAmount) + quote.shippingFee
  );

  return {
    ...quote,
    subtotal: cart.subtotal,
    discountAmount,
    totalAmount,
    currency: "EGP" as const,
    appliedCoupon,
  };
}
