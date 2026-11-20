# Contracts: Dashboard (Overview Page)

The dashboard adds no endpoint. It consumes these existing contracts, two of which change.

## GET /reports/kpi-summary (extended in place)

Path, permission (`reports.read`) and every existing field unchanged. Added: the extended `kpis[]` entries described in `data-model.md`, plus `filters` and `asOf`.

## GET /auth/me (extended)

Adds `membership.name` (string | null).

## GET /purchase-orders (widened)

`status` accepts one status or several (repeated parameter or comma-separated). Existing single-status calls stay valid.

## Consumed unchanged

| Endpoint | Permission | Used for |
|----------|-----------|----------|
| `GET /reports/sales-over-time` | reports.read | Sales over time chart |
| `GET /reports/documents-by-status` | reports.read | Sales orders by status chart |
| `GET /reports/receivables-aging` | reports.read | Receivables aging chart |
| `GET /reports/stock-reconciliation` | reports.read | Reconciliation attention item |
| `GET /invoices?overdue=true&pageSize=5` | invoices.read | Overdue invoices attention item |
| `GET /sales-orders?status=CONFIRMED&pageSize=5` | sales.read | Sales orders awaiting shipment |
| `GET /purchase-orders?status=CONFIRMED,PARTIALLY_RECEIVED&pageSize=5` | purchasing.read | Purchase orders awaiting receipt |
| `GET /inventory/stock-balances?lowStockOnly=true&pageSize=5` | inventory.read | Low-stock attention item |
| `GET /audit-logs?page=1&pageSize=8` | audit.read | Recent activity |
| `GET /products?pageSize=1` | products.read | Checklist step count |
| `GET /contacts?pageSize=1` | contacts.read | Checklist step count |
| `GET /inventory/stock-balances?pageSize=1` | inventory.read | Checklist step count |

## Request shape

First batch (≤ 8, in parallel): kpi-summary, sales-over-time, documents-by-status, receivables-aging, overdue invoices, confirmed sales orders, purchase orders awaiting receipt, low-stock balances.
Deferred batch (in parallel, low priority): stock-reconciliation, audit-logs, and the checklist counts the member's permissions allow.