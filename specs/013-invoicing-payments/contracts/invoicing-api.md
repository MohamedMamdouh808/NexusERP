# Invoicing and Payments API contract

Canonical contract for operational invoices (P0-F010) and payment recording with allocation (P0-F011). The generated OpenAPI document (`backend/openapi.json`) is built from the service source and must match it; `npm run openapi:diff --workspace @nexuserp/api` is the drift check.

All paths are under `/api/v1`, all require a session, and every endpoint declares the permission it enforces **and** the shared Invoicing module gate. Errors use the shared envelope `{ code, message, details, requestId }` with the documented status codes (400 validation, 403 forbidden, 404 not found, 409 conflict, 422 idempotency conflict). Quantities travel as **decimal strings** with three places; unit prices as decimal strings with four places; line totals, invoice totals, payment amounts and allocation amounts as decimal strings with two places. Timestamps are ISO 8601 UTC strings; dates travel as `YYYY-MM-DD`. Every invoice representation carries the exact label `"Operational invoice - not a tax invoice"`.

## Common rules

- Every request is tenant-scoped from the session. No endpoint accepts an organization identifier.
- Every endpoint declares the shared Invoicing module gate in addition to its permission. The gate is defined once, in `backend/src/common/guards/invoicing-module.guard.ts`, and currently allows every request; see "Module availability" below.
- Missing or inactive membership, or an absent permission, returns `403`.
- A record of another organization returns `404 NOT_FOUND`, whether or not it exists.
- List `page` defaults to `1`; `pageSize` defaults to `25` and is **capped** at `100`, not rejected.
- `sortBy` and `sortOrder` are validated against a closed list of keys per endpoint; an unknown key returns `400 VALIDATION_ERROR` naming the field. Omitting them selects the endpoint's default.
- Search terms treat `%`, `_` and `\` literally (`ILIKE` with escaped wildcards).
- Decimal strings carry at most the documented places; more are **refused**, never rounded.
- Balances, outstanding and overdue figures are **decimal strings with two places**, computed server-side with exact decimals and never by the client; overdue is derived at read time (due date before today in UTC AND balance above zero) and is never stored.
- Module availability is deferred to the Organization settings feature — see "Module availability".

## Numbering

`INV-` and `PAY-` numbers (six digits each) are assigned by the server from the organization's document sequences. Invoice numbers are allocated **at issue**; payment numbers at **creation**. Sequences are provisioned on first use inside the writing transaction under a `pg_advisory_xact_lock`, so two organizations provisioning concurrently cannot collide and a rolled-back write does not burn a number. The `number` of a `DRAFT` invoice is `null` until issue.

## The invoice

```json
{
  "id": "uuid",
  "number": "INV-000001",
  "orderId": "uuid",
  "orderNumber": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "status": "ISSUED",
  "issueDate": "2026-11-14",
  "dueDate": "2026-12-14",
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
  "paid": "1.00",
  "balance": "3.11",
  "isOverdue": false,
  "voidReason": null,
  "voidedAt": null,
  "voidedBy": null,
  "version": 2,
  "label": "Operational invoice - not a tax invoice",
  "paymentsApplied": [
    {
      "allocationId": "uuid",
      "paymentId": "uuid",
      "paymentNumber": "PAY-000001",
      "paymentDate": "2026-11-14",
      "amount": "1.00",
      "reversed": false
    }
  ],
  "createdAt": "2026-11-14T09:30:00.000Z",
  "updatedAt": "2026-11-14T09:31:00.000Z"
}
```

- `number` is `null` on a `DRAFT`. `issueDate` and `dueDate` are `null` on a `DRAFT` until issue (the draft may carry a due date; see issue rules below).
- `lineTotal` is the rounded `quantity × unitPrice` (2 places); `total` is the sum of the line totals and equals the sales order's total.
- `paid` is the sum of allocations of payments with no reversal; `balance` is `total − paid` (never negative); `isOverdue` is derived at read time.
- `paymentsApplied` lists every allocation against the invoice, the reversed ones labelled `reversed: true` (history is never rewritten). An ISSUED invoice's `paymentsApplied` from unreversed payments is what drives `status`.
- `voidReason`, `voidedAt`, `voidedBy` are set only for `VOID` invoices. `version` increments on every successful write.
- The invoice detail also echoes `orderNumber` for traceability; the Sales order remains the owner of shipment history.

## The list rows

### Invoices — `InvoiceRow`

```json
{
  "id": "uuid",
  "number": "INV-000001",
  "orderId": "uuid",
  "orderNumber": "SO-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "status": "PARTIALLY_PAID",
  "issueDate": "2026-11-14",
  "dueDate": "2026-12-14",
  "total": "128.45",
  "balance": "28.45",
  "isOverdue": false,
  "version": 2
}
```

### List payload — invoices

```json
{
  "items": [ "InvoiceRow", "..." ],
  "total": 137,
  "page": 1,
  "pageSize": 25,
  "outstanding": "128.45",
  "overdue": "100.00"
}
```

- `total`, `outstanding` and `overdue` describe the **whole filtered selection**, not the page, and are computed from one snapshot with the rows.
- `outstanding` = sum of balances of ISSUED and PARTIALLY_PAID invoices in the selection; DRAFT, PAID and VOID contribute `0.00`. `overdue` = the part of `outstanding` belonging to invoices due before today (UTC) with a balance above zero. Both travel as decimal strings with two places.
- The interface labels them "Outstanding in this selection" and "Overdue in this selection", states the filters when any is active, and shows `0.00` for an empty selection.
- `number` may be `null` for a `DRAFT` row.
- Search matches the invoice number or the customer name; wildcard characters in the term are treated literally. `status` filter: `DRAFT | ISSUED | PARTIALLY_PAID | PAID | VOID`. `overdue` filter: only overdue invoices (balance > 0 and due before today UTC). `orderId` filter: only the invoices of one sales order (an other-organization order id matches nothing). Default sort: `createdAt desc`, tie-broken by `id asc`.

### Payments — `PaymentRow`

```json
{
  "id": "uuid",
  "number": "PAY-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "amount": "100.00",
  "paymentDate": "2026-11-14",
  "method": "BANK_TRANSFER",
  "reference": "WIRE-778",
  "status": "RECORDED",
  "reversedAt": null,
  "recordedAt": "2026-11-14T09:30:00.000Z"
}
```

- `status` is computed: `RECORDED` when no `payment_reversals` row exists, `REVERSED` otherwise. The list marks reversed rows "Reversed on <date>" as text, not colour alone.
- List payload: `{ "items": [...], "total": 42, "page": 1, "pageSize": 25 }` — no figures; filter, rows and total come from one query (left join to `payment_reversals`).
- Search matches the payment number or the customer name; wildcards literal. `status` filter: `active | reversed | all` (default `all`), mapped to `RECORDED | REVERSED` in the query. `method` filter: `CASH | BANK_TRANSFER | CARD | OTHER | all` (default `all`), independent of `status`. `dateFrom`/`dateTo` bound `payment_date`, inclusive, `dateTo >= dateFrom` else `400 VALIDATION_ERROR` naming the date field. Default sort: `paymentDate desc, id asc`.

### The payment detail — `PaymentDetail`

```json
{
  "id": "uuid",
  "number": "PAY-000001",
  "customerId": "uuid",
  "customerName": "Acme Retail",
  "amount": "128.45",
  "paymentDate": "2026-11-14",
  "method": "CARD",
  "reference": "TXN-123",
  "status": "REVERSED",
  "allocations": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "invoiceNumber": "INV-000001",
      "amount": "100.00",
      "reversed": true
    }
  ],
  "reversal": {
    "reason": "Duplicate of PAY-000000",
    "reversedAt": "2026-11-14T10:00:00.000Z",
    "reversedBy": "uuid"
  },
  "recordedBy": "uuid",
  "recordedAt": "2026-11-14T09:30:00.000Z"
}
```

- `reversal` is `null` while `status` is `RECORDED`. After a reversal the allocations stay listed, labelled `reversed: true`; invoice balances ignore them.
- A payment carries **no** `label`: the "Operational invoice - not a tax invoice" label belongs to invoice representations only (list rows, detail, print markup).

## Endpoints

| Method | Endpoint | Feature | Permission | Idem. |
|---|---|---|---|---|
| POST | /sales-orders/:id/invoices | P0-F010 | invoices.write | No |
| GET | /invoices | P0-F010 | invoices.read | No |
| GET | /invoices/open | P0-F010 | invoices.read | No |
| GET | /invoices/:id | P0-F010 | invoices.read | No |
| PUT | /invoices/:id | P0-F010 | invoices.write (DRAFT only) | No |
| POST | /invoices/:id/issue | P0-F010 | invoices.issue | Yes |
| POST | /invoices/:id/void | P0-F010 | invoices.void | Yes |
| GET | /payments | P0-F011 | payments.read | No |
| POST | /payments | P0-F011 | payments.record | Yes |
| GET | /payments/:id | P0-F011 | payments.read | No |
| POST | /payments/:id/reverse | P0-F011 | payments.reverse | Yes |
| GET | /auth/me (extended) | P0-F002/P0-F010 | authenticated | No |

- `GET /invoices/open?customerId=<uuid>` — the open invoices of a customer: `ISSUED` or `PARTIALLY_PAID` with `balance > 0`, each row `{ "id", "number", "dueDate", "total", "balance", "isOverdue" }`. The customer must belong to the caller's organization (else 404). Used by the Record payment screen, together with `payments.record`.
- `GET /invoices?orderId=<uuid>` — the invoices created from one sales order; used by the sales order detail to find an existing invoice. An unknown or other organization's order id yields an empty selection.
- `GET /auth/me` gains `defaultPaymentTermsDays` (integer 30 by default) exposed read-only on the session payload, next to the organization fields. There is no write path in this feature.
- `GET /invoices` and `GET /payments` sorts: `sortBy` in `number|status|issueDate|dueDate|createdAt|customerName` (`sortOrder` `asc|desc`, default `createdAt desc`); unknown key → `400 VALIDATION_ERROR`. Exception: `GET /payments` `sortBy` in `number|paymentDate|customerName|method|status`, default `paymentDate desc`.

### `POST /sales-orders/:id/invoices`

Request: `{}` — the draft copies customer, lines, quantities and unit prices from the order. Requires `invoices.write`. The order must exist in the caller's organization (else `404 NOT_FOUND`), be `SHIPPED` (else `409 INVALID_STATE_TRANSITION`), and hold no non-void invoice (else `409 INVOICE_ALREADY_EXISTS`). Response `201` with the `Invoice` payload (`status: DRAFT`, `number: null`, `issueDate: null`). Not idempotent; the server validates and creates atomically.

### `PUT /invoices/:id`

Request: `{ "dueDate": "2026-12-14" | null, "version": 3 }`. DRAFT invoices only (else `409 INVALID_STATE_TRANSITION`); the only editable field is `dueDate`; `dueDate` may not precede `createdAt::date` (else `400 VALIDATION_ERROR` naming the field); `version` must match the caller's read (else `409 STALE_VERSION`). Response `200` with the updated `Invoice`. Not idempotent.

### `POST /invoices/:id/issue`

Request: `{ "dueDate": "2026-12-31" }` — optional. Idempotency-Key required. The transaction locks the invoice, requires `DRAFT` (else `409 INVALID_STATE_TRANSITION`), allocates the `INV-` number, sets `issueDate` to today (UTC), sets `dueDate`: request value first (must not precede `issueDate`, else `400 VALIDATION_ERROR`), else the draft's due date (kept; also must not precede `issueDate`, else `400 VALIDATION_ERROR` naming it), else `issueDate + default_payment_terms_days`. Sets `ISSUED`, increments `version`, writes the audit entry, stores the idempotency response. Response `200` with the updated `Invoice` (for a replayed key with the same body, the stored response).

### `POST /invoices/:id/void`

Request: `{ "reason": "Customer cancelled the order" }` — required, non-empty. Idempotency-Key required. Allowed from `DRAFT` and from `ISSUED` with zero active allocations (any unreversed payment allocation blocks it); `PARTIALLY_PAID` and `PAID` return `409 INVOICE_HAS_PAYMENTS` with a message telling the user to reverse the payments first. The invoice stays in history as `VOID` (detail readable, fields read-only) and the order may be invoiced again. Void reason, `voidedAt`, `voidedBy` are stored with the audit entry in the same transaction.

### `POST /payments`

Request:

```json
{
  "customerId": "uuid",
  "amount": "128.45",
  "paymentDate": "2026-11-14",
  "method": "CARD",
  "reference": "TXN-123",
  "allocations": [
    { "invoiceId": "uuid", "amount": "100.00", "expectedBalance": "128.45" },
    { "invoiceId": "uuid", "amount": "28.45", "expectedBalance": "28.45" }
  ]
}
```

Idempotency-Key required. Rules, all inside one transaction: `amount > 0` (2 places); `paymentDate` not in the future (UTC); the sum of `allocations[].amount` equals `amount` exactly (overpayment or unallocated remainder → `400 VALIDATION_ERROR`); every invoice belongs to the same customer and organization, and is `ISSUED` or `PARTIALLY_PAID` (else `409`); at most one allocation per invoice per payment (else `400 VALIDATION_ERROR`); each allocation is `> 0` and ≤ the balance recomputed under the lock, which is taken in ascending `invoiceId` order. If a recomputed balance differs from an `expectedBalance` the caller read earlier, the whole payment is refused with `409 BALANCE_CHANGED` and `details: { "invoiceId": "uuid", "currentBalance": "…" }` — nothing is written. If it matches but the allocation exceeds it, `400 OVER_ALLOCATION`. The response `201` returns the `PaymentDetail` with the payment number; the invoice(s) move to `PARTIALLY_PAID` or `PAID` (PAID only at balance exactly zero).

### `POST /payments/:id/reverse`

Request: `{ "reason": "Duplicate of PAY-000000" }` — required, non-empty. Idempotency-Key required. Creates a `payment_reversals` row (the payment row is never changed); restores each affected invoice's status per its remaining active allocations (`PAID`/`PARTIALLY_PAID` → `ISSUED`/`PARTIALLY_PAID`); writes the audit entry; stores the idempotency response — all in one transaction. A second reversal of the same payment returns `409`. Response `200` with the `PaymentDetail` (`status: REVERSED`).

## Detail rules

- Invoice detail: lines (with SKU and name), totals, payments applied (including reversed ones, labelled), void info when void, `version`. Read-only once ISSUED.
- Payment detail: allocations with invoice number and amount, `reversed` per allocation, the reversal (`reason`, `reversedAt`, `reversedBy`) when present, `recordedBy`/`recordedAt`.
- Every invoice representation — list rows, detail, print markup — carries the `label` payload field and renders "Operational invoice - not a tax invoice"; the print stylesheet shows **only** the invoice and the label.

## Error codes (new shared additions)

- `BALANCE_CHANGED` (409) — an invoice's balance changed since the client read it; `details.currentBalance` names the current balance.
- `INVOICE_ALREADY_EXISTS` (409) — the order already has a non-void invoice.
- `INVOICE_HAS_PAYMENTS` (409, existing catalog code) — void refused; reverse the payments first.

## Module availability

Every invoicing endpoint declares the shared Invoicing module gate (`backend/src/common/guards/invoicing-module.guard.ts`), defined once and currently allowing every request. The gate is the single place the Organization settings feature will enable a `MODULE_DISABLED` refusal; this feature ships no module table, no module-toggle endpoint, and no module-toggle interface. The archive-customer usage guard (409 `CONTACT_IN_USE`) is owned by Contacts archiving and queries this module's tables for `DRAFT`/`ISSUED`/`PARTIALLY_PAID` invoices only.
