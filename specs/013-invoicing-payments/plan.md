# Implementation Plan: Invoicing and Payments end to end

**Branch**: `013-invoicing-payments` | **Date**: 2026-11-14 | **Spec**: `specs/013-invoicing-payments/spec.md`

**Input**: Feature specification from `specs/013-invoicing-payments/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the Invoicing backend (P0-F010) and Payment Recording and Allocation (P0-F011), and switch the Invoicing screens from sample data to the real backend. Invoicing owns invoices, invoice lines, payments, payment allocations, and payment reversals; it reads the sales order through the Sales service (never writing Sales tables) and the customer through the Contacts service. Follows the Contacts/Products/Inventory/Purchasing/Sales pattern: snake_case naming, composite organization keys `(organization_id, id)`, versions on documents, audit entries in the same transaction, idempotency keys on issue/void/record/reverse, module-gate hook on every endpoint, RLS enabled with no policies on every new table, additive-only immutable migrations. Document numbers `INV-` and `PAY-` use six digits with the same first-use, per-organization advisory-lock sequence allocation as the other documents.

Every invoice is an OPERATIONAL invoice: no tax fields exist, and every invoice representation (API payload, interface, print) carries the exact label "Operational invoice - not a tax invoice". Issue, void, record, and reverse are the posted-document boundaries; payments and allocations are append-only at the database level.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, React Hook Form, Zod
**Storage**: PostgreSQL (dev on :3000, test schema `nexuserp_test` isolated, production separate)
**Testing**: Jest + Supertest (backend integration, real PostgreSQL), Vitest + React Testing Library (frontend)
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge
**Project Type**: Web service (modular monolith)
**Performance Goals**: p95 API response under 500 ms excluding reports; pages usable within 2 seconds at p95
**Constraints**: Real-PostgreSQL integration tests only (no SQLite/in-memory/mocked persistence for critical rules); no floating-point money or quantities (NUMERIC exact decimals, JSON decimal strings); no microservices/Redis/Kubernetes in v1; Phase 4 build order — Invoicing follows Sales; tests run only in the isolated schema with `connection_limit=5`, public row counts unchanged, run suite-grouped (pooler caps at 15 session connections); nothing committed without explicit instruction
**Scale/Scope**: P0 feature; one developer; 16-week plan; document numbers INV-/PAY- six digits, same allocation as SO-/SH-/PO-/GR-

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | Pass: `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_reversals` all carry `organization_id`; every cross-entity FK is composite `(organization_id, id)`; tenant scope from session/membership context only; cross-org records return 404; RLS enabled with no policies on every new table; two-organization isolation test per endpoint |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | Pass: reads use `invoices.read`/`payments.read`; create and draft update use `invoices.write`; issue `invoices.issue`; void `invoices.void`; record `payments.record`; reverse `payments.reverse`; every endpoint declares the shared Invoicing module gate; invoice transitions DRAFT→ISSUED/VOID, ISSUED→PARTIALLY_PAID/PAID/VOID, PARTIALLY_PAID→PAID/ISSUED, PAID→PARTIALLY_PAID/ISSUED validated server-side (and enforced by a DB trigger); `POST /sales-orders/:id/invoices` needs only `invoices.write` (the Sales service performs the order read) |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | Pass: issue, void, record, reverse each run in one transaction with `Idempotency-Key`; key record, fingerprint, response, expiry commit with the business change; same key+same body returns stored response, different body returns 422; invoices immutable once ISSUED except status/void fields (DB trigger); payments, allocations, reversals append-only (triggers + revoked grants from one migration step); invoice lines never change after creation; number-once per invoice enforced by unique index |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | Pass: quantities `NUMERIC(14,3)`, unit prices `NUMERIC(14,4)`, line totals/invoice totals/payment amounts/allocations `NUMERIC(14,2)`; half-up rounding per line at persist time; invoice total sums already-rounded line totals; balance derives from exact sums of active allocations; JSON carries decimal strings; vectors 0.10+0.20=0.30, 128.45−(100.00, 28.45)=0.00, 0.01-above-balance refused |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | Pass: failing tests written first for tenant isolation, permissions, two simultaneous payments, payment-versus-void, reversal-versus-payment, double issue, duplicate requests, rollback on allocation/audit failure, append-only protection with direct SQL, rounding vectors, the `CONTACT_IN_USE` usage guard, the list snapshot consistency, the payments derived-status filter; invariant script extended; critical-path coverage ≥80% |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | Pass: Invoicing owns its five tables; reads the order via the Sales service inside the create transaction and nothing else crosses; the archive-customer usage guard queries the Invoicing tables from the Contacts module's archiving path via an Invoicing-owned usage service; shared derivation (balance/outstanding/overdue) is one DB view or service function reused by list, report, and Dashboard later; no circular dependencies |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | Pass: no tax fields anywhere; label "Operational invoice - not a tax invoice" on every invoice representation; docs state invoicing is not accounting and NexusERP is not an accounting system; no PDF generation or emailing (browser print only) |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | Pass: existing Invoicing screens keep design-system tokens and components; PRD 7.3 rules (inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs for issue/void/reverse, status badges, server-paginated tables with visible totals, "Outstanding/Overdue in this selection" figures); WCAG 2.1 AA keyboard/focus/labeling/error messages; print stylesheet ships with an accessible invoice layout |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | Pass: P0-F010/P0-F011; Sales (preceding phase, P0-F008/P0-F009) is implemented and tested; taxes, credit notes, partial invoicing, discounts, recurring invoices, PDFs, emailing, gateways, unallocated credit, supplier bills, accounting entries are out of scope; Overview stays sample |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the Phase 4 build order for the modules involved.

## Project Structure

### Documentation (this feature)

```text
specs/013-invoicing-payments/
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
    │   ├── invoicing/
    │   │   ├── invoice.entity.ts
    │   │   ├── invoice-line.entity.ts
    │   │   ├── payment.entity.ts
    │   │   ├── payment-allocation.entity.ts
    │   │   ├── payment-reversal.entity.ts
    │   │   ├── invoice-number.ts          (INV-/PAY- allocation, same advisory-lock pattern as sales-number.ts)
    │   │   ├── invoicing.module.ts
    │   │   ├── invoicing.service.ts
    │   │   ├── invoicing.controller.ts
    │   │   ├── dto/                       (create/update/list/issue/void/record/reverse/query DTOs + response DTOs)
    │   │   └── __tests__/                 (integration, real PostgreSQL)
    │   ├── contacts/    (usage guard: refuse archive of a customer with DRAFT/ISSUED/PARTIALLY_PAID invoice)
    │   ├── organizations/ (expose organizations.default_payment_terms_days read-only in GET /organizations/current)
    │   └── sales/       (existing; read-only reuse for the create-invoice order lookup)
    ├── common/guards/invoicing-module.guard.ts   (shared Invoicing module gate; allows everything for now)
    └── openapi/                               (regenerated contract)
database/prisma/migrations/                    (new additive migrations only; see data-model.md)
frontend/
└── src/
    ├── features/invoicing/
    │   ├── invoicing-page.tsx              (invoice list + selection figures)
    │   ├── invoice-detail-page.tsx         (+ print button, print stylesheet)
    │   ├── payment-form-page.tsx           (Record payment with open-invoice allocation table)
    │   ├── payment-detail-page.tsx
    │   ├── use-invoicing.ts                (service-seam hooks; sampleCatalogService removed for invoicing)
    │   └── __tests__/
    ├── features/sales/order-detail-page.tsx ("Create Invoice" enabled for SHIPPED orders, links to the invoice)
    ├── services/                             (real invoicing-client; service seam types updated)
    └── i18n/locales/{en,ar}/invoicing.ts     (labels updated; "Outstanding/Overdue in this selection")
scripts/verify-db-invariants.mjs              (extended; see data-model.md)
shared/src/                                    (audit actions; error codes BALANCE_CHANGED, INVOICE_ALREADY_EXISTS)
```

**Structure Decision**: Option 2 — Web application. Backend under `backend/src/modules/invoicing/`, frontend under `frontend/src/features/invoicing/`; the invoicing module is a new sibling of the existing modules; Sales and Contacts are edited only through their service seams.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | All principles satisfied without violation | — |
