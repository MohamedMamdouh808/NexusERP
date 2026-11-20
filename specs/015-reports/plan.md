# Implementation Plan: Reports Page End to End

**Branch**: `main` (feature directory: `specs/015-reports`) | **Date**: 2026-11-15 | **Spec**: `specs/015-reports/spec.md`
**Input**: Feature specification from `specs/015-reports/spec.md`

## Summary

Build the Reports module (P0-F013): five read-only reports over existing Inventory, Purchasing, Sales, and Invoicing data, plus a hub. Backend adds a `reports` module with five `GET` endpoints (all declaring `reports.read`, tenant-scoped, read-only, read-consistent transaction, statement timeout, 100-row page cap, exact decimals as strings). Stock movements delegates to the Inventory Movements service. Outstanding invoices reuses the shared invoice balance/overdue definition. Stock reconciliation compares balances against movements/reservations. Frontend adds `/reports` hub and five screens with toolbar, table, skeleton, empty/error states, selection-labelled totals, and links to records. No stored data changes; only new indexes in new migrations.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, React Hook Form, Zod, date-fns (if used) or native Date
**Storage**: PostgreSQL (dev `public`, test schema `nexuserp_test` isolated)
**Testing**: Jest + Supertest (backend integration, real PostgreSQL), Vitest + RTL (frontend)
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge
**Project Type**: Web service (modular monolith)
**Performance Goals**: p95 API response under 2 seconds on ≥2,000 products / 20,000 movements / 5,000 invoices; pages usable within 2 seconds at p95
**Constraints**: Real-PostgreSQL integration tests only; exact decimals (no JS floats); no microservices/Redis/Kubernetes in v1; read-only queries in read-consistent transactions with statement timeout; pageSize ≤ 100; tests only in isolated schema; public row counts unchanged; nothing committed without explicit instruction
**Scale/Scope**: P0 feature (P0-F013); depends on Inventory, Purchasing, Sales, Invoicing

## Constitution Check

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter? | Pass: no new tables; all report queries filter by `organization_id` from session context; cross-org → 404; RLS already enabled on all underlying tables |
| II. Server-Enforced Authority | Which permission does each new endpoint declare? | Pass: `reports.read` on all five endpoints; hidden controls are convenience only |
| III. Transactional Integrity | Which operations are multi-record or posted? | Pass: read-only; queries run in a read-consistent transaction (`$transaction` with isolation level); no writes, no posted records, no idempotency needed |
| IV. Exact Decimals | Column precisions and rounding? | Pass: quantities `NUMERIC(14,3)`, money `NUMERIC(14,2)`; returned as decimal strings; mixed-unit totals handled by unit grouping; no JS floats |
| V. Test-First | Failing tests first; coverage target? | Pass: tenant-isolation, permission, totals-equality (known datasets, mixed units, archived), corruption/reconciliation, empty-org, performance with measured results; ≥80% coverage |
| VI. Modular Boundaries | Which modules touched; cross-module writes? | Pass: new `reports` module reads via existing services (Inventory Movements); no table writes; no circular deps |
| VII. Honest Boundaries | Tax/compliance/accounting claim? | Pass: informational only; no tax/accounting claim |
| VIII. Design System & A11y | Tokens, PRD 7.3, WCAG 2.1 AA? | Pass: existing tokens/components; PRD 7.3 states; 1180px fit; WCAG 2.1 AA |
| IX. Scope Discipline | P0/P1/P2 and preceding phase exit? | Pass: P0 (P0-F013); Inventory/Purchasing/Sales/Invoicing implemented and tested; exports/charts/dashboard/scheduled reports out of scope |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, Phase 4 build order (Reports after Invoicing).

## Project Structure

### Documentation (this feature)

```text
specs/015-reports/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/modules/reports/
│   ├── reports.module.ts
│   ├── reports.controller.ts
│   ├── reports.service.ts
│   └── dto/reports.dto.ts
└── test/integration/reports-*.spec.ts

frontend/
├── src/features/reports/
│   ├── reports-hub-page.tsx
│   ├── stock-on-hand-page.tsx
│   ├── stock-movements-page.tsx
│   ├── outstanding-invoices-page.tsx
│   ├── document-statuses-page.tsx
│   ├── stock-reconciliation-page.tsx
│   └── use-reports.ts
└── src/services/reports-client.ts

database/prisma/
└── migrations/  (indexes only)
```

**Structure Decision**: Web application (Option 2). New backend module `reports` reading from existing tables/services; new frontend feature `reports`; new migrations for indexes only.

## Complexity Tracking

No violations. All principles pass.