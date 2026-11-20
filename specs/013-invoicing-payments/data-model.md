# Phase 1 Data Model: Invoicing and Payments end to end

**Feature**: 013-invoicing-payments · **Date**: 2026-11-14

Column naming follows the repository's convention: `snake_case` columns, camelCase Prisma properties with `@map`, `organization_id` as the tenant key, composite unique keys per organization, and a `version` integer on documents for optimistic concurrency. Existing migrations are never edited; everything below arrives in new additive migrations.

## Relationships at a glance

```text
organizations (id) ──┬──< invoices >──< invoice_lines >── products
                     │        │  └── sales_orders (organization_id, id)
                     │        └── contacts (customer)
                     ├──< payments >──< payment_allocations >── invoices
                     │        └── payment_reversals (≤ 1 per payment)
                     └── document_sequences (invoice, payment kinds)
```

All cross-table relations are composite `(organization_id, id)` foreign keys. Balances and overdue figures are never stored; they come from the shared `invoice_balances` view (see below).

## Tables

### `invoices` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key, default `gen_random_uuid()` |
| `organization_id` | `uuid` | not null, FK to `organizations(id)` on delete restrict; tenant key |
| `number` | `varchar(32)` | NULL on `DRAFT`; `INV-` + six digits once issued; unique per organization (nullable-unique) |
| `sales_order_id` | `uuid` | not null; composite FK to `sales_orders(organization_id, id)` on delete restrict |
| `customer_id` | `uuid` | not null; composite FK to `contacts(organization_id, id)` on delete restrict |
| `status` | `varchar(24)` | not null, default `DRAFT`; check in `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID` |
| `issue_date` | `date` | NULL on `DRAFT`; not null once issued/partially paid/paid |
| `due_date` | `date` | NULL on `DRAFT` only if never set; at latest required at issue; check `due_date >= issue_date` when both present |
| `total` | `numeric(14,2)` | not null, default `0`; check `total >= 0` |
| `void_reason` | `varchar(1000)` | NULL unless `VOID` |
| `voided_at` | `timestamptz(6)` | NULL unless `VOID` |
| `voided_by` | `uuid` | NULL unless `VOID`; FK to `users(id)` |
| `version` | `integer` | not null, default 1; incremented on every successful write (create sets 1; update/issue/void increment) |
| `created_by` | `uuid` | not null; FK to `users(id)` on delete restrict |
| `created_at` | `timestamptz(6)` | not null, default `now()` |
| `updated_at` | `timestamptz(6)` | not null, default `now()` |

Constraints and indexes:

- `unique (organization_id, id)` — required by the composite foreign keys.
- `unique (organization_id, number) WHERE number IS NOT NULL`.
- `unique (organization_id, sales_order_id) WHERE status <> 'VOID'` — one non-void invoice per order; VOID invoices never block re-invoicing.
- Check: `status NOT IN ('ISSUED','PARTIALLY_PAID','PAID') OR (number IS NOT NULL AND issue_date IS NOT NULL AND due_date IS NOT NULL)`.
- `index (organization_id, customer_id, created_at desc)`, `index (organization_id, status, due_date)`, `index (organization_id, due_date)` — overdue selection and customer open-invoices.
- RLS enabled, no policies.

Immutability trigger (`invoices_immutability`):

- `BEFORE UPDATE`: when `OLD.status <> 'DRAFT'`, any change to `customer_id`, `sales_order_id`, `number`, `issue_date`, or `total` raises.
- `status` may change only via the allowed map: `DRAFT→ISSUED`, `DRAFT→VOID`, `ISSUED→PARTIALLY_PAID`, `ISSUED→PAID`, `ISSUED→VOID`, `PARTIALLY_PAID→PAID`, `PARTIALLY_PAID→ISSUED`, `PAID→PARTIALLY_PAID`, `PAID→ISSUED`. Any other transition raises. `VOID` is terminal.
- `void_reason`, `voided_at`, `voided_by` may be set only on a transition into `VOID`, and only together.
- `due_date` may change only while `OLD.status = 'DRAFT'` (the only field a draft may change) and never to before `created_at::date`.
- `version` may only increase; `created_by`/`created_at` are never updatable.

### `invoice_lines` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `invoice_id` | `uuid` | not null; composite FK to `invoices(organization_id, id)` on delete cascade |
| `product_id` | `uuid` | not null; composite FK to `products(organization_id, id)` on delete restrict |
| `quantity` | `numeric(14,3)` | not null; check `quantity > 0` |
| `unit_price` | `numeric(14,4)` | not null; check `unit_price >= 0` |
| `line_total` | `numeric(14,2)` | not null; check `line_total >= 0` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

- `unique (organization_id, invoice_id, product_id)` — one product per invoice.
- `unique (organization_id, id)` — not strictly required today; reserved for composite FKs.
- `index (organization_id, invoice_id)`.
- Insert-only: a trigger rejects UPDATE, DELETE, and TRUNCATE regardless of invoice status (this feature has no line-mutation path at all). The create transaction inserts the copied lines.
- RLS enabled, no policies.

`line_total` = `round(quantity × unit_price, 2)` half-up, computed by the server; PostgreSQL `round(numeric, 2)` rounds half away from zero, which is half-up for the non-negative values this table holds. The invoice `total` is the sum of the stored line totals and MUST equal the copied order's total — enforced by the invariant script.

### `payments` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `number` | `varchar(32)` | not null; `PAY-` + six digits; assigned at creation; unique per organization |
| `customer_id` | `uuid` | not null; composite FK to `contacts(organization_id, id)` on delete restrict |
| `amount` | `numeric(14,2)` | not null; check `amount > 0` |
| `payment_date` | `date` | not null; check not in the future relative to validation date (UTC) |
| `method` | `varchar(24)` | not null; check in `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER` |
| `reference` | `varchar(255)` | NULL |
| `recorded_by` | `uuid` | not null; FK to `users(id)` |
| `recorded_at` | `timestamptz(6)` | not null, default `now()` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

- `unique (organization_id, number)`, `unique (organization_id, id)`.
- `index (organization_id, customer_id, payment_date desc)`, `index (organization_id, payment_date)`.
- Append-only: BEFORE UPDATE/DELETE triggers raise; TRUNCATE revoked (see migration plan, one migration step for the whole trio).
- RLS enabled, no policies.
- No status column — the status is derived from the presence of `payment_reversals` (`RECORDED` vs `REVERSED`).

### `payment_allocations` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `payment_id` | `uuid` | not null; composite FK to `payments(organization_id, id)` on delete restrict |
| `invoice_id` | `uuid` | not null; composite FK to `invoices(organization_id, id)` on delete restrict |
| `amount` | `numeric(14,2)` | not null; check `amount > 0` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

- `unique (organization_id, payment_id, invoice_id)` — one allocation per invoice per payment.
- `index (organization_id, invoice_id)` — balance recompute under the lock; `index (organization_id, payment_id)`.
- Append-only: triggers + TRUNCATE revoked (same migration step as payments and reversals).
- RLS enabled, no policies.

### `payment_reversals` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | `uuid` | primary key |
| `organization_id` | `uuid` | not null; tenant key |
| `payment_id` | `uuid` | not null; composite FK to `payments(organization_id, id)` on delete restrict |
| `reason` | `varchar(1000)` | not null; non-empty |
| `reversed_by` | `uuid` | not null; FK to `users(id)` |
| `reversed_at` | `timestamptz(6)` | not null, default `now()` |
| `created_at` | `timestamptz(6)` | not null, default `now()` |

- `unique (organization_id, payment_id)` — one reversal per payment; a second reversal is 409 at the application.
- `index (organization_id, payment_id)` — the derived-status join stays cheap (the payments list LEFT JOINs this table in one query).
- Append-only: triggers + TRUNCATE revoked (same migration step).
- RLS enabled, no policies.

### `organizations` (existing, column added)

- `default_payment_terms_days integer NOT NULL DEFAULT 30` with check `0 <= default_payment_terms_days <= 365`.
- Exposed read-only on `GET /organizations/current` alongside `currencyCode`; no editing in this feature.

### `document_sequences` (existing, kinds added)

Existing table; kinds `invoice` (INV-) and `payment` (PAY-) are allocated with the same `pg_advisory_xact_lock(hashtext('<orgId>:<name>'))` pattern as `sales_order`/`shipment` (`allocateDocumentNumber` generalized, or a sibling `invoice-number.ts` mirroring `sales-number.ts`). Invoice allocates at issue; payment at creation. The existing `unique ("organizationId", name)` constraint covers both new kinds. No backfill; rows appear on first use.

## Read projection (computed, never stored)

### `invoice_balances` (view, the one shared definition)

```text
organization_id | invoice_id | total | allocated (sum of allocations of payments with NO reversal) | balance (total − allocated) | is_overdue (due_date < now()::date UTC AND balance > 0)
```

- Used by: the invoice list (row balances, `outstanding` and `overdue` aggregates for the selection, one snapshot), the invoice detail (`balance`, `paid`, `isOverdue`, `paymentsApplied`), the record-payment screen (`GET /invoices/open`), the later Outstanding Invoices report, and the Dashboard. Nothing reimplements the definition.
- The invoice list and the payments list each compute rows, `total`, and figures inside a single query/transaction; the payments list LEFT JOINs `payment_reversals` so its derived `status` backs filter, rows, and total in one pass.

## Rules that live in the database, not in application code

| Rule | Mechanism |
|------|-----------|
| amount/quantity/line total positive; prices non-negative | check constraints |
| one non-void invoice per order | partial unique index `(organization_id, sales_order_id) WHERE status <> 'VOID'` |
| number unique per organization (when issued) | unique `(organization_id, number) WHERE number IS NOT NULL` |
| issued invoice header immutable (customer, order, number, issue date, total) | `invoices_immutability` trigger |
| invoice transitions restricted to the allowed map | same trigger; `VOID` terminal |
| void fields set only on transition into VOID | same trigger |
| invoice lines insert-only | trigger rejects UPDATE/DELETE/TRUNCATE always |
| payments, allocations, reversals append-only | triggers + revoked `UPDATE/DELETE/TRUNCATE` from PUBLIC and `service_role`/`authenticated`/`anon` in ONE migration step |
| one reversal per payment | unique `(organization_id, payment_id)` |
| ISSUED/PARTIALLY_PAID/PAID invoice has number, issue date, due date | check constraint + invariant script |
| sequence once per organization and document kind | existing `unique ("organizationId", name)` |
| tenant isolation at the schema level | `ENABLE ROW LEVEL SECURITY` with no policies on all five tables |
| every relation is tenant-safe | composite unique keys and composite foreign keys |

## Rules proved by `scripts/verify-db-invariants.mjs` (extended)

Existing 1–9 stay; new rules are added:

10. Every `invoices.total` equals the sum of its lines' `line_total` and equals the sales order's `total` (VOID/DRAFT included where lines exist).
11. For every invoice, `paid` (sum of allocations of payments with no reversal) plus `balance` equals `total`, and `balance >= 0`.
12. Every invoice's status agrees with its balance: `ISSUED` → balance = total; `PARTIALLY_PAID` → 0 < balance < total; `PAID` → balance = 0; `DRAFT` → balance = total (nothing allocated); `VOID` excluded from payment-derived checks but allocations of a VOID invoice must be all reversed (active allocations of VOID invoices do not exist).
13. Every `ISSUED`/`PARTIALLY_PAID`/`PAID` invoice has a number, issue date, and due date.
14. At most one non-void invoice exists per sales order.
15. Every payment's allocations sum to the payment's `amount`.
16. `payments`, `payment_allocations`, `payment_reversals` refuse UPDATE, DELETE, TRUNCATE and carry no API-role grants.
17. `invoices`, once not `DRAFT`, refuse changes to `customer_id`, `sales_order_id`, `number`, `issue_date`, `total` (direct SQL UPDATE attempts fail).
18. The unfiltered `outstanding` and `overdue` figures (all invoices in the organization) equal the sums of the view's balances — the shared definition is reproducible.
19. The public schema's row counts are unchanged after the isolated test suite (unchanged from sales).

## Lifecycle and state transitions

```text
             issue (invoices.issue, idem, number from sequence)
    DRAFT ───────────────────────────────────────────────► ISSUED
      │  │                                                   │  │  │
      │  │ void (invoices.void, idem, reason)                │  │  │ void (reason, no active allocations)
      ▼  ▼                                                   ▼  ▼  ▼
    VOID ◄──────────────────────────────────────────── VOID  ISSUED/PARTIALLY_PAID ── issue payment ──► PARTIALLY_PAID
                                                            │                                │
                                                            │        allocation reaches exactly 0
                                                            └──────────────────────────────► PAID
      PAID ── reversal of every active allocation ──► ISSUED (or PARTIALLY_PAID if some remain)
      PARTIALLY_PAID ── reversal ──► ISSUED (or stays PARTIALLY_PAID if others remain)
```

- Create always starts `DRAFT` with `total` copied from the order's lines; no number until issue.
- Update is allowed only while `DRAFT` and only for `due_date` (never before creation date); it increments `version`.
- Issue locks the invoice, requires `DRAFT`, allocates the number, sets issue and due dates per D-004, sets `ISSUED`, increments `version`, audits, stores the idempotency response.
- Void is allowed from `DRAFT` (no allocations can exist) and from `ISSUED` with zero active allocations; `PARTIALLY_PAID`/`PAID` return 409 `INVOICE_HAS_PAYMENTS`. `VOID` is terminal; the order may be invoiced again.
- Record: locks invoices ascending id, recomputes balances, enforces the `expectedBalance` rule, creates payment + allocations, sets statuses (PAID only at balance exactly zero), audits, stores the idempotency response.
- Reverse: creates `payment_reversals`, restores statuses of affected invoices per their remaining active allocations (PAID/PARTIALLY_PAID → ISSUED/PARTIALLY_PAID), audits, stores the idempotency response; a second reversal is 409.

## Validation rules (from the specification)

- Quantity: at most 3 fractional places, > 0. Unit price: at most 4 fractional places, not negative. Line total: exactly 2 places, computed server-side half-up; more places are refused, never rounded.
- Invoice total: sum of the stored line totals; must equal the copied order's total.
- Payment amount: at most 2 places, > 0; payment date not in the future (UTC); method one of `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER`.
- Allocations: one entry per invoice per payment; each `> 0`; each carries `expectedBalance`; allocations sum exactly to the payment amount; each invoice is same customer and organization, `ISSUED` or `PARTIALLY_PAID`, with `0 < amount <= balance`.
- Stale expected balance: 409 `BALANCE_CHANGED` with `details: { invoiceId, currentBalance }`; other over-allocation with a matching expected balance: 400 `OVER_ALLOCATION`; sum mismatch: 400 `VALIDATION_ERROR`.
- Draft due date: not before the creation date; version-checked; ISSUED+ invoices: immutable except status/void fields.
- Date range on the payments list: end not before start, else 400 `VALIDATION_ERROR` naming the date field; both ends inclusive.
- Page size: default 25, capped at 100; search wildcards (`%`, `_`, `\`) treated literally; list `total` counts the whole selection.
- Sort keys validated against a closed list; unknown key returns 400 `VALIDATION_ERROR` naming the field; default `number asc` (invoices) and `payment_date desc` (payments), tie-broken by `id`.
- Every new table: RLS enabled, no policies; every relation composite `(organization_id, id)`; cross-tenant records return 404.
- Error codes: `VALIDATION_ERROR`/`OVER_ALLOCATION` (400); `FORBIDDEN` (403, membership/permission), `NOT_FOUND` (404, cross-tenant); `INVALID_STATE_TRANSITION`, `INVOICE_HAS_PAYMENTS`, `BALANCE_CHANGED`, `STALE_VERSION`, `CONTACT_IN_USE`, `INVOICE_ALREADY_EXISTS` (409); `IDEMPOTENCY_KEY_REUSED` (422).

## Migration plan (additive, immutable)

1. `20261115000001_organizations_default_payment_terms_days` — add the column with the check constraint.
2. `20261115000002_invoices` — create `invoices` (checks, partial unique index, composite FKs, indexes); insert-only trio NOT here.
3. `20261115000003_invoice_lines` — create `invoice_lines` (checks, unique `(organization_id, invoice_id, product_id)`, indexes, composite FKs).
4. `20261115000004_invoices_immutability` — `invoices_immutability` trigger (header immutability, transition map, void-field rules) and the `invoice_lines` insert-only trigger.
5. `20261115000005_payments` — create `payments` (checks, unique indexes, composite FKs).
6. `20261115000006_payment_allocations` — create `payment_allocations` (checks, unique `(organization_id, payment_id, invoice_id)`, indexes, composite FKs).
7. `20261115000007_payment_reversals` — create `payment_reversals` (reasoning, unique `(organization_id, payment_id)`, index on `payment_id`, composite FKs).
8. `20261115000008_payments_append_only` — BEFORE UPDATE/DELETE triggers on all three append-only tables, plus `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC` and from `service_role`/`authenticated`/`anon` guarded by role existence, in ONE migration step.
9. `20261115000009_invoice_balances_view` — create the `invoice_balances` view used by list, detail, report, and Dashboard; grants consistent with read-only use.
10. `20261115000010_invoicing_rls` — enable RLS with no policies on `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_reversals`.
11. Sequence kinds `invoice`/`payment` need no migration (rows are created on first use); if `document_sequences` has a check on `name`, the migration for it is folded into step 1–2 and is the only edit of a pre-existing table's constraint set, additive and new.
12. No backfill; existing migrations are not edited; the public schema is untouched by the migration itself.
