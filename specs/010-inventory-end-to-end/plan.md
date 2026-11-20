# Implementation Plan: Inventory end to end — real stock for every organization

**Branch**: `010-inventory-end-to-end` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/010-inventory-end-to-end/spec.md`

## Summary

Real inventory for every organization: a new backend capability that owns warehouses, stock balances, an append-only movement ledger and stock adjustments (with the idempotency layer the first posting endpoint needs), plus the Inventory screens switching from the in-memory sample service to that real API. The stock model follows the products/contacts pattern exactly — snake_case columns, composite organization keys, version numbers, audit entries in the same transaction, row-level security enabled with no policies, and immutable additive migrations. The interface keeps its existing screens and loses its sample-data banner; the still-sample modules keep their own private sample stock and never touch the real tables.

## Technical Context

**Language/Version**: TypeScript 5.6 (backend: Node 24 / NestJS 10; frontend: React 18 + Vite 6)
**Primary Dependencies**: NestJS 10 + Prisma 6 (PostgreSQL), Zod (request validation), `@nestjs/swagger` (OpenAPI generation), TanStack Query 5 + React 18 (frontend), the shared package for permission codes and error envelopes
**Storage**: PostgreSQL (Supabase), existing `warehouses` table extended, new `stock_balances`, `stock_movements` and `idempotency_keys` tables
**Testing**: Backend `npm test` (unit) + `npm run test:integration` (real `nexuserp_test` schema); frontend `npx vitest run`; `scripts/verify-db-invariants.mjs`; `npm run openapi:diff` (contract drift)
**Target Platform**: Linux server (API), evergreen desktop/mobile browsers (web)
**Project Type**: web-service + SPA (existing modular monolith — no new service, no new package)
**Performance Goals**: PRD Section 8 targets — list endpoints answer a page of 100 within the product's stated latency budget; the balances endpoint stays a single query plan with the low-stock rule evaluated in the database, never row-by-row in the application
**Constraints**: no floating-point money **or quantity** arithmetic anywhere (exact decimals only; the 0.1 + 0.2 = 0.3 vector is a test); no microservices/Redis/Kubernetes in v1; migrations are additive and immutable; row-level security enabled with no policies; every endpoint declares its permission; the public schema is never touched by a test run
**Scale/Scope**: 1 new backend module (inventory) + 1 shared platform concern (idempotency), 3 new tables, 1 extended table, ~9 endpoints, 4 interface screens touched, 3 still-sample modules left isolated

## Constitution Check

*GATE: must pass before Phase 0 research — it does; re-checked after Phase 1 design — it still does.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | **Pass** — `stock_balances`, `stock_movements` and `idempotency_keys` all carry `organization_id`; every table is reached only through the session's organization; balances/movements reference `(organization_id, warehouse_id)` and `(organization_id, product_id)` composite keys like products and contacts; row-level security enabled with no policies; cross-organization records answer 404. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | **Pass** — `inventory.read` on both list endpoints, `inventory.write` on warehouse writes, `inventory.adjust` on adjustments; the usage checks (reserved stock on archive, stock on deactivation, archived-product write-offs, inactive-warehouse adjustments) are all server-side refusals with 409. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | **Pass** — an adjustment is one transaction (lock balance → movement → balance → audit → idempotency record); `Idempotency-Key` is required on the adjustment endpoint; movements and audit entries are append-only, enforced by database triggers; the idempotency record is written in the same transaction. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | **Pass** — on-hand, reserved and every movement quantity are `NUMERIC(14,3)`; available is derived in the query, never stored; all arithmetic happens in PostgreSQL (or with exact decimal helpers), never in JavaScript floats; the decimal test vectors are part of the suite. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | **Pass** — the failing tests come first per task batch: the schema/migration checks, the tenant-isolation and permission tests per endpoint, the concurrency test, the duplicate-request tests, the rollback test, the append-only test, the decimal vectors, and the invariant script additions. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | **Pass** — a new `inventory` module owns its tables; the products module keeps its own tables and only *asks* the inventory capability through the existing `PRODUCTS_USAGE_HOOK` seam (the answer arrives through the seam, not through a write); the shared package gains permission definitions only; no module writes another's tables and no cycle is introduced. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | **Pass** — stock is a quantity; no valuation, costing or compliance claim is made; the out-of-scope list is explicit. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | **Pass** — the screens reuse the existing components, states and tokens (the sample-data banner is removed, the inline error treatment with the request identifier is reused); no new colour or spacing is introduced, and the design-value check keeps passing. |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | **Pass** — P0 (PRD P0-F006 gates purchasing receipts and sales reservations); reservations, receipts, shipments, transfers, lots, serials, valuation, costing, import/export are out of scope and stay out. |

**Constraints recorded in Technical Context**: real-PostgreSQL integration tests (isolated schema only), no floating-point money **or quantity** arithmetic, no microservices/Redis/Kubernetes in v1, additive immutable migrations, and the Phase 4 build order for the modules involved (shared permissions → database migrations → platform idempotency → inventory module → products hook → frontend client → frontend screens → docs and contract).

## Project Structure

### Documentation (this feature)

```text
specs/010-inventory-end-to-end/
├── spec.md            # feature specification (incl. the Clarifications session)
├── plan.md            # this file
├── research.md        # Phase 0 output: the design decisions and their alternatives
├── data-model.md      # Phase 1 output: tables, columns, constraints, invariants
├── quickstart.md      # Phase 1 output: manual and automated verification
├── contracts/
│   ├── inventory-api.md   # the inventory endpoints' request/response contract
│   └── idempotency.md     # the idempotency record's contract and lifecycle
├── checklists/
│   └── requirements.md
└── tasks.md           # Phase 2 output (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
shared/src/permissions/index.ts          # + inventory.read / inventory.write / inventory.adjust

database/prisma/schema.prisma            # + StockBalance, StockMovement, IdempotencyKey models; warehouse columns
database/prisma/migrations/<new>/         # additive: tables, constraints, triggers, RLS, indexes, backfill
scripts/verify-db-invariants.mjs         # + on_hand = sum(movements), reserved <= on_hand, movement immutability

backend/src/common/                      # + idempotency service/interceptor seam, shared error codes
backend/src/modules/inventory/            # NEW: controller, service, dto/, usage hook provider, low-stock rule
backend/src/modules/products/             # wire the inventory-backed usage provider (no table writes)
backend/src/openapi/openapi-document.ts  # + the inventory endpoints (drift check must pass)

frontend/src/services/inventory-client.ts # NEW: the real API client behind the service seam
frontend/src/services/catalog-service.ts  # + the inventory surface the screens consume
frontend/src/features/inventory/          # balances-tab, movements-tab, warehouses-tab, use-inventory
frontend/src/i18n/locales/{en,ar}/       # + the new and changed strings in both languages
frontend/src/features/products/          # + the archived-product adjust-stock entry point

docs/PRD.md, docs/api-*.md               # + the inventory endpoints and the rules
```

**Structure Decision**: the existing modular monolith, extended — no new package, no new service. The backend gains one module (`inventory`) plus one shared platform concern (idempotency) that lives beside the other shared infrastructure. The frontend gains one client beside `products-client.ts` and reuses the existing service seam (`catalog-service.ts`) so the screens do not know whether the data is sample or real.

## Implementation order (input for /speckit.tasks)

1. **Shared permissions** (inventory.read / inventory.write / inventory.adjust) and the role templates that grant them.
2. **Database**: additive migrations — extend `warehouses` (active flag, version, name uniqueness), create `stock_balances`, `stock_movements` (append-only triggers, RLS) and `idempotency_keys` (RLS), plus the backfill of version 1.
3. **Platform idempotency**: the record table's writer/reader, the request fingerprint, the replay and the 422-on-mismatch, the expiry and the purge.
4. **Inventory module**: warehouses (CRUD, default, deactivate/reactivate), the balances and movements reads, the adjustments write, the shared low-stock rule, the inventory-backed products usage provider.
5. **Frontend**: the real client behind the service seam, then the four screens (balances, movements, warehouses, adjust dialog), the archived-with-stock filter and hints, the idempotency key generated on open and reused on retry, both locales.
6. **Verification**: unit, integration (isolated schema only), concurrency, duplicate-request, rollback, append-only, the extended invariant script, the contract drift check, and the manual quickstart paths.

## Phase 2 hand-off

`/speckit.tasks` converts this plan into `tasks.md`, with the failing tests landing in the first batch of every phase and the migrations (immutable, additive) ordered before the code that depends on them.
