# Contracts: Reports Page

All endpoints under `/api/v1/reports/*`, require a valid session, declare `reports.read`, tenant-scoped. Errors use the standard envelope. All quantities/money returned as decimal strings.

## GET /reports/stock-on-hand

Query: `search`, `warehouseId`, `includeArchived` (bool, default false), `sort` (productName|onHand|reserved|available), `direction` (asc|desc), `page`, `pageSize` (max 100).
Response 200:
```json
{
  "items": [{ "productId","productName","productSku","isArchived","warehouseId","warehouseName","unitOfMeasure","onHand","reserved","available" }],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totals": { "onHand":"0","reserved":"0","available":"0" } | { "rowCount": 0 }
}
```
Totals summed only across rows sharing one unit of measure; otherwise `rowCount` only.

## GET /reports/stock-movements

Query: `productId` (optional), `warehouseId` (optional), `start` (date), `end` (date, not before start), `type` (optional), `sort`, `direction`, `page`, `pageSize` (max 100).
Response 200: `{ items: StockMovementRow[], total, page, pageSize }`. Delegates to Inventory Movements service.

## GET /reports/outstanding-invoices

Query: `search` (customer), `overdueOnly` (bool), `dueFrom`, `dueTo` (dates), `sort`, `direction`, `page`, `pageSize` (max 100).
Response 200:
```json
{
  "items": [{ "invoiceId","number","customerId","customerName","issueDate","dueDate","total","paid","balance","daysOverdue" }],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totals": { "total":"0","paid":"0","balance":"0" },
  "aging": { "current":{ "count":0,"balance":"0" }, "d1_30":{...}, "d31_60":{...}, "d61_90":{...}, "over90":{...} }
}
```

## GET /reports/document-statuses

Query: `start` (date), `end` (date, not before start).
Response 200: `DocumentStatuses` object (see data-model). Single consistent snapshot.

## GET /reports/stock-reconciliation

Query: none beyond session.
Response 200: `{ items: ReconciliationRow[], total, checkedAt }`. Empty list on a healthy schema.