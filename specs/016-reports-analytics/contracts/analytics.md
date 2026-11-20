# Contracts: Reports Analytics Page

All endpoints under `/api/v1/reports/*`, declare `reports.read`, tenant-scoped, read-only, no caching. Decimal strings. Each returns `{ filters:{start,end}, asOf: ISO }` plus the body.

## GET /reports/kpi-summary

Query: `start`, `end`. Response:
```json
{
  "filters": { "start":"2026-11-01","end":"2026-11-16" }, "asOf":"...",
  "kpis":[ { "key","label","value","unit","previousValue":"...","change":"...","direction":"..." } ]
}
```

## GET /reports/sales-over-time, purchases-over-time, payments-received-over-time

Query: `start`, `end`. Response: `{ filters, asOf, granularity, buckets: [ { label, value, count } ] }`.

## GET /reports/top-products, top-customers

Query: `start`, `end`. Response: `{ filters, asOf, rows: [...] }` (top 10).

## GET /reports/documents-by-status

Query: `start`, `end`. Response: `{ filters, asOf, groups: { salesOrders, purchaseOrders, invoices, payments:{RECORDED,REVERSED} } }`.

## GET /reports/receivables-aging

Response: `{ filters, asOf, aging: { current, d1_30, d31_60, d61_90, over90 } }` — identical definition to outstanding-invoices report.

## GET /reports/stock-health

Response: `{ filters, asOf, inStock, lowStock, outOfStock, lowStockProducts: [ { name, sku, available, threshold } ] }`.

## GET /reports/stock-movements-over-time

Query: `start`, `end`. Response: `{ filters, asOf, granularity, buckets: [ { label, receiptCount, shipmentCount, adjustmentCount } ] }`.