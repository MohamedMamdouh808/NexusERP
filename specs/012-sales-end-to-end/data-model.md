# Phase 1 Data Model: Sales end to end — real sales orders, reservations, and shipments

**Feature**: 012-sales-end-to-end · **Date**: 2026-11-14

Column naming follows the repository's established convention: `snake_case` columns, camelCase Prisma properties, `organization_id` as the tenant key, composite unique keys per organization, and a `version` integer for optimistic concurrency. Existing migrations are never edited; everything below arrives in new additive migrations.

## Relationships at a glance

```text
contacts (organization_id, id) ─┐
warehouses (organization_id, id ├──< sales_orders >──< sales_order_lines >── products (organization_id, id)
users (id) ─────────────────────┘         │                       │
                                          │                       │
                                          └──< shipments >──< shipment_lines
                                                    │
                                                    └── source_id / source_number on stock_movements (Inventory)
```

`shipments.sales_order_id` and `shipment_lines.sales_order_line_id` are composite organization-owned foreign keys. `stock_reservations` links the order line, warehouse and product. The Inventory `stock_movements` row has no database foreign key to Sales; the shipment id and number are copied onto the movement, and the invariant script proves they agree. Confirm creates `stock_reservations` rows; shipment marks them `CONSUMED`; cancel marks them `RELEASED`.

## Tables

### `sales_orders` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key, default `gen_random_uuid()` |
| `organization_id` | `uuid` | not null, FK to `organizations(id)` on delete restrict; tenant key |
| `number` | `varchar(32)` | not null; `SO-` + six digits; unique per organization |
| `customer_id` | `uuid` | not null; composite FK to `contacts(organization_id, id)` on delete restrict |
| `warehouse_id` | `uuid` | not null; composite FK to `warehouses(organization_id, id)` on delete restrict |
| `status` | `varchar(24)` | not null, default `DRAFT`; check in `DRAFT`, `CONFIRMED`, `SHIPPED`, `CANCELLED` |
| `order_date` | `date` | not null |
| `notes` | `varchar(1000)` | not null, default `''` |
| `total` | `numeric(14,2)` | not null, default `0`; check `total >= 0` |
| `version` | `integer` | not null, default 1; incremented on every successful write |
| `created_by` | `uuid` | not null; FK to `users(id)` on delete restrict |
| `created_at` | `timestamptz(6)` | not null, default `now()` |
| `updated_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, number)`.
- `unique (organization_id, id)` — required by the composite foreign keys.
- `index (organization_id, status, order_date)`, `index (organization_id, customer_id)`, `index (organization_id, warehouse_id)`.
- No append-only trigger: a DRAFT order is editable, and its status changes.

### `sales_order_lines` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `sales_order_id` | `uuid` | not null; composite FK to `sales_orders(organization_id, id)` on delete cascade (the line belongs to the order; deletion is only possible while the order is DRAFT) |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity` | `numeric(14,3)` | not null; check `quantity > 0` |
| `unit_price` | `numeric(14,4)` | not null; check `unit_price >= 0` |
| `line_total` | `numeric(14,2)` | not null; check `line_total >= 0` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |
| `updated_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, sales_order_id, product_id)` — one product per order.
- `unique (organization_id, id)` — required by the shipment-line composite FK.
- `index (organization_id, sales_order_id)`.

The line total is `round(quantity × unit_price, 2)` (half-up) and stored by the server; the check is a second line of defence. PostgreSQL `round(numeric, 2)` rounds half away from zero, which is half-up for the non-negative values this table permits.

### `stock_reservations` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `sales_order_line_id` | `uuid` | not null; composite FK to `sales_order_lines(organization_id, id)` on delete restrict |
| `warehouse_id` | `uuid` | not null; composite FK to `warehouses(organization_id, id)` on delete restrict |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity` | `numeric(14,3)` | not null; check `quantity > 0` |
| `status` | `varchar(24)` | not null; check in `ACTIVE`, `CONSUMED`, `RELEASED` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `index (organization_id, sales_order_line_id)`, `index (organization_id, warehouse_id, product_id)`, `index (organization_id, status)`.
- One reservation per order line is created on confirm; its status moves to `CONSUMED` on shipment and `RELEASED` on cancel.

### `shipments` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `number` | `varchar(32)` | not null; `SH-` + six digits; unique per organization |
| `sales_order_id` | `uuid` | not null; composite FK to `sales_orders(organization_id, id)` on delete restrict |
| `shipped_by` | `uuid` | not null; FK to `users(id)` on delete restrict |
| `shipped_at` | `timestamptz(6)` | not null, default `now()` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, number)`.
- `unique (organization_id, id)` — required by the shipment-line composite FK.
- `index (organization_id, shipped_at)`, `index (organization_id, sales_order_id)`.
- Append-only: `BEFORE UPDATE`/`BEFORE DELETE` triggers raise, and `TRUNCATE` is revoked from the application role.

Customer and warehouse are read from the sales order, not duplicated.

### `shipment_lines` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `shipment_id` | `uuid` | not null; composite FK to `shipments(organization_id, id)` on delete restrict |
| `sales_order_line_id` | `uuid` | not null; composite FK to `sales_order_lines(organization_id, id)` on delete restrict |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity` | `numeric(14,3)` | not null; check `quantity > 0` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, shipment_id, sales_order_line_id)` — one entry per order line per shipment.
- `index (organization_id, shipment_id)`, `index (organization_id, sales_order_line_id)`.
- Append-only triggers and revoked `TRUNCATE`, exactly like `shipments`.

### `stock_movements` (existing, used by shipments)

No schema change. A shipment creates one row per shipment line with:

- `type = 'SHIPMENT'`
- `quantity_delta = -quantity`
- `source_type = 'SHIPMENT'`
- `source_id = shipments.id`
- `source_number = shipments.number`
- `warehouse_id = sales_orders.warehouse_id`
- `product_id = shipment_lines.product_id`
- `user_id = shipments.shipped_by`

The movement is written only through `InventoryService.postShipmentMovement`; Sales never inserts it.

### `document_sequences` (existing, extended)

Sequence names `sales_order` and `shipment`; the row is created on first use inside the creating transaction, the value is incremented under `pg_advisory_xact_lock(hashtext('<organizationId>:<name>'))`, and the number is formatted with six digits (`SO-000001`, `SH-000001`). The migration adds one constraint:

- `unique ("organizationId", name)` — a sequence exists once per organization and per document kind, so two concurrent first-uses cannot create two rows. (The table's columns are the grandfathered camelCase ones; the constraint uses the real column names.)

No backfill is needed: the rows appear when the organization creates its first order or shipment.

## Read projections (computed, never stored)

### Sales-order list row (one order)

| Field | Meaning |
|-------|---------|
| `number`, `customerName`, `warehouseName`, `status`, `orderDate`, `total` | from the order header |
| `version` | current order version |

The list returns one row per order and its `total` counts orders. There is no progress summary for sales orders (one shipment ships the whole order; received-of-ordered is a purchasing concept).

### Shipments list row (one shipment)

| Field | Meaning |
|-------|---------|
| `number`, `orderNumber`, `customerName`, `warehouseName`, `shippedAt`, `user`, `lineCount` | from the shipment and its order |

One row per shipment; the list payload carries **no** `lines`. The lines are read from the order's shipment history.

## Rules that live in the database, not in application code

| Rule | Mechanism |
|------|-----------|
| quantity positive; unit price non-negative | check constraints on `sales_order_lines` |
| one product per order | unique `(organization_id, sales_order_id, product_id)` |
| one shipment line per order line per shipment | unique `(organization_id, shipment_id, sales_order_line_id)` |
| status is one of the four API names | check constraint on `sales_orders` |
| reservations status one of ACTIVE/CONSUMED/RELEASED | check constraint on `stock_reservations` |
| reservations positive quantity | check constraint on `stock_reservations` |
| shipments and shipment lines cannot be updated, deleted or truncated | triggers + revoked privilege |
| one document number per organization | unique `(organization_id, number)` on both documents |
| one sequence per organization and document kind | unique `(organization_id, name)` on `document_sequences` |
| tenant isolation at the schema level | `ENABLE ROW LEVEL SECURITY` with no policies on all five tables |
| every relation is tenant-safe | composite unique keys and composite foreign keys |

## Rules proved by `scripts/verify-db-invariants.mjs` (extended)

1. Every `stock_reservations.quantity` is positive.
2. For every balance, `reserved` equals the sum of its `ACTIVE` `stock_reservations` rows.
3. For every balance, `reserved <= on_hand`.
4. Every `sales_orders.total` equals the sum of its lines' `line_total` (zero for an empty draft).
5. Status agrees with reservations:
   - `DRAFT`, `CANCELLED`: every line has no `ACTIVE` reservation.
   - `CONFIRMED`: every line has exactly one `ACTIVE` reservation.
   - `SHIPPED`: every line has a `CONSUMED` reservation.
6. Every `SHIPPED` order has exactly one shipment, and every shipment line has a matching `stock_movements` row with `source_type = 'SHIPMENT'`, `source_id = shipment_id`, `source_number = shipment_number`, for the same product and quantity.
7. `shipments` and `shipment_lines` refuse `UPDATE`, `DELETE` and `TRUNCATE`.
8. Every `stock_reservations` row for a `SHIPPED` order's line is `CONSUMED`; every `stock_reservations` row for a `CANCELLED` order's line is `RELEASED`.
9. The public schema's row counts are unchanged after the isolated test suite.

## Lifecycle and state transitions

```text
       confirm (>= 1 line, current version)
   DRAFT ─────────────────────────────────────────────────► CONFIRMED
     │                                                         │
     │ cancel (current version)                                │ ship (current version; active reservation per line)
     ▼                                                         ▼
   CANCELLED                                                   SHIPPED
```

- Create always starts `DRAFT`; an empty draft is allowed and has `total = 0.00`.
- Update is allowed only while `DRAFT`; it replaces the header values and lines, recalculates totals, and increments `version`.
- Confirm is allowed only from `DRAFT`, requires at least one line and the current version; it runs in one transaction with an `Idempotency-Key`, locks balances in ascending product id order, checks `on_hand - reserved` per line, creates one `ACTIVE` reservation per line, increases `reserved`, sets `CONFIRMED`, and writes the audit entry.
- Cancel is allowed from `DRAFT`, or from `CONFIRMED` when the order has no shipment; it carries an `Idempotency-Key` and the current version; cancelling `CONFIRMED` releases its `ACTIVE` reservations (they become `RELEASED`, `reserved` decreases); cancelling `SHIPPED` returns `409 ORDER_SHIPPED`.
- Ship is allowed only from `CONFIRMED` with an active reservation for every line; it carries an `Idempotency-Key`; it runs in one transaction, locks balances, creates the shipment and its lines, posts `SHIPMENT` movements through the Inventory service (decreasing `on_hand` and `reserved`), marks every reservation `CONSUMED`, sets `SHIPPED`, and writes the audit entry.
- Negative stock is impossible: a ship that would take `on_hand` below zero is refused by the conditional update / `reserved <= on_hand` guard; the balance rows are locked and the conditional update guarantees it.
- A shipment does not carry the order version; the order row lock, status check and per-line active-reservation guard provide its concurrency safety.
- `SHIPPED` and `CANCELLED` are terminal for this feature.

## Validation rules (from the specification)

- Quantity strings: decimal with at most 3 fractional places, greater than zero on an order line.
- Unit-price strings: decimal with at most 4 fractional places, not negative.
- Line-total strings: decimal with exactly 2 fractional places, computed by the server as half-up `quantity × unit_price`.
- Order-total strings: sum of the already-rounded line totals.
- Customer: existing, non-archived contact with the customer role.
- Product: existing, non-archived product; one per order.
- Warehouse: existing, active warehouse.
- At least one line to confirm.
- Confirm on a non-DRAFT order returns `409 INVALID_STATE_TRANSITION`.
- Update on a non-DRAFT order returns `409 INVALID_STATE_TRANSITION`.
- Ship on a non-CONFIRMED order returns `409 INVALID_STATE_TRANSITION`; on a CONFIRMED order missing an active reservation for any line, refused.
- Cancel on a SHIPPED order returns `409 ORDER_SHIPPED`.
- Stale version on update/confirm/cancel returns `409 STALE_VERSION`.
- Shipment date range: both ends inclusive, applied to `shipped_at`; end before start is `400 VALIDATION_ERROR` naming the date field.
- Shipment list row: one row per shipment; the payload carries no lines.
- Page size: default 25, capped at 100; search wildcards (`%`, `_`, `\`) are treated literally.

## Migration plan (additive, immutable)

1. Create `sales_orders` with its columns, checks, unique keys, composite FKs and indexes.
2. Create `sales_order_lines` after the order table, with its composite FKs, checks, unique keys and indexes.
3. Create `stock_reservations` after the line table, with its composite FKs, checks and indexes.
4. Create `shipments` after the order table, with its unique keys, composite FK, indexes and append-only triggers.
5. Create `shipment_lines` after the shipment and line tables, with its composite FKs, unique keys, indexes and append-only triggers.
6. Revoke `TRUNCATE` on `shipments` and `shipment_lines` from the application role.
7. Enable RLS with no policies on all five tables.
8. Add the unique constraint `document_sequences ("organizationId", name)`; no sequence row is backfilled, because the rows are created on first use inside the creating transaction.
9. No backfill is needed for the new tables; they start empty. Existing migrations are not edited.
