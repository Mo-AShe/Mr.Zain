# MR. ZAIN — Database Entity-Relationship Design

## Core Planned Entities (PostgreSQL)
- `users`: Customer and admin accounts (`id`, `email`, `phone`, `password_hash`, `role`, `created_at`)
- `addresses`: Egyptian delivery addresses (`governorate`, `city`, `street`, `building`, `floor`, `notes`)
- `categories`: Apparel categories (`slug`, `name_en`, `name_ar`, `parent_id`)
- `products`: Apparel items (`slug`, `title_en`, `title_ar`, `description`, `price_egp`, `fabric_details`)
- `product_variants`: Size/color SKU inventory (`product_id`, `sku`, `size`, `color`, `stock_quantity`)
- `carts` & `cart_items`: Active customer/session shopping bags
- `orders`, `order_items`, & `payments`: Checkout snapshots, EGP totals, COD/Paymob/Fawry status
- `shipping_zones`: Delivery fees and estimated transit days per Egyptian governorate
