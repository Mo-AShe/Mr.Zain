# MR. ZAIN — API Specification

## Runtime and base URL

The active API is an Express + TypeScript application mounted at `/api/v1` by `server.ts`. The Express server also serves the static application from `/frontend`, so the browser uses the same origin. Active route definitions are in `server/routes/v1/`; request shapes are enforced by Zod validators under `server/validators/`.

The `/backend` FastAPI tree is legacy/reference material and is not the active API.

## Endpoint groups

### Public and customer

- `/health` — health check
- `/auth/*` — registration, sign-in, session identity, and sign-out
- `/categories/*`, `/products/*`, `/collections/*`, `/homepage/*` — storefront catalog and content
- `/cart/*` — customer cart operations
- `/addresses/*` — customer delivery addresses
- `/checkout/*` — preview, shipping quote, and COD order placement
- `/orders/*` — customer order history and cancellation

### Administrator

All `/admin/*` endpoints require an authenticated admin session. The active admin groups include:

- `/admin/me`, `/admin/dashboard`, `/admin/dashboard/sales`
- `/admin/products/*`, `/admin/categories/*`, `/admin/collections/*`
- `/admin/inventory/*`
- `/admin/orders/*`, `/admin/customers/*`
- `/admin/coupons/*`, `/admin/shipping/*`
- `/admin/settings/*`, `/admin/banners/*`, `/admin/notifications/*`

The admin console is `/admin/index.html`; its section links are hash routes, such as `#orders` and `#customers`. The legacy `/admin/orders.html` and `/admin/customers.html` pages redirect to these sections.

Homepage banners are managed from **Store Settings → Homepage Ads**. Admins can create, edit, activate/deactivate, reorder, and delete bilingual banners with uploaded images and internal storefront links. The homepage promotion section displays active banners in display order; the global visibility switch remains under the Homepage Config tab.

- `GET /admin/settings` — returns the admin settings overview, including all banners
- `POST /admin/banners` — create a banner using an `imageUploadId` returned by `POST /admin/products/images/staged`
- `PATCH /admin/banners/:id` — update banner copy, link, order, visibility, or replace its image
- `DELETE /admin/banners/:id` — delete a banner and its managed image

## Authentication and request security

- Authentication uses a server-managed session in an HttpOnly cookie. The browser does not store bearer tokens in `localStorage` or `sessionStorage`.
- Mutating requests use the double-submit CSRF model: the frontend reads the CSRF cookie and sends the value in `X-CSRF-Token`.
- Admin routes enforce authentication, admin authorization, and CSRF validation for state-changing HTTP methods.
- `401` means the session is missing or invalid; the admin UI redirects to the shared `/pages/auth.html` sign-in page. `403` means the authenticated account is not authorized for the console.

## Validation and errors

Route handlers parse query parameters, path parameters, and bodies with their corresponding Zod schemas before calling service functions. Errors are returned through the shared Express error handler; clients should present the server's validation or conflict message rather than treating a failed response as success.

## Source of truth

The Drizzle schema and active migrations are under `server/db/`. Endpoint behavior is implemented in `server/services/`; update this document when the API surface changes.
