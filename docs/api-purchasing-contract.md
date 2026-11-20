# Purchasing API contract

Canonical contract for purchase orders and goods receipts. The generated
OpenAPI document (`backend/openapi.json`) is built from the service source and
must match it; `npm run openapi:diff --workspace @nexuserp/api` is the drift
check.

All paths are under `/api/v1`, all require a session, and every endpoint
declares the permission it enforces **and** the shared Purchasing module gate.
Errors use the shared envelope `{ code, message, details, requestId }` with the
documented status codes (400 validation, 403 forbidden, 404 not found, 409
conflict, 422 idempotency conflict). Quantities travel as **decimal strings**
with three places; unit costs as decimal strings with four places; line and
order totals as decimal strings with two places. Timestamps are ISO 8601 UTC
strings (`2026-11-12T09:30:00.000Z`).

## Common rules

- Every request is tenant-scoped from the session. No endpoint accepts an
  organization identifier.
- Every endpoint declares the shared Purchasing module gate in addition to its
  permission. The gate is defined once, in
  `backend/src/common/guards/purchasing-module.guard.ts`, and currently allows
  every request; see "Module availability" below.
- Missing or inactive membership, or an absent permission, returns `403`.
- A record of another organization returns `404 NOT_FOUND`, whether or not it
  exists.
- List `page` defaults to `1`; `pageSize` defaults to `25` and is **capped** at
  `100`, not rejected.
- `sortBy` and `sortOrder` are validated against a closed list of keys per
  endpoint; an unknown key returns `400 VALIDATION_ERROR` naming the field.
  Omitting them selects the endpoint's default.
- Search terms treat `%`, `_` and `\` literally (`ILIKE` with escaped
  wildcards).
- Decimal strings carry at most the documented places; more are **refused**,
  never rounded.
- Every purchasing endpoint is protected by membership and permission. Module
  availability is deferred to the Organization settings feature — see "Module
  availability".

## Numbering

`PO-` and `GR-` numbers (six digits each) are assigned by the server from the
organization's document sequences, unique per organization. Sequences are
provisioned on first use inside the writing transaction under a
`pg_advisory_xact_lock`, so two organizations provisioning concurrently cannot
collide and a rolled-back write does not burn a number. Dates travel as
`YYYY-MM-DD`; the `receivedAt` timestamp travels as ISO 8601 UTC.

## The purchase order

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

- `received` is the stored received quantity; `outstanding` is derived as
  `quantity - received`.
- `unitOfMeasure` is the abbreviation captured when the line was entered; it
  does not change when the product's unit is edited later.
- `lineTotal` is the rounded `quantity` × `unitCost` (2 places); the order
  `total` is the sum of the line totals.
- `version` increments on every successful write; update, confirm and cancel
  require the version the caller read and return `409 STALE_VERSION` for a
  stale one.
- The order detail response adds `receipts` (the receipt history for the
  order, newest first), each receipt carrying its lines.

## The goods receipt

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
  "receivedAt": "2026-11-12T09:30:00.000Z",
  "user": "nur@example.com",
  "lines": [
    {
      "lineId": "uuid",
      "orderLineId": "uuid",
      "productId": "uuid",
      "productSku": "SKU-001",
      "productName": "Steel bolt",
      "quantity": "1.000",
      "unitCost": "1.2345",
      "unitOfMeasure": "roll"
    }
  ]
}
```

`receivedAt` is the receipt timestamp. `user` is the receiving user's email
address. The receipt is permanent: no endpoint updates or deletes it, and the
`goods_receipts` / `goods_receipt_lines` tables refuse UPDATE, DELETE and
TRUNCATE at the database level.

## The list rows

### Purchase orders — `PurchaseOrderRow`

```json
{
  "id": "uuid",
  "number": "PO-000001",
  "supplierId": "uuid",
  "supplierName": "Acme Supplies",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "status": "PARTIALLY_RECEIVED",
  "orderDate": "2026-11-12",
  "total": "4.11",
  "version": 3,
  "progress": {
    "kind": "QUANTITY",
    "receivedTotal": "1.000",
    "orderedTotal": "3.333",
    "unitOfMeasure": "roll"
  }
}
```

- `progress.kind` is `QUANTITY` when every line of the order shares one unit
  of measure, `LINES` otherwise, and `NONE` for a `DRAFT` (no progress figure
  is shown).
- `progress.kind = "LINES"` carries `fullyReceivedLineCount` and `lineCount`
  instead of the quantities; a line counts as fully received when
  `quantity_received = quantity_ordered`.
- The summary is derived from the quantities actually received, not from the
  status: a `CANCELLED` order carries the progress it reached, and a
  `RECEIVED` order carries complete progress.
- The progress column is neither sortable nor filterable. Sorting and
  filtering stay on the status, the dates and the total.
- The order detail always shows the per-line table of ordered, received and
  outstanding quantities, so this figure is a summary only.

### Goods receipts — `GoodsReceiptRow`

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
  "receivedAt": "2026-11-12T09:30:00.000Z",
  "user": "nur@example.com",
  "lineCount": 2,
  "receivedTotal": "3.000",
  "unitOfMeasure": "roll"
}
```

- One row per receipt; the list payload carries **no** `lines`. The lines are
  read from the order's receipt history.
- `receivedTotal` and `unitOfMeasure` are present **only** when every line of
  the receipt shares one unit of measure; when the units differ both are
  absent and the row shows `lineCount` alone.
- `receivedTotal` is the exact sum of the receipt's line quantities,
  returned as a decimal string.
- `total` in the list response counts **receipts**, and the interface labels
  it as receipts.

## Endpoints

Every purchasing endpoint declares `@PurchasingModule()` (the shared gate) in
addition to its permission; a route that reaches the gate without declaring it
is refused. The purchasing controller also runs `SessionGuard` and
`PurchasingModuleGuard`.

### `GET /purchase-orders` — `purchasing.read`

Query: `search`, `status` (`DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`,
`RECEIVED`, `CANCELLED`), `page`, `pageSize`, `sortBy` (`number`, `supplier`,
`status`, `orderDate`, `total`), `sortOrder` (`asc`, `desc`).

Response `200`:

```json
{
  "items": [PurchaseOrderRow],
  "total": 42,
  "page": 1,
  "pageSize": 25
}
```

- `total` counts the whole filtered selection, not the page.
- Search matches the order number or the supplier name.
- The default sort is `number asc`; the tie-break is `number asc, id asc`.

### `GET /purchase-orders/:id` — `purchasing.read`

Response `200`: one `PurchaseOrder` with `receipts` (newest first,
`receivedAt desc, number desc`), each receipt carrying its `lines` (ordered
by `created_at asc, id asc`).

Errors: `404 NOT_FOUND` for another organization or a missing id.

### `POST /purchase-orders` — `purchasing.write`

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

- `expectedDate` may be `null`; `notes` may be `""` (at most 1000 characters).
- `lines` may be empty: a draft can be saved with a header only and its lines
  added later. An order carries at most 100 lines; the same product may not
  appear twice on an order; confirmation still requires at least one line.
- `expectedDate` must not be before `orderDate`.
- The server assigns `number`, `status = DRAFT`, `version = 1`, each line id,
  `unitOfMeasure` from the product, and all totals.
- Referenced products must be active and not archived; the supplier must be an
  active contact with the supplier role; the warehouse must be active.

Response `201`: the full created `PurchaseOrder`.

Errors: `400 VALIDATION_ERROR` (missing/invalid values, duplicate product,
expected date before order date); `404 NOT_FOUND` (unknown supplier/product/
warehouse); `409 PRODUCT_ARCHIVED`; `409 INACTIVE_WAREHOUSE`.

### `PUT /purchase-orders/:id` — `purchasing.write`

Body: the create body plus `"version": 1`.

Response `200`: the full updated `PurchaseOrder` with a new version.

Errors: `404 NOT_FOUND`; `409 STALE_VERSION` (the detail carries the current
version); `409 INVALID_STATE_TRANSITION` when the order is not `DRAFT`;
`400 VALIDATION_ERROR`.

### `POST /purchase-orders/:id/confirm` — `purchasing.write`

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "PO-000001", "status": "CONFIRMED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 INVALID_STATE_TRANSITION`
when not `DRAFT`; `400 VALIDATION_ERROR` when the draft has no lines.

### `POST /purchase-orders/:id/cancel` — `purchasing.write`

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "PO-000001", "status": "CANCELLED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 ORDER_HAS_RECEIPTS` when a
receipt exists; `409 INVALID_STATE_TRANSITION` for `RECEIVED`/`CANCELLED`.
Cancelling a `DRAFT` or `CONFIRMED` order with no receipts moves it to
`CANCELLED`.

### `POST /purchase-orders/:id/receipts` — `inventory.receive`

Header: `Idempotency-Key` (required).

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
- Zero/blank quantities are accepted but create nothing; if no entry is
  positive, the request is refused as a whole.
- Positive quantities above the line's outstanding quantity are refused.
- The request does not carry the order version.

Response `201`:

```json
{
  "receipt": {
    "id": "uuid",
    "number": "GR-000001",
    "receivedAt": "2026-11-12T09:30:00.000Z"
  },
  "order": { "id": "uuid", "number": "PO-000001", "status": "PARTIALLY_RECEIVED", "version": 3 }
}
```

The stored response is replayed exactly for the same key and body — including
the original `receivedAt`.

Errors: `400 IDEMPOTENCY_KEY_REQUIRED`; `400 VALIDATION_ERROR` (all-zero,
foreign/mismatched/duplicate line); `400 OVER_RECEIPT` with the outstanding
quantity in `details`; `404 NOT_FOUND`; `409 INVALID_STATE_TRANSITION`
(`DRAFT`/`CANCELLED`/`RECEIVED` order); `409 INACTIVE_WAREHOUSE` (the
destination warehouse was deactivated before the receipt);
`422 IDEMPOTENCY_KEY_REUSED`.

### `GET /goods-receipts` — `purchasing.read`

Query: `search`, `startDate`, `endDate` (`YYYY-MM-DD`, both ends inclusive),
`page`, `pageSize`, `sortBy` (`number`, `orderNumber`, `supplier`,
`receivedAt`), `sortOrder` (`asc`, `desc`).

Response `200`:

```json
{
  "items": [GoodsReceiptRow],
  "total": 7,
  "page": 1,
  "pageSize": 25
}
```

- Search matches the receipt number, the order number, the supplier name or
  a product SKU/name. A product search matches any line of the receipt but
  still returns **one row per receipt**.
- The date range is applied to the received date and is inclusive of both
  ends; `endDate` before `startDate` is `400 VALIDATION_ERROR` naming the
  `endDate` field.
- `total` counts receipts, not lines, and the interface labels it as receipts.
- The default sort is `receivedAt desc`; the tie-break is `number asc, id asc`.

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

Permission and authentication failures use the platform's existing `403`
envelope.

## Receipt idempotency

`POST /purchase-orders/:id/receipts` is the only idempotent purchasing
endpoint; the state changes use version checks instead. Posting a receipt
changes stock, received quantities, order status and the audit log, so a
client that retries after a dropped connection must not post twice, and a
client that reuses a key for a different request must be told rather than
silently accepted.

The platform implementation is `backend/src/platform/idempotency/
idempotency.service.ts`; records are scoped by
`(organization_id, endpoint, key)` with a unique constraint on those three
columns.

| Field | Meaning |
|-------|---------|
| `organization_id` | the tenant the request belonged to |
| `endpoint` | `/purchase-orders/:id/receipts` for the order being received |
| `key` | the client-generated key for one receipt attempt |
| `request_hash` | SHA-256 of the canonically ordered request body |
| `response_status` | `201` for the first successful receipt |
| `response_body` | the `{ receipt, order }` body returned the first time |
| `expires_at` | creation + 24 hours |

Behaviour:

1. The interface generates the key when the Receive goods dialog **opens** and
   reuses it for every retry of that attempt. A new key is generated only
   when the previous attempt ended in a **definite answer** — a success or a
   definite failure. When the outcome was unknown (a timeout, a lost
   connection), the dialog keeps its key, so the retry replays the stored
   answer instead of posting a second receipt.
2. The service claims the key **inside the receipt transaction**. The unique
   index serializes two simultaneous requests with the same key.
3. The claim is inserted before the business change; the response is stored
   before the transaction commits. A rollback removes the claim.
4. The same key with the same body returns the stored `201` response and
   creates no second receipt, receipt line, movement, stock change, status
   change or audit entry.
5. The same key with a different body returns `422 IDEMPOTENCY_KEY_REUSED` and
   changes nothing.
6. An expired record is treated as absent and is purged by the platform
   script.
7. A key is scoped to the endpoint, so the same key used on a different order
   is a different claim; the body hash still protects a changed body on the
   same order.

The fingerprint is computed from the body as received:
`{ lines: [{ lineId, productId, quantity }] }`. Object key order does not
matter; array order and every value do. A retry that sends the same lines in
the same order is the same request; a retry that changes a quantity or a line
is a different request and is refused with `422` under the same key.

## Usage refusals (other modules' endpoints)

These are not Purchasing endpoints, but Purchasing supplies their answers:

- `POST /contacts/:id/archive` → `409 CONTACT_IN_USE` naming an open purchase
  order.
- `POST /products/:id/archive` → `409 PRODUCT_IN_USE` naming an open purchase
  order (in addition to reserved stock).
- `POST /warehouses/:id/deactivate` → `409 WAREHOUSE_IN_USE` naming an open
  purchase order (in addition to the stock/default rules).

Open means `DRAFT`, `CONFIRMED` or `PARTIALLY_RECEIVED`. `RECEIVED` and
`CANCELLED` are closed.

## Module availability (deferred to P0-F002)

This feature does not implement module state: there is no
`organization_modules` table, no toggle endpoint and no interface for one, and
the purchasing endpoints are protected by membership and permission only.

Every purchasing endpoint declares **one** shared module gate — the
`PurchasingModuleGuard` in `backend/src/common/guards/purchasing-module.guard.ts`
— so the Organization settings feature can enable the module-disabled check in
one place. The owning feature (Organization settings, P0-F002) must apply
these rules to Purchasing when it lands:

- endpoints of a disabled module return `403 MODULE_DISABLED`;
- Purchasing requires Inventory (turning Inventory off while Purchasing is on
  is refused);
- turning Purchasing off is refused while any purchase order is `DRAFT`,
  `CONFIRMED` or `PARTIALLY_RECEIVED` (an open order names the module);
- the interface shows "turned off in Settings" — a state this feature
  deliberately does not simulate.
