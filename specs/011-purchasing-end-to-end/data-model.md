# Phase 1 Data Model: Purchasing end to end — real purchase orders and goods receipts

**Feature**: 011-purchasing-end-to-end · **Date**: 2026-11-12 · **Updated**: 2026-11-13 (clarification session)

Column naming follows the repository's established convention: `snake_case` columns, camelCase Prisma properties, `organization_id` as the tenant key, composite unique keys per organization, and a `version` integer for optimistic concurrency. Existing migrations are never edited; everything below arrives in one new additive migration.

## Relationships at a glance

```text
contacts (organization_id, id) ─┐
warehouses (organization_id, id) ├──< purchase_orders >──< purchase_order_lines >── products (organization_id, id)
users (id) ──────────────────────┘         │                       │
                                            │                       │
                                            └──< goods_receipts >──< goods_receipt_lines
                                                      │
                                                      └── source_id / source_number on stock_movements (Inventory)
```

`goods_receipts.purchase_order_id` and `goods_receipt_lines.purchase_order_line_id` are composite organization-owned foreign keys. The Inventory `stock_movements` row has no database foreign key to Purchasing; the receipt id and number are copied onto the movement, and the invariant script proves they agree.

## Tables

### `purchase_orders` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key, default `gen_random_uuid()` |
| `organization_id` | `uuid` | not null, FK to `organizations(id)` on delete restrict; tenant key |
| `number` | `varchar(32)` | not null; `PO-` + six digits; unique per organization |
| `supplier_id` | `uuid` | not null; composite FK to `contacts(organization_id, id)` on delete restrict |
| `warehouse_id` | `uuid` | not null; composite FK to `warehouses(organization_id, id)` on delete restrict |
| `status` | `varchar(24)` | not null, default `DRAFT`; check in `DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` |
| `order_date` | `date` | not null |
| `expected_date` | `date` | nullable; check `expected_date IS NULL OR expected_date >= order_date` |
| `notes` | `varchar(1000)` | not null, default `''` |
| `total` | `numeric(14,2)` | not null, default `0`; check `total >= 0` |
| `version` | `integer` | not null, default 1; incremented on every successful write |
| `created_by` | `uuid` | not null; FK to `users(id)` on delete restrict |
| `created_at` | `timestamptz(6)` | not null, default `now()` |
| `updated_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, number)`.
- `unique (organization_id, id)` — required by the composite foreign keys.
- `index (organization_id, status, order_date)`, `index (organization_id, supplier_id)`, `index (organization_id, warehouse_id)`.
- No append-only trigger: a DRAFT order is editable, and its status changes.

### `purchase_order_lines` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `purchase_order_id` | `uuid` | not null; composite FK to `purchase_orders(organization_id, id)` on delete cascade (the line belongs to the order; deletion is only possible while the order is DRAFT and has no receipts) |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity_ordered` | `numeric(14,3)` | not null; check `quantity_ordered > 0` |
| `quantity_received` | `numeric(14,3)` | not null, default 0; check `quantity_received >= 0 AND quantity_received <= quantity_ordered` |
| `unit_cost` | `numeric(14,4)` | not null; check `unit_cost >= 0` |
| `unit_of_measure` | `varchar(16)` | not null; the product's unit-of-measure **abbreviation** captured when the line was entered; a snapshot, so a later product edit never changes the document |
| `line_total` | `numeric(14,2)` | not null; check `line_total >= 0 AND line_total = round(quantity_ordered * unit_cost, 2)` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |
| `updated_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, purchase_order_id, product_id)` — one product per order.
- `unique (organization_id, id)` — required by the goods-receipt-line composite FK.
- `index (organization_id, purchase_order_id)`.

The line total is calculated by the service and stored; the check is a second line of defence, not the primary calculation. PostgreSQL `round(numeric, 2)` rounds half away from zero, which is half-up for the non-negative values this table permits.

### `goods_receipts` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `number` | `varchar(32)` | not null; `GR-` + six digits; unique per organization |
| `purchase_order_id` | `uuid` | not null; composite FK to `purchase_orders(organization_id, id)` on delete restrict |
| `received_by` | `uuid` | not null; FK to `users(id)` on delete restrict |
| `received_at` | `timestamptz(6)` | not null, default `now()` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, number)`.
- `unique (organization_id, id)` — required by the goods-receipt-line composite FK.
- `index (organization_id, received_at)`, `index (organization_id, purchase_order_id)`.

Supplier and warehouse are read from the purchase order, not duplicated. The receipt is immutable: `BEFORE UPDATE`/`BEFORE DELETE` triggers raise, and `TRUNCATE` is revoked from the application role.

### `goods_receipt_lines` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `goods_receipt_id` | `uuid` | not null; composite FK to `goods_receipts(organization_id, id)` on delete restrict |
| `purchase_order_line_id` | `uuid` | not null; composite FK to `purchase_order_lines(organization_id, id)` on delete restrict |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity` | `numeric(14,3)` | not null; check `quantity > 0` |
| `unit_cost` | `numeric(14,4)` | not null; copied from the order line; check `unit_cost >= 0` |
| `unit_of_measure` | `varchar(16)` | not null; copied from the order line; the receipt history keeps the unit the goods arrived in |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, goods_receipt_id, purchase_order_line_id)` — one entry per order line per receipt.
- `index (organization_id, goods_receipt_id)`, `index (organization_id, purchase_order_line_id)`.
- Append-only triggers and revoked `TRUNCATE`, exactly like `goods_receipts`.

### `stock_movements` (existing, used by receipts)

No schema change. A receipt creates one row per positive receipt line with:

- `type = 'RECEIPT'`
- `quantity_delta = quantity`
- `source_type = 'RECEIPT'`
- `source_id = goods_receipts.id`
- `source_number = goods_receipts.number`
- `warehouse_id = purchase_orders.warehouse_id`
- `product_id = goods_receipt_lines.product_id`
- `user_id = goods_receipts.received_by`
- `reason` and `note` null.

The movement is written only through `InventoryService.postReceiptMovement`; Purchasing never inserts it.

### `document_sequences` (existing, extended)

Sequence names `purchase_order` and `goods_receipt`; the row is created on first use inside the creating transaction, the value is incremented under `pg_advisory_xact_lock(hashtext('<organizationId>:<name>'))`, and the number is formatted with six digits (`PO-000001`, `GR-000001`). The migration adds one constraint:

- `unique ("organizationId", name)` — a sequence exists once per organization and per document kind, so two concurrent first-uses cannot create two rows. (The table's columns are the grandfathered camelCase ones; the constraint uses the real column names.)

No backfill is needed: the rows appear when the organization creates its first order or receipt.

## Read projections (computed, never stored)

Two list rows carry a summary the server computes from the document lines. Neither is a column: a stored aggregate of quantities with different units would be meaningless, and a stored summary would have to be recomputed on every write.

### Purchase-order progress summary (one order row)

| Field | Meaning |
|-------|---------|
| `progressKind` | `QUANTITY` when every line of the order shares one unit of measure, `LINES` otherwise, `NONE` for a `DRAFT` |
| `receivedTotal`, `orderedTotal`, `unitOfMeasure` | present when `progressKind = QUANTITY`; `SUM(quantity_received)` and `SUM(quantity_ordered)` over the lines, and the shared abbreviation |
| `fullyReceivedLineCount`, `lineCount` | present when `progressKind = LINES`; a line counts as fully received when `quantity_received = quantity_ordered` |

The uniformity test is `COUNT(DISTINCT unit_of_measure) = 1` over the order's lines. The summary is derived from the quantities actually received, never from the status: a `DRAFT` carries no progress figure, a `CANCELLED` order carries the progress it reached, a `RECEIVED` order carries complete progress. The progress column is neither sortable nor filterable.

### Goods-receipt list row (one receipt)

| Field | Meaning |
|-------|---------|
| `lineCount` | the number of receipt lines |
| `receivedTotal`, `unitOfMeasure` | present only when `COUNT(DISTINCT unit_of_measure) = 1` over the receipt's lines; `SUM(quantity)` as a decimal string |
| `lines` | **never present** in the list payload; the lines are read from the order's receipt history |

The receipts list returns one row per receipt and its `total` counts receipts.

## Rules that live in the database, not in application code

| Rule | Mechanism |
|------|-----------|
| received never above ordered, never below zero | check constraint on `purchase_order_lines` |
| ordered quantity positive; unit cost non-negative | check constraints on `purchase_order_lines` |
| line total equals rounded quantity × unit cost | check constraint on `purchase_order_lines` |
| expected date never before order date | check constraint on `purchase_orders` |
| one product per order | unique `(organization_id, purchase_order_id, product_id)` |
| one receipt line per order line per receipt | unique `(organization_id, goods_receipt_id, purchase_order_line_id)` |
| status is one of the five API names | check constraint on `purchase_orders` |
| receipts and receipt lines cannot be updated, deleted or truncated | triggers + revoked privilege |
| one document number per organization | unique `(organization_id, number)` on both documents |
| one sequence per organization and document kind | unique `(organization_id, name)` on `document_sequences` |
| tenant isolation at the schema level | `ENABLE ROW LEVEL SECURITY` with no policies on all four tables |
| every relation is tenant-safe | composite unique keys and composite foreign keys |

## Rules proved by `scripts/verify-db-invariants.mjs`

1. Every `purchase_order_lines.quantity_received` is between `0` and `quantity_ordered`.
2. Every `purchase_order_lines.line_total` equals `round(quantity_ordered * unit_cost, 2)`.
3. Every `purchase_orders.total` equals the sum of its lines' `line_total` (zero for an empty draft).
4. Status agrees with the lines:
   - `DRAFT`, `CONFIRMED`, `CANCELLED`: every line has `quantity_received = 0`.
   - `PARTIALLY_RECEIVED`: at least one line has `quantity_received > 0` and at least one line has `quantity_received < quantity_ordered`.
   - `RECEIVED`: every line has `quantity_received = quantity_ordered`.
5. Every `goods_receipt_lines` row has a matching `stock_movements` row with `source_type = 'RECEIPT'`, `source_id = goods_receipt_id`, and `source_number = goods_receipts.number`, for the same product and quantity.
6. `goods_receipts` and `goods_receipt_lines` refuse `UPDATE`, `DELETE` and `TRUNCATE`.
7. Every `goods_receipt_lines.unit_of_measure` equals the `purchase_order_lines.unit_of_measure` of the line it fulfils.
8. Every `purchase_order_lines.unit_of_measure` is non-empty and matches the abbreviation the product carried when the line was entered (a snapshot, so a later product change does not fail this check).
9. The public schema's row counts are unchanged after the isolated test suite.

## Lifecycle and state transitions

```text
             confirm (>= 1 line, current version)
  DRAFT ───────────────────────────────────────────────► CONFIRMED
    │                                                      │
    │ cancel (current version, no receipts)                │ cancel (no receipts)
    ▼                                                      ▼
 CANCELLED                                             CANCELLED

  CONFIRMED ── receipt with some outstanding ─────────► PARTIALLY_RECEIVED
      │                                                    │
      └── receipt that fills every line ───────────────► RECEIVED
                                                           ▲
  PARTIALLY_RECEIVED ── receipt that fills every line ─────┘
```

- Create always starts `DRAFT`; an empty draft is allowed and has `total = 0.00`.
- Update is allowed only while `DRAFT`; it replaces the header values and lines, recalculates totals, and increments `version`.
- Confirm is allowed only from `DRAFT`, requires at least one line and the current version.
- Cancel is allowed from `DRAFT`, or from `CONFIRMED` only when the order has no receipts.
- A receipt is allowed only from `CONFIRMED` or `PARTIALLY_RECEIVED`; the resulting status is `RECEIVED` when every line is full, otherwise `PARTIALLY_RECEIVED`.
- A receipt does not carry the order version; the order row lock, status check and per-line outstanding quantities provide its concurrency safety.
- `RECEIVED` and `CANCELLED` are terminal for this feature.

## Validation rules (from the specification)

- Quantity strings: non-negative decimal with at most 3 fractional places; order-line quantity must be greater than zero.
- Unit-cost strings: non-negative decimal with at most 4 fractional places.
- At most 100 lines per order (a defensive limit; the UI does not offer more).
- Supplier: existing, non-archived contact with `is_supplier = true`.
- Product: existing, non-archived product; one per order.
- Warehouse: existing, active warehouse.
- Expected date: absent or on/after the order date.
- Receipt request: every entry names a line on the order and the matching product; duplicate line ids are refused; only positive quantities create rows; an all-zero request is refused.
- Goods-receipt date range: both ends inclusive, applied to the received date; end before start is a validation error naming the date field.
- Goods-receipt list row: one row per receipt; the aggregate quantity is present only when every line of the receipt shares one unit of measure; the payload carries no lines.
- Purchase-order progress summary: `QUANTITY` when every line shares one unit of measure, `LINES` otherwise, `NONE` for a `DRAFT`; never sorted or filtered.
- Page size: default 25, capped at 100; search wildcards (`%`, `_`, `\`) are treated literally.

## Migration plan (additive, immutable)

1. Create `purchase_orders` with its columns, checks, unique keys, composite FKs and indexes.
2. Create `purchase_order_lines` after the order table, with its composite FKs, checks, unique keys and indexes.
3. Create `goods_receipts` after the order table, with its unique keys, composite FK, indexes and append-only triggers.
4. Create `goods_receipt_lines` after the receipt and line tables, with its composite FKs, unique keys, indexes and append-only triggers.
5. Revoke `TRUNCATE` on `goods_receipts` and `goods_receipt_lines` from the application role.
6. Enable RLS with no policies on all four tables.
7. Add the unique constraint `document_sequences (organization_id, name)`; no sequence row is backfilled, because the rows are created on first use inside the creating transaction.
8. No backfill is needed for the new tables; they start empty. Existing migrations are not edited.
