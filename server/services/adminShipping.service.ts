import { and, asc, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { addresses, shippingSettings, shippingZones } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import { getShippingSettings } from "./shipping.service.js";
import type {
  AdminShippingQuery,
  CreateShippingZoneInput,
  UpdateShippingSettingsInput,
  UpdateShippingZoneInput,
} from "../validators/adminShipping.validators.js";

export interface AdminShippingZoneDTO {
  id: string;
  governorate: string;
  shippingFee: number;
  estimatedDeliveryDays: number;
  estimatedDeliveryMaxDays: number | null;
  isActive: boolean;
}

function roundCurrency(val: number): number {
  return Math.round(val * 100) / 100;
}

function mapZoneRow(row: {
  id: string;
  governorate: string;
  shippingFee: string;
  estimatedDeliveryDays: number;
  estimatedDeliveryMaxDays: number | null;
  isActive: boolean;
}): AdminShippingZoneDTO {
  return {
    id: row.id,
    governorate: row.governorate,
    shippingFee: roundCurrency(Number(row.shippingFee)),
    estimatedDeliveryDays: Number(row.estimatedDeliveryDays),
    estimatedDeliveryMaxDays:
      row.estimatedDeliveryMaxDays !== null &&
      row.estimatedDeliveryMaxDays !== undefined
        ? Number(row.estimatedDeliveryMaxDays)
        : null,
    isActive: Boolean(row.isActive),
  };
}

export async function getAdminShippingOverview(query: AdminShippingQuery) {
  const conditions = [];

  if (query.search) {
    conditions.push(ilike(shippingZones.governorate, `%${query.search}%`));
  }

  if (query.status === "active") {
    conditions.push(eq(shippingZones.isActive, true));
  } else if (query.status === "inactive") {
    conditions.push(eq(shippingZones.isActive, false));
  }

  let orderByClause = [asc(shippingZones.governorate)];
  if (query.sort === "governorate_desc") {
    orderByClause = [desc(shippingZones.governorate)];
  } else if (query.sort === "fee_asc") {
    orderByClause = [asc(shippingZones.shippingFee), asc(shippingZones.governorate)];
  } else if (query.sort === "fee_desc") {
    orderByClause = [desc(shippingZones.shippingFee), asc(shippingZones.governorate)];
  } else if (query.sort === "days_asc") {
    orderByClause = [
      asc(shippingZones.estimatedDeliveryDays),
      asc(shippingZones.governorate),
    ];
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [settings, summaryRows, zoneRows] = await Promise.all([
    getShippingSettings(),
    db
      .select({
        totalZones: sql<number>`COUNT(*)::int`,
        activeZones: sql<number>`COUNT(*) FILTER (WHERE ${shippingZones.isActive} = true)::int`,
        inactiveZones: sql<number>`COUNT(*) FILTER (WHERE ${shippingZones.isActive} = false)::int`,
        averageShippingFee: sql<string>`COALESCE(AVG(${shippingZones.shippingFee}), 0)::numeric(12,2)`,
      })
      .from(shippingZones),
    db
      .select()
      .from(shippingZones)
      .where(whereClause)
      .orderBy(...orderByClause),
  ]);

  const summaryRow = summaryRows[0];

  return {
    settings,
    summary: {
      totalZones: Number(summaryRow?.totalZones ?? 0),
      activeZones: Number(summaryRow?.activeZones ?? 0),
      inactiveZones: Number(summaryRow?.inactiveZones ?? 0),
      averageShippingFee: roundCurrency(
        Number(summaryRow?.averageShippingFee ?? 0)
      ),
    },
    zones: zoneRows.map(mapZoneRow),
  };
}

export async function createAdminShippingZone(input: CreateShippingZoneInput) {
  const normalizedName = input.governorate.trim();

  const [duplicate] = await db
    .select({ id: shippingZones.id })
    .from(shippingZones)
    .where(sql`LOWER(${shippingZones.governorate}) = LOWER(${normalizedName})`)
    .limit(1);

  if (duplicate) {
    throw new AppError(
      `Shipping zone for "${normalizedName}" already exists.`,
      409,
      "GOVERNORATE_EXISTS"
    );
  }

  const [created] = await db
    .insert(shippingZones)
    .values({
      governorate: normalizedName,
      shippingFee: roundCurrency(input.shippingFee).toFixed(2),
      estimatedDeliveryDays: input.estimatedDeliveryDays,
      estimatedDeliveryMaxDays: input.estimatedDeliveryMaxDays ?? null,
      isActive: input.isActive,
    })
    .returning();

  return mapZoneRow(created);
}

export async function updateAdminShippingZone(
  zoneId: string,
  input: UpdateShippingZoneInput
) {
  const [existing] = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.id, zoneId))
    .limit(1);

  if (!existing) {
    throw new AppError("Shipping zone not found.", 404, "ZONE_NOT_FOUND");
  }

  const nextGovernorate =
    input.governorate !== undefined
      ? input.governorate.trim()
      : existing.governorate;

  if (nextGovernorate.toLowerCase() !== existing.governorate.toLowerCase()) {
    const [duplicate] = await db
      .select({ id: shippingZones.id })
      .from(shippingZones)
      .where(
        and(
          ne(shippingZones.id, zoneId),
          sql`LOWER(${shippingZones.governorate}) = LOWER(${nextGovernorate})`
        )
      )
      .limit(1);

    if (duplicate) {
      throw new AppError(
        `Shipping zone for "${nextGovernorate}" already exists.`,
        409,
        "GOVERNORATE_EXISTS"
      );
    }
  }

  const nextMinDays =
    input.estimatedDeliveryDays !== undefined
      ? input.estimatedDeliveryDays
      : existing.estimatedDeliveryDays;

  const nextMaxDays =
    input.estimatedDeliveryMaxDays !== undefined
      ? input.estimatedDeliveryMaxDays
      : existing.estimatedDeliveryMaxDays;

  if (nextMaxDays !== null && nextMaxDays < nextMinDays) {
    throw new AppError(
      "Maximum delivery days cannot be less than minimum delivery days.",
      400,
      "INVALID_DELIVERY_RANGE"
    );
  }

  const nextFee =
    input.shippingFee !== undefined
      ? roundCurrency(input.shippingFee)
      : roundCurrency(Number(existing.shippingFee));

  const nextIsActive =
    input.isActive !== undefined ? input.isActive : existing.isActive;

  const [updated] = await db
    .update(shippingZones)
    .set({
      governorate: nextGovernorate,
      shippingFee: nextFee.toFixed(2),
      estimatedDeliveryDays: nextMinDays,
      estimatedDeliveryMaxDays: nextMaxDays,
      isActive: nextIsActive,
    })
    .where(eq(shippingZones.id, zoneId))
    .returning();

  return mapZoneRow(updated);
}

export async function deleteAdminShippingZone(zoneId: string) {
  const [existing] = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.id, zoneId))
    .limit(1);

  if (!existing) {
    throw new AppError("Shipping zone not found.", 404, "ZONE_NOT_FOUND");
  }

  const [addrRef] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(addresses)
    .where(sql`LOWER(${addresses.governorate}) = LOWER(${existing.governorate})`);

  if (Number(addrRef?.count ?? 0) > 0) {
    throw new AppError(
      `Shipping zone "${existing.governorate}" is referenced by saved customer addresses. Deactivate it instead.`,
      409,
      "ZONE_IN_USE"
    );
  }

  await db.delete(shippingZones).where(eq(shippingZones.id, zoneId));

  return {
    deleted: true,
    zoneId: existing.id,
    governorate: existing.governorate,
  };
}

export async function updateAdminShippingSettings(
  input: UpdateShippingSettingsInput
) {
  const [existing] = await db.select().from(shippingSettings).limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(shippingSettings)
      .values({
        freeShippingThreshold: roundCurrency(
          input.freeShippingThreshold ?? 2500
        ).toFixed(2),
        isFreeShippingEnabled: input.isFreeShippingEnabled ?? true,
        isCodEnabled: input.isCodEnabled ?? true,
        updatedAt: new Date(),
      })
      .returning();

    return {
      freeShippingThreshold: roundCurrency(
        Number(inserted.freeShippingThreshold)
      ),
      isFreeShippingEnabled: inserted.isFreeShippingEnabled,
      isCodEnabled: inserted.isCodEnabled,
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  const [updated] = await db
    .update(shippingSettings)
    .set({
      freeShippingThreshold:
        input.freeShippingThreshold !== undefined
          ? roundCurrency(input.freeShippingThreshold).toFixed(2)
          : existing.freeShippingThreshold,
      isFreeShippingEnabled:
        input.isFreeShippingEnabled !== undefined
          ? input.isFreeShippingEnabled
          : existing.isFreeShippingEnabled,
      isCodEnabled:
        input.isCodEnabled !== undefined
          ? input.isCodEnabled
          : existing.isCodEnabled,
      updatedAt: new Date(),
    })
    .where(eq(shippingSettings.id, existing.id))
    .returning();

  return {
    freeShippingThreshold: roundCurrency(Number(updated.freeShippingThreshold)),
    isFreeShippingEnabled: updated.isFreeShippingEnabled,
    isCodEnabled: updated.isCodEnabled,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
