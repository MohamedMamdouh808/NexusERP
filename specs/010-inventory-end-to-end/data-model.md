# Phase 1 Data Model: Inventory end to end — real stock for every organization

**Feature**: 010-inventory-end-to-end · **Date**: 2026-11-12

Column naming follows the repository's established convention: `snake_case` columns, camelCase properties, `organization_id` as the tenant key, composite unique constraints per organization, and a `version` integer for optimistic concurrency (products, contacts and — from this feature — warehouses).

## Tables

### `warehouses` (extended — existing table)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key, existing |
| `organization_id` | `uuid` | tenant key, existing; composite references from balances and movements |
| `name` | `varchar(128)` | **trimmed, 1–100 characters**, unique per organization **case-insensitively** (unique index on `(organization_id, lower(name))`) — no code column |
| `is_active` | `boolean` | default `true`; a deactivated warehouse holds no stock and takes no adjustments |
| `is_default` | `boolean` | default `false`; **exactly one default per organization**, enforced by a partial unique index on `organization_id` where `is_default` |
| `version` | `integer` | not null, default 1; backfilled to 1 for existing rows by the migration; incremented on every successful write |
| `created_at` | `timestamptz(6)` | existing |

State transitions: `active → deactivated` (refused when the warehouse is the default or holds stock) and `deactivated → active` (reactivation). Both are versioned writes.

### `stock_balances` (new)

| Column | Type | Rules |
|--------|------|-------|
| `organization_id` | `uuid` | tenant key; part of the composite keys |
| `warehouse_id` | `uuid` | composite foreign key to `(organization_id, id)` on `warehouses` |
| `product_id` | `uuid` | composite foreign key to `(organization_id, id)` on `products` |
| `on_hand` | `numeric(14,3)` | not null, default 0, check `on_hand >= 0` |
| `reserved` | `numeric(14,3)` | not null, default 0, check `reserved >= 0` and `reserved <= on_hand` |
| `version` | `integer` | not null, default 1 |
| `created_at` / `updated_at` | `timestamptz(6)` | |

Unique: `(organization_id, warehouse_id, product_id)`.

**Absent row means zero** on hand and zero reserved. A row is created by the first movement for that combination. **Available is derived** (`on_hand - reserved`) and never stored.

### `stock_movements` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | tenant key |
| `warehouse_id` | `uuid` | composite foreign key to `(organization_id, id)` on `warehouses` |
| `product_id` | `uuid` | composite foreign key to `(organization_id, id)` on `products` |
| `type` | `varchar(16)` | `RECEIPT` \| `SHIPMENT` \| `ADJUSTMENT` — this feature writes only `ADJUSTMENT` |
| `quantity_delta` | `numeric(14,3)` | signed, never zero (check `quantity_delta <> 0`) |
| `reason` | `varchar(32)` | `DAMAGE` \| `LOSS` \| `FOUND` \| `COUNT_CORRECTION` \| `OTHER` |
| `note` | `varchar(500)` | nullable; required when `reason = 'OTHER'` |
| `source_type` | `varchar(32)` | `ADJUSTMENT` \| `RECEIPT` \| `SHIPMENT` |
| `source_id` | `uuid` | the source document's id (the adjustment's id for this feature) |
| `source_number` | `varchar(32)` | the source document's number (`ADJ-00001`) |
| `user_id` | `uuid` | the acting user |
| `created_at` | `timestamptz(6)` | |

**Append-only**: `BEFORE UPDATE` and `BEFORE DELETE` triggers raise; `TRUNCATE` is revoked for the application role (the audit-log mechanism, copied).

**Invariant**: for every balance, `on_hand` equals the sum of its movements' `quantity_delta`.

### `idempotency_keys` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | tenant key |
| `endpoint` | `varchar(128)` | the endpoint path |
| `key` | `varchar(255)` | the client-generated key (a UUID per user action) |
| `request_hash` | `varchar(64)` | SHA-256 of the canonically ordered request body |
| `response_status` | `integer` | the status returned the first time |
| `response_body` | `jsonb` | the body returned the first time |
| `expires_at` | `timestamptz(6)` | creation + 24 hours |

Unique: `(organization_id, endpoint, key)`.

### Supporting database objects

- A view holding the **single low-stock rule** (research D3): product identity, threshold, total available over active warehouses, and the status (out of stock / low stock / in stock), for non-archived products with a threshold; products with no balance rows appear with zero available.
- Row-level security enabled with **no policies** on every new table, exactly as the existing tables do.
- An index supporting the balances list (organization, product, warehouse) and one supporting the low-stock view's aggregation.

## Rules that live in the database, not in application code

| Rule | Mechanism |
|------|-----------|
| on hand never negative; reserved never negative; reserved ≤ on hand | check constraints on `stock_balances` |
| a movement's quantity is never zero | check constraint on `stock_movements` |
| movements cannot be updated, deleted or truncated | triggers + revoked privilege |
| one default warehouse per organization | partial unique index |
| warehouse names unique per organization, case-insensitively | unique index on `(organization_id, lower(name))` |
| one idempotency record per organization, endpoint and key | unique constraint |
| row-level security on every new table | `ENABLE ROW LEVEL SECURITY`, no policies |
| on hand equals the sum of movements | enforced by the write path and **proved** by `scripts/verify-db-invariants.mjs` |

## Lifecycle and state transitions

- **Warehouse**: active ⇄ deactivated, versioned, with the refusals above.
- **Balance**: created lazily by the first movement; updated only by movements; never deleted by this feature.
- **Movement**: inserted once, never changed, never deleted.
- **Idempotency record**: inserted at claim time, filled with the response, expired after 24 hours, purged afterwards.

## Validation rules (from the specification)

- Warehouse name: trimmed, 1–100 characters, unique per organization (case-insensitive).
- Adjustment: quantity signed and never zero; reason required and from the fixed set; a note is required for `OTHER`; the resulting on hand may not fall below zero nor below reserved; an adjustment into a deactivated warehouse is refused; on an archived product only decreasing adjustments are allowed, and an increase is refused with a conflict.
- Filters: a date range whose end precedes its start is refused; page size is capped at 100; search terms treat `%` and `_` literally.

## Migration plan (additive, immutable — existing migrations are never edited)

1. Extend `warehouses`: add `is_active`, `version` (default 1, backfilled), the partial unique index for the default, and the unique index on `(organization_id, lower(name))`.
2. Create `stock_balances`, `stock_movements` and `idempotency_keys` with their columns, constraints, composite foreign keys, indexes and row-level security.
3. Attach the append-only triggers to `stock_movements` and revoke its truncate privilege.
4. Create the low-stock view.
