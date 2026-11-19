import { count } from "drizzle-orm";
import { db } from "./index.js";
import { roles, shippingSettings, shippingZones } from "./schema.js";

const EGYPT_SHIPPING_ZONES = [
  { governorate: "Cairo", shippingFee: "65.00", estimatedDeliveryDays: 2 },
  { governorate: "Giza", shippingFee: "65.00", estimatedDeliveryDays: 2 },
  { governorate: "Alexandria", shippingFee: "75.00", estimatedDeliveryDays: 3 },
  { governorate: "Qalyubia", shippingFee: "70.00", estimatedDeliveryDays: 2 },
  { governorate: "Sharqia", shippingFee: "80.00", estimatedDeliveryDays: 3 },
  { governorate: "Dakahlia", shippingFee: "80.00", estimatedDeliveryDays: 3 },
  { governorate: "Gharbia", shippingFee: "80.00", estimatedDeliveryDays: 3 },
  { governorate: "Monufia", shippingFee: "80.00", estimatedDeliveryDays: 3 },
  { governorate: "Beheira", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Kafr El Sheikh", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Damietta", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Port Said", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Ismailia", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Suez", shippingFee: "85.00", estimatedDeliveryDays: 3 },
  { governorate: "Faiyum", shippingFee: "90.00", estimatedDeliveryDays: 4 },
  { governorate: "Beni Suef", shippingFee: "95.00", estimatedDeliveryDays: 4 },
  { governorate: "Minya", shippingFee: "100.00", estimatedDeliveryDays: 4 },
  { governorate: "Asyut", shippingFee: "105.00", estimatedDeliveryDays: 5 },
  { governorate: "Sohag", shippingFee: "110.00", estimatedDeliveryDays: 5 },
  { governorate: "Qena", shippingFee: "115.00", estimatedDeliveryDays: 5 },
  { governorate: "Luxor", shippingFee: "120.00", estimatedDeliveryDays: 5 },
  { governorate: "Aswan", shippingFee: "125.00", estimatedDeliveryDays: 6 },
  { governorate: "Red Sea", shippingFee: "120.00", estimatedDeliveryDays: 5 },
  { governorate: "New Valley", shippingFee: "135.00", estimatedDeliveryDays: 6 },
  { governorate: "Matrouh", shippingFee: "120.00", estimatedDeliveryDays: 5 },
  { governorate: "North Sinai", shippingFee: "135.00", estimatedDeliveryDays: 6 },
  { governorate: "South Sinai", shippingFee: "130.00", estimatedDeliveryDays: 5 },
];

export async function seedFoundationalData() {
  await db
    .insert(roles)
    .values([
      { name: "customer", description: "Standard storefront customer account" },
      { name: "admin", description: "MR. ZAIN store administrator account" },
    ])
    .onConflictDoNothing({ target: roles.name });

  await db
    .insert(shippingZones)
    .values(EGYPT_SHIPPING_ZONES)
    .onConflictDoNothing({ target: shippingZones.governorate });

  const [{ value: settingsCount }] = await db
    .select({ value: count() })
    .from(shippingSettings);

  if (settingsCount === 0) {
    await db.insert(shippingSettings).values({
      freeShippingThreshold: "2500.00",
      isFreeShippingEnabled: true,
      isCodEnabled: true,
    });
  }
}
