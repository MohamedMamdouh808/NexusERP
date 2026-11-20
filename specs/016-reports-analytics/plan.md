# Implementation Plan: Reports Analytics Page End to End

**Branch**: `main` (feature directory: `specs/016-reports-analytics`) | **Date**: 2026-11-16 | **Spec**: `specs/016-reports-analytics/spec.md`
**Input**: Feature specification from `specs/016-reports-analytics/spec.md`

## Summary

Extend the Reports module (`015-reports`) into a full analytics page: new chart/KPI endpoints (all `reports.read`, tenant-scoped, read-only, read-consistent transactions, statement timeout, decimal string outputs), plus a refreshed frontend analytics page with a range control, KPI row, chart grid, detailed-reports cards, and accessible table alternatives. The five detailed reports and their endpoints stay unchanged and are not duplicated. New indexes land in new migrations. Shared definitions (sales, purchases, payments, low/out/in-stock, outstanding/overdue/aging) live in shared server code used by every report.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, existing chart library
**Storage**: PostgreSQL (dev `public`, test schema `nexuserp_test` isolated)
**Testing**: Jest + Supertest (backend integration), Vitest + RTL (frontend)
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge
**Project Type**: Web service (modular monolith)
**Performance Goals**: p95 under 2 seconds on ≥2,000 products / 20,000 movements / 5,000 invoices / 5,000 sales orders / 2,000 POs / 5,000 payments; pages usable within 2s at p95
**Constraints**: Real-PostgreSQL integration tests only; no JS floats; no microservices; read-consistent transactions; statement timeout; no caching in v1; isolated test schema only; public row counts unchanged; nothing committed without explicit instruction
**Scale/Scope**: P0 extension of 015-reports; shares the existing Reports module

## Constitution Check

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain org scope and where does scope enter? | Pass: extended queries all filter by `organization_id` from the session; cross-org → 404; no new tables |
| II. Server-Enforced Authority | Which permission per endpoint? | Pass: `reports.read` on every new endpoint; hidden controls are convenience only |
| III. Transactional Integrity | Writes / posted records? | Pass: read-only; read-consistent `$transaction`; no writes, no posted records, no idempotency needed |
| IV. Exact Decimals | Precision + rounding? | Pass: quantities `NUMERIC(14,3)`, money `NUMERIC(14,2)`; returned as decimal strings; mixed units → counts only |
| V. Test-First | Failing tests first; coverage? | Pass: tenant-isolation, permission, snapshot, totals-equality, zero-filled buckets, perf with measured results; ≥80% coverage |
| VI. Modular Boundaries | Which modules touched; cross-module writes? | Pass: extend Reports; inventory for stock definitions; invoicing/sales/purchasing/contacts for reads; no writes |
| VII. Honest Boundaries | Tax/accounting claim? | Pass: informational only; no tax claim; charts are charts |
| VIII. Design System & A11y | Tokens, PRD 7.3, WCAG 2.1 AA? | Pass: chart tokens; PRD 7.3; keyboard reachable, alt table; 2.1 AA |
| IX. Scope Discipline | P0/P1/P2 and preceding phase? | Pass: P0 extension of 015-reports; P1 metrics (exports) out of scope |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests; no floating-point money; no microservices; Phase 4 build order — depends on 015-reports and Inventory/Invoicing/Sales/Purchasing/Contacts modules being implemented.

## Project Structure

### Documentation (this feature)

```text
specs/016-reports-analytics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/src/modules/reports/          # extend with new endpoints
  ├── reports.controller.ts
  ├── reports.service.ts
  └── dto/analytics.dto.ts

frontend/src/features/reports/        # analytics page
  ├── reports-analytics-page.tsx      (replaces reports-page.tsx hub)
  ├── use-analytics.ts
  └── chart-card.tsx                  (reusable accessible chart card)

```

**Structure Decision**: Web application (Option 2). Extends the existing backend module and frontend feature; no new workspaces.

## Complexity Tracking

No violations. All principles pass.