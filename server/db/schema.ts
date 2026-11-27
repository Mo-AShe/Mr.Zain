import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// A. Authentication and Customers
// ============================================================================

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 30 }).unique(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_role_id_idx").on(table.roleId),
    index("users_created_at_idx").on(table.createdAt),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    rememberMe: boolean("remember_me").notNull().default(false),
    userAgent: varchar("user_agent", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    governorate: varchar("governorate", { length: 100 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    street: varchar("street", { length: 255 }).notNull(),
    building: varchar("building", { length: 100 }),
    apartment: varchar("apartment", { length: 50 }),
    floor: varchar("floor", { length: 40 }),
    additionalInformation: text("additional_information"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("addresses_user_id_idx").on(table.userId)]
);

// ============================================================================
// B. Products and Catalogue
// ============================================================================

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nameEn: varchar("name_en", { length: 150 }).notNull(),
    nameAr: varchar("name_ar", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("categories_display_order_idx").on(table.displayOrder)]
);

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  nameEn: varchar("name_en", { length: 150 }).notNull(),
  nameAr: varchar("name_ar", { length: 150 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameAr: varchar("name_ar", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull().unique(),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 12, scale: 2 }),
    isFeatured: boolean("is_featured").notNull().default(false),
    isNew: boolean("is_new").notNull().default(false),
    isBestSeller: boolean("is_best_seller").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_is_published_idx").on(table.isPublished),
    index("products_created_at_idx").on(table.createdAt),
    check("products_base_price_non_negative", sql`${table.basePrice} >= 0`),
    check(
      "products_compare_at_price_non_negative",
      sql`${table.compareAtPrice} IS NULL OR ${table.compareAtPrice} >= 0`
    ),
  ]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    altText: varchar("alt_text", { length: 255 }),
    displayOrder: integer("display_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [index("product_images_product_id_idx").on(table.productId)]
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 100 }).notNull(),
    size: varchar("size", { length: 40 }).notNull(),
    color: varchar("color", { length: 60 }).notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_variants_product_id_idx").on(table.productId),
    uniqueIndex("product_variants_sku_normalized_uidx").on(
      sql`upper(btrim(${table.sku}))`
    ),
    uniqueIndex("product_variants_product_size_color_normalized_uidx").on(
      table.productId,
      sql`lower(btrim(${table.size}))`,
      sql`lower(btrim(${table.color}))`
    ),
    check("product_variants_price_non_negative", sql`${table.price} >= 0`),
  ]
);

export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.productId, table.collectionId] })]
);

// ============================================================================
// C. Inventory
// ============================================================================

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .unique()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("inventory_quantity_non_negative", sql`${table.quantity} >= 0`),
    check("inventory_reserved_non_negative", sql`${table.reservedQuantity} >= 0`),
    check("inventory_threshold_non_negative", sql`${table.lowStockThreshold} >= 0`),
    check(
      "inventory_reserved_lte_quantity",
      sql`${table.reservedQuantity} <= ${table.quantity}`
    ),
  ]
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    movementType: varchar("movement_type", { length: 40 }).notNull(),
    quantity: integer("quantity").notNull(),
    previousQuantity: integer("previous_quantity"),
    resultingQuantity: integer("resulting_quantity"),
    reason: text("reason"),
    referenceId: uuid("reference_id"),
    performedBy: uuid("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_movements_variant_id_idx").on(table.variantId),
    index("inventory_movements_reference_id_idx").on(table.referenceId),
    index("inventory_movements_created_at_idx").on(table.createdAt),
    // Prevents duplicate stock deductions/reservations for the same order + variant + movement
    uniqueIndex("inventory_movements_idempotent_ref_uidx")
      .on(table.variantId, table.movementType, table.referenceId)
      .where(
        sql`${table.referenceId} IS NOT NULL AND ${table.movementType} IN ('reservation', 'reduction', 'cancellation', 'return')`
      ),
    uniqueIndex("inventory_movements_var_idempotency_uidx")
      .on(table.variantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check(
      "inventory_movements_type_check",
      sql`${table.movementType} IN ('addition', 'reduction', 'reservation', 'cancellation', 'return', 'adjustment')`
    ),
    check("inventory_movements_quantity_nonzero", sql`${table.quantity} <> 0`),
  ]
);

export const inventoryThresholdChanges = pgTable(
  "inventory_threshold_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    previousThreshold: integer("previous_threshold").notNull(),
    newThreshold: integer("new_threshold").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_threshold_changes_variant_id_idx").on(table.variantId),
    index("inventory_threshold_changes_created_at_idx").on(table.createdAt),
    check("inventory_threshold_changes_previous_non_negative", sql`${table.previousThreshold} >= 0`),
    check("inventory_threshold_changes_new_non_negative", sql`${table.newThreshold} >= 0`),
  ]
);

// ============================================================================
// D. Shopping Cart and Wishlist
// ============================================================================

export const carts = pgTable("carts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    index("cart_items_cart_id_idx").on(table.cartId),
    uniqueIndex("cart_items_cart_variant_uidx").on(table.cartId, table.variantId),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

export const wishlists = pgTable("wishlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wishlist_items_wishlist_id_idx").on(table.wishlistId),
    uniqueIndex("wishlist_items_wishlist_product_uidx").on(
      table.wishlistId,
      table.productId
    ),
  ]
);

// ============================================================================
// F. Discounts (defined before orders so orders.coupon_id can reference coupons)
// ============================================================================

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 60 }).notNull().unique(),
    discountType: varchar("discount_type", { length: 20 }).notNull(),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
    minimumOrderAmount: numeric("minimum_order_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    maximumDiscount: numeric("maximum_discount", { precision: 12, scale: 2 }),
    usageLimit: integer("usage_limit"),
    usagePerCustomer: integer("usage_per_customer").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    check(
      "coupons_discount_type_check",
      sql`${table.discountType} IN ('percentage', 'fixed')`
    ),
    check("coupons_discount_value_positive", sql`${table.discountValue} > 0`),
    check(
      "coupons_percentage_max",
      sql`${table.discountType} <> 'percentage' OR ${table.discountValue} <= 100`
    ),
    check(
      "coupons_min_order_non_negative",
      sql`${table.minimumOrderAmount} >= 0`
    ),
    check(
      "coupons_max_discount_positive",
      sql`${table.maximumDiscount} IS NULL OR ${table.maximumDiscount} > 0`
    ),
    check(
      "coupons_usage_limit_positive",
      sql`${table.usageLimit} IS NULL OR ${table.usageLimit} >= 1`
    ),
    check(
      "coupons_usage_per_customer_positive",
      sql`${table.usagePerCustomer} >= 1`
    ),
    check(
      "coupons_date_range_valid",
      sql`${table.startsAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`
    ),
  ]
);

// ============================================================================
// E. Orders and Payments
// ============================================================================

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderNumber: varchar("order_number", { length: 40 }).notNull().unique(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    shippingFee: numeric("shipping_fee", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    couponId: uuid("coupon_id").references(() => coupons.id, {
      onDelete: "set null",
    }),
    shippingAddressSnapshot: jsonb("shipping_address_snapshot").notNull(),
    paymentMethod: varchar("payment_method", { length: 40 }).notNull().default("cod"),
    paymentStatus: varchar("payment_status", { length: 40 })
      .notNull()
      .default("pending"),
    orderStatus: varchar("order_status", { length: 40 }).notNull().default("pending"),
    customerNotes: text("customer_notes"),
    shippingCarrier: varchar("shipping_carrier", { length: 100 }),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_user_id_idx").on(table.userId),
    index("orders_order_status_idx").on(table.orderStatus),
    index("orders_created_at_idx").on(table.createdAt),
    uniqueIndex("orders_user_idempotency_uidx")
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    check("orders_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("orders_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check("orders_shipping_non_negative", sql`${table.shippingFee} >= 0`),
    check("orders_total_non_negative", sql`${table.totalAmount} >= 0`),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),
    sizeSnapshot: varchar("size_snapshot", { length: 40 }).notNull(),
    colorSnapshot: varchar("color_snapshot", { length: 60 }).notNull(),
    skuSnapshot: varchar("sku_snapshot", { length: 100 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    check("order_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_total_price_non_negative", sql`${table.totalPrice} >= 0`),
  ]
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    previousStatus: varchar("previous_status", { length: 40 }),
    newStatus: varchar("new_status", { length: 40 }).notNull(),
    changedBy: uuid("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_status_history_order_id_idx").on(table.orderId),
    index("order_status_history_created_at_idx").on(table.createdAt),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentMethod: varchar("payment_method", { length: 40 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentStatus: varchar("payment_status", { length: 40 })
      .notNull()
      .default("pending"),
    transactionReference: varchar("transaction_reference", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    check("payments_amount_non_negative", sql`${table.amount} >= 0`),
  ]
);

export const couponUsages = pgTable(
  "coupon_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("coupon_usages_coupon_id_idx").on(table.couponId),
    index("coupon_usages_user_id_idx").on(table.userId),
    uniqueIndex("coupon_usages_coupon_order_uidx").on(table.couponId, table.orderId),
  ]
);

// ============================================================================
// F. Administrator notifications
// ============================================================================

export const adminNotifications = pgTable(
  "admin_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" })
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_notifications_created_at_idx").on(table.createdAt)]
);

export const adminNotificationReads = pgTable(
  "admin_notification_reads",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => adminNotifications.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.notificationId, table.adminId] }),
    index("admin_notification_reads_admin_id_idx").on(table.adminId),
  ]
);

// ============================================================================
// G. Shipping
// ============================================================================

export const shippingZones = pgTable(
  "shipping_zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    governorate: varchar("governorate", { length: 100 }).notNull().unique(),
    shippingFee: numeric("shipping_fee", { precision: 12, scale: 2 }).notNull(),
    estimatedDeliveryDays: integer("estimated_delivery_days").notNull().default(3),
    estimatedDeliveryMaxDays: integer("estimated_delivery_max_days"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    check("shipping_zones_fee_non_negative", sql`${table.shippingFee} >= 0`),
    check("shipping_zones_days_positive", sql`${table.estimatedDeliveryDays} > 0`),
    check(
      "shipping_zones_days_range",
      sql`${table.estimatedDeliveryMaxDays} IS NULL OR ${table.estimatedDeliveryMaxDays} >= ${table.estimatedDeliveryDays}`
    ),
  ]
);

export const shippingSettings = pgTable(
  "shipping_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    freeShippingThreshold: numeric("free_shipping_threshold", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("2500.00"),
    isFreeShippingEnabled: boolean("is_free_shipping_enabled")
      .notNull()
      .default(true),
    isCodEnabled: boolean("is_cod_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "shipping_settings_threshold_non_negative",
      sql`${table.freeShippingThreshold} >= 0`
    ),
  ]
);

// ============================================================================
// H. Reviews
// ============================================================================

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    isApproved: boolean("is_approved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reviews_product_id_idx").on(table.productId),
    index("reviews_user_id_idx").on(table.userId),
    uniqueIndex("reviews_product_user_order_uidx").on(
      table.productId,
      table.userId,
      table.orderId
    ),
    check("reviews_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
  ]
);

// ============================================================================
// I. Website Content Management
// ============================================================================

export const homepageSections = pgTable("homepage_sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  sectionType: varchar("section_type", { length: 80 }).notNull(),
  titleEn: varchar("title_en", { length: 200 }),
  titleAr: varchar("title_ar", { length: 200 }),
  contentEn: text("content_en"),
  contentAr: text("content_ar"),
  displayOrder: integer("display_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
});

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  titleEn: varchar("title_en", { length: 200 }),
  titleAr: varchar("title_ar", { length: 200 }),
  subtitleEn: varchar("subtitle_en", { length: 300 }),
  subtitleAr: varchar("subtitle_ar", { length: 300 }),
  imageUrl: text("image_url").notNull(),
  targetUrl: text("target_url"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const websiteContent = pgTable("website_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentKey: varchar("content_key", { length: 120 }).notNull().unique(),
  titleEn: varchar("title_en", { length: 200 }),
  titleAr: varchar("title_ar", { length: 200 }),
  bodyEn: text("body_en"),
  bodyAr: text("body_ar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: varchar("file_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("media_file_size_positive", sql`${table.fileSize} > 0`)]
);

export const websiteSettings = pgTable("website_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingKey: varchar("setting_key", { length: 120 }).notNull().unique(),
  settingValue: text("setting_value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
