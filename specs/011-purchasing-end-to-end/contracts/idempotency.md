# Contract: Receipt Idempotency

Canonical document: `docs/api-purchasing-contract.md` (the receipt section). PRD 9.6 is the source of this design; the platform implementation is `backend/src/platform/idempotency/idempotency.service.ts`.

## Why it exists

Posting a goods receipt changes stock, received quantities, order status and the audit log. A client that retries after a dropped connection must not post twice, and a client that reuses a key for a different request must be told rather than silently accepted.

## Record

Scoped by `(organization_id, endpoint, key)` with a unique constraint on those three columns.

| Field | Meaning |
|-------|---------|
| `organization_id` | the tenant the request belonged to |
| `endpoint` | `/purchase-orders/:id/receipts` for the order being received |
| `key` | the client-generated key for one receipt attempt |
| `request_hash` | SHA-256 of the canonically ordered request body |
| `response_status` | `201` for the first successful receipt |
| `response_body` | the `{ receipt, order }` body returned the first time |
| `expires_at` | creation + 24 hours |

## Behaviour

1. The interface generates the key when the Receive goods dialog **opens** and reuses it for every retry of that attempt. A new key is generated only when the previous attempt ended in a **definite answer** — a success or a definite failure. When the outcome was unknown (a timeout, a lost connection), the dialog keeps its key, so the retry replays the stored answer instead of posting a second receipt.
2. The service claims the key **inside the receipt transaction**. The unique index serializes two simultaneous requests with the same key.
3. The claim is inserted before the business change; the response is stored before the transaction commits. A rollback removes the claim.
4. The same key with the same body returns the stored `201` response and creates no second receipt, receipt line, movement, stock change, status change or audit entry.
5. The same key with a different body returns `422 IDEMPOTENCY_KEY_REUSED` and changes nothing.
6. An expired record is treated as absent and is purged by the platform script.
7. A key is scoped to the endpoint, so the same key used on a different order is a different claim; the body hash still protects a changed body on the same order.

## Request fingerprint

The fingerprint is computed from the body as received: `{ lines: [{ lineId, productId, quantity }] }`. Object key order does not matter; array order and every value do. A retry that sends the same lines in the same order is the same request; a retry that changes a quantity or a line is a different request and is refused with `422` under the same key.

## Key generation in the interface

- The Receiving dialog creates one key per open, using the browser's `crypto.randomUUID()` where available and the existing fallback generator otherwise.
- The key is passed to `purchasing-client.receiveGoods` on every retry while the dialog remains open.
- A successful receipt, or a definite refusal, ends the attempt: closing and reopening the dialog generates a new key.
- An attempt whose outcome was unknown keeps its key, so the next post of the same attempt is a replay of the first answer rather than a second receipt.

## Out of scope

- Idempotency is not applied to create/update/confirm/cancel; those use version checks and state guards.
- Automatic purging is the platform's existing operational concern; the purge script is not changed by this feature.
