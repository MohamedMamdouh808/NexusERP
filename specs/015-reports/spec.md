# Feature Specification: Reports Page End to End

**Feature Branch**: `main` (feature directory: `specs/015-reports`)
**Created**: 2026-11-15
**Status**: Draft
**MoSCoW Priority**: P0 (P0-F013 Reports)
**Input**: User description: "Build the Reports page end to end: the backend API and the interface. Source: docs/PRD.md P0-F013, Sections 7.4, 8 and 9.5, the constitution, and the Inventory, Purchasing, Sales and Invoicing features. All figures come from real data; there is no sample data on these screens. Nothing here changes stored data."

This feature adds a read-only Reports module: five reports over existing data, plus a hub. No stored data changes. All endpoints declare `reports.read`; every query is scoped to the session's organization; another organization's data never appears.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reports hub (Priority: P1)

As a member holding `reports.read`, I want a hub of five report cards, so I can open the report I need.

**Why this priority**: The hub is the entry point to every report; without it nothing else is reachable.

**Independent Test**: Open `/reports`, confirm five cards (Stock on hand, Stock movements, Outstanding invoices, Document statuses, Stock reconciliation), each opens its screen; the sidebar entry is available; a member without `reports.read` cannot see the entry and gets 403 from the API.

**Acceptance Scenarios**:

1. **Given** a member with `reports.read`, **When** they open `/reports`, **Then** five cards are shown, each linking to its report screen.
2. **Given** a member without `reports.read`, **When** they open `/reports`, **Then** the entry is hidden and the API returns 403.
3. **Given** any report screen, **When** it loads, **Then** a toolbar, table, loading skeleton, empty state, error state with Retry, and selection-labelled totals are present.

### User Story 2 - Stock on hand (Priority: P1)

As an inventory clerk, I want on-hand, reserved, and available quantities per product and warehouse, so I can see what is physically there and what is free to sell.

**Why this priority**: Stock position is the most frequently consulted figure.

**Independent Test**: Open the report, filter by product search and warehouse, toggle archived products, sort and page, and confirm totals for the whole filtered selection.

**Acceptance Scenarios**:

1. **Given** stock balances, **When** the report loads, **Then** each row shows product, warehouse, on hand, reserved, available.
2. **Given** a product search, **When** applied, **Then** rows narrow and the total reflects the filtered selection.
3. **Given** the "include archived products that hold stock" toggle off, **When** loaded, **Then** archived products with zero stock are excluded; with it on, archived products holding stock are included.
4. **Given** rows with mixed units of measure, **When** totals are shown, **Then** sums are computed only across rows sharing a unit of measure; otherwise the line count is shown.
5. **Given** `pageSize` above 100, **When** requested, **Then** 400.

### User Story 3 - Stock movements (Priority: P1)

As an inventory clerk, I want movements for a product, a warehouse, or both, over a date range, so I can trace stock changes.

**Why this priority**: Movement history is essential for investigating discrepancies.

**Independent Test**: Open the report, filter by product and/or warehouse and date range, and confirm rows match the Inventory Movements tab for the same inputs.

**Acceptance Scenarios**:

1. **Given** a product and/or warehouse and a date range, **When** the report loads, **Then** movements in the range are listed with type, quantity, reference, and date.
2. **Given** an end date before the start date, **When** submitted, **Then** 400 with the date field named.
3. **Given** the same inputs, **When** compared to the Inventory Movements tab, **Then** the result is identical (same service, no duplicated query).

### User Story 4 - Outstanding invoices (Priority: P1)

As a billing clerk, I want ISSUED and PARTIALLY_PAID invoices with a balance above zero, with aging, so I can chase collections.

**Why this priority**: Collections depend on an accurate, aged view of open receivables.

**Independent Test**: Open the report with known invoices; confirm rows, totals, and aging buckets match the Invoicing list for the same selection.

**Acceptance Scenarios**:

1. **Given** ISSUED/PARTIALLY_PAID invoices with balance > 0, **When** the report loads, **Then** each row shows customer, number, issue date, due date, total, paid, balance, days overdue.
2. **Given** customer search, overdue-only, and due-date range filters, **When** applied, **Then** rows and totals reflect the selection.
3. **Given** the filtered selection, **When** totals and aging are computed, **Then** aging buckets (Current, 1–30, 31–60, 61–90, over 90 days) each show count and balance sum, and the outstanding/overdue figures equal the Invoicing list's for the same selection.

### User Story 5 - Document statuses (Priority: P2)

As a manager, I want counts (and totals for orders and invoices) per status over a date range, so I can see pipeline health.

**Why this priority**: Operational visibility; depends on the same data.

**Independent Test**: Open the report, choose a date range, and confirm counts/totals per status for POs, SOs, invoices, payments, plus shipments and goods receipts, from one consistent snapshot.

**Acceptance Scenarios**:

1. **Given** a date range, **When** the report loads, **Then** per-status counts (and totals where applicable) are shown for purchase orders, sales orders, invoices, and payments (RECORDED/REVERSED).
2. **Given** the range, **When** loaded, **Then** shipments and goods receipts counts in the range are shown.
3. **Given** an end date before the start date, **When** submitted, **Then** 400.

### User Story 6 - Stock reconciliation (Priority: P2)

As an inventory clerk, I want a report of any balance that disagrees with its movements or reservations, so I can detect and repair data corruption.

**Why this priority**: Integrity check; expected to be empty.

**Independent Test**: Open the report on a clean schema → "No discrepancies found, checked at <time>". Corrupt a balance in the isolated schema → it appears; repair → empty again.

**Acceptance Scenarios**:

1. **Given** a consistent schema, **When** the report loads, **Then** it shows "No discrepancies found, checked at <time>".
2. **Given** a corrupted balance (on hand ≠ sum of movements, or reserved ≠ sum of ACTIVE reservations, or reserved > on hand), **When** the report loads, **Then** the row appears with both figures and an explanation of the discrepancy kind.
3. **Given** the report, **When** it loads, **Then** a `checkedAt` timestamp is returned.

### Edge Cases

- Empty organization returns empty reports with zero totals, never an error.
- Archived products holding stock appear only when the toggle is on.
- Mixed units: totals are summed only within a unit of measure; otherwise the row count is shown.
- Date range validation: end before start → 400 naming the date field.
- pageSize above 100 → 400.
- Reconciliation returns a `checkedAt` timestamp even when empty.
- Report queries are read-only and run in a read-consistent transaction with a statement timeout.
- Tables fit a 1180px window without horizontal scroll.
- Every row links to its record where the member can read it; every report is read-only.

## Requirements *(mandatory)*

### Functional Requirements

**Stock on hand**

- **FR-001**: `GET /reports/stock-on-hand` MUST return per (product, warehouse) rows: product id/name, warehouse id/name, unit of measure, on hand, reserved, available, plus product archived flag.
- **FR-002**: It MUST accept product search, warehouse filter, an `includeArchived` toggle, sort, page, pageSize (max 100), and return `total`.
- **FR-003**: It MUST return server-computed totals of on hand, reserved, and available for the whole filtered selection, summing only across rows sharing a unit of measure; otherwise returning the line count only.

**Stock movements**

- **FR-004**: `GET /reports/stock-movements` MUST accept product (optional), warehouse (optional), date range (start/end, end not before start), type filter, sort, page, pageSize (max 100), total.
- **FR-005**: It MUST call the same service as the Inventory Movements tab; no duplicated query.

**Outstanding invoices**

- **FR-006**: `GET /reports/outstanding-invoices` MUST return ISSUED and PARTIALLY_PAID invoices with balance > 0: customer, number, issue date, due date, total, paid, balance, days overdue.
- **FR-007**: It MUST accept customer search, overdue-only, due-date range, sort, page, pageSize (max 100), total.
- **FR-008**: It MUST return totals for the whole filtered selection and aging buckets (Current, 1–30, 31–60, 61–90, over 90 days) each with count and balance sum.
- **FR-009**: It MUST use the same shared balance and overdue definition as the invoice list.

**Document statuses**

- **FR-010**: `GET /reports/document-statuses` MUST, for a date range, return per-status counts (and total amount for orders and invoices) for purchase orders, sales orders, invoices, and payments (RECORDED/REVERSED), plus shipments and goods receipts counts in the range, from a single consistent snapshot.

**Stock reconciliation**

- **FR-011**: `GET /reports/stock-reconciliation` MUST return rows where on hand ≠ sum of movements, or reserved ≠ sum of ACTIVE reservations, or reserved > on hand, with both figures, a total, and a `checkedAt` timestamp.

**General (all endpoints)**

- **FR-012**: All endpoints MUST declare `reports.read` and be tenant-scoped (another organization's data → 404).
- **FR-013**: All quantities and money MUST be exact decimals returned as decimal strings, never JavaScript floats.
- **FR-014**: Report queries MUST be read-only, run in a read-consistent transaction, with a statement timeout and a maximum page size.
- **FR-015**: New indexes needed by report queries MUST be added in new migrations.

**Interface**

- **FR-016**: `/reports` MUST be a hub of five cards, one per report.
- **FR-017**: Each report screen MUST have a toolbar (the filters above), a table, loading skeleton, empty state, error state with Retry, and totals labelled as selection figures ("Outstanding in this selection").
- **FR-018**: The Reports sidebar entry MUST become available.
- **FR-019**: Dates MUST be validated (end not before start).
- **FR-020**: The reconciliation report MUST show "No discrepancies found, checked at <time>" on success and an explanation of each discrepancy kind when rows exist.
- **FR-021**: Tables MUST fit a 1180px window without horizontal scroll.
- **FR-022**: Every report row MUST link to its record where the member can read it.
- **FR-023**: Every report MUST be read-only (no edit control).
- **FR-024**: Actions the member lacks permission for MUST be hidden or disabled from `GET /auth/me`, server still the authority; the page MUST state that a member who can read reports can see the figures they contain.

### Key Entities

- **StockBalance (read)**: on hand, reserved, available, per (organization, warehouse, product, unit).
- **StockMovement (read)**: type, quantity, reference, date.
- **Invoice (read)**: status, balance, due date (shared definition).
- **PurchaseOrder / SalesOrder / Payment / Shipment / GoodsReceipt (read)**: status counts and amounts.
- **Report (virtual)**: a read-only projection; no stored entity.

### Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every report query scoped to the session's organization; cross-org → 404; RLS stays enabled.
- **II. Server-enforced authority:** `reports.read` on every endpoint; hidden controls are convenience only.
- **III. Transactional integrity:** Read-only queries in a read-consistent transaction; no posted records; no writes.
- **IV. Exact decimals:** All quantities/money as decimal strings; no JS floats.
- **V. Test-first:** Failing tests first; tenant-isolation, permission, totals-equality, corruption/reconciliation, empty-org, performance with measured results.
- **VI. Modular boundaries:** Reports module reads via existing services (Inventory movements); no cross-module table writes.
- **VII. Honest boundaries:** Reports are informational; no tax/compliance/accounting claim.
- **VIII. Design system and accessibility:** Existing tokens/components; PRD 7.3 states; WCAG 2.1 AA; 1180px fit.
- **IX. Scope discipline:** P0 (P0-F013); depends on Inventory, Purchasing, Sales, Invoicing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every report endpoint returns in under 2 seconds at the 95th percentile on a dataset of at least 2,000 products, 20,000 movements, and 5,000 invoices (measured, not claimed).
- **SC-002**: 100% of report requests are tenant-scoped.
- **SC-003**: Each report's totals equal the sum of the underlying records (tests with known datasets, including mixed units and archived products).
- **SC-004**: Outstanding and overdue figures equal the Invoicing list's for the same selection.
- **SC-005**: Stock on hand equals the Inventory balances.
- **SC-006**: A deliberately corrupted balance appears in the reconciliation report and the report is empty after repair.
- **SC-007**: An empty organization returns empty reports, never an error.
- **SC-008**: The contract-drift check and every existing guard pass; public row counts unchanged.

## Assumptions

- Inventory, Purchasing, Sales, and Invoicing features are implemented and their tables populated.
- The shared balance/overdue definition (invoice_balances view) is reused, not re-implemented.
- The stock movements report delegates to the Inventory Movements service (no duplicated query).
- No new tables; only indexes may be added in new migrations.
- CSV/PDF export, charts/dashboard, scheduled/emailed reports, custom builders, valuation/profit, supplier payables are out of scope.