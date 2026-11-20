# Implementation Plan: Sales end to end — real sales orders, reservations, and shipments

**Branch**: `012-sales-end-to-end` | **Date**: 2026-11-14 | **Spec**: `specs/012-sales-end-to-end/spec.md`

**Input**: Feature specification from `specs/012-sales-end-to-end/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the backend API for sales orders, stock reservation (confirm), and whole-order shipment with stock deduction (P0-F008/P0-F009), and switch the Sales screens from sample data to the real backend. Sales owns orders, order lines, reservations, shipments, and shipment lines; it calls the Inventory service for SHIPMENT movements and balance changes, never writing Inventory tables directly. Follows the Contacts/Products/Inventory/Purchasing pattern: snake_case naming, composite organization keys `(organization_id, id)`, versions, audit entries, idempotency keys on confirm/cancel/ship, module-gate hook on every endpoint, RLS enabled with no policies on every new table, additive-only immutable migrations.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend  
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, React Hook Form, Zod  
**Storage**: PostgreSQL (dev on :3000, test schema isolated, production separate)  
**Testing**: Jest + Supertest (backend integration), Vitest + React Testing Library (frontend)  
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge  
**Project Type**: Web service (modular monolith)  
**Performance Goals**: p95 API response under 500 ms excluding reports; pages usable within 2 seconds at p95  
**Constraints**: Real-PostgreSQL integration tests only (no SQLite/in-memory/mocked persistence for critical rules); no floating-point money or quantities (NUMERIC exact decimals, JSON decimal strings); no microservices/Redis/Kubernetes in v1; Phase 4 build order — Sales follows Contacts/Products/Inventory/Purchasing  
**Scale/Scope**: P0 feature; one developer; 16-week plan; document numbers SO-/SH- use six digits with same first-use sequence allocation as purchase orders

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | Pass: `sales_orders`, `sales_order_lines`, `stock_reservations`, `shipments`, `shipment_lines` all carry `organization_id`; all cross-entity FKs are composite `(organization_id, id)`; tenant scope from session/membership context only; cross-org records return 404; RLS enabled with no policies on every new table |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | Pass: reads use `sales.read`, writes use `sales.write`, shipping uses `inventory.ship`; every endpoint declares the shared Sales module gate; status transitions DRAFT→CONFIRMED→SHIPPED/CANCELLED validated server-side; invalid transitions return 409 `INVALID_STATE_TRANSITION`; default deny via `GET /auth/me` permissions |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | Pass: confirm, cancel, ship each run in one transaction with `Idempotency-Key`; key record, fingerprint, response, expiry commit with business change; same key+same body returns stored response; same key+different body returns 422; shipments/shipment_lines append-only (no UPDATE/DELETE/TRUNCATE) |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | Pass: quantities `NUMERIC(14,3)`, unit prices `NUMERIC(14,4)`, line totals/order totals `NUMERIC(14,2)`; half-up rounding per line at persist time; order total sums already-rounded line totals; JSON carries decimal strings; vectors `3.333×1.2345=4.11`, `1.000×0.0050=0.01`, `2.500×4.5000=11.25` |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | Pass: failing tests written first for tenant isolation, permissions, concurrent confirmations, confirm/cancel races, duplicate requests, rollback, append-only shipments, rounding vectors, usage guards; invariant script extended; critical-path coverage ≥80% |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | Pass: Sales owns orders/lines/reservations/shipments/shipment_lines; calls Inventory service for SHIPMENT movements and balance decreases; never writes Inventory tables directly; Contacts/Products/Inventory answer usage guards; no circular dependencies |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | Pass: no tax fields, no certified-invoicing claim; "Create Invoice" stays disabled with "Arrives with Invoicing"; Invoicing is the next feature (P0-F010) |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | Pass: reuses existing Sales screens, design-system tokens, shared line items editor; PRD 7.3 rules (inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs, status badges, paginated tables with totals); WCAG 2.1 AA keyboard/focus/labeling/error messages |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | Pass: P0-F008/P0-F009; Inventory (preceding phase) is complete; partial shipments/backorders/invoices deferred to later features |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the Phase 4 build order for the modules involved.

## Project Structure

### Documentation (this feature)

```text
specs/012-sales-end-to-end/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

Web application structure detected (backend + frontend present):

```text
backend/
└── src/
    ├── modules/
    │   ├── sales/
    │   │   ├── sales-order.entity.ts
    │   │   ├── sales-order-line.entity.ts
    │   │   ├── stock-reservation.entity.ts
    │   │   ├── shipment.entity.ts
    │   │   ├── shipment-line.entity.ts
    │   │   ├── sales.module.ts
    │   │   ├── sales.service.ts
    │   │   ├── sales.controller.ts
    │   │   └── __tests__/ (integration, real PostgreSQL)
    │   └── inventory/ (existing; Sales calls its service, never writes tables)
    ├── migrations/ (new additive migrations only)
    ├── openapi/ (regenerated contract)
    └── __tests__/
frontend/
└── src/
    ├── features/sales/
    │   ├── orders-tab.tsx
    │   ├── order-new-page.tsx
    │   ├── order-edit-page.tsx
    │   ├── order-form.tsx
    │   ├── order-detail-page.tsx
    │   ├── shipments-tab.tsx
    │   ├── sales-page.tsx
    │   ├── use-sales.ts
    │   └── __tests__/
    ├── services/catalog-service.ts (real API client replaces sample-catalog-service)
    └── __tests__/ (regenerated real-data tests)
```

**Structure Decision**: Option 2 — Web application. Backend under `backend/src/modules/sales/`, frontend under `frontend/src/features/sales/`; shared line items editor stays in `frontend/src/components/ui/line-items-editor.tsx`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | All principles satisfied without violation | — |
