# Data Model: Dashboard (Overview Page) End to End

No new tables and no new stored columns. The dashboard reads existing data through existing endpoints.

## Extended response: GET /reports/kpi-summary (existing endpoint, extended in place)

Keeps every existing field with the same value. Adds:

| Field | Type | Notes |
|-------|------|-------|
| `kpis[]` | array | Each entry: `key`, `label`, `value` (decimal string or count), `unit` (`money` \| `count`), `previousValue` (period-bound figures only), `change` (null when the previous value is zero), `asOf` (for not-range-bound figures) |
| `filters` | object | `{ start, end }` — the range the request used |
| `asOf` | ISO timestamp | When the figures were computed |

Period-bound KPIs (current month and the immediately preceding equal-length period):
- `salesTotal`, `invoiceCount` (sales = ISSUED/PARTIALLY_PAID/PAID by issue date)
- `purchasesTotal`, `purchaseOrderCount` (purchases = CONFIRMED/PARTIALLY_RECEIVED/RECEIVED by order date)
- `paymentsReceived` (payments with no reversal by payment date)
- `salesOrderCount`, `purchaseOrderCreatedCount` (documents created in the range)

Not range-bound (as of today, labelled, no change):
- `outstanding` (balance), `outstandingInvoiceCount`
- `overdue` (balance), `overdueInvoiceCount`

Current stock (not range-bound):
- `lowStockProductCount`, `outOfStockProductCount` (archived products excluded)

## Extended request: GET /auth/me

| Field | Type | Notes |
|-------|------|-------|
| `membership.name` | string \| null | The per-membership display name (column already exists) |

## Widened request: GET /purchase-orders

| Parameter | Type | Notes |
|-----------|------|-------|
| `status` | one status, or a list of statuses | Repeating the parameter or passing a comma-separated list selects several; the single-status form stays valid |

## Virtual entities (not stored)

- **Widget**: a permission-gated card; carries its definition line and as-of time.
- **AttentionItem**: count + up to 5 rows + a "View all" link.
- **ChecklistStep**: label, link, ticked-from-count.

## Validation

- Range: inclusive of both ends; end not before start; maximum 400 days.
- pageSize: the dashboard asks for 5 (attention lists) or 1 (checklist counts).
- Money and quantities: decimal strings; never summed on the client.