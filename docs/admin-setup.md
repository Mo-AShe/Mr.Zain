# MR. ZAIN — Secure Initial Admin Setup & Verification

This document explains how to provision the first **MR. ZAIN** administrator account in Neon PostgreSQL using the one-time CLI bootstrap script (`npm run admin:bootstrap`).

## 1. Required Server-Side Environment Variables

Set the following server-side variables in your shell session or deployment secret manager (never prefix with `VITE_` and never place real credentials in frontend files or committed configuration):

- `ADMIN_EMAIL` — Valid email address for the initial administrator (normalized to lowercase).
- `ADMIN_FULL_NAME` — Administrator display name (2–150 characters).
- `ADMIN_PASSWORD` — Strong password meeting all requirements:
  - 12–128 characters, no leading or trailing spaces
  - At least 1 uppercase letter (`A-Z`)
  - At least 1 lowercase letter (`a-z`)
  - At least 1 number (`0-9`)
  - At least 1 special character (e.g., `!@#$%^&*`)
  - Must not contain the email local-part or trivial weak sequences

## 2. Running the Bootstrap Script

Run with environment variables passed directly for the one-time execution (recommended so secrets are not left in plaintext config files):

```bash
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_FULL_NAME="MR. ZAIN Admin" \
ADMIN_PASSWORD="YourStrong!Password123" \
npm run admin:bootstrap
```

### One-Time & Concurrency Guarantees

- Executes inside a PostgreSQL transaction protected by `pg_advisory_xact_lock(71001, 1)` so concurrent runs serialize safely.
- Uses the existing `admin` role in `roles` (never creates duplicate roles).
- Hashes the password using the shared `bcryptjs` helper (`BCRYPT_COST = 12`).
- If an administrator already exists, exits safely with code `0` without modifying any database rows.
- If `ADMIN_EMAIL` belongs to an existing customer account, refuses to promote or overwrite that account and exits non-zero.
- Never prints passwords or password hashes to logs.

## 3. Admin Authentication & Authorization

- Administrators sign in through the standard session login endpoint (`POST /api/v1/auth/login` or `/pages/auth.html`), backed by `HttpOnly` `mz_session` cookies and `mz_csrf` CSRF protection.
- Protected admin endpoints live under `/api/v1/admin/*` and enforce:
  - `requireAuth` (returns HTTP `401` if unauthenticated, expired, or revoked)
  - `requireRole("admin")` (`requireAdmin`, returns HTTP `403` for customer accounts)
  - `requireMutatingCsrf` (enforces same-origin + CSRF validation on all `POST`/`PUT`/`PATCH`/`DELETE` routes under `/api/v1/admin/*`)
- `GET /api/v1/admin/me` returns only safe profile metadata (`id`, `fullName`, `email`, `phone`, `role`, `isVerified`, `createdAt`) with `Cache-Control: no-store`.
- Signing out via `POST /api/v1/auth/logout` revokes the session row in `sessions`, clears session/CSRF cookies, and immediately blocks further access to `/api/v1/admin/*`.
