# Implementation Plan: Dashboard (Overview Page) End to End

**Branch**: `main` (feature directory: `specs/017-dashboard-overview`) | **Date**: 2026-11-16 | **Spec**: `specs/017-dashboard-overview/spec.md`
**Input**: Feature specification from `specs/017-dashboard-overview/spec.md`

## Summary

Turn the Overview page (`/`) into a real landing page composed from existing endpoints. The page answers "how are we doing" (analytics from the Reports endpoints) and "what needs my attention" (existing list endpoints), adapts to the signed-in member's permissions, and never requests a widget the member may not see. Backend additions are limited to: extending the existing `GET /reports/kpi-summary` in place, widening the purchase order list filter to several statuses, adding `name` to the `/auth/me` membership payload, and any migrations/indexes the new queries need. The sample dashboard service, its sample invoice rows and the Overview Sample data banner are deleted. System Health, the sidebar and the shell are unchanged.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, React Hook Form, Zod, existing chart library (`recharts`)
**Storage**: PostgreSQL (dev `public`, test schema `nexuserp_test` isolated)
**Testing**: Jest + Supertest (backend integration, real PostgreSQL), Vitest + RTL (frontend)
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge
**Project Type**: Web service (modular monolith)
**Performance Goals**: first batch = 8 parallel requests for a full Administrator, measured per role together with the settled total; extended KPI endpoint inside the 2s p95 goal on the measured dataset
**Constraints**: Real-PostgreSQL integration tests only; no JS floats; no new analytics endpoint; no new tables; read-only page; no polling or auto-refresh; tests only in the isolated schema; public row counts unchanged; nothing committed without explicit instruction
**Scale/Scope**: P0 (P1-F001); depends on Reports (015/016), Inventory, Purchasing, Sales, Invoicing, Contacts, Products and Audit features

## Constitution Check

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain org scope? | Pass: no new tables; every widget reads a tenant-scoped existing endpoint; cross-org data never appears; RLS unchanged |
| II. Server-Enforced Authority | Permission per endpoint; who gates the widgets? | Pass: every widget gated by the member's held permissions from `GET /auth/me`; a widget the member may not see is never requested; the server still refuses anything the member lacks |
| III. Transactional Integrity | Multi-record or posted operations? | Pass: read-only page; Refresh only re-reads; the extended KPI response is one read-consistent transaction |
| IV. Exact Decimals | Precision and rounding? | Pass: money and quantities arrive as decimal strings and are formatted, never computed, on the client |
| V. Test-First | Failing tests first; coverage? | Pass: widget-permission matrix per role, request-count measurement (two numbers), KPI equality, checklist ticking, failure isolation; ≥80% critical-path coverage |
| VI. Modular Boundaries | Modules touched; cross-module writes? | Pass: the page composes existing clients; no shared definition is reimplemented; no new analytics endpoint; the Reports module owns the extended KPI response |
| VII. Honest Boundaries | Tax/accounting claim? | Pass: informational only; no tax, profit or valuation claim |
| VIII. Design System & A11y | Tokens, PRD 7.3, WCAG 2.1 AA? | Pass: existing tokens and chart components; skeleton/empty/error states; "Show as table"; text summaries; aria-labels; reduced motion |
| IX. Scope Discipline | P0/P1/P2 and preceding phase? | Pass: P0 (P1-F001); customizable widgets, saved views, export/print, real-time updates and new report endpoints are out of scope |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests; no floating-point money; no microservices; Phase 4 build order — Dashboard after Reports (015/016) and the domain features it composes.

## Project Structure

### Documentation (this feature)

```text
specs/017-dashboard-overview/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
backend/src/modules/reports/reports.service.ts   # extend kpiSummary in place
backend/src/modules/purchasing/dto/list-purchase-orders.dto.ts  # multi-status filter
backend/src/modules/purchasing/purchasing.service.ts            # honour it
backend/src/modules/auth/auth.service.ts           # /auth/me membership name

frontend/src/features/overview/
├── overview-page.tsx        # rewritten: header, analytics, attention, quick actions, activity, checklist
├── dashboard-widgets.tsx    # widget frame: skeleton / empty / error+retry / definition line
├── attention-panel.tsx
├── quick-actions.tsx
├── recent-activity.tsx
├── first-use-checklist.tsx
└── use-dashboard.ts         # real endpoints; sample service and sample-invoices deleted
```

**Structure Decision**: Web application (Option 2). The Overview feature keeps its folder; the sample dashboard service and its sample invoice rows are deleted; the backend additions stay inside the modules that own the data.

## Complexity Tracking

No violations. All principles pass.