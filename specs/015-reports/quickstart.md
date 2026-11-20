# Quickstart: Reports Page

## Prerequisites
- Dev stack running (`:3000` API, `:5173` web); signed in as a member with `reports.read`.
- Inventory, Purchasing, Sales, Invoicing data present (or an empty organization for the empty-state check).

## Walk-through
1. Open `/reports` — five cards; click each.
2. Stock on hand: search a product, filter by warehouse, toggle archived, sort/page; confirm totals (or row count for mixed units).
3. Stock movements: pick product/warehouse + date range; confirm end-before-start is rejected; compare with Inventory Movements tab.
4. Outstanding invoices: customer search, overdue-only, due-date range; confirm aging buckets and totals match the Invoicing list.
5. Document statuses: choose a date range; confirm counts/totals and shipments/goods-receipts counts.
6. Stock reconciliation: confirm "No discrepancies found, checked at <time>"; corrupt a balance in the isolated schema → row appears; repair → empty.

## Verification
- Backend: `npm run typecheck --workspace @nexuserp/api` and `npm run build --workspace @nexuserp/api`.
- Frontend: `npm run typecheck --workspace @nexuserp/web`.
- OpenAPI: `npm run openapi:generate && npm run openapi:diff`.
- Integration (isolated): `cd backend && npx jest --selectProjects integration --runInBand --testPathPattern 'reports'`.