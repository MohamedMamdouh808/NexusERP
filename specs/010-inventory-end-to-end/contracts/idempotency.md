# Contract: Idempotency

Canonical document: `docs/api-inventory-contract.md` (the idempotency section). PRD 9.6 is the source of this design.

## Why it exists

The first posting endpoint in the product is the stock adjustment. A client that retries after a dropped connection must not post twice, and a client that reuses a key for a *different* request must be told rather than silently accepted. So the layer is built with the endpoint, not after it.

## Record

Scoped by `(organization_id, endpoint, key)`, with a unique constraint on those three columns.

| Field | Meaning |
|-------|---------|
| `organization_id` | the tenant the request belonged to |
| `endpoint` | the endpoint path the key was used on |
| `key` | the client-generated key (a UUID per user action) |
| `request_hash` | SHA-256 of the canonically ordered request body |
| `response_status` | the status returned the first time |
| `response_body` | the body returned the first time |
| `expires_at` | created + 24 hours |

## Behaviour

1. The client generates a key per user action and reuses it for every retry of **that** action.
2. The service claims the key **inside the business transaction**: it inserts the record (the unique index serializes two simultaneous claims), then performs the business change, then stores the response.
3. A repeated key with the **same** request returns the stored response and creates nothing.
4. A repeated key with a **different** body is refused with `422 IDEMPOTENCY_KEY_REUSED` and creates nothing.
5. A failed transaction stores no key at all — a rolled-back attempt leaves no claim, so a corrected retry may use the key again.
6. Records expire 24 hours after creation and are purged by a script; an expired record is treated as absent.

## Key generation in the interface

- The adjust-stock dialog generates its key when it **opens** and reuses it for every retry of that same attempt — so a double click, or a retry after a dropped connection, produces exactly one movement.
- Closing the dialog and starting again generates a new key (a new user action).

## Out of scope

- A scheduler that runs the purge automatically is an operational decision; the purge script is the deliverable of this feature.
- Idempotency is not applied to read endpoints.
