# Feature Specification: Reports Analytics Page End to End

**Feature Branch**: `main` (feature directory: `specs/016-reports-analytics`)
**Created**: 2026-11-16
**Status**: Draft
**MoSCoW Priority**: P0 (P0-F013 Reports extended; P1-F001 export later)
**Input**: User description: "Extend the Reports page into a full analytics page: real charts, KPIs and the existing detailed tables, covering sales, purchasing, receivables, payments and inventory, end to end (backend API and interface). Source: docs/PRD.md P0-F013 and P1-F001, Sections 7.4, 8 and 9.5, the constitution, and the existing Reports feature, which this EXTENDS and must reuse (the five detailed table reports and their endpoints stay and are not duplicated)."

This feature extends the existing Reports module (`015-reports`) into a full analytics page. It reuses the five detailed table reports and their endpoints and adds new chart/KPI endpoints and cards. No stored data changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Range control and KPI summary (Priority: P1)

As a manager, I want a range control and a row of KPI cards comparing the current period to the previous one, so I can see the business at a glance.

**Why this priority**: The range + KPI row is the entry point and frames every figure below it.

**Independent Test**: Validate the range (end not before start, 400-day max), presets, URL persistence, KPI cards with change vs previous period, and empty state.

**Acceptance Scenarios**:

1. **Given** a range, **When** KPIs load, **Then** sales, purchases, payments received, outstanding/overdue receivables (as of today), orders created, and low/out-of-stock product counts are shown.
2. **Given** a KPI, **Then** the value for the immediately preceding equal-length period and the change (or null) are returned by the server.
3. **Given** an end before start, **Then** 400; a range over 400 days **Then** 400; an empty organization **Then** empty figures, never an error.

### User Story 2 - Time series charts (Priority: P1)

As a manager, I want sales, purchases, and payments over time, so I can spot trends.

**Why this priority**: Trend visibility is the core of analytics.

**Independent Test**: Buckets zero-filled, granularity server-chosen (day ≤31, week ≤120, else month), range-inclusive, DRAFT/VOID/CANCELLED excluded, series sums to the matching KPI.

**Acceptance Scenarios**:

1. **Given** a range, **When** loaded, **Then** zero-filled buckets with totals and document counts are returned.
2. **Given** a document on the first/last range day, **Then** included; one day outside **Then** excluded.

### User Story 3 - Top products and customers (Priority: P1)

As a manager, I want top products by invoiced revenue and top customers by invoiced total, so I can focus on the biggest contributors.

**Why this priority**: High-value slice of the sales data.

**Independent Test**: Top 10 products (from Sales-lines) and top 10 customers by invoiced total in the range; quantity shown only when single unit applies.

**Acceptance Scenarios**:

1. **Given** a range, **When** loaded, **Then** top 10 products with revenue and quantity/unit when single unit; top 10 customers by total.

### User Story 4 - Documents by status (Priority: P2)

As a manager, I want counts per status for orders, invoices, and payments in the range.

**Why this priority**: Operational pipeline view.

**Independent Test**: SO/PO/invoice counts per status; payments RECORDED/REVERSED in range; single snapshot.

**Acceptance Scenarios**:

1. **Given** a range, **Then** per-status counts for SO/PO/invoices and payments by state are returned.

### User Story 5 - Receivables aging (Priority: P1)

As a billing clerk, I want aging as of today matching the Outstanding invoices report exactly.

**Why this priority**: Collections; must equal the outstanding report.

**Acceptance Scenarios**:

1. **Given** the shared balance/overdue definition, **Then** aging buckets (Current, 1–30, 31–60, 61–90, over 90) with count and balance are returned, equal to the outstanding report.

### User Story 6 - Stock health and movements by type (Priority: P2)

As an inventory clerk, I want stock health counts and the most urgent low-stock products, plus movements over time by type.

**Why this priority**: Inventory at a glance; reuse inventory's low-stock definition.

**Acceptance Scenarios**:

1. **Given** the shared low-stock/out-of-stock/in-stock definition, **Then** counts are returned; the 10 most urgent low-stock products are listed.
2. **Given** a range, **Then** movement counts per bucket by type (receipts, shipments, adjustments) are returned, never quantity sums.

### User Story 7 - Detailed reports and access rules (Priority: P2)

As a manager, I want the five detailed table reports kept and linked, and permission gating everywhere.

**Why this priority**: Reuse and access control.

**Acceptance Scenarios**:

1. **Given** "Detailed reports", **Then** compact cards link to the five table reports; chart cards carry the same range via a link.
2. **Given** no `reports.read`, **Then** controls hidden/disabled, server is authority, and the page carries the access notice.

### Edge Cases

- Empty organization returns empty data, never an error.
- Range validation: end not before start; 400-day maximum.
- DRAFT/VOID/CANCELLED and reversed payments excluded as defined.
- Archived products excluded from low-stock; mixed units → counts only.
- Every chart has an accessible table alternative; reduced motion respected; no sample data on the page.

## Requirements *(mandatory)*

### Functional Requirements

**Definitions (shared server code / view)**

- **FR-001**: Sales = invoices in ISSUED/PARTIALLY_PAID/PAID by issue date; DRAFT and VOID excluded. Purchases = POs in CONFIRMED/PARTIALLY_RECEIVED/RECEIVED by order date; DRAFT and CANCELLED excluded. Payments received = payments with no reversal by payment date. Outstanding, overdue, aging come from the shared definition the Invoicing list uses. Low/out/in stock come from the shared product-level definition the Inventory screens use (archived products excluded).
- **FR-002**: Days and periods use UTC dates; a range is inclusive of start and end; end not before start; maximum 400 days. Lack of org time zone recorded as a follow-up.
- **FR-003**: Money in organization's single currency, exact decimals computed by DB/server as decimal strings, never JS floats. Different units of measure never summed; quantity total only when a single unit applies.

**Backend (all declare `reports.read`, tenant-scoped, read-only in a read-consistent transaction with a statement timeout, returning exact filters used and an asOf timestamp)**

- **FR-004**: `GET /reports/kpi-summary` returns for the range: sales total + invoice count; purchases total + order count; payments received; outstanding + overdue receivables as of today (labelled, not range-bound); SO/PO counts created; low stock and out of stock counts; each KPI also returns the same figure for the immediately preceding equal-length period and the change (null when previous is zero).
- **FR-005**: `GET /reports/sales-over-time`, `GET /reports/purchases-over-time`, `GET /reports/payments-received-over-time` return zero-filled buckets with server-chosen granularity (day ≤31, week ≤120, else month) with total and document count.
- **FR-006**: `GET /reports/top-products` and `GET /reports/top-customers` return top 10 products by invoiced revenue and top 10 customers by invoiced total in the range; quantity shown only when a single unit applies.
- **FR-007**: `GET /reports/documents-by-status` returns counts per status for SO/PO/invoices created in the range and payments by RECORDED/REVERSED, from a single consistent snapshot.
- **FR-008**: `GET /reports/receivables-aging` returns Current, 1–30, 31–60, 61–90, over 90 days overdue with count and balance, matching the Outstanding invoices report exactly.
- **FR-009**: `GET /reports/stock-health` returns counts in stock/low stock/out of stock and the 10 most urgent low-stock products (name, SKU, available, threshold); `GET /reports/stock-movements-over-time` returns counts per bucket by type, never quantity sums.
- **FR-010**: All queries use only new indexes in migrations and a max number of buckets; no caching; statement timeout; page size cap where applicable.
- **FR-011**: The contract is regenerated and the drift check passes; OpenAPI and docs updated.

**Interface (/reports)**

- **FR-012**: A range control with presets and validation; the range lives in the URL.
- **FR-013**: KPI cards with change vs previous period in words and arrow (colour never the only signal); good/bad direction defined per KPI.
- **FR-014**: The chart grid (sales, purchases, payments, top products, top customers, documents by status, receivables aging, stock health, stock movements by type, low-stock list).
- **FR-015**: "Detailed reports" compact cards linking to the five table reports; each chart has "View details" carrying the same range.
- **FR-016**: Every chart card: title, one-line definition subtitle, loading skeleton, informative empty state, error state with Retry, "Show as table" toggle, tooltips never the only copy of a value, legends show values, visually hidden text summary + aria-label, keyboard reachable, colours from design system chart tokens, distinguishable without colour, reduced motion respected, existing chart library only (add no new dependency).
- **FR-017**: Money formatted with org currency code + thousands separators, no arithmetic; figures labelled with their period ("This period", "As of today"); the page states "Reports show figures from across your organization. Access is limited to members with report permission."; controls the member lacks are hidden/disabled from `GET /auth/me`, server still authority.
- **FR-018**: Responsive desktop + tablet; KPI cards in a row / 2x2; chart grid 2 columns then 1; no horizontal scroll; print out of scope.
- **FR-019**: No sample data remains on the page.

### Key Entities

- **ReportKPI (virtual)**: computed figure + previous + change; filters; asOf.
- **ReportTimeSeries (virtual)**: zero-filled buckets.
- **ReportDetail**: the five detailed reports (reused).
- No new stored entities.

### Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** every endpoint scoped to org; cross-org → 404; RLS unchanged.
- **II. Server-enforced authority:** reports.read on every endpoint; hidden controls are convenience only.
- **III. Transactional integrity:** read-only; read-consistent transactions; no writes; no posted records.
- **IV. Exact decimals:** string decimals; never JS floats; mixed units → counts only.
- **V. Test-first:** failing tests first; tenant-isolation, permission, snapshot, totals-equality, perf with measured results; ≥80% coverage.
- **VI. Modular boundaries:** extend the Reports module; reuse existing services; no new tables.
- **VII. Honest boundaries:** informational; no tax/accounting claim.
- **VIII. Design system and accessibility:** design tokens for charts, PRD 7.3, WCAG 2.1 AA.
- **IX. Scope discipline:** P0 extension; depends on 015-reports, inventory, invoicing, sales, purchasing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every KPI equals the sum of underlying records; each time series sums to the matching KPI; zero-filled buckets present.
- **SC-002**: Documents on range boundaries included; documents outside excluded; DRAFT/VOID/CANCELLED and reversed payments excluded as defined.
- **SC-003**: Outstanding/overdue/aging equal the Invoicing list and Outstanding invoices report.
- **SC-004**: Low-stock figures equal the Inventory screens.
- **SC-005**: Empty organization returns empty data, never an error; each endpoint returns a consistent snapshot.
- **SC-006**: Every chart has an accessible table alternative; no sample data remains on the page; public row counts unchanged.
- **SC-007**: Performance measured and recorded; contract-drift and existing guards pass.
- **SC-008**: 100% of endpoints declare reports.read and are tenant-scoped.

## Assumptions

- The five detailed table reports and endpoints of `015-reports` remain, unchanged and not duplicated.
- No new stored tables; only new indexes in migrations; no caching.
- Organization time zone lack recorded as a follow-up; all dates UTC.
- The chart library already in the project is used; no new dependency.
- Out of scope: CSV/Excel/PDF export, custom builders, scheduled/emailed reports, stock valuation/profit, supplier payables, taxes, forecasting, audit-activity charts (arrive with audit permission separately).