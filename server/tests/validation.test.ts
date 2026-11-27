import assert from "node:assert/strict";
import test from "node:test";
import { createAddressSchema } from "../validators/address.validators.js";
import { placeOrderSchema } from "../validators/checkout.validators.js";
import { storeInfoUpdateSchema } from "../validators/adminSettings.validators.js";
import { updateCustomerProfileSchema } from "../validators/auth.validators.js";
import { TRANSLATIONS } from "../../frontend/js/i18n/translations.js";
import { parsePhoneNumbers } from "../../frontend/js/utils/formatters.js";

test("customer profile requires a nonblank name, valid email, and phone", () => {
  const validProfile = {
    fullName: "  Karim Hassan  ",
    email: "  KARIM@example.com ",
    phone: " 01001234567 ",
  };
  const parsed = updateCustomerProfileSchema.parse(validProfile);

  assert.equal(parsed.fullName, "Karim Hassan");
  assert.equal(parsed.email, "karim@example.com");
  assert.equal(parsed.phone, "+201001234567");
  assert.equal(
    updateCustomerProfileSchema.safeParse({ ...validProfile, phone: "   " }).success,
    false
  );
  assert.equal(
    updateCustomerProfileSchema.safeParse({ ...validProfile, fullName: " " }).success,
    false
  );
  assert.equal(
    updateCustomerProfileSchema.safeParse({ ...validProfile, email: "not-an-email" }).success,
    false
  );
  assert.equal(
    updateCustomerProfileSchema.safeParse({ ...validProfile, role: "admin" }).success,
    false
  );
});

test("address creation rejects incomplete required delivery details", () => {
  const validAddress = {
    recipientName: "Karim Hassan",
    phone: "01001234567",
    governorate: "Assiut",
    city: "Assiut",
    street: "El Gomhoria Street",
    building: "12",
  };

  assert.equal(createAddressSchema.safeParse(validAddress).success, true);
  assert.equal(
    createAddressSchema.safeParse({ ...validAddress, phone: "   " }).success,
    false
  );
  assert.equal(
    createAddressSchema.safeParse({ ...validAddress, building: " " }).success,
    false
  );
});

test("order placement requires a delivery address ID", () => {
  const validOrder = {
    addressId: "c4e7eac8-3d50-49cb-9ce0-c8ee7f60faca",
    paymentMethod: "cod",
  };

  assert.equal(placeOrderSchema.safeParse(validOrder).success, true);
  assert.equal(placeOrderSchema.safeParse({ paymentMethod: "cod" }).success, false);
  assert.equal(
    placeOrderSchema.safeParse({ ...validOrder, addressId: " " }).success,
    false
  );
});

test("store social links allow empty values but require HTTPS URLs", () => {
  assert.equal(
    storeInfoUpdateSchema.safeParse({
      instagramUrl: "https://instagram.com/mrzain",
      tiktokUrl: "",
      facebookUrl: " https://facebook.com/mrzain ",
    }).success,
    true
  );
  assert.equal(
    storeInfoUpdateSchema.safeParse({ instagramUrl: "http://instagram.com/mrzain" }).success,
    false
  );
  assert.equal(
    storeInfoUpdateSchema.safeParse({ tiktokUrl: "javascript:alert(1)" }).success,
    false
  );
});

test("store WhatsApp setting accepts multiple numbers", () => {
  const whatsappNumber = "+201000000001\n+201000000002\n+201000000003";
  assert.equal(
    storeInfoUpdateSchema.safeParse({ whatsappNumber }).success,
    true
  );
  assert.deepEqual(parsePhoneNumbers(whatsappNumber), [
    { number: "+201000000001", digits: "201000000001" },
    { number: "+201000000002", digits: "201000000002" },
    { number: "+201000000003", digits: "201000000003" },
  ]);
});

test("profile and checkout validation messages are available in both languages", () => {
  for (const language of ["en", "ar"] as const) {
    assert.ok(TRANSLATIONS[language].account.errPhoneRequired);
    assert.ok(TRANSLATIONS[language].account.errEmail);
    assert.ok(TRANSLATIONS[language].account.addressLoadError);
    assert.ok(TRANSLATIONS[language].checkout.incompleteAddress);
  }
});
