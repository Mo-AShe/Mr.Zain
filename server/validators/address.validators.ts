import { z } from "zod";
import { normalizeEgyptianPhone } from "./auth.validators.js";

function emptyToNull(val: unknown): unknown {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  return trimmed === "" ? null : trimmed;
}

const addressFieldsShape = {
  recipientName: z
    .string({ error: "Full name is required." })
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(150, "Full name must be at most 150 characters."),
  phone: z.preprocess(
    (val) => normalizeEgyptianPhone(val),
    z
      .string({ error: "Egyptian mobile number is required." })
      .regex(
        /^\+201[0125]\d{8}$/,
        "Please enter a valid Egyptian mobile number (e.g. +201001234567 or 01001234567)."
      )
  ),
  governorate: z
    .string({ error: "Governorate is required." })
    .trim()
    .min(2, "Please select a valid Egyptian governorate.")
    .max(100, "Governorate name is too long."),
  city: z
    .string({ error: "City or area is required." })
    .trim()
    .min(2, "City or area must be at least 2 characters.")
    .max(100, "City or area must be at most 100 characters."),
  street: z
    .string({ error: "Street address is required." })
    .trim()
    .min(3, "Street address must be at least 3 characters.")
    .max(255, "Street address must be at most 255 characters."),
  building: z
    .string({ error: "Building number is required." })
    .trim()
    .min(1, "Building number is required.")
    .max(100, "Building number must be at most 100 characters."),
  apartment: z.preprocess(
    emptyToNull,
    z.string().max(50, "Apartment number must be at most 50 characters.").nullable().optional()
  ),
  floor: z.preprocess(
    emptyToNull,
    z.string().max(40, "Floor must be at most 40 characters.").nullable().optional()
  ),
  additionalInformation: z.preprocess(
    emptyToNull,
    z
      .string()
      .max(500, "Delivery instructions must be at most 500 characters.")
      .nullable()
      .optional()
  ),
  isDefault: z.boolean().optional(),
};

function normalizeAddressAliases(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const obj = { ...(raw as Record<string, unknown>) };
  if (obj.recipientName === undefined && obj.fullName !== undefined) {
    obj.recipientName = obj.fullName;
  }
  if (obj.additionalInformation === undefined && obj.deliveryInstructions !== undefined) {
    obj.additionalInformation = obj.deliveryInstructions;
  }
  return obj;
}

export const createAddressSchema = z.preprocess(
  normalizeAddressAliases,
  z.object(addressFieldsShape)
);

export const updateAddressSchema = z.preprocess(
  normalizeAddressAliases,
  z
    .object({
      recipientName: addressFieldsShape.recipientName.optional(),
      phone: addressFieldsShape.phone.optional(),
      governorate: addressFieldsShape.governorate.optional(),
      city: addressFieldsShape.city.optional(),
      street: addressFieldsShape.street.optional(),
      building: addressFieldsShape.building.optional(),
      apartment: addressFieldsShape.apartment,
      floor: addressFieldsShape.floor,
      additionalInformation: addressFieldsShape.additionalInformation,
      isDefault: z.boolean().optional(),
    })
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
      message: "At least one address field must be provided for update.",
    })
);

export const addressIdParamSchema = z.object({
  id: z.string().uuid("Invalid address ID."),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
