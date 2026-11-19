import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { shippingSettings, shippingZones } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";

export interface ShippingSettingsDTO {
  freeShippingThreshold: number;
  isFreeShippingEnabled: boolean;
  isCodEnabled: boolean;
}

export interface ShippingQuoteDTO {
  governorate: string;
  baseShippingFee: number;
  shippingFee: number;
  estimatedDeliveryDays: number;
  estimatedDeliveryMaxDays: number | null;
  qualifiesForFreeShipping: boolean;
  isFreeShippingEnabled: boolean;
  freeShippingThreshold: number;
  amountToFreeShipping: number;
  isCodEnabled: boolean;
}

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getShippingSettings(
  executor: DbLike = db
): Promise<ShippingSettingsDTO> {
  const [row] = await executor
    .select()
    .from(shippingSettings)
    .orderBy(asc(shippingSettings.updatedAt))
    .limit(1);

  if (!row) {
    throw new AppError(
      "Shipping configuration is missing in the database.",
      500,
      "SHIPPING_SETTINGS_MISSING"
    );
  }

  return {
    freeShippingThreshold: roundCurrency(Number(row.freeShippingThreshold)),
    isFreeShippingEnabled: Boolean(row.isFreeShippingEnabled),
    isCodEnabled: Boolean(row.isCodEnabled),
  };
}

export async function calculateShippingQuote(params: {
  governorate: string;
  subtotal: number;
  discountAmount?: number;
  executor?: DbLike;
}): Promise<ShippingQuoteDTO> {
  const executor = params.executor ?? db;
  const normalizedGov = params.governorate.trim();

  const [zone] = await executor
    .select()
    .from(shippingZones)
    .where(
      and(
        sql`LOWER(${shippingZones.governorate}) = LOWER(${normalizedGov})`,
        eq(shippingZones.isActive, true)
      )
    )
    .limit(1);

  if (!zone) {
    throw new AppError(
      "Shipping is not configured for the selected governorate.",
      400,
      "SHIPPING_ZONE_UNAVAILABLE"
    );
  }

  const settings = await getShippingSettings(executor);
  const discountAmount = roundCurrency(Math.max(0, params.discountAmount ?? 0));
  const subtotal = roundCurrency(Math.max(0, params.subtotal));
  const eligibleAmount = roundCurrency(Math.max(0, subtotal - discountAmount));
  const baseShippingFee = roundCurrency(Number(zone.shippingFee));

  const qualifiesForFreeShipping =
    settings.isFreeShippingEnabled &&
    eligibleAmount >= settings.freeShippingThreshold;

  const shippingFee = qualifiesForFreeShipping ? 0 : baseShippingFee;
  const amountToFreeShipping =
    settings.isFreeShippingEnabled && !qualifiesForFreeShipping
      ? roundCurrency(Math.max(0, settings.freeShippingThreshold - eligibleAmount))
      : 0;

  return {
    governorate: zone.governorate,
    baseShippingFee,
    shippingFee,
    estimatedDeliveryDays: zone.estimatedDeliveryDays,
    estimatedDeliveryMaxDays:
      zone.estimatedDeliveryMaxDays !== null &&
      zone.estimatedDeliveryMaxDays !== undefined
        ? Number(zone.estimatedDeliveryMaxDays)
        : null,
    qualifiesForFreeShipping,
    isFreeShippingEnabled: settings.isFreeShippingEnabled,
    freeShippingThreshold: settings.freeShippingThreshold,
    amountToFreeShipping,
    isCodEnabled: settings.isCodEnabled,
  };
}
