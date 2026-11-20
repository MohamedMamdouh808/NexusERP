# Data Model: Reports Page End to End

This feature adds **no tables and no columns**. It reads existing tables. Only new indexes are added (in a new migration).

## Read-only projections (not stored)

### StockOnHandRow
- productId, productName, productSku, isArchived
- warehouseId, warehouseName
- unitOfMeasure (code)
- onHand, reserved, available (decimal strings)
- unit shared across the row's quantity

### StockMovementRow (reused from Inventory Movements)
- id, productId, productName, warehouseId, warehouseName
- type, quantity, reference (source id/number), createdAt

### OutstandingInvoiceRow
- invoiceId, number, customerId, customerName
- issueDate, dueDate, total, paid, balance (decimal strings)
- daysOverdue (integer)

### AgingBuckets
- current: { count, balance }
- d1_30, d31_60, d61_90, over90: { count, balance }

### DocumentStatuses
- purchaseOrders: { [status]: { count, totalAmount } }
- salesOrders: { [status]: { count, totalAmount } }
- invoices: { [status]: { count, totalAmount } }
- payments: { RECORDED: { count, totalAmount }, REVERSED: { count, totalAmount } }
- shipments: count
- goodsReceipts: count
- dateRange: { start, end }

### ReconciliationRow
- warehouseId, warehouseName, productId, productName, unitOfMeasure
- onHand, movementSum, reserved, reservationSum (decimal strings)
- kinds: ['onHandMismatch' | 'reservedMismatch' | 'reservedExceedsOnHand']
- checkedAt (ISO timestamp)

### SelectionTotals (stock on hand)
- onHand, reserved, available (decimal strings) when all rows share one unit of measure; otherwise row count only.

## Indexes (new migration)

- `stock_balances(organization_id, warehouse_id)`
- `stock_movements(organization_id, product_id, created_at)`
- `stock_movements(organization_id, warehouse_id, created_at)`
- `invoices(organization_id, status, due_date)`

## Validation rules

- `pageSize`: 1–100 (400 above).
- Date range: end not before start (400 naming the date field).
- `includeArchived`: boolean, default false.
- Report queries run in a read-consistent transaction with a 10s statement timeout.