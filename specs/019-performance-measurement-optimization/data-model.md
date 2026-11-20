# Data Model: Performance Measurement and Optimization End to End

**Feature**: `specs/019-performance-measurement-optimization/spec.md` | **Date**: 2026-11-20

## Scope

This feature adds **no new business tables and no new columns**. It adds indexes (justified by `EXPLAIN (ANALYZE, BUFFERS)`), a database extension (`pg_trgm`, created conditionally), and the instrumentation/budget machinery. All existing entities, fields, relationships, state transitions, validation rules, audit entries and RLS policies are unchanged.

## Entities touched

### Existing indexes (retained)

Every existing index is retained unless `EXPLAIN (ANALYZE, BUFFERS)` proves it unused, in which case removal is recorded with the plan. No index is dropped without proof.

### New indexes (added only where justified)

Added in a new migration `20261120000001_performance_indexes`, composite with organization first, matching the filters and sorts of the slowest queries. Candidate indexes (final set determined by the plans, not by assumption):

| Table | Columns | Justification |
|-------|---------|---------------|
| `products` | `(organization_id, is_archived, name)` | list/filter/sort by name |
| `products` | `(organization_id, sku)` (trigram `gin_trgm_ops`) | substring search on SKU |
| `contacts` | `(organization_id, is_archived, name)` | list/filter/sort by name |
| `contacts` | `(organization_id, email)` (trigram) | substring search on email |
| `invoices` | `(organization_id, status, due_date)` | outstanding/overdue filters |
| `invoices` | `(organization_id, customer_id, status)` | customer-scoped invoice lists |
| `sales_orders` | `(organization_id, status, order_date)` | list/filter/sort |
| `purchase_orders` | `(organization_id, status, order_date)` | list/filter/sort |
| `stock_movements` | `(organization_id, product_id, created_at)` | product movement history |
| `stock_movements` | `(organization_id, source_type, source_id)` | receipt/shipment linkage |
| `audit_logs` | `(organization_id, created_at)` | recent-activity listing |
| `payments` | `(organization_id, payment_date)` | payment listing/sort |

### Database extension

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Created conditionally and safely so it works on plain PostgreSQL and on Supabase. Trigram indexes are added only on the columns the plans justify.

### Instrumentation cache (per-request, not persisted)

`RequestContext` gains an optional `instrumentation` field holding `{ queryCount, dbTimeMs, startedAt }` for the lifetime of the request. It is stored in `AsyncLocalStorage` (the same mechanism as `userId`/`organizationId`) so it cannot be forgotten and cannot leak between requests. It is never persisted and never shared across requests.

### Per-request context loader (one round trip)

The session, membership, roles, effective permissions, module state and organization settings are loaded by a single query (or one Prisma call with `include`) and memoised on the request context for the lifetime of the request. The memoisation is cleared when the request ends. No cross-request cache.

### Query-count and bundle budgets (CI only, no schema change)

Each endpoint declares its maximum query count as a constant in its test file. Each route declares its maximum bundle size in `frontend/scripts/check-bundle-budget.mjs`. Both are enforced in CI. No schema change.

## Relationships

Unchanged. No new foreign keys.

## State transitions

Unchanged. No new state machines.

## Validation rules

Unchanged. No new validation.

## Indexes and constraints

- All new indexes are composite with `organization_id` first, matching the tenant isolation principle.
- No existing index or constraint is dropped without proof (a documented `EXPLAIN` showing it unused).
- The `pg_trgm` extension is created with `IF NOT EXISTS` so the migration is idempotent.
- RLS remains enabled on every table with no policies; the new migration does not change RLS.

## Assumptions

- The generated dataset (2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders, 5,000 payments) is produced by `scripts/generate-perf-dataset.mjs` into the isolated test schema.
- `EXPLAIN (ANALYZE, BUFFERS)` is run against the isolated schema; no production database is touched.
- The production-like build (`nest build` then `node dist/main.js`, `NODE_ENV=production`, built frontend) is the only build measured.
