import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { addresses, shippingZones, users } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from "../validators/address.validators.js";

export interface GovernorateZoneDTO {
  id: string;
  governorate: string;
  shippingFee: number;
  estimatedDeliveryDays: number;
  estimatedDeliveryMaxDays?: number | null;
}

export interface AddressDTO {
  id: string;
  recipientName: string;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string | null;
  apartment: string | null;
  floor: string | null;
  additionalInformation: string | null;
  isDefault: boolean;
  createdAt: string;
}

function toAddressDTO(row: typeof addresses.$inferSelect): AddressDTO {
  return {
    id: row.id,
    recipientName: row.recipientName,
    fullName: row.recipientName,
    phone: row.phone,
    governorate: row.governorate,
    city: row.city,
    street: row.street,
    building: row.building ?? null,
    apartment: row.apartment ?? null,
    floor: row.floor ?? null,
    additionalInformation: row.additionalInformation ?? null,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActiveGovernorates(): Promise<GovernorateZoneDTO[]> {
  const rows = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.isActive, true))
    .orderBy(asc(shippingZones.shippingFee), asc(shippingZones.governorate));

  return rows.map((z) => ({
    id: z.id,
    governorate: z.governorate,
    shippingFee: Number(z.shippingFee),
    estimatedDeliveryDays: z.estimatedDeliveryDays,
    estimatedDeliveryMaxDays:
      z.estimatedDeliveryMaxDays !== null &&
      z.estimatedDeliveryMaxDays !== undefined
        ? Number(z.estimatedDeliveryMaxDays)
        : null,
  }));
}

export async function resolveActiveGovernorate(
  governorateInput: string
): Promise<GovernorateZoneDTO> {
  const normalized = governorateInput.trim();
  const [zone] = await db
    .select()
    .from(shippingZones)
    .where(
      and(
        sql`LOWER(${shippingZones.governorate}) = LOWER(${normalized})`,
        eq(shippingZones.isActive, true)
      )
    )
    .limit(1);

  if (!zone) {
    throw new AppError(
      "Delivery is not configured for the selected Egyptian governorate.",
      400,
      "INVALID_GOVERNORATE"
    );
  }

  return {
    id: zone.id,
    governorate: zone.governorate,
    shippingFee: Number(zone.shippingFee),
    estimatedDeliveryDays: zone.estimatedDeliveryDays,
  };
}

export async function listCustomerAddresses(userId: string): Promise<AddressDTO[]> {
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  return rows.map(toAddressDTO);
}

export async function getCustomerAddressById(
  userId: string,
  addressId: string
): Promise<AddressDTO> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
    .limit(1);

  if (!row) {
    throw new AppError("Delivery address not found.", 404, "ADDRESS_NOT_FOUND");
  }

  return toAddressDTO(row);
}

export async function createCustomerAddress(
  userId: string,
  input: CreateAddressInput
): Promise<AddressDTO> {
  const zone = await resolveActiveGovernorate(input.governorate);

  const created = await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    const existingRows = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(eq(addresses.userId, userId));

    const shouldBeDefault =
      !existingRows.some((row) => row.isDefault) || Boolean(input.isDefault);

    if (shouldBeDefault && existingRows.length > 0) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
    }

    const [inserted] = await tx
      .insert(addresses)
      .values({
        userId,
        recipientName: input.recipientName.trim(),
        phone: input.phone,
        governorate: zone.governorate,
        city: input.city.trim(),
        street: input.street.trim(),
        building: input.building.trim(),
        apartment: input.apartment ?? null,
        floor: input.floor ?? null,
        additionalInformation: input.additionalInformation ?? null,
        isDefault: shouldBeDefault,
      })
      .returning();

    return inserted;
  });

  return toAddressDTO(created);
}

export async function updateCustomerAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput
): Promise<AddressDTO> {
  const canonicalGovernorate =
    input.governorate !== undefined
      ? (await resolveActiveGovernorate(input.governorate)).governorate
      : undefined;

  const updated = await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    const [existing] = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError("Delivery address not found.", 404, "ADDRESS_NOT_FOUND");
    }

    const otherAddresses = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), ne(addresses.id, addressId)))
      .orderBy(desc(addresses.createdAt));
    const otherHasDefault = otherAddresses.some((address) => address.isDefault);
    const nextDefault =
      input.isDefault === false && existing.isDefault && otherAddresses.length > 0
        ? otherAddresses.find((address) => address.isDefault) || otherAddresses[0]
        : null;
    const shouldBeDefault =
      input.isDefault === true ||
      otherAddresses.length === 0 ||
      (input.isDefault === undefined && existing.isDefault) ||
      (!existing.isDefault && !otherHasDefault);

    if (shouldBeDefault || nextDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
    }

    const [row] = await tx
      .update(addresses)
      .set({
        ...(input.recipientName !== undefined
          ? { recipientName: input.recipientName.trim() }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(canonicalGovernorate !== undefined
          ? { governorate: canonicalGovernorate }
          : {}),
        ...(input.city !== undefined ? { city: input.city.trim() } : {}),
        ...(input.street !== undefined ? { street: input.street.trim() } : {}),
        ...(input.building !== undefined ? { building: input.building.trim() } : {}),
        ...(input.apartment !== undefined ? { apartment: input.apartment } : {}),
        ...(input.floor !== undefined ? { floor: input.floor } : {}),
        ...(input.additionalInformation !== undefined
          ? { additionalInformation: input.additionalInformation }
          : {}),
        isDefault: shouldBeDefault,
      })
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .returning();

    if (nextDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(
          and(
            eq(addresses.id, nextDefault.id),
            eq(addresses.userId, userId)
          )
        );
    }

    return row;
  });

  return toAddressDTO(updated);
}

export async function deleteCustomerAddress(
  userId: string,
  addressId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    const [existing] = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError("Delivery address not found.", 404, "ADDRESS_NOT_FOUND");
    }

    await tx
      .delete(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));

    const remainingAddresses = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.createdAt));
    const nextDefault =
      remainingAddresses.find((address) => address.isDefault) ||
      remainingAddresses[0];

    if (nextDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
      await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(
          and(
            eq(addresses.id, nextDefault.id),
            eq(addresses.userId, userId)
          )
        );
    }
  });
}
