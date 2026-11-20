# Research: Dashboard (Overview Page) End to End

## R-001 — The extended KPI endpoint

- **Decision**: Extend `GET /reports/kpi-summary` in place (path and every existing field unchanged) inside the Reports module, so the Dashboard and the Reports page read one source. One read-consistent transaction, `reports.read`, decimal strings, filters + asOf.
- **Rationale**: No new analytics endpoint is allowed, and composing the cards from several endpoints would multiply requests and let the two pages drift apart.
- **Alternatives considered**: a new dashboard endpoint (rejected — forbidden and duplicative); client-side composition (rejected — breaks the request budget and SC-002).

## R-002 — Request budget shape

- **Decision**: Two batches. First batch: the 4 analytics requests (KPI row, sales over time, documents by status, receivables aging) plus the 4 attention-list requests (overdue invoices, confirmed sales orders, purchase orders awaiting receipt, low-stock balances) dispatched together in parallel — exactly 8 for a full Administrator. Deferred batch: stock reconciliation, recent activity and the checklist's own counts, dispatched right after the first batch, in parallel, at low priority, never chained.
- **Rationale**: The clarification fixed the cap to the first batch; the deferred widgets still show their skeleton from the first paint so the layout does not jump.
- **Alternatives considered**: relaxing the cap (rejected); deferring fewer widgets (rejected — the total would still exceed 8).

## R-003 — Permission gating is request gating

- **Decision**: Widget visibility is computed from `GET /auth/me`'s permission list; a widget the member may not see is never mounted, so no request is issued and no 403 can appear. The KPI row inherits `reports.read` from the analytics section.
- **Rationale**: FR-017: a permission error is never shown as a widget error.
- **Alternatives considered**: requesting and swallowing 403s (rejected — wasteful and violates the requirement).

## R-004 — Checklist counting

- **Decision**: The checklist requests its counts only for the steps the member can read, with `pageSize 1`, and is skipped entirely when it cannot apply (for example a member who cannot read products). Nothing is stored in the browser; each step ticks from the endpoint total.
- **Rationale**: The clarification fixed this; a permission-filtered setup-status endpoint is recorded as a follow-up instead of being added now.

## R-005 — Attention items from existing lists

- **Decision**: Overdue invoices from `GET /invoices?overdue=true` (pageSize 5, sorted by due date ascending); confirmed sales orders from `GET /sales-orders?status=CONFIRMED`; purchase orders awaiting receipt from `GET /purchase-orders` with the widened multi-status filter (CONFIRMED, PARTIALLY_RECEIVED); low-stock products from `GET /inventory/stock-balances?lowStockOnly=true`; discrepancies from `GET /reports/stock-reconciliation`.
- **Rationale**: Every item reuses an existing endpoint and its total; only the purchase order filter needs widening (the others already exist).

## R-006 — Purchase order multi-status filter

- **Decision**: Widen the purchase order list's `status` query parameter to accept a repeated or comma-separated list of statuses, keeping the single-status form valid. One call then yields CONFIRMED and PARTIALLY_RECEIVED together.
- **Rationale**: The only backend list change the dashboard needs.

## R-007 — Display name

- **Decision**: Add `name` to the `/auth/me` membership payload (the `memberships.name` column already exists). The greeting uses it, falling back to the email.
- **Rationale**: No extra request, no extra permission; the memberships list would need `users.manage`, which most members lack.

## R-008 — Money formatting

- **Decision**: Format the server's decimal strings with the organization's currency code and thousands separators, using the existing formatting helper; never add or subtract on the client. Overdue and outstanding are labelled "As of today" and carry no change.
- **Rationale**: Constitution Principle IV.

## R-009 — Sample data removal

- **Decision**: Delete `frontend/src/features/overview/sample-invoices.ts` and the dashboard's sample service method, replace the Overview hook with real endpoints, and remove the Overview Sample data banner. Sample data used by other features is left alone.
- **Rationale**: FR-023; the page must show only real figures.