# MR. ZAIN — E-commerce Platform

MR. ZAIN is an Egyptian clothing storefront and admin console. The active application is a same-origin Express API and static frontend backed by Neon PostgreSQL.

## Technology

- **API/server:** Node.js, Express, and TypeScript (`server.ts`, `server/`)
- **Database:** Neon PostgreSQL using Drizzle ORM; schema and SQL migrations are in `server/db/`
- **Frontend:** Vanilla JavaScript ES modules, HTML, and CSS in `frontend/`
- **Authentication:** HttpOnly session cookies and a double-submit CSRF cookie/header
- **Tests and type-check:** Node's test runner with `tsx`; TypeScript check via `npm run lint`

The legacy `/backend` (FastAPI) and `/database` trees are retained for reference only. They are not used by the active app; do not use their migrations, seed scripts, or API as the source of truth. The active database schema is `server/db/schema.ts`, and the active migrations are `server/db/migrations/`.

## Project layout

```text
.
├── frontend/               # Storefront and /admin/index.html single-page console
│   ├── admin/              # Admin entry/redirect pages
│   ├── css/
│   ├── js/
│   └── pages/              # Customer pages, including shared authentication
├── server/                 # Express API implementation
│   ├── db/                 # Drizzle schema, migrations, and seed
│   ├── middleware/
│   ├── routes/v1/
│   ├── services/
│   └── validators/
├── server.ts               # Express entry point; serves frontend and /api/v1
└── docs/
```

## Run locally

1. Use Node.js and npm versions that support the versions in `package.json`.
2. Create a Neon PostgreSQL database and configure `DATABASE_URL` with its SSL connection string. Configure `SESSION_SECRET` and `JWT_SECRET` as server-only secrets; replace all sample values before running the app.
3. Install dependencies and apply the active Drizzle migrations:

   ```bash
   npm ci
   npm run db:migrate
   ```

4. Start the server:

   ```bash
   npm run dev
   ```

   The Express server serves the `frontend/` directory and API from the same origin. Open `http://localhost:3000/`; the admin console is at `http://localhost:3000/admin/index.html`.

Create the first administrator with `npm run admin:bootstrap` and the server-side `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and `ADMIN_PASSWORD` environment variables. See [docs/admin-setup.md](docs/admin-setup.md).

## Development checks

```bash
npm run lint
npm test
npm run build
```

API endpoints are under `/api/v1`; see [docs/api-specification.md](docs/api-specification.md). Architecture and data model notes are in [docs/architecture.md](docs/architecture.md) and [docs/database-erd.md](docs/database-erd.md).
