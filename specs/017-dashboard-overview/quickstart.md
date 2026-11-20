# Quickstart: Dashboard (Overview Page)

## Prerequisites
- Dev stack running (`:3000` API, `:5173` web); signed-in member.

## Walk-through
1. Open `/`. Greeting uses the member's name (or email) and the organization name; "This month" label; Refresh button with the last-update time; the info line.
2. As Administrator: analytics block with four KPI cards (Sales, Purchases, Payments received, Outstanding receivables with overdue beside it, labelled "As of today"), sales-over-time chart, sales-orders-by-status chart, receivables aging chart — each linking to its detailed report with the same range.
3. "Needs attention": overdue invoices, confirmed sales orders, purchase orders awaiting receipt, low-stock products, reconciliation discrepancies — each showing what it has, or saying so briefly.
4. Quick actions: only the ones your permissions and modules allow.
5. Recent activity: latest 8 entries, links to records, no secrets.
6. On an empty organization: the "Get started" checklist appears, ticks from real counts, and disappears when complete.
7. Sign in as a member with no dashboard permissions: a plain welcome, no 403 wall.

## Verification
- Backend typecheck/build; OpenAPI regen + drift check.
- Frontend typecheck/build + `npm test --workspace @nexuserp/web`.
- Integration (isolated): `cd backend && npx jest --selectProjects integration --runInBand --testPathPattern 'dashboard'`.
- Measured per role: first-batch request count and the settled total; assert no 403.