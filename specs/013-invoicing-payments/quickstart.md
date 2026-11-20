# Quickstart: Invoicing and Payments end to end

**Feature**: 013-invoicing-payments · **Branch**: `013-invoicing-payments` · **Spec**: `specs/013-invoicing-payments/spec.md` · **Date**: 2026-11-14

## What this feature adds

A real Invoicing backend (P0-F010/P0-F011) plus the Invoicing screens switched from sample data to the real API:

- `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_reversals` per organization, all with `organization_id` and composite `(organization_id, id)` foreign keys; `organizations.default_payment_terms_days` added.
- Invoice lifecycle: DRAFT → ISSUED → PARTIALLY_PAID/PAID, DRAFT/ISSUED → VOID. Create from a SHIPPED sales order (one non-void invoice per order); issue allocates `INV-` and locks the header (immutable except status/void fields); void is refused with `INVOICE_HAS_PAYMENTS` when active allocations exist.
- Payment recording with allocation: `POST /payments` locks invoices ascending id, recomputes balances under the lock, enforces `expectedBalance` (409 `BALANCE_CHANGED`) and exact-sum allocation; `POST /payments/:id/reverse` appends a reversal row (payments are append-only; status is derived from `payment_reversals`).
- Endpoints: `POST /sales-orders/:id/invoices`, `GET /invoices`, `GET /invoices/open`, `GET /invoices/:id`, `PUT /invoices/:id`, `POST /invoices/:id/issue`, `POST /invoices/:id/void`, `GET /payments`, `POST /payments`, `GET /payments/:id`, `POST /payments/:id/reverse`; `GET /auth/me` gains `defaultPaymentTermsDays`.
- Idempotency keys required on issue/void/record/reverse; invoice lines insert-only; payments, allocations and reversals append-only (triggers + revoked grants in one migration step); `invoice_balances` view is the single shared definition of balance/outstanding/overdue; RLS enabled with no policies on every new table.
- Invoicing screens: invoice list with "Outstanding/Overdue in this selection" figures, invoice detail with browser print ("Operational invoice - not a tax invoice" label on every representation), record-payment screen with the open-invoice allocation table, payment detail — all reading real data; sample banner and sample invoicing data deleted. The Sales order detail's "Create Invoice" button becomes enabled for SHIPPED orders and links to the invoice.

## Prerequisites

- Node.js LTS, npm, PostgreSQL (dev on `localhost:3000`, test schema isolated).
- The preceding phase (Sales, 012) is complete: `sales_orders`, `sales_order_lines`, `shipments` exist and SHIPPED orders can be invoiced.
- `npm ci` run at repo root; `frontend` proxies `/api` to `:3000`.

## Run the dev stack

Terminal 1 — API (watches source, restarts on change):

```powershell
cd D:\web-projects\NexusERP
npm run dev:api   # listens on :3000; log: C:\Users\toshiba\AppData\Local\Temp\opencode\devapi.log
```

Terminal 2 — frontend:

```powershell
cd D:\web-projects\NexusERP\frontend
npm run dev       # listens on :5173; proxies /api to :3000
```

Verify: `GET http://localhost:5173/api/v1/health` → `{"status":"ok", ...}`.

## Run the checks

```powershell
cd D:\web-projects\NexusERP
# Backend integration tests (Jest + Supertest, real PostgreSQL, isolated schema only)
$env:DATABASE_URL = "postgresql://postgres.ymnafwpxuvaptfswwskq:NEXUS_ERP12@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?schema=nexuserp_test&connection_limit=5"
npm run test:integration --workspace @nexuserp/api -- --testPathPattern="invoicing" --verbose
# Frontend tests (Vitest + RTL)
cd frontend && npm run test
# Lint, type check, build
cd .. && npm run lint && npm run typecheck && npm run build
# OpenAPI drift check
npm run openapi:diff --workspace @nexuserp/api
# Database invariant script (extended with invoice/payment invariants 10–19)
node scripts/verify-db-invariants.mjs
```

Integration tests run only in the isolated `nexuserp_test` schema and leave the public schema's row counts unchanged. The hosted pooler caps sessions at 15 connections: run suites grouped (never the whole suite at once) and retry on transient `P1002`/`P3018`/`EMAXCONNSESSION` errors. Never run integration suites concurrently.

## Key files

- `backend/src/modules/invoicing/` — invoicing module (service, controller, DTOs, number allocation, tests)
- `backend/src/common/guards/invoicing-module.guard.ts` — shared Invoicing module gate (allows everything until settings enable it)
- `backend/src/modules/sales/` and `backend/src/modules/contacts/` — edited only through their service seams (order read for create; `CONTACT_IN_USE` archive guard)
- `frontend/src/features/invoicing/` — invoice list, invoice detail (+ print), payment form, payment detail, hooks
- `frontend/src/features/sales/order-detail-page.tsx` — "Create Invoice" enabled for SHIPPED orders
- `frontend/src/i18n/locales/{en,ar}/invoicing.ts` — labels incl. "Outstanding/Overdue in this selection"
- `shared/src/errors/index.ts`, `shared/src/audit/index.ts` — new codes `BALANCE_CHANGED`, `INVOICE_ALREADY_EXISTS`; new actions `invoices.*`, `payments.*`
- `database/prisma/migrations/20261115000001..000010_*` — additive steps; append-only enforcement in ONE step
- `scripts/verify-db-invariants.mjs` — extended with invoice/payment invariants 10–19
- `specs/013-invoicing-payments/contracts/invoicing-api.md` — canonical endpoint contract
- `specs/013-invoicing-payments/data-model.md` — table definitions, triggers, and state transitions

## Out of scope (this feature)

Taxes and tax invoices, credit notes, partial invoicing, discounts, recurring invoices, PDF generation and emailing, payment gateways, unallocated customer credit, supplier bills and payables, accounting entries, editing `default_payment_terms_days` from the UI, module-toggle settings (deferred to Organization settings).
