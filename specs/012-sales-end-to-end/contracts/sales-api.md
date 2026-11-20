# Sales API contract

Canonical contract for sales orders, stock reservation (confirm), cancellation, and whole-order shipment with stock deduction. The generated OpenAPI document (`backend/openapi.json`) is built from the service source and must match it; `npm run openapi:diff --workspace @nexuserp/api` is the drift check.

All paths are under `/api/v1`, all require a session, and every endpoint declares the permission it enforces **and** the shared Sales module gate. Errors use the shared envelope `{ code, message, details, requestId }` with the documented status codes (400 validation, 403 forbidden, 404 not found, 409 conflict, 422 idempotency conflict). Quantities travel as **decimal strings** with three places; unit prices as decimal strings with four places; line and order totals as decimal strings with two places. Timestamps are ISO 8601 UTC strings (`2026-11-14T09:30:00.000Z`).

## Common rules

- Every request is tenant-scoped from the session. No endpoint accepts an organization identifier.
- Every endpoint declares the shared Sales module gate in addition to its permission. The gate is defined once, in `backend/src/common/guards/sales-module.guard.ts`, and currently allows every request; see "Module availability" below.
- Missing or inactive membership, or an absent permission, returns `403`.
- A record of another organization returns `404 NOT_FOUND`, whether or not it exists.
- List `page` defaults to `1`; `pageSize` defaults to `25` and is **capped** at `100`, not rejected.
- `sortBy` and `sortOrder` are validated against a closed list of keys per endpoint; an unknown key returns `400 VALIDATION_ERROR` naming the field. Omitting them selects the endpoint's default.
- Search terms treat `%`, `_` and `\` literally (`ILIKE` with escaped wildcards).
- Decimal strings carry at most the documented places; more are **refused**, never rounded.
- Every sales endpoint is protected by membership and permission. Module availability is deferred to the Organization settings feature — see "Module availability".

## Numbering

`SO-` and `SH-` numbers (six digits each) are assigned by the server from the organization's document sequences, unique per organization. Sequences are provisioned on first use inside the writing transaction under a `pg_advisory_xact_lock`, so two organizations provisioning concurrently cannot collide and a rolled-back write does not burn a number. Dates travel as `YYYY-MM-DD`; the `shippedAt` timestamp travels as ISO 8601 UTC.

## The sales order

```json
{
  "id": "uuid",
  "number": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "status": "DRAFT",
  "orderDate": "2026-11-14",
  "notes": "",
  "lines": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productSku": "SKU-001",
      "productName": "Steel bolt",
      "quantity": "3.333",
      "unitPrice": "1.2345",
      "lineTotal": "4.11"
    }
  ],
  "total": "4.11",
  "version": 1
}
```

- `unitPrice` defaults to the product's selling price and remains editable.
- `lineTotal` is the rounded `quantity × unitPrice` (2 places); the order `total` is the sum of the line totals.
- `version` increments on every successful write; update, confirm and cancel require the version the caller read and return `409 STALE_VERSION` for a stale one.
- The order detail response adds `shipments` (the shipment history for the order, newest first), each shipment carrying its `lines`.

## The shipment

```json
{
  "id": "uuid",
  "number": "SH-000001",
  "orderId": "uuid",
  "orderNumber": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "shippedAt": "2026-11-14T09:30:00.000Z",
  "user": "salma@example.com",
  "lines": [
    {
      "lineId": "uuid",
      "orderLineId": "uuid",
      "productId": "uuid",
      "productSku": "SKU-001",
      "productName": "Steel bolt",
      "quantity": "3.333"
    }
  ]
}
```

- `shippedAt` is the shipment timestamp. `user` is the shipping user's email address.
- The shipment is permanent: no endpoint updates or deletes it, and the `shipments` / `shipment_lines` tables refuse UPDATE, DELETE and TRUNCATE at the database level.
- In this feature one shipment ships the whole order; each shipment line carries the quantity reserved for its order line.

## The list rows

### Sales orders — `SalesOrderRow`

```json
{
  "id": "uuid",
  "number": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "status": "CONFIRMED",
  "orderDate": "2026-11-14",
  "total": "4.11",
  "version": 2
}
```

- `total` counts the whole filtered selection, not the page.
- Search matches the order number or the customer name.
- The default sort is `number asc`; the tie-break is `number asc, id asc`.
- The order detail always shows the per-line table of product, quantity, unit price and line total, plus the shipment history.

### Shipments — `ShipmentRow`

```json
{
  "id": "uuid",
  "number": "SH-000001",
  "orderId": "uuid",
  "orderNumber": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "warehouseId": "uuid",
  "warehouseName": "Main warehouse",
  "shippedAt": "2026-11-14T09:30:00.000Z",
  "user": "salma@example.com",
  "lineCount": 2
}
```

- One row per shipment; the list payload carries **no** `lines`. The lines are read from the order's shipment history.
- `total` in the list response counts **shipments**, and the interface labels it as shipments.

## Endpoints

Every sales endpoint declares `@SalesModule()` (the shared gate) in addition to its permission; a route that reaches the gate without declaring it is refused. The sales controller also runs `SessionGuard` and `SalesModuleGuard`.

### `GET /sales-orders` — `sales.read`

Query: `search`, `status` (`DRAFT`, `CONFIRMED`, `SHIPPED`, `CANCELLED`), `page`, `pageSize`, `sortBy` (`number`, `customer`, `status`, `orderDate`, `total`), `sortOrder` (`asc`, `desc`).

Response `200`:

```json
{
  "items": [SalesOrderRow],
  "total": 42,
  "page": 1,
  "pageSize": 25
}
```

- `total` counts the whole filtered selection, not the page.
- Search matches the order number or the customer name.
- The default sort is `number asc`; the tie-break is `number asc, id asc`.

### `GET /sales-orders/:id` — `sales.read`

Response `200`: one `SalesOrder` with `shipments` (newest first, `shippedAt desc, number desc`), each shipment carrying its `lines` (ordered by `created_at asc, id asc`).

Errors: `404 NOT_FOUND` for another organization or a missing id.

### `POST /sales-orders` — `sales.write`

Body:

```json
{
  "customerId": "uuid",
  "warehouseId": "uuid",
  "orderDate": "2026-11-14",
  "notes": "",
  "lines": [
    { "productId": "uuid", "quantity": "3.333", "unitPrice": "1.2345" }
  ]
}
}
```

- `orderDate` may be `null` (defaults to the creation day); `notes` may be `""` (at most 1000 characters).
- `lines` may be empty: a draft can be saved with a header only and its lines added later. An order carries at most 100 lines; the same product may not appear twice on an order; confirmation still requires at least one line.
- `unitPrice` defaults to the product's selling price and is editable.
- Referenced products must be active and not archived; the customer must be an active contact with the customer role; the warehouse must be active.

Response `201`: the full created `SalesOrder`.

Errors: `400 VALIDATION_ERROR` (missing/invalid values, duplicate product); `404 NOT_FOUND` (unknown customer/product/warehouse); `409 PRODUCT_ARCHIVED`; `409 CUSTOMER_NOT_ACTIVE`; `409 INACTIVE_WAREHOUSE`.

### `PUT /sales-orders/:id` — `sales.write`

Body: the create body plus `"version": 1`.

Response `200`: the full updated `SalesOrder` with a new version.

Errors: `404 NOT_FOUND`; `409 STALE_VERSION` (the detail carries the current version); `409 INVALID_STATE_TRANSITION` when the order is not `DRAFT`; `400 VALIDATION_ERROR`.

### `POST /sales-orders/:id/confirm` — `sales.write`

Header: `Idempotency-Key` (required).

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "SO-000001", "status": "CONFIRMED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 INVALID_STATE_TRANSITION` when not `DRAFT`; `400 VALIDATION_ERROR` when the draft has no lines; `409 INSUFFICIENT_STOCK` listing every short product with its available and required quantity; `400 IDEMPOTENCY_KEY_REQUIRED`; `422 IDEMPOTENCY_KEY_REUSED`.

### `POST /sales-orders/:id/cancel` — `sales.write`

Header: `Idempotency-Key` (required).

Body: `{ "version": 1 }`.

Response `200`:

```json
{ "id": "uuid", "number": "SO-000001", "status": "CANCELLED", "version": 2 }
```

Errors: `404 NOT_FOUND`; `409 STALE_VERSION`; `409 ORDER_SHIPPED` when the order is `SHIPPED`; `409 INVALID_STATE_TRANSITION` when already `CANCELLED`. Cancelling a `DRAFT` or `CONFIRMED` order with no shipment moves it to `CANCELLED` and releases its active reservations.

### `POST /sales-orders/:id/shipments` — `inventory.ship`

Header: `Idempotency-Key` (required).

Body:

```json
{}
```

- The request carries no quantities: one shipment ships the whole order, and each shipment line carries the quantity reserved for its order line.
- The request does not carry the order version; the order row lock, status check and per-line active-reservation guard provide concurrency safety.

Response `201`:

```json
{
  "shipment": {
    "id": "uuid",
    "number": "SH-000001",
    "shippedAt": "2026-11-14T09:30:00.000Z"
  },
  "order": { "id": "uuid", "number": "SO-000001", "status": "SHIPPED", "version": 3 }
}
```

The stored response is replayed exactly for the same key and body — including the original `shippedAt`.

Errors: `400 IDEMPOTENCY_KEY_REQUIRED`; `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 INVALID_STATE_TRANSITION` (`DRAFT`/`CANCELLED`/`SHIPPED` order, or `CONFIRMED` without an active reservation for every line); `409 ORDER_SHIPPED` cannot occur here (ship requires CONFIRMED); `422 IDEMPOTENCY_KEY_REUSED`.

### `GET /shipments` — `sales.read`

Query: `search`, `startDate`, `endDate` (`YYYY-MM-DD`, both ends inclusive), `page`, `pageSize`, `sortBy` (`number`, `orderNumber`, `customer`, `shippedAt`), `sortOrder` (`asc`, `desc`).

Response `200`:

```json
{
  "items": [ShipmentRow],
  "total": 7,
  "page": 1,
  "pageSize": 25
}
```

- Search matches the shipment number, the order number or the customer name.
- The date range is applied to `shippedAt` and is inclusive of both ends; `endDate` before `startDate` is `400 VALIDATION_ERROR` naming the `endDate` field.
- `total` counts shipments, not lines, and the interface labels it as shipments.
- The default sort is `shippedAt desc`; the tie-break is `number asc, id asc`.

### `GET /shipments/:id` — `sales.read`

Response `200`: one `Shipment` with its `lines`.

Errors: `404 NOT_FOUND` for another organization or a missing id.

## Error details

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Field/content failure; `details` names the field. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | The confirm/cancel/ship call had no key. |
| `NOT_FOUND` | 404 | Missing record, including another organization's record. |
| `STALE_VERSION` | 409 | Update/confirm/cancel presented an old version; the detail carries the current version. |
| `INVALID_STATE_TRANSITION` | 409 | The action is not available in the current status. |
| `ORDER_SHIPPED` | 409 | Cancel was refused because the order has shipped. |
| `INSUFFICIENT_STOCK` | 409 | Confirm was refused because at least one line is short; `details` lists every short product with available and required quantity. |
| `INACTIVE_WAREHOUSE` | 409 | The shipping warehouse was deactivated. |
| `CUSTOMER_NOT_ACTIVE` | 409 | The customer is archived or lacks the customer role. |
| `PRODUCT_ARCHIVED` | 409 | A referenced product is archived. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | The same key was used for a different request body. |

Permission and authentication failures use the platform's existing `403` envelope.

## Confirm, cancel and ship idempotency

`POST /sales-orders/:id/confirm`, `POST /sales-orders/:id/cancel` and `POST /sales-orders/:id/shipments` are idempotent; update uses version checks instead. These endpoints change stock, reservations, order status and the audit log, so a client that retries after a dropped connection must not act twice, and a client that reuses a key for a different request must be told rather than silently accepted.

The platform implementation is `backend/src/platform/idempotency/idempotency.service.ts`; records are scoped by `(organization_id, endpoint, key)` with a unique constraint on those three columns.

| Field | Meaning |
|-------|---------|
| `organization_id` | the tenant the request belonged to |
| `endpoint` | `/sales-orders/:id/confirm` (or `/cancel`, `/shipments`) |
| `key` | the client-generated key for one attempt |
| `request_hash` | SHA-256 of the canonically ordered request body |
| `response_status` | `200`/`201` for the first successful attempt |
| `response_body` | the body returned the first time |
| `expires_at` | creation + 24 hours |

Behaviour:

1. The interface generates the key when the Confirm/Ship/Cancel dialog **opens** and reuses it for every retry of that attempt. A new key is generated only when the previous attempt ended in a **definite answer** — a success or a definite failure. When the outcome was unknown (a timeout, a lost connection), the dialog keeps its key, so the retry replays the stored answer instead of posting twice.
2. The service claims the key **inside the transaction**. The unique index serializes two simultaneous requests with the same key.
3. The claim is inserted before the business change; the response is stored before the transaction commits. A rollback removes the claim.
4. The same key with the same body returns the stored response and creates no second reservation, movement, shipment, stock change, status change or audit entry.
5. The same key with a different body returns `422 IDEMPOTENCY_KEY_REUSED` and changes nothing.
6. An expired record is treated as absent and is purged by the platform script.
7. A key is scoped to the endpoint, so the same key used on a different order is a different claim; the body hash still protects a changed body on the same order.

## Usage refusals (other modules' endpoints)

These are not Sales endpoints, but Sales supplies their answers:

- `POST /contacts/:id/archive` → `409 CONTACT_IN_USE` naming an open sales order.
- `POST /products/:id/archive` → `409 PRODUCT_IN_USE` naming an open sales order.
- `POST /warehouses/:id/deactivate` → `409 WAREHOUSE_IN_USE` naming an open sales order (in addition to the stock/default rules).

Open means `DRAFT` or `CONFIRMED`. `SHIPPED` and `CANCELLED` are closed.

## Module availability (deferred to P0-F002)

This feature does not implement module state: there is no `organization_modules` table, no toggle endpoint and no interface for one, and the sales endpoints are protected by membership and permission only.

Every sales endpoint declares **one** shared module gate — the `SalesModuleGuard` in `backend/src/common/guards/sales-module.guard.ts` — so the Organization settings feature can enable the module-disabled check in one place. The owning feature (Organization settings, P0-F002) must apply these rules to Sales when it lands:

- endpoints of a disabled module return `403 MODULE_DISABLED`;
- Sales requires Inventory (turning Inventory off while Sales is on is refused);
- turning Sales off is refused while any sales order is `DRAFT` or `CONFIRMED` (an open order names the module);
- the interface shows "turned off in Settings" — a state this feature deliberately does not simulate.
