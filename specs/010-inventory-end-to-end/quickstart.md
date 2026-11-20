# Quickstart: 010-inventory-end-to-end — real stock for every organization

Manual verification of the feature against an isolated schema (`nexuserp_test`) and a dev frontend. Every command below is read-only or operates on the isolated schema only.

## Prereqs

- `node scripts/with-test-schema-env.mjs` for anything that touches the database.
- `npm run dev:api` (or the isolated equivalent on another port) and `npm run dev:web`.

## Golden path — a real balance and its history

1. Sign in as an administrator of an organization that has products.
2. Open **Inventory → Stock balances**: no sample-data banner; rows show on hand, reserved and available per product and warehouse.
3. Open **Inventory → Movements**: the ledger is empty (a fresh organization has no stock yet).
4. Open **Inventory → Warehouses**: one default warehouse, named, with no Code column.
5. Post an adjustment (the adjust-stock dialog): pick the product and warehouse, quantity `+5.000`, reason *Found*, submit.
6. The balance now reads on hand `5.000`, reserved `0.000`, available `5.000`; the Movements tab shows one ADJUSTMENT movement with an `ADJ-00001` number; the audit log shows the change with its before and after values.

## Repeatability — the same click posts once

1. Post an adjustment and, in the same dialog, submit again (or retry after a forced failure).
2. Exactly one movement exists, and the second attempt shows the original result (the interface reuses the key it generated when the dialog opened).

## Refusals

1. Post an adjustment of `-99.000` on a balance of `5.000` → refused with a conflict, and the balance is unchanged.
2. Post an adjustment into a deactivated warehouse → refused.
3. Post an increase against an archived product that still holds stock → refused with "Restore the product before adding stock"; a decreasing write-off posts.
4. Try to deactivate the default warehouse, or one holding stock → refused with a conflict.
5. Rename a warehouse from two browsers at once → one succeeds, the other is told to reload.

## Low stock

1. Give a product a threshold and no stock → the low-stock filter shows it as a row with zero quantities, marked as having no stock yet.
2. With the filter off, the screen states how many products need attention.
3. The low-stock count equals the number of products the filter returns.
4. Archived products never appear in the list or the count; the archived-with-stock filter shows them when they still hold stock, and a write-off can be posted from the product's detail page.

## Warehouse management

1. Create a second warehouse; rename it; deactivate it; reactivate it.
2. A duplicate name (any letter case) is refused; exactly one default warehouse exists at every moment.

## Isolation

1. Sign in to another organization: none of the above records are visible; asking for one by id reports "not found".

## Automated checks (run before declaring done)

- `npm run test --workspace @nexuserp/api` — unit suites.
- `node scripts/with-test-schema-env.mjs npm run test:integration --workspace @nexuserp/api` — the inventory integration suite (tenant isolation, permissions, concurrency, duplicate request, rollback, append-only, decimal vectors).
- `node scripts/with-test-schema-env.mjs node scripts/verify-db-invariants.mjs` — the extended invariant script (on hand equals the sum of movements; reserved never exceeds on hand; movements refuse update, delete and truncate).
- `npm run openapi:diff --workspace @nexuserp/api` — the contract drift check.
- `npx vitest run` in `frontend/` — the interface suites, including the archived-with-stock filter, the hints and the idempotency-key reuse.
