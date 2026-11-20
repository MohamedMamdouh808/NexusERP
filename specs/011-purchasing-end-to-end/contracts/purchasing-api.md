# Contract: Purchasing API

Canonical documentation: `docs/api-purchasing-contract.md` (generated from the implemented controllers and kept in sync by the OpenAPI drift check). All paths are under `/api/v1`.

## Common rules

- Every response decimal is a **string**: quantities 3 places, unit costs 4 places, line/order totals 2 places.
- Every request is tenant-scoped from the session. No endpoint accepts an organization identifier.
- Every endpoint declares a permission **and** the shared Purchasing module gate; a missing/inactive membership or an absent permission returns `403`. A disabled module is not enforced by this feature — see "Module availability" below.
- A record of another organization returns `404`, whether or not it exists.
- List `page` defaults to 1; `pageSize` defaults to 25 and is **capped** at 100, not rejected.
- `sortBy` and `sortOrder` are optional; unknown sort keys fall back to the endpoint's stable default.
- Search terms treat `%`, `_` and `\` literally.
- Errors use `{ code, message, details, requestId }`. Content failures are `400 VALIDATION_ERROR`; over-receipt is `400 OVER_RECEIPT`; state conflicts and stale versions are `409`; idempotency mismatch is `422`.

## Resources

### Purchase order

```json
{
  "id": "uuid",
  "number": "PO-000001",
  "supplierId": "uuid",
  "supplierName": "Acme Supplies",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "status": "DRAFT",
  "orderDate": "2026-11-12",
  "expectedDate": "2026-11-20",
  "notes": "",
  "lines": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productSku": "SKU-001",
      "productName": "Steel bolt",
      "quantity": "3.333",
      "received": "0.000",
      "outstanding": "3.333",
      "unitCost": "1.2345",
      "unitOfMeasure": "roll",
      "lineTotal": "4.11"
    }
  ],
  "total": "4.11",
  "version": 1
}
```

- `received` is the stored received quantity; `outstanding` is derived as `quantity - received`.
- `unitOfMeasure` is the abbreviation captured when the line was entered; it does not change when the product's unit is edited later.
- `version` is required for update, confirm and cancel.
- The detail response adds `receipts: GoodsReceipt[]` (the receipt history for the order, newest first), each receipt carrying its lines.

### Goods receipt

```json
{
  "id": "uuid",
  "number": "GR-000001",
  "orderId": "uuid",
  "orderNumber": "PO-000001",
  "supplierId": "uuid",
  "supplierName": "Acme Supplies",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "receiptDate": "2026-11-12T09:30:00.000Z",
  "lines": [
    {
      "lineId": "uuid",
      "productId": "uuid",
      "productSku": "SKU-001",
      "productName": "Steel bolt",
      "quantity": "1.000",
      "unitCost": "1.2345",
      "unitOfMeasure": "roll"
    }
  ],
  "user": "Nour"
}
```

`receiptDate` is the receipt timestamp (ISO) and is the date the date range filters on. `user` is the receiving user's display name. The receipt is permanent: no endpoint updates or deletes it.

### Goods-receipt list row

```json
{
  "id": "uuid",
  "number": "GR-000001",
  "orderId": "uuid",
  "orderNumber": "PO-000001",
  "supplierName": "Acme Supplies",
  "warehouseName": "Main warehouse",
  "receiptDate": "2026-11-12T09:30:00.000Z",
  "user": "Nour",
  "lineCount": 2,
  "receivedTotal": "3.000",
  "unitOfMeasure": "roll"
}
```

- One row per receipt; the list payload carries **no** `lines`. The lines are read from the order's receipt history.
- `receivedTotal` and `unitOfMeasure` are present **only** when every line of the receipt shares one unit of measure; when the units differ both are absent and the row shows `lineCount` alone.
- `receivedTotal` is the exact sum of the receipt's line quantities, returned as a decimal string.

## Endpoints

### `GET /purchase-orders`

Permission: `purchasing.read`.

Query: `search`, `status`, `page`, `pageSize`, `sortBy` (`number`, `supplier`, `status`, `orderDate`, `total`), `sortOrder` (`asc`, `desc`).

Response `200`:

```json
{
  "items": [PurchaseOrder],
  "total": 42,
  "page": 1,
  "pageSize": 25
}
```

`total` counts the whole filtered selection, not the page. Search matches the order number or supplier name.

Each row carries the server's progress summary, and the interface renders it verbatim:

```json
{
  "id": "uuid",
  "number": "PO-000001",
  "supplierName": "Acme Supplies",
  "warehouseName": "Main warehouse",
  "status": "PARTIALLY_RECEIVED",
  "orderDate": "2026-11-12",
  "total": "4.11",
  "progress": {
    "kind": "QUANTITY",
    "receivedTotal": "1.000",
    "orderedTotal": "3.333",
    "unitOfMeasure": "roll"
  }
}
```

- `progress.kind` is `QUANTITY` when every line of the order shares one unit of measure, `LINES` otherwise, and `NONE` for a `DRAFT` (no progress figure is shown).
- `progress.kind = "LINES"` carries `fullyReceivedLineCount` and `lineCount` instead of the quantities; a line counts as fully received when `quantity_received = quantity_ordered`.
- The summary is derived from the quantities actually received, not from the status: a `CANCELLED` order carries the progress it reached and a `RECEIVED` order carries complete progress.
- The progress column is neither sortable nor filterable; sorting and filtering stay on the status and the dates.
- The order detail always shows the per-line table of ordered, received and outstanding quantities, so this figure is a summary only.

### `GET /purchase-orders/:id`

Permission: `purchasing.read`.

Response `200`: one `PurchaseOrder` with `receipts` (newest first).

Errors: `404 NOT_FOUND` for another organization or a missing id.

### `POST /purchase-orders`

Permission: `purchasing.write`.

Body:

```json
{
  "supplierId": "uuid",
  "warehouseId": "uuid",
  "orderDate": "2026-11-12",
  "expectedDate": "2026-11-20",
  "notes": "",
  "lines": [
    { "productId": "uuid", "quantity": "3.333", "unitCost": "1.2345" }
  ]
}
```

- `expectedDate` may be `null`; `notes` may be `""`.
- `lines` may be empty for a draft.
- The server assigns `number`, `status = DRAFT`, `version = 1`, each line id, and all totals.

Response `201`: the full created `PurchaseOrder`.

Errors: `400 VALIDATION_ERROR` (missing/invalid values, duplicate product, expected date before order date); `404 NOT_FOUND` (unknown supplier/product/warehouse); `409 PRODUCT_ARCHIVED`/`CONTACT_IN_USE`-style state conflicts for archived/non-supplier/inactive references as documented below.

### `PUT /purchase-orders/:id`

Permission: `purchasing.write`.

Body: the create body plus `"version": 1`.

Response `200`: the full updated `PurchaseOrder` with a new version.

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 INVALID_STATE_TRANSITION` when not `DRAFT`; `400 VALIDATION_ERROR`.

### `POST /purchase-orders/:id/confirm`

Permission: `purchasing.write`.

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "PO-000001", "status": "CONFIRMED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 INVALID_STATE_TRANSITION` when not `DRAFT`; `400 VALIDATION_ERROR` when the draft has no lines.

### `POST /purchase-orders/:id/cancel`

Permission: `purchasing.write`.

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "PO-000001", "status": "CANCELLED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 ORDER_HAS_RECEIPTS` when the order has any receipt; `409 INVALID_STATE_TRANSITION` for `RECEIVED`/`CANCELLED`.

### `POST /purchase-orders/:id/receipts`

Permission: `inventory.receive`. Header: `Idempotency-Key` (required).

Body:

```json
{
  "lines": [
    { "lineId": "uuid", "productId": "uuid", "quantity": "1.000" }
  ]
}
```

- Every entry must name a line on this order and that line's product.
- Duplicate `lineId` entries are refused.
- Zero/blank quantities are accepted but create nothing; if no entry is positive, the request is refused.
- Positive quantities above the line's outstanding quantity are refused.
- The request does not carry the order version.

Response `201`:

```json
{
  "receipt": { "id": "uuid", "number": "GR-000001", "receiptDate": "2026-11-12T09:30:00.000Z" },
  "order": { "id": "uuid", "number": "PO-000001", "status": "PARTIALLY_RECEIVED", "version": 3 }
}
```

The stored response is replayed exactly for the same key and body.

Errors: `400 IDEMPOTENCY_KEY_REQUIRED`; `400 VALIDATION_ERROR` (all-zero, foreign/mismatched/duplicate line); `400 OVER_RECEIPT` with the outstanding quantity in `details`; `404 NOT_FOUND`; `409 INVALID_STATE_TRANSITION` (DRAFT/CANCELLED/RECEIVED); `409 INACTIVE_WAREHOUSE`; `422 IDEMPOTENCY_KEY_REUSED`.

### `GET /goods-receipts`

Permission: `purchasing.read`.

Query: `search`, `startDate`, `endDate`, `page`, `pageSize`, `sortBy` (`number`, `orderNumber`, `supplier`, `receiptDate`), `sortOrder`.

Response `200`:

```json
{
  "items": [GoodsReceiptListRow],
  "total": 7,
  "page": 1,
  "pageSize": 25
}
```

- Search matches the receipt number, order number, supplier name or product SKU/name. A product search matches any line of the receipt but still returns **one row per receipt**.
- The date range is applied to the received date and is inclusive of both ends; `endDate` before `startDate` is `400 VALIDATION_ERROR` naming the date field.
- `total` counts receipts, and the interface labels it as receipts.
- The list is newest first by default, with `number` as the stable tie-break.

## Error details

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Field/content failure; `details` names the field. |
| `OVER_RECEIPT` | 400 | A quantity exceeds the line's outstanding quantity; the detail carries the outstanding quantity. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | The receipt call had no key. |
| `NOT_FOUND` | 404 | Missing record, including another organization's record. |
| `STALE_VERSION` | 409 | Update/confirm/cancel presented an old version; the detail carries the current version. |
| `INVALID_STATE_TRANSITION` | 409 | The action is not available in the current status. |
| `ORDER_HAS_RECEIPTS` | 409 | Cancel was refused because a receipt exists. |
| `INACTIVE_WAREHOUSE` | 409 | The destination warehouse was deactivated before the receipt. |
| `PRODUCT_ARCHIVED` | 409 | A referenced product is archived. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | The same key was used for a different request body. |

Permission and authentication failures use the platform's existing `403` envelope.

## Module availability (deferred to P0-F002)

This feature does not implement module state: there is no `organization_modules` table, no toggle endpoint and no interface for one, and the purchasing endpoints are protected by membership and permission only.

Every purchasing endpoint declares **one** shared module gate — a guard named for the module that currently allows every request — so the Organization settings feature can enable the module-disabled check in one place. The owning feature must apply these rules to Purchasing when it lands:

- endpoints of a disabled module return `403 MODULE_DISABLED`;
- Purchasing requires Inventory (turning Inventory off while Purchasing is on is refused);
- turning Purchasing off is refused while any purchase order is `DRAFT`, `CONFIRMED` or `PARTIALLY_RECEIVED`;
- the interface shows "turned off in Settings" — a state this feature deliberately does not simulate.

## Usage refusals (other modules' endpoints)

These are not Purchasing endpoints, but Purchasing supplies their answers:

- `POST /contacts/:id/archive` → `409 CONTACT_IN_USE` naming an open purchase order.
- `POST /products/:id/archive` → `409 PRODUCT_IN_USE` naming an open purchase order (in addition to reserved stock).
- `POST /warehouses/:id/deactivate` → `409 WAREHOUSE_IN_USE` naming an open purchase order (in addition to stock/default rules).

Open means `DRAFT`, `CONFIRMED` or `PARTIALLY_RECEIVED`. `RECEIVED` and `CANCELLED` are closed.
