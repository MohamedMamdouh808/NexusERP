# Data Model: Reports Analytics Page End to End

No new tables and no new stored entities. Read-only projections over existing tables. Only new indexes.

## Virtual projections

- **KpiValue**: { key, label, value, unit, previousValue|null, change|null, direction }
- **KpiSummaryResponse**: { range:{start,end}, asOf, kpis: KpiValue[], filters:{ start, end } }
- **TimeSeriesBucket**: { label, value (decimal string), count }
- **TimeSeriesResponse**: { range, granularity, buckets: TimeSeriesBucket[] }
- **TopProductRow**: { productId, name, sku, revenue, quantity|null, unit|null }
- **TopCustomerRow**: { customerId, name, total }
- **DocumentsByStatusGroup**: { docType, statuses: { [status]: count }, payments: { RECORDED, REVERSED } }
- **ReceivablesAging**: as in 015 (Current, d1_30, d31_60, d61_90, over90) with count and balance
- **StockHealth**: { inStock, lowStock, outOfStock, lowStockProducts: [ { name, sku, available, threshold } x10 ] }
- **StockMovementsOverTime**: { granularity, buckets: { type counts } }

## State transitions

None — read-only.

## Indexes (new migration)

- `payments(organization_id, payment_date)`
- `invoices(organization_id, issue_date)`
- `purchase_orders(organization_id, order_date)`

## Validation

- range inclusive both ends; end not before start; max 400 days.
- granularity chosen by server; max buckets bound.
- statement timeout 10s; no caching.

## Audit

Not applicable (read-only).