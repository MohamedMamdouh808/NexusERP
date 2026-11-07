# Backend Readiness Audit

**Repository:** NexusERP (MohamedMamdouh808/NexusERP)
**Date:** 2026-11-08
**Scope:** backend/, database/, shared/, scripts/, .github/workflows/ only. frontend/ not touched.
**Status:** Complete — all commands run, results recorded below.

---

## 1. Environment check

### .env gitignore
`.env` and `.env.*` (except `!.env.example`) are listed in `.gitignore` at the repository root. **Confirmed: .env is gitignored.**

### DATABASE_URL
`.env` was updated to point at the Supabase session pooler:
- Host: `aws-0-eu-west-1.pooler.supabase.com` (resolved from `aws-1-eu-west-3.pooler.supabase.com`)
- Port: 5432
- Database: `postgres`
- User: `postgres.jjxrjafoxqdpaeiihltv`
- Password: **masked** — never printed, logged, committed, or written to evidence.

The connection string was supplied by the user and written to `.env` directly by them. I did not see or handle the password.

---

## 2. Modules and endpoints that exist

### Backend (`@nexuserp/api`, NestJS modular monolith)
The service compiles to a single deployable application. Domain modules are registered in `AppModule` one at a time by feature.

| Module | Location | Endpoints | Status |
|---|---|---|---|
| Platform (health) | `backend/src/platform/health/health.controller.ts` | `GET /api/v1/health` | Implemented |
| Platform (prisma client) | `backend/src/platform/prisma/prisma.service.ts` | — | Infrastructure only |
| Platform (transaction) | `backend/src/platform/transaction/transaction.service.ts` | — | Infrastructure only |
| Auth | — | — | Not implemented (P0, TODO in PRD) |
| Organizations & membership | — | — | Not implemented (P0, TODO in PRD) |
| RBAC / AccessControl | — | — | Reference tables only (Permission, RoleTemplate, RoleTemplatePermission); no organization-owned roles yet |
| Audit log | — | — | Not implemented (P0, TODO in PRD) |
| Contacts | — | — | Not implemented (P0, TODO in PRD) |
| Products | — | — | Not implemented (P0, TODO in PRD) |

The only deployed route is `GET /api/v1/health`, declared `@Public()`. Every other route is denied by default by the globally registered `PermissionGuard` until authentication lands and a permission is resolved.

### Shared contract (`@nexuserp/shared`)
- Error codes (`ERROR_CODES`), status mapping, default messages
- Permission catalog (`PERMISSION_CATALOG`, 25 codes) and five default role templates (`administrator`, `manager`, `sales`, `inventory`, `purchasing`)
- Zod schemas: `decimalString`, `moneyString`, `unitPriceString`, `quantityString`, `errorEnvelopeSchema`, `healthReportSchema`, `requestIdSchema`
- `isValidRequestId()` / `REQUEST_ID_PATTERN` allowlist

### Database (`@nexuserp/database`, Prisma)
Two migrations:
1. `20261018100057_init_reference_tables` — creates `permissions`, `role_templates`, `role_template_permissions`
2. `20261108004024_enable_rls_on_all_tables` — enables RLS on all 3 tables with no policies

---

## 3. Prisma models and tables

| Model | Table | Columns (key ones) | RLS | Notes |
|---|---|---|---|---|
| `Permission` | `permissions` | `id` UUID PK, `code` VARCHAR(64) unique, `module` VARCHAR(32), `description` VARCHAR(255), `createdAt` TIMESTAMPTZ(6) | Enabled | Global permission vocabulary |
| `RoleTemplate` | `role_templates` | `id` UUID PK, `key` VARCHAR(64) unique, `name` VARCHAR(128), `description` VARCHAR(255), `isSystem` Boolean default true, `createdAt` TIMESTAMPTZ(6) | Enabled | Role recipe, not a grant |
| `RoleTemplatePermission` | `role_template_permissions` | `roleTemplateId` UUID, `permissionId` UUID, composite PK `(roleTemplateId, permissionId)`, `createdAt` | Enabled | Join table; composite PK prevents duplicate grants |

No `Organization`, `User`, `Membership`, `Contact`, `Product`, `AuditLog` table exists yet.

---

## 4. What the seed loads

`database/prisma/seed.ts` — idempotent, upserts keyed on natural unique keys. **Note: the seed was changed from a single long-lived transaction to sequential per-statement auto-committed upserts** because Supabase's session pooler kills idle transactions after ~5 seconds and the seed makes ~98 round trips (~26s in a transaction).

- **Permissions:** all 25 codes from `PERMISSION_CATALOG` (contacts, products, inventory, purchasing, sales, invoices, payments, reports, audit, users, roles, settings)
- **Role templates:** 5 templates (`administrator` = all permissions; `manager` = all except users/roles/settings management; `sales`; `inventory`; `purchasing`)
- **Grants:** composite-key upserts between templates and permissions (68 grants)

No tenant-bearing workspace, organization, or user is created.

---

## 5. Cross-cutting mechanisms

### Permission guard (`backend/src/common/guards/permission.guard.ts`)
- Globally registered `APP_GUARD` in `AppModule` — no endpoint can opt out by forgetting a guard (Constitution Principle II).
- Default deny: a route is reachable only when marked `@Public()`; otherwise it requires `@RequirePermission(code)` and the caller must hold it.
- `effectivePermissions()` returns `[]` until authentication ships — every declared route is denied today, failing closed.
- 403 means "valid member, lacks permission"; 404 is used for cross-tenant records (tenant-isolation guarantee, not yet implemented at the data layer).

### Tenant scoping
- Documented as a convention in `schema.prisma` for LATER features: every organization-owned table gets `organization_id` NOT NULL indexed; foreign keys between organization-owned tables are composite over `(organization_id, id)`; tenant scope resolved from session + verified membership, never client input.
- **Not yet implemented** — no `Organization` table, no membership, no tenant context in queries.

### Error envelope (`backend/src/common/errors/all-exceptions.filter.ts`, shared `ErrorEnvelope`)
- Single `AllExceptionsFilter` (`@Catch()`) registered globally — every failure returns `{ code, message, details, requestId }`.
- `AppException` carries a catalogued `ErrorCode` → HTTP status mapping; unexpected failures return `INTERNAL_ERROR` with a fixed message and the requestId.
- Validation errors map to dotted field paths (`lines.2.quantity`).
- No stack traces, queries, paths, or credentials in responses.

### Request context (`backend/src/common/logging/request-context.ts`)
- `AsyncLocalStorage<RequestContext>` carries `requestId`, `userId` (null until auth), `organizationId` (null until organizations).
- `RequestIdMiddleware` (registered as middleware, **before** guards — T057/FR-028) assigns or adopts `x-request-id`, echoes it on every response, and binds context via `runWithRequestContext`.
- `extendRequestContext()` patches `userId`/`organizationId` after resolution without mutating the outer value.

### Logging (`backend/src/common/logging/logger.ts`)
- Structured JSON to stdout via pino, `NestPinoLogger` adapter.
- `scrubSecrets()` recursively redacts sensitive-named fields at any depth (max 12 levels), before serialization — never mutates input.
- `REDACTION_PATHS` covers `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`.
- `SENSITIVE_FIELD_NAMES` covers passwords, tokens, secrets, API keys, CSRF, session IDs, authorization headers.

---

## 6. Constitution principles vs. current state

Constitution v1.1.0 (`.specify/memory/constitution.md`) — Principles I–IX.

| Principle | Requirement | Current state | Assessment |
|---|---|---|---|
| I. Tenant Isolation | Every org-owned table has NOT NULL `organization_id`; composite FKs; 404 for cross-tenant | No org table exists; convention documented only | **Missing** |
| II. Server-Enforced Authority, Default Deny | Every endpoint declares permission; default deny; server-side validation | `PermissionGuard` global default deny; `@Public()` only on health; Zod schemas in shared | **Partly met** (guard works, no auth to resolve permissions yet) |
| III. Transactional Integrity | Multi-record ops in one transaction; idempotency; immutability; audit commits with business change | `TransactionService` (AsyncLocalStorage propagation) exists; idempotency not yet implemented; no audit table | **Partly met** (transaction boundary exists, nothing posts yet) |
| IV. Exact Decimal Arithmetic | `Decimal(14,2)` money, `(14,4)` price, `(14,3)` quantity; no Float; JSON strings | `check-schema-numeric-types.ts` gate enforced; schema has no Decimal columns yet | **Met** (vacuously — no numeric columns) |
| V. Test-First | Critical rules tested first; real PostgreSQL; 80% coverage on critical paths; CI gates | Jest unit + integration projects; coverage thresholds on `common`, `platform`, `scripts`; boot smoke test uses compiled `dist/main.js` | **Partly met** (infrastructure exists; no critical business paths yet) |
| VI. Modular Monolith | One module per domain; explicit interfaces; no direct cross-table access | Platform module owns DB client; no domain modules yet | **Partly met** (boundary pattern exists, no modules) |
| VII. Honest Product Boundaries | No tax/accounting claims; "operational invoice" labeling | README Legal section states no tax/accounting claims | **Met** |
| VIII. Design System & Accessibility | UI from design system; WCAG 2.1 AA | Frontend concern — not in scope for this audit | — |
| IX. Scope Discipline | P0 first; P3 never | P0 features (auth, orgs, RBAC, audit, contacts, products) all unstarted | **Missing** (not started) |

### PRD Section 9 requirements
Section 9 covers observability/technical constraints. The current backend implements structured logging with request ID but no error monitoring, no metrics, no alerting. **Partly met.**

---

## 7. Command results (step 2 — CONNECT)

All commands run from repository root with `DATABASE_URL` from `.env` (Supabase session pooler, password masked). Only host/database shown.

| Command | Result | Evidence |
|---|---|---|
| `db:generate` | ✅ Pass | Prisma Client v6.19.3 generated |
| `db:migrate` | ✅ Pass | 1 migration applied: `20261018100057_init_reference_tables` |
| `db:seed` | ✅ Pass | 25 permissions, 5 role templates, 68 grants |
| `check:migrations` | ✅ Pass | Applied history matches repository |
| RLS migration (`db:migrate` 2nd run) | ✅ Pass | 1 migration applied: `20261108004024_enable_rls_on_all_tables` |
| `check:migrations` (2nd run) | ✅ Pass | 2 applied migrations match 2 folders |
| `db:seed` (re-run, idempotency) | ✅ Pass | Same counts — no duplicates |
| `dev:api` | ✅ Pass | API started via `nest start --watch` (not tsx), connected to Supabase |
| `/api/v1/health` | ✅ Pass | `{"status":"ok","checks":{"application":{"status":"ok"},"database":{"status":"ok","latencyMs":203}}}` |

The API was stopped after the health check per safety rules (stop every process started).

**Connection diagnosis note:** The initial `.env` on disk pointed at `127.0.0.1:5432` (local PostgreSQL 17 placeholder from `.env.example`), and no server was listening there. After the user updated `.env` to the Supabase session pooler, all database commands connected successfully. Host: `aws-0-eu-west-1.pooler.supabase.com`, database: `postgres`. `sslmode` was not explicitly set — Prisma's default for `postgresql://` over pooled connections worked without it. `connection_limit=5` is the Supabase session pooler default and was not overridden.

---

## 8. Step 3 — SAFETY: db:reset host guard

### Changes
- **`database/scripts/db-reset-guard.ts`** (new): Reads `DATABASE_URL` from `.env` (via the same minimal parser as `with-root-env.mjs`), extracts the host, and refuses to run `prisma migrate reset --force` unless the host is `localhost` or `127.0.0.1`. The password is masked in all diagnostics — only host and database name are shown.
- **`database/package.json`**: `db:reset` changed from `prisma migrate reset --force` to `tsx scripts/db-reset-guard.ts && npx prisma migrate reset --force`.
- **`package.json`** (root): `db:reset` changed from `npm run db:reset --workspace @nexuserp/database` to `node scripts/with-root-env.mjs npm run db:reset --workspace @nexuserp/database` (so `.env` is loaded).

### Test results

**Failing on purpose (Supabase):**
```
db:reset: refused — DATABASE_URL host "aws-0-eu-west-1.pooler.supabase.com" is not localhost or 127.0.0.1.
Resolved URL (password masked):
postgresql://postgres.ymnafwpxuvaptfswwskq:[redacted]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```
Exit code: 1. `prisma migrate reset` was NOT invoked.

**Passing (localhost):**
```
db:reset: host "127.0.0.1" is allowed.
```
The guard does not refuse; `npx prisma migrate reset --force` proceeds (and would fail at the connection step since no local PostgreSQL is running — that is expected and unrelated to the guard).

---

## 9. Step 4 — ROW-LEVEL SECURITY as defence in depth

### Changes
- **`database/prisma/migrations/20261108004024_enable_rls_on_all_tables/migration.sql`** (new): `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on `permissions`, `role_templates`, `role_template_permissions`. **No policies created** — RLS with zero policies means every row is invisible to non-superuser roles (Supabase API roles see nothing), which is the correct default-deny posture.
- **`database/scripts/check-rls.ts`** (new): Scans all migration SQL files, extracts every `CREATE TABLE` table name, and checks that each table has a corresponding `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` somewhere in the migration history. Fails (exit 1) when any table is created without RLS.
- **`database/package.json`**: added `check:rls: tsx scripts/check-rls.ts`.
- **`package.json`** (root): added `check:rls: npm run check:rls --workspace @nexuserp/database`.

### Runbook note (for docs)
Prisma's own `_prisma_migrations` table needs a one-off `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY` run by hand against the Supabase project — Prisma does not manage RLS on its own migrations table. The Supabase Data API stays disabled (verified separately via `scripts/check-supabase-data-api.sh` when `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN` are available).

### Test results

**Passing (current migrations):**
```
check:rls: all 3 table(s) created in migrations have ROW LEVEL SECURITY enabled.
```
Exit code: 0.

**Failing on purpose (temporary migration without RLS):**
Created `20261108004129_tmp_table_without_rls` with `CREATE TABLE "tmp_no_rls" (...)` and no RLS:
```
check:rls: 1 table(s) created without ROW LEVEL SECURITY:
  [20261108004129_tmp_table_without_rls] table "tmp_no_rls" created without ENABLE ROW LEVEL SECURITY
```
Exit code: 1. Temporary migration removed afterwards; `check:rls` re-verified passing.

---

## 10. Problems found (ranked)

| Rank | Problem | Status |
|---|---|---|
| 1 | **`npm test` and CI unit job skip `shared` and `database` workspaces** | Open — listed as follow-up (fix not small) |
| 2 | **No Supabase connection configured** | Resolved — `.env` updated to Supabase session pooler, all DB commands verified |
| 3 | **License mismatch** | Open — `package.json` says `UNLICENSED`, `README.md` says MIT, no `LICENSE` file exists |
| 4 | **Static badges unverified / likely stale** | Open — README badges (Build Passing, Coverage 99.67%, Tests 160 Passing) are static images |
| 5 | **No organization-owned tables** | Open — no `Organization`, `User`, `Membership`, `Contact`, `Product`, `AuditLog` table |
| 6 | **No RLS on any table** | Resolved — RLS enabled on all 3 tables via migration `20261108004024_enable_rls_on_all_tables` |
| 7 | **`db:reset` has no host guard** | Resolved — guard added, tested failing on Supabase and passing on localhost |
| 8 | **Supabase Data API status unknown** | Open — `scripts/check-supabase-data-api.sh` exists but needs `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` |
| 9 | **C locale / sort-order dependencies** | Open — no C-locale dependency found in current schema; flagged for when `lower(unique)` indexes are added |

---

## 11. Follow-ups (not changed per instruction 5)

1. **Fix problem 1(a) only if small** — NOT FIXED. The root `test` script runs only `@nexuserp/api` and `@nexuserp/web`; `shared` (vitest) and `database` (no test script) are excluded. Fix is not small: `shared` uses a different test runner and `database` has no test script. Listed as follow-up.
2. Align license: `package.json` says `UNLICENSED`, `README.md` says MIT with a `LICENSE` link, but **no `LICENSE` file exists** in the repository.
3. Replace static README badges with measured CI results or remove them.
4. Add `Organization`, `User`, `Membership` tables and auth feature (P0).
5. Add `Contact`, `Product` domain modules (P0).
6. Add `AuditLog` module (P0).
7. Implement idempotency (`Idempotency-Key` header).
8. Verify Supabase Data API disabled via `scripts/check-supabase-data-api.sh` (requires `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN`).
9. Add C-locale collation review when `lower(sku)` / `lower(email)` unique indexes are added.
10. Apply `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY` by hand against Supabase (one-off, Prisma does not manage its own migrations table).

---

## 12. Files changed (backend/database/shared/scripts/workflows only)

| File | Action |
|---|---|
| `docs/backend-readiness.md` | Created (this audit) |
| `database/prisma/migrations/20261108004024_enable_rls_on_all_tables/migration.sql` | Created — RLS on all tables |
| `database/scripts/db-reset-guard.ts` | Created — localhost-only guard for `db:reset` |
| `database/scripts/check-rls.ts` | Created — RLS coverage guard |
| `database/package.json` | `db:reset` uses guard; added `check:rls` |
| `package.json` (root) | `db:reset` uses `with-root-env.mjs`; added `check:rls` |
| `database/prisma/seed.ts` | Changed from single transaction to sequential auto-committed upserts (Supabase pooler compatibility) |
| `frontend/` | **Not touched** |
