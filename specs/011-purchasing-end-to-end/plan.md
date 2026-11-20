# Implementation Plan: Purchasing end to end — real purchase orders and goods receipts

**Branch**: `010-inventory-end-to-end` (the working branch; the constitution's single-branch workflow selects the feature through `.specify/feature.json` → `specs/011-purchasing-end-to-end`) | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/011-purchasing-end-to-end/spec.md`

## Summary

Real purchasing for every organization: a new backend module that owns purchase orders, order lines, goods receipts and receipt lines, posts RECEIPT movements and stock increases through the Inventory service inside one transaction, and answers the "is this record still in use?" question that Contacts, Products and Inventory ask. The Purchasing screens switch from the in-memory sample service to that real API, the sample purchasing data and the sample banner are deleted, and the still-sample Sales, Invoicing and Overview modules keep their own private data.

The feature follows the products/contacts/inventory pattern exactly: snake_case columns, composite organization keys, version numbers, audit entries in the same transaction as the business change, an `Idempotency-Key` on the posting path, row-level security enabled with no policies, and immutable additive migrations. The specification was clarified on 2026-11-13; its five answers shape the two list rows, the receive dialog, the module gate and the document numbering, and they are folded into `research.md` (D12–D18), `data-model.md` and `contracts/`.

## Technical Context

**Language/Version**: TypeScript 5.6 (backend: Node ≥ 22.13 / NestJS 11; frontend: React 18 + Vite 6)
**Primary Dependencies**: NestJS 11 + Prisma 6 over PostgreSQL, Zod 3 (request validation), `@nestjs/swagger` (OpenAPI generation), TanStack Query 5 + React 18 (frontend), `@nexuserp/shared` for permission codes, error codes and audit actions
**Storage**: PostgreSQL (Supabase) — new `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`; `document_sequences` gains a unique constraint on `("organizationId", name)`; `stock_movements` is reused for RECEIPT movements; `idempotency_keys` is reused for the receipt claim
**Testing**: Backend `npm test` (unit) + `npm run test:integration` (real `nexuserp_test` schema only); frontend `npx vitest run`; `scripts/verify-db-invariants.mjs`; `npm run openapi:diff` (contract drift); `npm run check:guards` (migrations, RLS, naming, boundaries, structure, secrets)
**Target Platform**: Linux server (API), evergreen desktop/mobile browsers (web)
**Project Type**: web-service + SPA (existing modular monolith — no new service, no new package)
**Performance Goals**: PRD Section 8 — a list endpoint answers a page of 100 within the stated latency budget; the receipt summary and the order progress summary are each computed by one aggregate query per page, never row-by-row in the application
**Constraints**: no floating-point money **or quantity** arithmetic anywhere (exact decimals only; the three rounding vectors are tests); no microservices/Redis/Kubernetes in v1; migrations are additive and immutable; row-level security enabled with no policies; every endpoint declares its permission **and** the shared module gate; the public schema is never touched by a test run
**Scale/Scope**: 1 new backend module (purchasing) + 1 dependency-light usage-answer module, 4 new tables, 2 new unique constraints, ~9 endpoints, 6 interface screens touched, 3 still-sample modules left isolated

## Constitution Check

*GATE: must pass before Phase 0 research — it does; re-checked after Phase 1 design — it still does, with one deferral recorded in Complexity Tracking.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | **Pass** — all four new tables carry `organization_id`; every organisation-owned relation is composite over `(organization_id, id)` (`purchase_order_lines → purchase_orders`, `goods_receipts → purchase_orders`, `goods_receipt_lines → goods_receipts` and `purchase_order_lines`, `purchase_order_lines → products`, `purchase_orders → contacts` and `warehouses`); every query is scoped by the organisation resolved from the session, and another organisation's record answers 404 on every endpoint. RLS is enabled with no policies on all four tables. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | **Pass, with one recorded deferral** — reads declare `purchasing.read`, order writes declare `purchasing.write`, the receipt declares `inventory.receive` (all three codes already exist in the shared catalogue); every status transition, archived/active reference, quantity, version and line match is validated server-side, and the interface only hides actions. The module-disabled refusal is deferred to the Organization settings feature (P0-F002) and is recorded in Complexity Tracking, with the shared Purchasing module gate shipped so the check can be enabled in one place. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | **Pass** — a receipt is one transaction (order lock → line locks → receipt and receipt-line inserts → RECEIPT movements through the Inventory service → balance increases → received-quantity updates → status update → audit entry → idempotency record); the receipt endpoint requires the `Idempotency-Key` header; receipts, receipt lines and movements are append-only, enforced by database triggers plus a revoked `TRUNCATE`; the audit entry commits with the business change. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | **Pass** — ordered, received and movement quantities are `NUMERIC(14,3)`, unit costs `NUMERIC(14,4)`, line and order totals `NUMERIC(14,2)`; the service rounds half-up per line with `Prisma.Decimal` and sums already-rounded line totals; every JSON amount is a string; the three required vectors are tests. The new list aggregates are `SUM(...)` in PostgreSQL and are returned as decimal strings. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | **Pass** — the failing tests land first per batch: the tenant-isolation and permission tests for every endpoint, the module-gate declaration test, two simultaneous receipts on one line, the receipt-versus-cancel race, the duplicate-key and key-reuse tests, the rollback test, the append-only tests, the three rounding vectors, the mixed-unit aggregate, the status/progress consistency check and the usage guards. Integration tests run against real PostgreSQL in the isolated schema and leave the public counts unchanged. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | **Pass** — the new `purchasing` module owns its four tables; the stock effect goes through `InventoryService.postReceiptMovement` (Purchasing never writes a movement or a balance); Contacts, Products and Inventory ask the purchasing usage answer through the existing seams instead of reading its tables; a dependency-light usage module breaks the otherwise circular dependency (Purchasing needs Inventory, Inventory needs Purchasing's answer) without `forwardRef` and without a cross-module table read. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | **Pass** — a purchase order and a goods receipt are operational documents; no tax, valuation, costing, invoice or accounting claim is made, and the out-of-scope list is explicit. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | **Pass** — the screens reuse the existing components, tokens and states; the feature implements the PRD 7.3 rules for the paths it touches (skeleton loading, disabled submit with spinner, inline field errors, the dismissible banner carrying the `requestId`, the success toast naming the `GR-` number, the confirmation dialog for the irreversible receipt, status badges with API names, server-paginated tables with a visible total). Labels move to the real-module convention (no `*` inside the label text; the component's own required marker is used). |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | **Pass** — P0 (PRD P0-F007). The build order places purchasing after inventory, so the preceding stage exists; returns, supplier invoices, bills, taxes, discounts, landed costs, valuation, approvals, attachments, printing and import/export stay out, as does module availability (owned by P0-F002). |

**Constraints recorded in Technical Context**: real-PostgreSQL integration tests (isolated schema only), no floating-point money **or quantity** arithmetic, no microservices/Redis/Kubernetes in v1, additive immutable migrations, and the Phase 4 build order for the modules involved (shared codes and audit actions → database migrations → platform seams → purchasing module → usage answers → inventory receipt method → frontend client → frontend screens → docs and contract).

## Project Structure

### Documentation (this feature)

```text
specs/011-purchasing-end-to-end/
├── spec.md            # feature specification (incl. the Clarifications sessions 2026-11-12 and 2026-11-13)
├── plan.md            # this file
├── research.md        # Phase 0 output: the design decisions and their alternatives
├── data-model.md      # Phase 1 output: tables, columns, constraints, invariants, read projections
├── quickstart.md      # Phase 1 output: manual and automated verification
├── contracts/
│   ├── purchasing-api.md  # the purchasing endpoints' request/response contract
│   └── idempotency.md     # the receipt idempotency record's contract and lifecycle
├── checklists/
│   └── requirements.md
└── tasks.md           # Phase 2 output (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
shared/src/errors/index.ts            # + ORDER_HAS_RECEIPTS; the purchasing codes join the emittable set
shared/src/audit/index.ts             # + purchaseOrdersCreated/Updated/Confirmed/Cancelled, goodsReceiptsPosted
shared/src/permissions/index.ts       # purchasing.read / purchasing.write / inventory.receive already exist

database/prisma/schema.prisma        # + PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine
database/prisma/migrations/<new>/    # additive: the four tables, their constraints, triggers, RLS, the sequences constraint

backend/src/modules/purchasing/            # NEW: controller, service, dto/, the purchasing module gate
backend/src/modules/purchasing/purchasing-usage.module.ts   # NEW: the reverse answers (open order per product/contact/warehouse)
backend/src/common/guards/purchasing-module.guard.ts        # NEW: the one shared module gate (allows everything today)

backend/src/modules/inventory/            # + InventoryService.postReceiptMovement; the products usage provider
                                           #   aggregates the purchasing answer; warehouse deactivation asks it
backend/src/modules/contacts/             # the contacts usage provider asks the purchasing answer
backend/src/modules/products/             # the selectable-product summary gains the unit-of-measure abbreviation
backend/src/openapi/openapi-document.ts   # + the purchasing endpoints (the drift check must pass)

frontend/src/services/purchasing-client.ts  # NEW: the real API client behind the service seam
frontend/src/services/catalog-service.ts    # + the purchasing list-row and progress types the screens consume
frontend/src/features/purchasing/           # orders-tab, receipts-tab, order-detail-page, order-form,
                                            #   receive-goods-dialog, purchasing-page, use-purchasing
frontend/src/config/real-modules.ts         # purchasing becomes a real module
frontend/src/services/sample-catalog-service.ts  # - the purchasing state and methods
frontend/src/mocks/sample-data.ts                # - SAMPLE_PURCHASE_ORDERS, SAMPLE_GOODS_RECEIPTS
frontend/src/i18n/locales/{en,ar}/purchasing.ts  # + the new strings in both languages

docs/api-purchasing-contract.md         # NEW: the canonical Purchasing documentation
scripts/verify-db-invariants.mjs        # + the purchasing invariants
```

**Structure Decision**: the existing modular monolith, extended — no new package, no new service. The backend gains one module (`purchasing`) plus a dependency-light usage-answer module inside it, one shared guard, and one method on the Inventory service. The frontend gains one client beside `products-client.ts` / `inventory-client.ts` and reuses the existing service seam (`catalog-service.ts`), so the screens do not know whether the data is sample or real.

## Complexity Tracking

> **Filled because the Constitution Check has one item that must be justified in writing.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle II's "module availability MUST be enforced server-side: endpoints of a disabled module return HTTP 403 `MODULE_DISABLED`" is not implemented by this feature | No organisation-level module state exists anywhere in the product yet — the PRD assigns module enable/disable to P0-F002 (Organization Workspaces and Tenant Isolation), which is a separate feature with its own settings screen, audit trail and dependency rules (`MODULE_DEPENDENCY`). Implementing the toggle here would pull a settings feature into purchasing, and the specification records the deferral explicitly (FR-031b) together with the rules the owning feature must apply to Purchasing: Purchasing requires Inventory, and turning Purchasing off is refused while any order is `DRAFT`, `CONFIRMED` or `PARTIALLY_RECEIVED`. The mitigation ships with this feature: every purchasing endpoint declares one shared module gate — a guard named for the module that currently allows every request — so the owning feature enables the check in one place without touching any endpoint, and a test asserts that every purchasing endpoint declares it. | Implementing the `organization_modules` table and the toggle here — rejected: it duplicates another feature's scope, adds a settings screen the specification explicitly forbids (FR-031b), and would still be a partial implementation of that feature's rules; `forwardRef` to break the module cycle — rejected: the constitution prohibits circular module dependencies; a shared platform "module registry" — rejected: new infrastructure for a capability that does not exist yet. |

## Implementation order (input for /speckit.tasks)

1. **Shared codes**: `ORDER_HAS_RECEIPTS` (409) and the purchasing audit actions; the purchasing codes join the emittable set; the `purchasing` role template decision (the receipt stays `inventory.receive`, so the Purchasing officer template does not gain it).
2. **Database**: one additive migration — `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines` with their checks, unique keys, composite foreign keys, indexes, append-only triggers, revoked `TRUNCATE` and RLS — plus the unique constraint on `document_sequences (organization_id, name)`.
3. **Platform seams**: the shared Purchasing module gate (guard + declaration metadata) and the purchasing usage-answer module.
4. **Purchasing module**: the order lifecycle (create, update, confirm, cancel), the lists with the progress and receipt-row summaries, the detail with the receipt history, and the receipt posting path.
5. **Inventory and the usage answers**: `InventoryService.postReceiptMovement`, the products/contacts/warehouse usage providers that ask the purchasing answer, and the forward validation locks owned by Contacts, Products and Inventory.
6. **Frontend**: the real client behind the service seam, the two list screens, the order form with real pickers, the receive dialog (blank fields, "Receive all outstanding", the confirmation summary, the key lifecycle), the order detail, both locales, and the deletion of the sample purchasing data and banner.
7. **Verification**: unit, integration (isolated schema only), concurrency, duplicate-request, rollback, append-only, the extended invariant script, the contract drift check, and the manual quickstart paths.

## Phase 2 hand-off

`/speckit.tasks` converts this plan into `tasks.md`, with the failing tests landing in the first batch of every phase and the migrations (immutable, additive) ordered before the code that depends on them. The clarified answers from 2026-11-13 are binding inputs: the receipt-level list row with its conditional aggregate, the server-computed order progress summary, the shared module gate with its deferred owner, the receive dialog's blank-field and confirmation behaviour, and the lazily provisioned document sequences with their unique constraints.
