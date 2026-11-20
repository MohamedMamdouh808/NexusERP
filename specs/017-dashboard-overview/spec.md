# Feature Specification: Dashboard (Overview Page) End to End

**Feature Branch**: `main` (feature directory: `specs/017-dashboard-overview`)
**Created**: 2026-11-16
**Status**: Draft
**MoSCoW Priority**: P0 (P1-F001 Dashboard)
**Input**: User description: "Build the Dashboard (the Overview page at /) end to end: the interface switching from sample data to real data, composed from existing endpoints, with only the small backend additions listed. Source: docs/PRD.md P1-F001, Sections 7.4, 8 and 9.5, the constitution, the existing Overview screen, and the Reports, Inventory, Purchasing, Sales and Invoicing features, whose shared definitions and endpoints this REUSES: nothing here reimplements a definition, and no new analytics endpoint is added. Every figure is real; there is no sample data on this page, the sample dashboard service and its data are deleted, and the Sample data banner is removed from Overview. System Health stays separate."

This feature turns the Overview page into a real landing page composed entirely from existing endpoints. It adds no analytics endpoint and reimplements no shared definition: every figure comes from the Reports, Inventory, Purchasing, Sales, Invoicing, Contacts, Products and Audit endpoints that already exist. The sample dashboard service and its sample invoice rows are deleted, and the Sample data banner leaves Overview. System Health keeps its own screen.

## Clarifications *(mandatory)*

### Session 2026-11-16

- Q: How do the widget list and the "at most 8 requests" cap fit together? → A: The cap applies to the **first batch** only: the 4 analytics requests and the 4 attention-list requests are dispatched together, in parallel, and a full Administrator's measured first batch is exactly 8. The deferred widgets (stock reconciliation, recent activity, and the first-use checklist counts) dispatch right after that first batch, also in parallel, at low priority, and never wait for each other or for the first batch, so there is no chain of requests. The measured test reports **two** numbers — the first-batch requests (8) and the total until every widget has settled — and records both; the total is never described as 8. Only what the member may see is requested: a member without `reports.read` dispatches no analytics request, and a member who holds none of a deferred widget's permissions dispatches nothing for it. The count test runs per default role, records each role's two numbers, and asserts that no request returns 403. The checklist requests its counts only for the steps the member can read, with pageSize 1, and the whole checklist is skipped when it cannot apply (for example a member who cannot read products). If the deferred requests prove slow in the measurement, a single permission-filtered setup-status endpoint is recorded as a follow-up instead of being added now. Deferred widgets show their skeleton from the first paint so the layout does not jump when they arrive.

- Q: Where do the dashboard's four KPI cards get their figures, given that no new analytics endpoint may be added? → A: Extend the existing `GET /reports/kpi-summary`, keeping its path and every existing field so nothing that already uses it breaks. The response carries, for the requested range and the immediately preceding period of equal length: sales total and count; purchases total and count; payments received; sales orders and purchase orders created; products low stock and out of stock; and, as of today and labelled as not range-bound, the outstanding receivables balance and the overdue balance (and their invoice counts). For every period-bound figure it also returns the previous-period value and the change, computed by the server; the change is null when the previous value is zero. All money is a decimal string and the endpoint returns the filters it used and an asOf timestamp. Rules: everything uses the shared definitions (Sales, Purchases, Payments received, outstanding and overdue, low and out of stock) and the same service the Reports page uses, so the Dashboard and the Reports page read this one endpoint for their KPI row and there is a single source; no new endpoint is added (the only backend additions are this extension, the multi-status purchase order filter already listed, and the migrations and indexes the queries need); the response stays one consistent snapshot (one read-consistent transaction), so the cards can never disagree with each other; the overdue and outstanding figures are as of today and ignore the range, the interface labels them "As of today", the previous-period comparison is returned only for period-bound KPIs, and no change is fabricated for an as-of figure; the endpoint declares `reports.read`, so the Dashboard's KPI row follows the same rule as the analytics section. Tests: each field equals the sum of the underlying records for a known dataset, including the previous-period values and a zero previous value (null change); the Dashboard's values equal the Reports page's for the same range; outstanding and overdue equal the Invoicing list's for the overdue-only selection; the extended response keeps every previously existing field with the same value (contract regression test); the endpoint stays within the performance goal in the measured dataset and the measured time is recorded.

- Q: Where does the greeting's display name come from? → A: Add `name` to the `/auth/me` membership payload — the `memberships.name` column already exists (added in the Users & Roles feature), so only the response changes. The shell already loads `/auth/me` once per session, so this costs no extra request and needs no extra permission; fetching the name from the memberships list instead would need `users.manage`, which most members lack, and would 403 for exactly the members the page must serve. The greeting therefore uses the membership name when present and the email otherwise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Greeting and header (Priority: P1)

As a signed-in member, I want the Overview page to greet me with my name and my organization and say when the figures were last updated, so I know whose numbers I am looking at.

**Why this priority**: The header frames every widget below it and carries the "this is your organization, filtered by your permissions" statement.

**Independent Test**: Sign in, open `/`, confirm the greeting uses the member's display name (name, else email) and the organization name, the period label reads "This month", the Refresh button re-requests every visible widget, the last-update time is shown, and the info line is present.

**Acceptance Scenarios**:

1. **Given** a member with a display name, **When** they open `/`, **Then** the greeting uses that name; with no name, the email is used.
2. **Given** a signed-in member, **When** they press Refresh, **Then** every visible widget is re-requested and the last-update time updates.
3. **Given** the page, **Then** the info line reads "Figures show your organization. What you see depends on your permissions."

### User Story 2 - Analytics from the Reports endpoints (Priority: P1)

As a member holding `reports.read`, I want this month's sales, purchases, payments and receivables at the top of my landing page, so I can judge the month without opening Reports.

**Why this priority**: The analytics block is the "how are we doing" half of the page and already has a tested source of truth.

**Independent Test**: Sign in as Administrator, open `/`, confirm four KPI cards (Sales, Purchases, Payments received, Outstanding receivables with the overdue figure beside it) with the change against the previous equal-length period shown in words and an arrow, a sales-over-time chart, a sales-orders-by-status chart, and a receivables aging chart; each card links to its detailed report with the same range.

**Acceptance Scenarios**:

1. **Given** a member without `reports.read`, **When** they open `/`, **Then** no analytics section is rendered, no empty placeholder appears, and no analytics request is issued.
2. **Given** a member with `reports.read`, **Then** each KPI equals the Reports endpoint's value for the same range, and the change is computed by the server (a null change when the previous figure is zero).
3. **Given** an outstanding receivables KPI, **Then** the overdue figure is shown beside it, and a falling overdue balance is presented as good.
4. **Given** any analytics card, **Then** it links to its detailed report carrying the same range.

### User Story 3 - Needs attention (Priority: P1)

As a member, I want to see only the things that need my attention, so I can act without hunting.

**Why this priority**: "What needs my attention" is the other half of the landing page's purpose.

**Independent Test**: As each default role, confirm exactly the permitted items appear, each built from the existing list endpoint with pageSize 5 and the endpoint's total, each row linking to its record, each item offering "View all" with the filter applied, and an item with nothing to show saying so briefly.

**Acceptance Scenarios**:

1. **Given** a member with `invoices.read`, **Then** overdue invoices appear with the count, the overdue balance, and the 5 most overdue, each linking to its invoice; with none, "No overdue invoices".
2. **Given** a member with `sales.read`, **Then** confirmed sales orders awaiting shipment appear; with none, the item says so.
3. **Given** a member with `purchasing.read`, **Then** purchase orders awaiting receipt (CONFIRMED or PARTIALLY_RECEIVED) appear; with none, the item says so.
4. **Given** a member with `inventory.read`, **Then** the 5 most urgent low-stock products appear with total available and threshold, and the count equals the Inventory low-stock filter's total.
5. **Given** a member with `reports.read`, **Then** stock reconciliation discrepancies appear; with none, a quiet "No discrepancies" is shown.

### User Story 4 - Quick actions (Priority: P2)

As a member, I want one-click entry to the create screens I am allowed to use, so common work starts from the landing page.

**Why this priority**: Convenience that reuses existing screens.

**Independent Test**: As a member holding each write permission, confirm the matching action appears and navigates to its existing screen; as a member without it, the action is absent.

**Acceptance Scenarios**:

1. **Given** a member with `sales.write`, **Then** "New sales order" appears and navigates to the sales order screen.
2. **Given** a member with `payments.record`, **Then** "Record payment" appears; without it, it does not.
3. **Given** a module that is not available to the organization, **Then** its quick action is absent even if the permission is held.

### User Story 5 - Recent activity (Priority: P2)

As a member holding `audit.read`, I want the latest audit entries, so I can see who changed what.

**Why this priority**: Audit is a separate permission; the block is simply hidden otherwise.

**Acceptance Scenarios**:

1. **Given** a member with `audit.read`, **Then** the latest 8 entries appear with readable labels and links to the record.
2. **Given** any entry, **Then** no password, token or secret is ever shown.
3. **Given** a member without `audit.read`, **Then** the block is absent and no request is issued.

### User Story 6 - First-use checklist (Priority: P2)

As a new organization, I want a checklist of the first steps, so I know how to get the system working.

**Why this priority**: Onboarding guidance derived from real counts, self-completing.

**Acceptance Scenarios**:

1. **Given** an organization with no products, no customers or no stock, **Then** a "Get started" checklist appears with the steps the member's permissions allow, each linking to its screen.
2. **Given** the counts change, **Then** each step ticks itself from the totals of the list endpoints the member can read, and the checklist disappears once complete.
3. **Given** the checklist, **Then** it is not dismissible and nothing is stored in the browser.

### User Story 7 - A member with no dashboard permissions (Priority: P1)

As a member who holds none of the dashboard permissions, I want a plain welcome, not an error wall.

**Why this priority**: The page must never look broken.

**Acceptance Scenarios**:

1. **Given** a member holding none of the relevant permissions, **When** they open `/`, **Then** they see their name, their organization, and a note that they have no dashboard widgets yet; no 403 is shown.

### Edge Cases

- A widget failing never affects the other widgets; each carries its own skeleton, empty state, and error state with Retry and the request identifier.
- A permission error is never rendered as a widget error: the widget is not requested at all.
- An empty organization shows the first-use state and no errors.
- Money is formatted from the server's decimal strings with the organization's currency code and thousands separators; the client never does arithmetic on money.
- Charts carry a text summary, an aria-label, and a "Show as table" alternative; reduced motion is respected.

## Requirements *(mandatory)*

### Functional Requirements

**Header**

- **FR-001**: The page MUST greet the signed-in member using their display name (the membership name, otherwise the email) and the organization name.
- **FR-002**: The page MUST show the period label "This month" (fixed in this feature), a Refresh button that re-requests every visible widget, the time of the last update, and the info line "Figures show your organization. What you see depends on your permissions."

**Analytics (only with `reports.read`)**

- **FR-003**: The analytics section MUST be rendered only for members holding `reports.read`; for others it MUST be absent (no placeholder) and no analytics request MUST be issued.
- **FR-004**: It MUST show four KPI cards — Sales, Purchases, Payments received, Outstanding receivables (with the overdue balance and count beside it) — for the current month, each read from the extended `GET /reports/kpi-summary` endpoint, which also returns the server-computed previous-period value and change, expressed in words and an arrow, where colour is never the only signal and a falling overdue balance is good. Period-bound figures carry their change; the as-of-today figures (outstanding and overdue) are labelled "As of today" and carry no change.
- **FR-005**: It MUST show a sales-over-time chart, a sales-orders-by-status chart, and a receivables aging chart, reusing the Reports page's chart components and tokens with no new dependency.
- **FR-006**: Every analytics card MUST link to its detailed report carrying the same range.

**Needs attention**

- **FR-007**: Each attention item MUST appear only when the member holds the matching read permission: overdue invoices (`invoices.read`), confirmed sales orders awaiting shipment (`sales.read`), purchase orders awaiting receipt (`purchasing.read`, statuses CONFIRMED or PARTIALLY_RECEIVED), low-stock products (`inventory.read`), stock reconciliation discrepancies (`reports.read`).
- **FR-008**: Each item MUST be built from the existing list endpoint with pageSize 5 and the endpoint's total; every row MUST link to its record and every item MUST offer "View all" linking to the list with the filter applied.
- **FR-009**: An item with nothing to show MUST say so briefly (for example "No overdue invoices"); the reconciliation item MUST show a quiet "No discrepancies" when clean.

**Quick actions**

- **FR-010**: Each quick action MUST appear only when the member holds the write permission AND the module is available: New sales order (`sales.write`), New purchase order (`purchasing.write`), New product (`products.write`), New contact (`contacts.write`), Record payment (`payments.record`), Adjust stock (`inventory.adjust`); each navigates to the existing screen.

**Recent activity**

- **FR-011**: The latest 8 audit entries MUST be shown for members holding `audit.read`, with readable labels and links to the record, and MUST be absent otherwise; no password, token or secret may ever be shown.

**First-use state**

- **FR-012**: While the organization has no products, no customers or no stock, a "Get started" checklist MUST show the steps the member's permissions allow (add a product, add a customer, add stock, create a purchase order, create a sales order, invoice it), each linking to its screen. The checklist MUST request its counts only for the steps the member can read, with pageSize 1, and MUST be skipped entirely when it cannot apply (for example a member who cannot read products).
- **FR-013**: Each step MUST tick itself from the real totals of the list endpoints the member can read, and the checklist MUST disappear when complete; it MUST NOT be dismissible and MUST NOT store anything in the browser.

**No-permission member**

- **FR-014**: A member holding none of the above permissions MUST see a plain welcome with their name and organization and a note that they have no dashboard widgets yet; never a 403 wall.

**Performance and failure behaviour**

- **FR-015**: Each widget MUST load and fail independently with its own skeleton, empty state, and error state with Retry carrying the request identifier.
- **FR-016**: The first load MUST dispatch a first batch of at most 8 requests — the 4 analytics requests and the 4 attention-list requests — together, in parallel, with no polling and no auto-refresh; a full Administrator's measured first batch is exactly 8. The deferred widgets (stock reconciliation, recent activity, and the checklist's own counts) MUST dispatch immediately after the first batch, also in parallel, at low priority, never waiting for each other or for the first batch. Refresh re-requests all visible widgets. The measurement MUST record two numbers per role — the first-batch requests and the total until every widget has settled — and MUST NOT describe the total as 8.
- **FR-017**: A permission error MUST NEVER be shown as a widget error: the widget MUST not be requested at all. A member without `reports.read` dispatches no analytics request; a member who holds none of a deferred widget's permissions dispatches nothing for it.
- **FR-018**: Every widget that shows figures MUST state its definition in one line and its as-of time.
- **FR-019**: Deferred widgets MUST show their skeleton from the first paint, so the layout does not jump when their data arrives.

**Presentation**

- **FR-020**: Money MUST be formatted with the organization's currency code and thousands separators, from the server's decimal strings, with no client arithmetic; counts and quantities as the server gives them.
- **FR-021**: Charts MUST reuse the Reports page's chart components and tokens, each with a "Show as table" alternative, a text summary, and an aria-label; reduced motion MUST be respected.
- **FR-022**: The layout MUST be desktop and tablet only: KPI cards in a row on desktop and two by two on tablet, with no horizontal page scroll.

**Data source (no sample data)**

- **FR-023**: The sample dashboard service and its sample invoice rows MUST be deleted; the Sample data banner MUST be removed from Overview; every figure MUST come from a real endpoint.
- **FR-024**: System Health, the sidebar, and the rest of the shell MUST be unchanged.

**Backend (only what is missing)**

- **FR-025**: The purchase order list MUST accept several statuses in one filter so "awaiting receipt" is one call; the sales order list status filter already accepts CONFIRMED; the invoice list's overdue-only filter and the Inventory low-stock filter already exist and MUST be reused unchanged.
- **FR-026**: The existing `GET /reports/kpi-summary` MUST be extended, keeping its path and every existing field with the same value: it MUST additionally return, for the requested range and the immediately preceding period of equal length, sales total and count, purchases total and count, payments received, sales orders and purchase orders created, and products low stock and out of stock; and, as of today and labelled as not range-bound, the outstanding receivables balance, the overdue balance and their invoice counts. Every period-bound figure MUST also carry its previous-period value and the server-computed change (null when the previous value is zero). The whole response MUST come from one read-consistent transaction, use the shared definitions, declare `reports.read`, return the filters it used and an asOf timestamp, and carry money as decimal strings. No new endpoint may be added.
- **FR-027**: The `/auth/me` response MUST carry the member's per-membership `name` alongside the membership id, roles and active flag, so the greeting can use the display name without an extra request or permission.
- **FR-028**: The OpenAPI contract MUST be regenerated so the drift check passes.

### Key Entities

- **Widget (virtual)**: a permission-gated card; no stored entity.
- **AttentionItem (virtual)**: count + up to 5 rows + a "View all" link.
- **ChecklistStep (virtual)**: label, link, ticked-from-count.
- No new tables; no new stored columns.

### Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** every widget reads a tenant-scoped existing endpoint; another organization's data never appears; RLS unchanged.
- **II. Server-enforced authority:** every widget is gated by the member's held permissions from `GET /auth/me`; a hidden widget is never requested; the server still refuses anything the member lacks.
- **III. Transactional integrity:** read-only page; no writes; the Refresh button only re-reads.
- **IV. Exact decimals:** money and quantities come from the server as decimal strings and are formatted, never computed, on the client.
- **V. Test-first:** failing tests first for the widget-permission matrix, request count, KPI equality, checklist ticking, and failure isolation; ≥80% critical-path coverage.
- **VI. Modular boundaries:** the page composes existing clients and endpoints; no shared definition is reimplemented; no new analytics endpoint.
- **VII. Honest boundaries:** informational only; no tax, accounting or valuation claim.
- **VIII. Design system and accessibility:** existing tokens and chart components; skeleton/empty/error states; "Show as table"; text summaries; aria-labels; reduced motion; WCAG 2.1 AA.
- **IX. Scope discipline:** P0 (P1-F001) landing page; reusable/draggable widgets, saved views, targets, export/print, real-time updates and new report endpoints are out of scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each default role (Administrator, Manager, Sales, Inventory, Purchasing) and for a custom role with no permissions, exactly the permitted widgets are shown and no request is issued for a widget that must not appear (no 403 responses).
- **SC-002**: Every KPI equals the extended Reports KPI endpoint's value for the same range (field by field, including the previous-period values and a null change when the previous value is zero), and the Dashboard's values equal the Reports page's for the same range; the low-stock count equals the Inventory low-stock filter's total; the overdue figures equal the Invoicing list's overdue-only selection; and the extended endpoint keeps every previously existing field with the same value.
- **SC-003**: The first batch issues exactly 8 requests for a full Administrator and at most 8 for every role, measured and recorded per role together with the total requests until every widget has settled (both numbers recorded, the total never described as 8); no request returns 403.
- **SC-004**: A failing widget never affects the others; each shows its own error with Retry and the request identifier.
- **SC-005**: The first-use checklist ticks from real data and disappears when complete; an empty organization shows it and no errors.
- **SC-006**: No sample data, sample service or Sample data banner remains on Overview; the sidebar and System Health are unchanged.
- **SC-007**: The contract-drift check and every existing guard pass; public row counts are unchanged.

## Assumptions

- The existing Reports, Inventory, Purchasing, Sales, Invoicing, Contacts, Products and Audit endpoints are the only data sources; no analytics endpoint is added. The existing `GET /reports/kpi-summary` is extended in place (path and existing fields unchanged) and serves the KPI row for both the Dashboard and the Reports page.
- The purchase order list is the one list filter that needs widening (several statuses in one call); the sales order list already accepts CONFIRMED.
- The KPI row is one request (the extended kpi-summary) and is counted inside the first batch.
- The request budget applies to the first batch: the 4 analytics requests and the 4 attention-list requests, dispatched together in parallel. The deferred widgets (reconciliation, recent activity, checklist counts) dispatch right after, in parallel, at low priority, never chained. Both the first-batch count and the settled total are measured and recorded per role.
- The checklist requests counts only for the steps the member can read (pageSize 1) and is skipped entirely when it cannot apply; a permission-filtered setup-status endpoint is a follow-up if the deferred requests prove slow in the measurement.
- "This month" is fixed in this feature: the current calendar month to today, UTC.
- Quick actions appear only when the organization has the module enabled, as reported by the organization settings the shell already loads.
- The display name is the per-membership `name`, which `/auth/me` now carries; members without one show their email.
- Out of scope: customizable or draggable widgets, saved views, goals and targets, export and print, real-time updates and notifications, organization time zones, profit and valuation figures, and new report endpoints.