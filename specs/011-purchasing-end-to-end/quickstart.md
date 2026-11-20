# Quickstart: 011-purchasing-end-to-end — real purchase orders and goods receipts

Manual verification against the isolated `nexuserp_test` schema and the dev frontend. Every database command below is read-only or operates on the isolated schema only.

## Prereqs

- A test-schema environment: `node scripts/with-test-schema-env.mjs` for anything that touches the database.
- `PORT=3000 npm run dev:api` (the shell may set `PORT=0`; override it) and `npm run dev:web`.
- Sign in as an administrator or a member with `purchasing.write` and `inventory.receive`.
- At least one active supplier contact, one active product with a purchase price, and one active warehouse.

## Golden path — create, confirm, receive

1. Open **Purchasing**. There is no sample-data banner.
2. Create an order: pick a supplier, a destination warehouse, and an order date. Add a line; picking the product fills the unit cost with the product's purchase price, still editable. Save the draft.
3. The order appears as `DRAFT` with a `PO-` number, the entered lines, and a server-calculated total.
4. Edit the draft and save; the version increments. Edit it in a second tab with the old version; the save is refused with `409 STALE_VERSION` and offers a reload.
5. Confirm the draft from the list or the detail page. It becomes `CONFIRMED` and can no longer be edited.
6. Open **Receive goods**. Every quantity field is blank and the dialog generates a key when it opens. The **Receive all outstanding** action fills the lines that still have an outstanding quantity; a line that is already full shows its field disabled and marked "Fully received".
7. The post action is disabled while every quantity is blank or zero. Enter a quantity on one line: the dialog offers a confirmation summary naming the lines, the quantities, the resulting order status and the consequence that the receipt increases stock and cannot be edited or deleted. Confirm it.
8. The dialog closes with a toast naming the `GR-` number. The order becomes `PARTIALLY_RECEIVED`; the line shows ordered, received and outstanding.
9. Open **Inventory → Stock balances** and **Movements**: the real balance increased by exactly the received quantity, and a `RECEIPT` movement names the `GR-` number.
10. Receive the rest. The order becomes `RECEIVED`; the receipt history on the detail page lists both receipts, each line with its product, quantity, unit of measure and the order line it fulfils.

## Repeatability — the same attempt posts once

1. Open Receive goods, enter a quantity, and double-click **Post** (or retry after a forced network failure while the dialog is still open).
2. Exactly one receipt, one set of receipt lines, one set of movements, one stock change, one status change and one audit entry exist. The second attempt returns the first response.
3. After an attempt whose outcome was unknown (a timeout), closing and reopening the dialog keeps the same key, so the next post replays the first answer instead of posting a second receipt.
4. After an attempt that ended in a definite answer — a success or a definite refusal — closing and reopening the dialog generates a new key; posting the same quantities again is a new attempt and is allowed if quantities remain outstanding.

## Refusals

1. Try to receive `5.001` against an outstanding `5.000` → `400 OVER_RECEIPT` naming `5.000`; nothing changes.
2. Post an all-zero receipt → refused; nothing changes.
3. Receive against a `DRAFT`, `CANCELLED` or `RECEIVED` order → `409 INVALID_STATE_TRANSITION`.
4. Deactivate the destination warehouse after confirmation, then receive → refused; no stock change.
5. Cancel a confirmed order with no receipts → allowed. Cancel one with a receipt → `409 ORDER_HAS_RECEIPTS`.
6. Reuse the same key with a different body → `422 IDEMPOTENCY_KEY_REUSED`; nothing changes.
7. Send a receipt line from another order, a mismatched product, or the same line twice → refused; nothing changes.
8. Try to archive the supplier or product, or deactivate the warehouse, while the order is open → `409 CONTACT_IN_USE` / `PRODUCT_IN_USE` / `WAREHOUSE_IN_USE`, naming the blocking order. Cancel the order and repeat: each action succeeds subject to the existing stock/default rules.

## Decimal vectors

Create these lines and verify the line and order totals:

| Quantity | Unit cost | Line total |
|----------|-----------|------------|
| `3.333` | `1.2345` | `4.11` |
| `1.000` | `0.0050` | `0.01` |
| `2.500` | `4.5000` | `11.25` |

The order total is the sum of the displayed line totals; the server never re-rounds an unrounded sum. Quantities with more than 3 places and unit costs with more than 4 places are refused, not rounded.

## Lists and isolation

1. Search orders by number or supplier; filter by status; sort by number, supplier, status, order date or total; page through with the whole-selection total.
2. The progress column shows the server's figure: "40 of 100 rolls" when every line shares one unit of measure, "2 of 5 lines fully received" when the units differ, and nothing for a `DRAFT`. It is not sortable. The order detail always shows the per-line table of ordered, received and outstanding.
3. Search goods receipts by receipt/order number, supplier or product; one row per receipt, with the line count and — when every line of the receipt shares one unit of measure — the aggregate quantity. The total counts receipts and is labelled as receipts.
4. A receipt whose lines have different units of measure shows its line count and no aggregate quantity; its lines are still visible in the order's receipt history.
5. Filter the receipts by an inclusive date range on the received date; an end before the start is refused with a validation error naming the date field.
6. Sign in to another organization: none of these orders or receipts are visible, and asking for one by id reports "not found".
7. A member without `purchasing.read` cannot list or read; without `purchasing.write` cannot create/confirm/cancel; without `inventory.receive` cannot post a receipt. The interface hides/disables those actions, and a direct API call still returns `403`.
8. The Purchasing entry is still available in the sidebar: this feature ships no module toggle and no "turned off in Settings" state.

## The module gate

Every purchasing endpoint declares one shared module gate, and the automated declaration test proves it (the same way the default-deny test proves the permission behaviour). The gate allows every request today; the module-disabled check belongs to the Organization settings feature, and the canonical Purchasing documentation names it as the owner.

## Validation results (recorded 2026-11-13)

Automated checks actually executed in this session (all green):

- `npm run test --workspace @nexuserp/api` — 19 suites, 199 tests passed.
- `cd frontend && npx vitest run` — 62 test files, 334 tests passed.
- `npm run lint` — 0 errors (6 pre-existing warnings, none new).
- `npm run typecheck` — clean (shared, api, web, database).
- `npm run build` — clean.
- `npm run openapi:diff --workspace @nexuserp/api` — "the committed contract matches the source"; 6 purchasing paths present in `backend/openapi.json`.
- `npm run verify:invariants` (public schema) — ALL INVARIANT CHECKS PASSED, including the append-only triggers and role revokes for `audit_logs`, `stock_movements`, `goods_receipts`, `goods_receipt_lines`.
- `npm run verify:invariants:test` (isolated schema) — ALL INVARIANT CHECKS PASSED.
- `npm run check:migrations` — "36 applied migration(s) match 36 migration folder(s)".
- `node scripts/snapshot-public-counts.mjs` — read-only; 26 tables counted; no test data leaked (integration suite runs only against `nexuserp_test`).

Manual UI steps in this document (golden path, blank-field receive dialog, double-click-once, key kept after an unknown outcome, list shapes, isolation check) were **not** clicked through in this session: there is no running dev stack or browser available to the agent. Their behaviour is covered by the automated suites instead — `frontend/src/features/purchasing/__tests__/` (17 tests) and `backend/test/integration/purchasing-*.spec.ts` (tenant isolation and permissions for every endpoint, simultaneous receipts on one line, receipt-versus-cancel, duplicate requests, key reuse with a different body, rollback on a failed movement or audit write, append-only receipts, the three rounding vectors, and the usage guards). The full integration suite against the rebuilt (final) test schema is running at the time of writing; an earlier run was invalidated by schema drift introduced mid-session and was discarded.

Honest limits recorded:

- The Purchasing entry remains in the sidebar with no module toggle and no "turned off in Settings" state (this feature ships no module state), as documented in `docs/api-purchasing-contract.md` ("Module availability (deferred to P0-F002)").
- The deferred module-disabled check (403 `MODULE_DISABLED`) is not enforced by this feature; its owner is the Organization settings feature (P0-F002), named in the contract and in `PurchasingModuleGuard`.

## Automated checks (run before declaring done)

```bash
npm run test --workspace @nexuserp/api
PORT=3000 node scripts/with-test-schema-env.mjs npm run test:integration --workspace @nexuserp/api
PORT=3000 node scripts/with-test-schema-env.mjs node scripts/verify-db-invariants.mjs
npm run openapi:diff --workspace @nexuserp/api
cd frontend && npx vitest run
```

The integration suite must cover tenant isolation and permissions for every endpoint, simultaneous receipts on one line, receipt-versus-cancel, duplicate requests, key reuse with a different body, rollback on a failed movement or audit write, append-only receipts, the three rounding vectors, and the usage guards. It runs only in the isolated schema and must leave the public schema's counts unchanged.
