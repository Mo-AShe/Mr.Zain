# MR. ZAIN — REST API Specification

Base Prefix: `/api/v1`

## Planned Endpoint Groups
- `GET /health` — Service health check
- `/auth/*` — Customer/admin registration, JWT login, token refresh, profile
- `/categories/*` — Clothing collections & categories
- `/products/*` — Catalog listing, filtering (size, color, price in EGP), product details
- `/cart/*` — Shopping bag operations
- `/orders/*` — Checkout, Egyptian governorate shipping calculation, order tracking
- `/admin/*` — Protected admin KPIs, product/variant CRUD, order status management, customer directory
