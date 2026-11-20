# Phase 0 Research: Inventory end to end — real stock for every organization

**Feature**: 010-inventory-end-to-end · **Date**: 2026-11-12 · **Spec**: [spec.md](./spec.md)

Every unknown in the Technical Context was resolved against the repository before this file was written: the existing products/contacts modules (the pattern), the audit module's append-only migration, the row-level-security migrations, the permission catalog, the products usage-hook seam, the document-sequence numbering helper, the invariants script, and the OpenAPI generation/drift tooling. No external research was needed.

## D1 — Where the idempotency layer lives and how it behaves

- **Decision**: A shared platform concern beside the other shared infrastructure (`backend/src/common/idempotency/`), backed by a new `idempotency_keys` table keyed uniquely by `(organization_id, endpoint, key)` with columns for the request fingerprint, the response status, the response body and the expiry (24 hours). The fingerprint is a SHA-256 of the **canonically ordered** request body, so key order in the JSON does not change the hash. The lookup-and-claim happens **inside** the business transaction: the row is inserted first (the unique index is the serializer), then the business change is written, then the stored response is filled in. On a duplicate key the transaction sees the committed row and replays it; a different fingerprint is refused with 422. Expired rows are purged by a script that can run by hand or in CI, and opportunistically deleted during a lookup.
- **Rationale**: PRD 9.6 specifies exactly this shape (organization, endpoint, key, request hash, response status and body, expiry). Inserting inside the business transaction means a rollback removes the claim — a failed request stores nothing (PRD 9.6 acceptance A2) — and the unique index serializes two simultaneous requests with the same key without any extra lock.
- **Alternatives considered**: an in-memory cache (lost on restart, no cross-process guarantee — rejected); storing only the response without the fingerprint (cannot detect a different body — rejected); claiming the key in a separate transaction before the business change (a crash would leave a key that replays a response that never happened — rejected).

## D2 — How the balance is changed so that concurrency is safe and exact

- **Decision**: One guarded, self-upserting statement inside the transaction — insert the balance row if it is missing, otherwise update it — with the guard evaluated by the database (`on_hand + delta >= 0` and `on_hand + delta >= reserved`), and the affected-row count deciding the outcome: zero rows affected means the adjustment is refused with 409 INSUFFICIENT_STOCK. The movement insert, the balance change, the audit entry and the idempotency record all happen in the same transaction.
- **Rationale**: This is race-free without an explicit lock (the row is claimed by the statement itself), it keeps every arithmetic step in PostgreSQL with exact decimals (Principle IV), and it naturally implements "a missing row means zero" (the insert branch starts from zero). The existing `SELECT … FOR UPDATE` alternative is correct too, but it splits the check and the write across two round trips and leaves the arithmetic to the application if it is not careful.
- **Alternatives considered**: read-then-write with a row lock (correct, but two statements and more application-side arithmetic); doing the arithmetic in JavaScript (forbidden — float drift).

## D3 — Where the low-stock rule is implemented, once

- **Decision**: One database view that returns, per non-archived product with a configured threshold: the product identity, its threshold, its total available quantity (sum over active warehouses of on hand minus reserved, zero when it has no balance rows) and its status (out of stock, low stock, in stock). The balances endpoint, the low-stock count and the status pill all read that one view — never a second implementation.
- **Rationale**: The clarified rule is product-level and must include products with no balance rows; a left join in a view makes that structural instead of a special case, and the count and the filter cannot drift apart because they read the same rows. The view is the single place the rule exists, which is what the clarification demanded.
- **Alternatives considered**: computing it in the service over balance rows (misses zero-stock products and duplicates the rule — rejected); a stored function instead of a view (no advantage here, and a view composes into the list query).

## D4 — One balances endpoint, two row shapes, one row type

- **Decision**: A single balances endpoint whose row shape is the same in every case (product, warehouse, on hand, reserved, available, plus a "no stock yet" marker and an "archived" marker). The default filter returns balance rows; the low-stock filter returns product-level rows (default warehouse, zero quantities) for products that qualify; the archived-with-stock filter returns archived products whose total on hand is above zero. The response states whether its total counts products or rows, so the interface can label it.
- **Rationale**: One row type means one client rendering path and no shape-sniffing. The clarified behaviour (zero-stock low-stock products must be visible and adjustable) needs the product-level shape, and the archived-with-stock filter needs the archived shape; both reuse the same row.
- **Alternatives considered**: separate endpoints for the two lists (the client would need to know which one it got — rejected in favour of one explicit total label).

## D5 — Making the movement ledger append-only

- **Decision**: The same database mechanism the audit log already uses: `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise, plus `TRUNCATE` revoked for the application role. The triggers reject only those three operations, so the service can still insert movements.
- **Rationale**: The audit migration (`20261110000004_audit_log_append_only`, plus `20261110000005_revoke_truncate_privilege`) is the established, tested pattern in this repository; the invariants script already knows how to assert that a table resists update, delete and truncate.
- **Note**: The same documented limitation applies — a database superuser can drop the triggers.

## D6 — Warehouse concurrency: version numbers, like products

- **Decision**: A `version` integer column (not null, default 1, backfilled by the migration). Update, deactivate and reactivate must present the version they read; a mismatch is refused with 409 STALE_VERSION, and the version increments in the same transaction as the change and its audit entry. Making a warehouse the default is a versioned write, and the demotion-and-promotion happens in one transaction so exactly one default exists at every moment (a partial unique index enforces it).
- **Rationale**: The products and contacts tables already carry `version` and the services already refuse stale updates with this code; following the established pattern keeps one way to do concurrent writes in the product. The clarified atomicity of "exactly one default at every moment" needs the database index plus a single transaction — application-level ordering alone leaves a window.

## D7 — How the products archive check reaches the real stock

- **Decision**: The existing `PRODUCTS_USAGE_HOOK` seam stays exactly as it is; the inventory module supplies a provider that answers "in use" when the product has any reserved quantity, and the products module keeps asking through the seam.
- **Rationale**: The seam was built for precisely this ("the purchasing, sales and inventory features will answer"), so the module boundary is preserved without a cross-module table write: products asks, inventory answers.
- **Alternatives considered**: the products module querying stock tables directly (a cross-module read of another module's tables — the boundary the constitution forbids).

## D8 — Exact decimals end to end

- **Decision**: Quantities are `NUMERIC(14,3)` in the database and travel as **strings** over the API, exactly like money already does in this codebase (the shared package's decimal-string contract). The service never parses a quantity into a JavaScript number; the frontend uses the existing exact quantity helpers for comparison and display.
- **Rationale**: The codebase already established this for money (`shared/src/schemas`, `decimal-string.spec.ts`) and the frontend already has exact helpers for quantities; reusing them is the difference between exact and approximate.

## D9 — The frontend seam for the real inventory

- **Decision**: A new real client beside `products-client.ts` (`frontend/src/services/inventory-client.ts`), and the inventory screens' data hooks switch to it. The sample service keeps its own private sample warehouses, balances and movements for the modules that are still sample (purchasing, sales, invoicing, overview) and is never consulted by the Inventory screens.
- **Rationale**: The screens already talk to a service module (`use-inventory.ts`), so swapping the client behind it changes no screen logic beyond the service call — and the sample modules stay isolated by construction, because the sample data simply stops being the Inventory screens' source.

## D10 — Adjustment document numbers

- **Decision**: The existing document-sequence helper allocates the number inside the adjustment transaction: sequence name `adjustment`, prefix `ADJ`, padded to five digits (`ADJ-00001`), matching the contacts pattern (`CUST-00001`).
- **Rationale**: The mechanism exists and is proven; the adjustment needs no new numbering machinery, and the number is allocated in the same transaction so a rollback returns it.

## D11 — Purging expired idempotency records

- **Decision**: A script that deletes expired rows (runnable by hand and in CI), plus an opportunistic delete of the expired row for the same key during a lookup.
- **Rationale**: The table must not grow without bound, and the cleanup must never be required for correctness — a lookup that meets an expired row treats it as absent and takes the claim path.
- **Deferred**: whether a scheduler (cron/worker) runs the purge in production is an operational decision beyond this feature; the script is the deliverable.

## Resolved clarifications carried from the spec

The four clarification answers (balances shapes, no warehouse code, warehouse versioning, archived products with stock) are binding inputs to this plan; the research above only records how each is implemented.
