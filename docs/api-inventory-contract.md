# Inventory API contract

Canonical contract for warehouses, stock balances, the movement ledger and stock
adjustments. The generated OpenAPI document (`backend/openapi.json`) is built from
the service source and must match it; `npm run openapi:diff --workspace @nexuserp/api`
is the drift check.

All paths are under `/api/v1`, all require a session, and every endpoint declares
the permission it enforces. Errors use the shared envelope
`{ code, message, details, requestId }` with the documented status codes
(400 validation, 403 forbidden, 404 not found, 409 conflict, 422 idempotency
conflict). Quantities travel as **decimal strings** with three places; they are
never JavaScript numbers.

## Warehouses

### `GET /warehouses` — `inventory.read`

```json
{
  "items": [
    { "id": "…", "name": "Central Warehouse", "isActive": true, "isDefault": true, "version": 3 }
  ],
  "total": 1
}
```

### `POST /warehouses` — `inventory.write`

Request: `{ "name": "Central Warehouse", "isDefault": false }`

The name is trimmed, 1–100 characters and unique per organization without regard
to letter case. `isDefault: true` demotes the previous default in the same
transaction. Response `201` is the created warehouse; `409` means the name is
already used.

### `PUT /warehouses/:id` — `inventory.write`

Request: `{ "name": "Main Warehouse", "isDefault": false, "version": 3 }`

The version is required. A stale version is refused with `409 STALE_VERSION`, and
a duplicate name with `409`. The version increments on success.

### `POST /warehouses/:id/deactivate` — `inventory.write`

Request: `{ "version": 3 }`. Refused with `409` when the warehouse is the
organization's default or still holds stock, and with `409 STALE_VERSION` when the
version is stale.

### `POST /warehouses/:id/reactivate` — `inventory.write`

Request: `{ "version": 4 }`. Refused with `409 STALE_VERSION` when the version is
stale.

## Stock balances

### `GET /inventory/stock-balances` — `inventory.read`

| Parameter | Meaning |
|-----------|---------|
| `search` | matched against SKU and product name; `%` and `_` are literal |
| `warehouseId` | only rows in that warehouse |
| `lowStockOnly` | `true` switches to the product-level low-stock selection |
| `status` | `archivedWithStock` lists archived products whose total on hand is above zero |
| `sortBy`, `sortOrder` | documented sort keys, with ties broken by SKU then warehouse |
| `page`, `pageSize` | paging; `pageSize` is capped at 100 |

```json
{
  "items": [
    {
      "productId": "…",
      "sku": "SKU-001",
      "productName": "Industrial Drill",
      "warehouseId": "…",
      "warehouseName": "Central Warehouse",
      "onHand": "12.000",
      "reserved": "0.000",
      "available": "12.000",
      "status": "IN_STOCK",
      "archived": false,
      "hasStockRow": true
    }
  ],
  "total": 1,
  "totalKind": "rows",
  "lowStockCount": 3
}
```

`status` is `OUT_OF_STOCK`, `LOW_STOCK`, `IN_STOCK` or `null` when the product has
no configured threshold. `totalKind` is `rows` for the default list and
`products` for the low-stock and archived selections, so the interface can label
what it counted. The low-stock selection includes products with no balance row
(default warehouse, zero quantities, `hasStockRow: false`). Archived products
appear in neither the default list nor the low-stock selection and are never
counted as low stock; `archivedWithStock` lists only archived products whose total
on hand is above zero.

The low-stock rule is product-level: non-archived products with a configured
threshold, total available over active warehouses (zero when there are no balance
rows), low when available is at or below the threshold, with `OUT_OF_STOCK`
taking precedence over `LOW_STOCK`. It is implemented once by the database view
`inventory_low_stock` and read through `low-stock.rule.ts`.

## Stock movements

### `GET /inventory/stock-movements` — `inventory.read`

Query parameters: `search` (product SKU or name, wildcards literal),
`warehouseId`, `type`, `startDate`, `endDate`, `sortBy`, `sortOrder`, `page`,
`pageSize`.

A range whose end precedes its start is refused with `400`. Archived products'
movements are always returned, each marked `archived: true`.

```json
{
  "items": [
    {
      "id": "…",
      "createdAt": "2026-11-12T09:00:00.000Z",
      "type": "ADJUSTMENT",
      "quantityDelta": "-2.000",
      "reason": "DAMAGE",
      "note": null,
      "sourceType": "ADJUSTMENT",
      "sourceId": "…",
      "sourceNumber": "ADJ-00001",
      "productId": "…",
      "sku": "SKU-001",
      "productName": "Industrial Drill",
      "archived": false,
      "warehouseId": "…",
      "warehouseName": "Central Warehouse",
      "userId": "…",
      "userName": "karim@example.com"
    }
  ],
  "total": 1
}
```

## Adjustments

### `POST /inventory/adjustments` — `inventory.adjust`, requires `Idempotency-Key`

Headers: `Idempotency-Key: <uuid>` (required), `X-CSRF-Token` (as for every
state-changing request).

```json
{
  "warehouseId": "…",
  "productId": "…",
  "quantity": "-2.000",
  "reason": "DAMAGE",
  "note": "Cracked in transit"
}
```

`quantity` is signed and never zero. `reason` is `DAMAGE`, `LOSS`, `FOUND`,
`COUNT_CORRECTION` or `OTHER`; a note is required for `OTHER`.

```json
{
  "movement": { "id": "…", "sourceNumber": "ADJ-00001", "quantityDelta": "-2.000", "type": "ADJUSTMENT" },
  "balance": { "warehouseId": "…", "productId": "…", "onHand": "10.000", "reserved": "0.000", "available": "10.000" }
}
```

| Case | Status | Code |
|------|--------|------|
| The result would fall below zero or below the reserved quantity | 409 | `INSUFFICIENT_STOCK` |
| The target warehouse is deactivated | 409 | `INACTIVE_WAREHOUSE` |
| The product is archived and the adjustment increases stock | 409 | `PRODUCT_ARCHIVED` — "Restore the product before adding stock" |
| Reason `OTHER` without a note, or a zero quantity | 400 | `VALIDATION_ERROR` |
| The same key with a different body | 422 | `IDEMPOTENCY_KEY_REUSED` |
| The same key with the same body | original status and body | — (nothing is created) |

A posted adjustment is never edited or deleted; a mistake is corrected by a
compensating adjustment.

## Idempotency

The adjustment is the first posting endpoint, so idempotency is part of this
contract. The record is scoped by `(organization_id, endpoint, key)` with a unique
constraint on those three columns and stores the request hash, response status,
response body and expiry.

1. The client generates a key per user action and reuses it for every retry of
   that action. The adjust-stock dialog generates the key when it opens and keeps
   it for the dialog's lifetime; closing and reopening starts a new action.
2. The service claims the key inside the business transaction: it inserts the
   record, performs the business change, then stores the response.
3. A repeated key with the same request returns the stored response and creates
   nothing.
4. A repeated key with a different body is refused with `422
   IDEMPOTENCY_KEY_REUSED` and creates nothing.
5. A failed transaction stores no key, so a corrected retry may use it again.
6. Records expire 24 hours after creation; an expired record is treated as
   absent. `scripts/purge-expired-idempotency-keys.mjs` removes expired records.
   A scheduler is out of scope.

Idempotency is not applied to read endpoints.

## Products and the archive usage check

`POST /products/:id/archive` keeps its current contract. Its refusal becomes
concrete through the inventory capability: a product with any reserved quantity is
refused with `409 PRODUCT_IN_USE`. The products module asks through the existing
usage seam and never writes inventory tables.
