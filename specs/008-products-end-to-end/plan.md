# Implementation Plan: Products End to End

**Branch**: `008-products-end-to-end` | **Date**: 2026-11-11 | **Spec**: [specs/008-products-end-to-end/spec.md](spec.md)
**Input**: Feature specification from `specs/008-products-end-to-end/spec.md`

## Summary

Build the product catalogue the way the contacts feature was built: a real
service, real tables, and the product screens reading that service instead of
demonstration data.

Three tenant-scoped tables join the schema - `products`, `product_categories`
and `units_of_measure` - each carrying `organization_id`, a composite
`(organization_id, id)` key, row-level security with no policies, and an audit
entry written in the same transaction as every change. The SKU is unique within
an organization without regard to capitalisation and stays reserved even when
the product is archived. Prices are exact decimals with four places, the
optional reorder level three, and both cross the interface as strings.

Two things travel beyond the products module, both decided in the
clarification: the organization's currency becomes a stored setting
(`organizations.currency_code`, new migration, default `USD`) that the identity
feature exposes read-only, and the archive usage hook is the single seam through
which the future purchasing, sales and inventory features will refuse archiving
a product that is still in use.

## Technical Context

**Language/Version**: TypeScript 5.6+ / Node.js 20+ (CI runs Node 22)
**Primary Dependencies**:
- Backend: NestJS 11, Prisma 6.1, `@nestjs/swagger`, `zod`, `class-validator`, `class-transformer`
- Frontend: React 18, React Router 6, TanStack Query 5, `@nexuserp/ui`
- Shared: `@nexuserp/shared`
**Storage**: PostgreSQL 16+ via Prisma (real database only; no SQLite, no in-memory substitutes)
**Testing**: Jest (unit + integration against the isolated `nexuserp_test` schema), Vitest (frontend), Playwright (e2e)
**Target Platform**: Node.js server (Linux/Windows) + modern evergreen browser SPA
**Project Type**: web-service + SPA in a monorepo (NestJS modular monolith + Vite React SPA)
**Performance Goals**: <200ms p95 for list and search queries up to 10k products per tenant (the spec commits to the looser, measurable ceiling of under one second)
**Constraints**: strict multi-tenancy (every query scoped to `organizationId`); no floating-point money or quantities - prices are `NUMERIC(14,4)` and the reorder level `NUMERIC(14,3)`, carried as decimal strings; real-PostgreSQL integration tests only; no microservices, Redis or Kubernetes in v1; snake_case table and column names via `@map`; row-level security enabled with no policies; the integration suite runs only in the isolated schema, which is dropped, recreated and rebuilt from the current migrations before the first suite
**Scale/Scope**: ~10,000 products per organization; server-side pagination with a default page size of 25 and a maximum of 100; no stock rows and no stock tables (Inventory owns them)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | **PASS** - `products`, `product_categories` and `units_of_measure` gain `organization_id` with a composite `(organization_id, id)` unique key and composite foreign keys to `organizations`; the category and unit references on a product are composite over `(organization_id, id)` so a product cannot point at another organization's category or unit. Tenant scope enters the request context in the session guard, which binds the organization before any controller runs, and every query filters on it. Row-level security is enabled with no policies, and the naming guard keeps the tables snake_case. A test asserts that another organization's product, category and unit answer "not found". |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | **PASS** - `products.read` on the list, the single product, the categories and the units; `products.write` on create, update, archive, restore and on category and unit creation. The permission guard denies by default, and the state transitions (archived, restored, and the version check) are validated on the server. The interface hides what the caller may not do, using the permissions the identity answer carries; the server remains the authority. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | **PASS** - Creating an organization and its default units of measure is one transaction; every product change and its audit entry commit together, so a failed audit write rolls the change back with it. No product is ever deleted: archival is the only way out and an archived record stays readable. The usage-hook refusal leaves the product active. No endpoint here posts an immutable document, so no `Idempotency-Key` is required in this feature. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | **PASS** - `purchase_price` and `selling_price` are `NUMERIC(14,4)`, `low_stock_threshold` is `NUMERIC(14,3)`, all three carry non-negative checks, and none of them is ever rounded anywhere: the values cross the interface as decimal strings and the interface performs no arithmetic on money. |
| V. Test-first | Which failing test is written first, and what critical-path coverage does this change reach? | **PASS** - `backend/test/integration/products.spec.ts` is written first and observed failing against the real database: creation and SKU uniqueness, the search escaping and the filters, the stale-version refusal, the archive and restore round-trip, the usage refusal with a stub, the category and unit rules, the tenant isolation of every endpoint and the permission refusal of every write endpoint. The frontend tests cover the real client and the form rules. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | **PASS** - A self-contained products module owns its three tables. The usage check is an injectable seam the future purchasing, sales and inventory modules implement, so no cycle is created now and the products module knows nothing of their documents. The one change outside the module is the organization's currency column, which the identity feature exposes read-only on its own answers; the products module never writes the organizations table. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | **PASS** - Prices are recorded exactly as entered and shown as recorded. Nothing here claims tax treatment, certified invoicing or complete accounting; the reorder level is a level the inventory feature compares against, not a stock figure this feature computes. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | **PASS** - The shared components are used (table, input, select, card, badge, button, dialog, toast, empty state, error state). The PRD 7.3 rules apply in full: validation on blur and on submit with the error under the field, skeletons while loading, a dismissible error banner carrying the reference identifier, a confirmation toast naming the record, a confirmation dialog for archiving, an empty state that offers the create action, a status badge, and a server-side table with a visible total. Every control is reachable and operable by keyboard, with WCAG 2.1 AA contrast and focus visibility. |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | **PASS** - P0-F005 is a must-have for v1. The authentication, authorization, audit and contact foundations it depends on are in place, and the features that will consume products (inventory, purchasing, sales) remain their own features. Variants, barcodes, images, price lists, import and export and inventory stock are explicitly out of scope. |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests,
no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the
Phase 4 build order for the modules involved.

### Post-design re-check (after Phase 1)

Re-read against the design in `data-model.md` and `contracts/products-api.md`:

| Principle | Re-check | Result |
|-----------|----------|--------|
| I. Tenant Isolation | The design puts `organization_id` on all three tables with composite `(organization_id, id)` keys, and the product's references to its category and unit are composite over `(organization_id, id)` - a product cannot name another organization's category or unit. The SKU uniqueness index is over `(organization_id, LOWER(sku))`, so it holds the tenant in the index itself. | **PASS** |
| II. Server-Enforced Authority | The contract declares `products.read` on the three lists and the single read, `products.write` on every change; both permissions already exist in the shared catalogue and are granted by the administrator and manager role templates. The version check and the usage refusal are server-side. | **PASS** |
| III. Transactional Integrity | The design puts the default units of measure in the transaction that creates the organization, and every catalogue change in a transaction that also writes the audit entry. No delete path exists, and the migration creates no stock row. | **PASS** |
| IV. Exact Decimals | `NUMERIC(14,4)` for the prices and `NUMERIC(14,3)` for the reorder level, with non-negative checks; the contract carries them as strings and refuses a number. | **PASS** |
| V. Test-first | The plan names the integration file and the frontend test files; both are written before the implementation and observed failing against the real database. | **PASS** |
| VI. Modular Boundaries | The usage hook is the only seam to the future modules, the products module never reads the organizations table, and the currency is exposed read-only by the identity feature that owns it. | **PASS** |
| VII. Honest Boundaries | The prices are recorded and shown as recorded; the reorder level is a level, not a computed stock figure. | **PASS** |
| VIII. Design System & A11y | The contract and the plan name the shared components, the PRD 7.3 rules and the "Reorder level (low-stock threshold)" term the clarification fixed. | **PASS** |
| IX. Scope Discipline | The design creates no stock table, no variants, no images and no price lists; the inventory feature owns the stock. | **PASS** |

**Build order**: shared contracts and error codes → migration and schema → shared
permissions and audit actions → the products module (service, then endpoints) →
the identity feature's read-only currency → the interface client and screens →
the contract, the invariants and the guards.

## Project Structure

### Documentation (this feature)

```text
specs/008-products-end-to-end/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── products-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/src/modules/products/
├── products.module.ts
├── products.controller.ts
├── products.service.ts
├── products-usage.hook.ts
└── dto/
    ├── create-product.dto.ts
    ├── update-product.dto.ts
    ├── list-products.dto.ts
    ├── create-category.dto.ts
    ├── create-unit.dto.ts
    └── product-response.dto.ts

backend/test/integration/
└── products.spec.ts

backend/src/modules/auth/            # read-only currency on the identity answers
└── auth.service.ts

database/prisma/
├── schema.prisma
└── migrations/
    └── 20261110000013_products_catalog_and_currency/
        └── migration.sql

frontend/src/features/products/
├── products-page.tsx
├── product-detail-page.tsx
├── product-new-page.tsx
├── product-edit-page.tsx
└── use-products.ts

frontend/src/services/
└── products-client.ts

frontend/src/features/products/__tests__/
├── products-client.spec.ts
└── product-form.spec.tsx

shared/src/
├── products/index.ts      # the products contract vocabulary
└── audit/index.ts         # the products audit actions
```

**Structure Decision**: the repository is a monorepo of four workspaces
(`backend/`, `frontend/`, `database/`, `shared/`), and the feature follows the
contacts feature's layout exactly: a self-contained module in the backend, the
data model in `database/`, the contract vocabulary in `shared/`, and the screens
in `frontend/src/features/`. The product screens keep the contacts naming
(`use-products.ts`, `products-client.ts`) so the two features read as one
pattern rather than two.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | The constitution check passes for all nine principles | - |
