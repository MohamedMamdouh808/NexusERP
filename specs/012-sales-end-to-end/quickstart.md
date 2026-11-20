# Quickstart: Sales end to end

**Feature**: 012-sales-end-to-end · **Branch**: `012-sales-end-to-end` · **Spec**: `specs/012-sales-end-to-end/spec.md` · **Date**: 2026-11-14

## What this feature adds

A real Sales backend (P0-F008/P0-F009) plus the Sales screens switched from sample data to the real API:

- `sales_orders`, `sales_order_lines`, `stock_reservations`, `shipments`, `shipment_lines` per organization, all with `organization_id` and composite `(organization_id, id)` foreign keys.
- Sales-order lifecycle: DRAFT → CONFIRMED → SHIPPED; DRAFT/CONFIRMED → CANCELLED. Confirm reserves stock (all-or-nothing, `INSUFFICIENT_STOCK` otherwise); cancel releases reservations; ship deducts stock through the Inventory service and consumes reservations.
- Endpoints: `GET/POST /sales-orders`, `GET/PUT /sales-orders/:id`, `POST /sales-orders/:id/confirm`, `POST /sales-orders/:id/cancel`, `POST /sales-orders/:id/shipments`, `GET /shipments`, `GET /shipments/:id`.
- Idempotency keys required on confirm/cancel/ship; shipments append-only (no UPDATE/DELETE/TRUNCATE); RLS enabled with no policies on every new table.
- Sales screens: order list, create/edit form with the shared line items editor, detail page, Confirm/Ship/Cancel dialogs, Shipments tab — all reading real data; sample banner and sample data deleted; "Create Invoice" disabled with "Arrives with Invoicing".

## Prerequisites

- Node.js LTS, npm, PostgreSQL (dev on `localhost:3000`, test schema isolated).
- The preceding phase (Inventory, P0-F006) is complete: warehouses, balances, reservations, movements exist.
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
npm run test:api
# Frontend tests (Vitest + RTL)
cd frontend && npm run test
# Lint, type check, build
cd .. && npm run lint && npm run typecheck && npm run build
# OpenAPI drift check
npm run openapi:diff --workspace @nexuserp/api
# Database invariant script (extended for sales)
node scripts/verify-db-invariants.mjs
```

Integration tests run only in the isolated `nexuserp_test` schema and leave the public schema's row counts unchanged. Never run integration suites concurrently.

## Key files

- `backend/src/modules/sales/` — sales module (service, controller, entities, tests)
- `backend/src/common/guards/sales-module.guard.ts` — shared Sales module gate (allows everything until settings enable it)
- `frontend/src/features/sales/` — order list, form, detail, shipments tab, dialogs, hooks
- `frontend/src/components/ui/line-items-editor.tsx` — shared line items editor (reused, unchanged visual language)
- `scripts/verify-db-invariants.mjs` — extended with sales reservation/shipment invariants
- `docs/api-sales-contract.md` — canonical endpoint contract (also `specs/012-sales-end-to-end/contracts/sales-api.md`)
- `specs/012-sales-end-to-end/data-model.md` — table definitions and state transitions

## Out of scope (this feature)

Partial shipments/backorders, discounts/taxes, returns/credit notes, customer credit limits, price lists, delivery notes/packing lists, shipping carriers, invoices (next feature, P0-F010), attachments, import/export.
