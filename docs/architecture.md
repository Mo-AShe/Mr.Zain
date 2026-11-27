# MR. ZAIN — System Architecture

## Active runtime

`server.ts` is the application entry point. It creates an Express app, mounts the versioned API at `/api/v1`, serves product uploads, and serves the static frontend from `/frontend` on the same origin. The admin console is the single-page app at `/admin/index.html`; `frontend/js/admin/dashboard.js` selects sections from the URL hash.

The active server stack is:

1. **Frontend (`frontend/`)** — HTML, CSS, and vanilla JavaScript modules for the storefront and admin console. `frontend/js/api.js` calls the same-origin API and attaches the CSRF header to mutating requests.
2. **API (`server/`)** — Express routes, middleware, Zod validators, and services written in TypeScript. Routes are grouped under `server/routes/v1/`.
3. **Data (`server/db/`)** — Drizzle ORM schema and SQL migrations for Neon PostgreSQL. Business queries and transactions are implemented in `server/services/`.

## Request flow

```text
Browser (frontend/)
  -> /api/v1 route
  -> authentication/authorization/CSRF middleware
  -> Zod request validator
  -> service function
  -> Drizzle ORM / PostgreSQL
```

The admin API requires an authenticated admin session. The session is an HttpOnly cookie; state-changing routes also require the CSRF cookie value in `X-CSRF-Token`. The frontend must not persist authentication tokens in browser storage.

## Database source of truth

Use `server/db/schema.ts`, `server/db/migrations/`, and the `db:*` npm scripts for the active database. `/backend` contains an older FastAPI implementation and `/database` contains older SQL assets; they are legacy/reference material and are not part of the active request path.

See [admin-setup.md](admin-setup.md) for administrator provisioning and [database-erd.md](database-erd.md) for the current data model overview.
