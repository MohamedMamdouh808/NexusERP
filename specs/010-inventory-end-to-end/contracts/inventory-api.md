# Contract: Inventory API

Canonical document: `docs/api-inventory-contract.md` (created by this feature). The service's own OpenAPI document (`backend/src/openapi/openapi-document.ts`) is regenerated from it and `npm run openapi:diff` must pass.

All paths are under `/api/v1`, all require a session, and every endpoint declares the permission it enforces. Errors use the shared envelope `{ code, message, details, requestId }` with the documented status codes (400 validation, 403 forbidden, 404 not found, 409 conflict, 422 idempotency conflict).

Quantities travel as **strings** (exact decimals with three places), exactly like money does in this product.

## Warehouses

### `GET /warehouses` — inventory.read

Lists the organization's warehouses.

Response `200`:

```jsonc
{
  "items": [
    { "id": "…", "name": "Central Warehouse", "isActive": true, "isDefault": true, "version": 3 }
  ],
  "total": 1
}
```

### `POST /warehouses` — inventory.write

Request: `{ "name": "Central Warehouse", "isDefault": false }` — the name is trimmed and must be 1–100 characters and unique per organization (case-insensitively). `isDefault: true` demotes the previous default in the same transaction.

Response `201`: the created warehouse. `409` when the name already exists in the organization.

### `PUT /warehouses/:id` — inventory.write

Request: `{ "name": "Main Warehouse", "isDefault": false, "version": 3 }`.

- The `version` is required; a stale version is refused with `409 STALE_VERSION`.
- `409` when the name already exists in the organization.
- The version increments on success.

### `POST /warehouses/:id/deactivate` — inventory.write

Request: `{ "version": 3 }`.

- `409` when the warehouse is the organization's default.
- `409` when the warehouse holds stock (on hand or reserved above zero).
- `409 STALE_VERSION` on a stale version.

### `POST /warehouses/:id/reactivate` — inventory.write

Request: `{ "version": 4 }` (the version of the deactivated record). `409 STALE_VERSION` on a stale version.

## Stock balances

### `GET /inventory/stock-balances` — inventory.read

Query parameters:

| Parameter | Meaning |
|-----------|---------|
| `search` | matched against SKU and product name; `%` and `_` are matched literally |
| `warehouseId` | only rows in that warehouse |
| `lowStockOnly` | `true` switches to the product-level low-stock selection |
| `status` | `archivedWithStock` lists archived products whose total on hand is above zero |
| `sort` | one of the documented sort keys, with ties broken by SKU then warehouse |
| `page`, `pageSize` | paging; `pageSize` is capped at 100 |
| `totalKind` (response) | `rows` for the default list, `products` for the filtered list |

Response `200`:

```jsonc
{
  "items": [
    {
      "productId": "…", "sku": "SKU-001", "productName": "Industrial Drill",
      "warehouseId": "…", "warehouseName": "Central Warehouse",
      "onHand": "12.000", "reserved": "0.000", "available": "12.000",
      "status": "IN_STOCK",           // OUT_OF_STOCK | LOW_STOCK | IN_STOCK | null
      "archived": false,
      "hasStockRow": true              // false for a low-stock product that has no balance row yet
    }
  ],
  "total": 1,
  "totalKind": "rows",
  "lowStockCount": 3                  // the count of products the low-stock rule selects
}
```

Notes: the default list returns balance rows only. The low-stock filter is product-level and additionally returns low-stock products with no balance row as a single row (default warehouse, zero quantities, `hasStockRow: false`). Archived products appear in neither the default list nor the low-stock filter, and are never counted as low stock; the `archivedWithStock` status lists only archived products whose total on hand is above zero.

## Stock movements

### `GET /inventory/stock-movements` — inventory.read

Query parameters: `search` (product SKU or name, wildcards literal), `warehouseId`, `type`, `startDate`, `endDate`, `sort`, `page`, `pageSize`.

- A range whose end precedes its start is refused with `400`.
- Archived products' movements are always returned, each marked `archived: true`.

Response `200`:

```jsonc
{
  "items": [
    {
      "id": "…", "createdAt": "2026-11-12T09:00:00.000Z",
      "type": "ADJUSTMENT", "quantityDelta": "-2.000",
      "reason": "DAMAGE", "note": null,
      "sourceType": "ADJUSTMENT", "sourceId": "…", "sourceNumber": "ADJ-00001",
      "productId": "…", "sku": "SKU-001", "productName": "Industrial Drill", "archived": false,
      "warehouseId": "…", "warehouseName": "Central Warehouse",
      "userId": "…", "userName": "karim@example.com"
    }
  ],
  "total": 1
}
```

## Adjustments

### `POST /inventory/adjustments` — inventory.adjust, requires `Idempotency-Key`

Headers: `Idempotency-Key: <uuid>` (required), `X-CSRF-Token` (as for every state-changing request).

Request:

```jsonc
{
  "warehouseId": "…",
  "productId": "…",
  "quantity": "-2.000",        // signed, never zero
  "reason": "DAMAGE",          // DAMAGE | LOSS | FOUND | COUNT_CORRECTION | OTHER
  "note": "Cracked in transit" // required when reason is OTHER
}
```

Response `201`:

```jsonc
{
  "movement": { "id": "…", "sourceNumber": "ADJ-00001", "quantityDelta": "-2.000", "type": "ADJUSTMENT" },
  "balance": { "warehouseId": "…", "productId": "…", "onHand": "10.000", "reserved": "0.000", "available": "10.000" }
}
```

Refusals:

| Case | Status | Code |
|------|--------|------|
| The result would fall below zero or below the reserved quantity | 409 | `INSUFFICIENT_STOCK` |
| The target warehouse is deactivated | 409 | `INACTIVE_WAREHOUSE` |
| The product is archived and the adjustment increases stock | 409 | `PRODUCT_ARCHIVED` ("Restore the product before adding stock") |
| Reason `OTHER` without a note, or a zero quantity | 400 | `VALIDATION_ERROR` |
| The same key with a different body | 422 | `IDEMPOTENCY_KEY_REUSED` |
| The same key with the same body | the original status and body | — (nothing is created) |

A posted adjustment is never edited or deleted; a mistake is corrected by a compensating adjustment.

## Products and the archive usage check

`POST /products/:id/archive` keeps its current contract. Its refusal becomes concrete through the inventory capability: a product with any reserved quantity is refused with `409 PRODUCT_IN_USE`.
