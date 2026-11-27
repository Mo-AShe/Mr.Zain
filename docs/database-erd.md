# MR. ZAIN — Database Model

The active database is Neon PostgreSQL. `server/db/schema.ts` is the Drizzle ORM source of truth; migrations used by the running Express application are in `server/db/migrations/`. This overview is intentionally relational rather than a replacement for the typed schema.

## Main relationships

- `roles` → `users` → `sessions`; users also own `addresses`, `carts`, and `wishlists`.
- `categories` → `products`; products have `product_images` and `product_variants`.
- `collections` and `products` are linked many-to-many through `product_collections`.
- `product_variants` have one inventory record in `inventory`; adjustments and lifecycle changes are recorded in `inventory_movements` and `inventory_threshold_changes`.
- `carts` → `cart_items` → `product_variants`.
- `users` → `orders`; an order contains `order_items`, has `payments` and `order_status_history`, and may refer to a `coupon`.
- `coupons` → `coupon_usages`; a usage records its customer and order.
- `shipping_zones` hold governorate-specific fees and delivery estimates; `shipping_settings` hold free-shipping and COD rules.
- Admin notification records reference orders and per-admin read state. Store content is held in `homepage_sections`, `banners`, `website_content`, `website_settings`, and `media`.

## Legacy files

The older `/database` SQL, seed, and migration files are retained for reference and do not define the active schema. Use the Drizzle schema and migrations under `/server/db/`.
