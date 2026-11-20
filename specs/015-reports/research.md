# Research: Reports Page End to End

## R-001 — Read-consistent snapshot for report queries

- **Decision**: Wrap each report's reads in a single Prisma `$transaction` with `isolationLevel: 'ReadCommitted'` (Postgres default) and set `statement_timeout` via `SET LOCAL statement_timeout` inside the transaction. Read-only; no writes.
- **Rationale**: Guarantees totals, rows, and aging buckets come from one consistent snapshot; prevents long-running reports from locking tables.
- **Alternatives considered**: SERIALIZABLE (rejected — unnecessary contention, slower); separate queries (rejected — inconsistent totals).

## R-002 — Stock movements reuse

- **Decision**: The stock-movements report calls the existing Inventory Movements service method (same query, same filters). No duplicated SQL.
- **Rationale**: Spec requirement; single source of truth for movement listing.

## R-003 — Outstanding invoices shared definition

- **Decision**: Reuse the `invoice_balances` view and the same overdue predicate (due date before today, UTC) used by the invoice list. Aging buckets: Current (due date >= today or balance 0 excluded), 1–30, 31–60, 61–90, over 90 days overdue, each with count and balance sum.
- **Rationale**: Guarantees the outstanding/overdue figures equal the Invoicing list's for the same selection.

## R-004 — Mixed-unit totals for stock on hand

- **Decision**: Group selected rows by unit of measure. If all rows share one unit, return summed onHand/reserved/available. Otherwise return only the row count (no sums), to avoid adding incompatible quantities.
- **Rationale**: Exact decimals only; never add quantities of different units.

## R-005 — Stock reconciliation logic

- **Decision**: For each stock balance row, compute sum of movements (`SUM(quantity)` grouped by org/warehouse/product/unit) and sum of ACTIVE reservations. A discrepancy exists if onHand ≠ movement sum, or reserved ≠ reservation sum, or reserved > onHand. Return both figures, a total, and a `checkedAt` timestamp (server now, UTC).
- **Rationale**: Detects corruption; empty result on a healthy schema.

## R-006 — Document statuses snapshot

- **Decision**: Single transaction; counts per status for POs, SOs, invoices, payments (RECORDED/REVERSED); total amount for orders and invoices; shipments and goods receipts counts in the date range. Date range inclusive of both endpoints (date, not timestamp).
- **Rationale**: One consistent snapshot; date-range semantics match the rest of the app.

## R-007 — Indexes

- **Decision**: Add indexes the report queries need: `stock_balances(organization_id, warehouse_id)`, `stock_movements(organization_id, product_id, created_at)`, `stock_movements(organization_id, warehouse_id, created_at)`, `invoices(organization_id, status, due_date)`, plus existing `membership_roles(roleId)`. In a new migration.
- **Rationale**: Only what the queries need; append-only migration.

## R-008 — Performance test dataset

- **Decision**: Generate ≥2,000 products, 20,000 movements, 5,000 invoices in the isolated schema; measure each endpoint's p95 over repeated runs; record measured results (no claimed figure without measurement).
- **Rationale**: Spec success criterion; honest reporting.

## R-009 — Statement timeout

- **Decision**: `SET LOCAL statement_timeout = '10s'` inside each report transaction. Page size capped at 100.
- **Rationale**: Prevents unbounded report queries from locking tables.