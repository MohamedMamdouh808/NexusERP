# API Contract: Error Codes and Health

**Feature**: 001-platform-foundation | **Date**: 2026-10-18

This document is the human-readable companion to
[openapi.yaml](openapi.yaml). It fixes the meanings that a machine-readable schema cannot: which
code a given condition produces, and what a client is expected to do about it.

The machine-readable schema in `openapi.yaml` remains the authority on **shape**. This document
is the authority on **meaning**.

---

## The error envelope

Every failing response in NexusERP — in this release and every future one — has exactly this
shape and no other top-level fields:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Some fields need attention.",
  "details": [
    {
      "field": "lines.2.quantity",
      "code": "OUT_OF_RANGE",
      "message": "Quantity must be greater than zero."
    }
  ],
  "requestId": "3f6c1d2e-9a4b-4c1f-8e77-2b5d9a0c1e33"
}
```

### Rules

| Rule | Consequence for a client |
|---|---|
| `details` is always present, an empty array when there is nothing to add | Never null-check it; iterate it directly |
| `details[].field` is a dotted path into the submitted body | Render the message directly under that field's control |
| `details[].field` is absent for failures not tied to a field | Render at operation level, not under a field |
| `message` is safe to show a user verbatim | No parsing, no translation of your own is required |
| `message` never contains internals | You can log or display it as-is |
| `requestId` always matches the `x-request-id` response header | Show it on failure so a user can quote it |
| No other top-level field is ever present | Anything else is a defect, not an extension point |

### What the envelope never contains

A stack trace, a file path, a line number, a query or table name, a hostname, a port, a database
connection string, a driver version, an internal service name, or an exception class name. This is
enforced in one place — the global exception filter — so it cannot be forgotten per handler.

An unexpected failure returns the fixed message *"Something went wrong. No changes were saved.
Reference: `<requestId>`."* and the full record, including the stack, exists only in the server
log under that same `requestId`.

---

## HTTP status to code mapping

A client may branch on `code`. The status is informative; `code` is what is contractual.

| Status | Code | Meaning | Client action |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Input failed server-side validation | Map `details[].field` to inline field errors |
| 400 | `MALFORMED_REQUEST` | Body or query could not be parsed | Do not retry unchanged |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | A posting endpoint was called without a key | Supply the header and retry |
| 400 | `OVER_RECEIPT` | Received quantity exceeds the outstanding ordered quantity | Show `details` against the line |
| 400 | `OVER_ALLOCATION` | Payment allocation exceeds the invoice balance | Show `details` against the allocation row |
| 401 | `UNAUTHENTICATED` | No valid session | Clear session state and send the user to sign in |
| 403 | `FORBIDDEN` | Authenticated, but the required permission is absent | Do not retry; this will not change |
| 403 | `MODULE_DISABLED` | The endpoint's module is disabled for the organization | Offer the module-enablement path |
| 404 | `NOT_FOUND` | No such record in the caller's organization | Show "not found" |
| 405 | `METHOD_NOT_ALLOWED` | Route exists, method does not | Fix the client call |
| 409 | `CONFLICT` | Request contradicts current state | Reload and reconcile |
| 409 | `DUPLICATE_RECORD` | A unique value already exists in the organization | Map `details[].field` to the field |
| 409 | `INVALID_STATE_TRANSITION` | Document is not in a state allowing this action | Reload to see the current status |
| 409 | `INSUFFICIENT_STOCK` | Confirm or ship exceeded available stock | List short products from `details` |
| 409 | `PRODUCT_IN_USE` | Product referenced by open documents or reserved stock | Block archive with an explanation |
| 409 | `CONTACT_IN_USE` | Contact referenced by open documents or unpaid invoices | Block archive with an explanation |
| 409 | `LAST_ADMINISTRATOR` | Action would remove the last administrator | Block with an explanation |
| 409 | `INVOICE_HAS_PAYMENTS` | Invoice cannot be voided while allocations exist | Reverse the payments first |
| 409 | `STALE_VERSION` | Record changed since the caller loaded it | Reload and reapply the change |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds the documented limit | Split or reduce the request |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Key reused with a different request body | Generate a fresh key for the new action |
| 422 | `VALIDATION_FAILED` | Semantic validation failed after parsing | Map `details[].field` to inline field errors |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded | Honor `Retry-After` |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure | Show the message, keep `requestId`, do not blind-retry |
| 501 | `NOT_IMPLEMENTED` | Route reserved but not implemented in this release | Report as a product defect |
| 503 | `SERVICE_UNAVAILABLE` | Application or a dependency cannot serve the request | Retry with backoff |

### Two statuses that must not be confused

**403 versus 404.** A request for a record belonging to a *different* organization returns **404
`NOT_FOUND`**, never 403. This is deliberate: 403 would confirm the record exists, which leaks the
existence of another organization's commercial data. A 403 means the caller is a valid member of
*this* organization and lacks a permission — nothing more.

**401 versus 403.** 401 means "who are you"; the session is missing, expired, or invalid. 403
means "we know who you are, and you may not do this". Never show a sign-in prompt in response to a
403.

---

## Health contract

`GET /api/v1/health` is the only public endpoint in the foundation.

| Situation | Status | Body |
|---|---|---|
| Application serving, database reachable | 200 | `HealthReport` with `status: "ok"` |
| Application serving, database unreachable | 503 | `ErrorEnvelope`, `code: SERVICE_UNAVAILABLE`, `details` naming the failed check |
| Application cannot serve at all | 503 | `ErrorEnvelope`, `code: SERVICE_UNAVAILABLE` |

A failing health check reports *that* a dependency is unavailable and never *why*. The cause —
including the exception message — is written to the server log under the request identifier. This
keeps a probe response safe to expose on a public endpoint while remaining fully diagnosable for
the operator holding the logs.

Because the failure path returns the error envelope, a client that already handles errors
uniformly needs no special handling for an unhealthy deployment. The 503 status and the
`SERVICE_UNAVAILABLE` code are the only two signals it needs.

---

## Decimal transport

Money and quantity values cross the API as **strings**, never as JSON numbers:

```json
{ "lineTotal": "1250.00", "unitPrice": "19.9900", "quantity": "3.125" }
```

| Kind | Decimal places | Column type |
|---|---|---|
| Money | 2 | `NUMERIC(14,2)` |
| Unit price, unit cost | 4 | `NUMERIC(14,4)` |
| Quantity | 3 | `NUMERIC(14,3)` |

A client that parses these into a JavaScript `number` introduces a binary floating-point error and
will display a total that differs from the server's by a fraction of a unit. Formatters in the
client's design system receive the string and format it for display without an intervening numeric
conversion.

---

## Request identifier

| Situation | Behavior |
|---|---|
| Client sends `x-request-id: 5f2a-client-supplied` | Adopted; echoed in the response header, the envelope, and every log line for the request |
| Client sends no header | A UUID v4 is generated and used the same way |
| Client sends a value that is empty, longer than 128 characters, or contains anything outside `A-Za-z0-9._-` | Replaced with a generated UUID; the request is **not** rejected |

The identifier is never rejected as invalid. A malformed value is replaced rather than refused
because a bad tracing header is a client defect, not a reason to fail a business operation — and
because refusing it would let an unauthenticated caller provoke a 400 at will. Sanitization rather
than rejection is what prevents a supplied value from forging a log line.

---

## Versioning

All routes are served under `/api/v1`. A breaking change to a request shape, a response shape, a
status code, or the meaning of an error code requires a new version prefix. Adding an endpoint,
adding an optional response field, or adding a new error code is not breaking.

Error codes are never reused for a different failure and never have their meaning changed once
published. That is what makes it safe for a client to branch on `code` rather than on the message
text, which is written for humans and may be reworded at any time.