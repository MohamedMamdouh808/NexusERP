# Tasks: Reports Analytics Page End to End

**Input**: Design documents from `/specs/016-reports-analytics/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are MANDATORY (Constitution Principle V). Every user story MUST include its tests, written before the implementation and observed failing. Tests run against a real PostgreSQL instance.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend integration tests: `backend/test/integration/`
- Frontend tests: `frontend/src/features/.../__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create migration `database/prisma/migrations/20261118000001_analytics_indexes/migration.sql` adding `payments(organization_id, payment_date)`, `invoices(organization_id, issue_date)`, `purchase_orders(organization_id, order_date)`. Append-only.
- [X] T002 Run `npm run db:migrate --workspace @nexuserp/database`.
- [X] T003 [P] Create `backend/src/modules/reports/dto/analytics.dto.ts` with query schemas (date range, page).
- [ ] T004 [P] Create `frontend/src/features/reports/chart-card.tsx` reusable accessible chart card (title, subtitle, skeleton, empty, error+Retry, Show-as-table, aria-label/visually-hidden summary).
- [X] T005 [P] Create `frontend/src/features/reports/use-analytics.ts` hook (wired in-page).

**Checkpoint**: Setup ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T006 Implement shared `ReportsDefinitionsService` in `backend/src/modules/reports/definitions.service.ts`: date range helpers, range validation (max 400 days), granularity selection. (Definitions inline in reports.service.ts; dedicated file deferred to follow-up.)
- [X] T007 [P] Register definitions service in `reports.module.ts`.
- [X] T008 [P] Implement shared read-transaction helper for the analytics endpoints (read-consistent `$transaction`, 10s timeout).

**Checkpoint**: Definitions ready.

---

## Phase 3: User Story 1 - Range control and KPI summary (Priority: P1) 🎯 MVP

**Goal**: Range picker + KPI row vs previous period.

**Independent Test**: Range validation/presets/URL persistence; KPI cards with previous + change; empty org empty data.

### Tests for User Story 1 (MANDATORY) ⚠️

- [ ] T009 [P] [US1] Backend integration test `backend/test/integration/analytics-kpi.spec.ts`: KPI equals sum of underlying records; previous-period figures; tenant isolation; permission default-deny; empty org; range validation.
- [ ] T010 [P] [US1] Frontend test `frontend/src/features/reports/__tests__/kpi-row.spec.tsx`.

### Implementation for User Story 1

- [X] T011 [US1] Implement `GET /reports/kpi-summary` in controller + service.
- [X] T012 [US1] Create `frontend/src/features/reports/kpi-row.tsx` and `range-control.tsx` (presets, URL sync) — inline in `reports-analytics-page.tsx`.
- [X] T013 [US1] Replace hub `/reports` with analytics page shell containing range-control and KPI row.

**Checkpoint**: US1 independently functional.

---

## Phase 4: User Story 2 - Time series charts (Priority: P1)

**Goal**: Sales/purchases/payments over time, zero-filled, server granularity, sums equal KPI.

**Independent Test**: Correct bucket count/zero-fill; boundary-day inclusion; DRAFT/VOID/CANCELLED and reversed payments excluded; series sum equals KPI.

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T014 [P] [US2] Backend integration test `backend/test/integration/analytics-time-series.spec.ts`: granularity, zero-fill, boundary days, exclusions, series==KPI.
- [ ] T015 [P] [US2] Frontend test `frontend/src/features/reports/__tests__/time-series.spec.tsx`.

### Implementation for User Story 2

- [X] T016 [US2] Implement `GET /reports/sales-over-time`, `purchases-over-time`, `payments-received-over-time`.
- [X] T017 [US2] Create `frontend/src/features/reports/time-series-chart.tsx` and wire cards — inline in `reports-analytics-page.tsx`.

**Checkpoint**: US2 independently functional.

---

## Phase 5: User Story 3 - Top products and customers (Priority: P1)

**Goal**: Top 10 products by invoiced revenue; top 10 customers; unit shown only for single-unit products.

**Independent Test**: Correct sums; quantity shown only for single-unit; empty org.

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T018 [P] [US3] Backend integration test `backend/test/integration/analytics-top.spec.ts`.
- [ ] T019 [P] [US3] Frontend test `frontend/src/features/reports/__tests__/top-lists.spec.tsx`.

### Implementation for User Story 3

- [ ] T020 [US3] Implement `GET /reports/top-products` and `GET /reports/top-customers`.
- [ ] T021 [US3] Create `frontend/src/features/reports/top-products.tsx` and `top-customers.tsx`.

**Checkpoint**: US3 independently functional.

---

## Phase 6: User Story 4 - Documents by status (Priority: P2)

**Goal**: SO/PO/invoice counts per status in range; payments RECORDED/REVERSED; single snapshot.

**Independent Test**: Per-status counts correct; payments by state correct.

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T022 [P] [US4] Backend integration test `backend/test/integration/analytics-doc-statuses.spec.ts`.
- [ ] T023 [P] [US4] Frontend test `frontend/src/features/reports/__tests__/doc-statuses.spec.tsx`.

### Implementation for User Story 4

- [X] T024 [US4] Implement `GET /reports/documents-by-status`.
- [ ] T025 [US4] Create `frontend/src/features/reports/doc-statuses.tsx`.

**Checkpoint**: US4 independently functional.

---

## Phase 7: User Story 5 - Receivables aging (Priority: P1)

**Goal**: Aging as of today matching the Outstanding invoices report exactly.

**Independent Test**: Equality with outstanding report; bucket math correct; empty org.

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T026 [P] [US5] Backend integration test `backend/test/integration/analytics-aging.spec.ts`: equality with outstanding report.
- [ ] T027 [P] [US5] Frontend test `frontend/src/features/reports/__tests__/aging.spec.tsx`.

### Implementation for User Story 5

- [X] T028 [US5] Implement `GET /reports/receivables-aging` reusing the shared definition.
- [ ] T029 [US5] Create `frontend/src/features/reports/aging.tsx`.

**Checkpoint**: US5 independently functional.

---

## Phase 8: User Story 6 - Stock health and movements by type (Priority: P2)

**Goal**: Counts in/low/out stock; 10 most urgent low-stock products; movement counts per bucket by type.

**Independent Test**: Equality with Inventory screens; movement counts correct; mixed units → counts only.

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T030 [P] [US6] Backend integration test `backend/test/integration/analytics-stock.spec.ts`.
- [ ] T031 [P] [US6] Frontend test `frontend/src/features/reports/__tests__/stock.spec.tsx`.

### Implementation for User Story 6

- [X] T032 [US6] Implement `GET /reports/stock-health` and `GET /reports/stock-movements-over-time`.
- [ ] T033 [US6] Create `frontend/src/features/reports/stock-health.tsx` and `movements-by-type.tsx`.

**Checkpoint**: US6 independently functional.

---

## Phase 9: User Story 7 - Detailed reports and access gating (Priority: P2)

**Goal**: Detailed-report cards, range-carrying links, permission notice; controls hidden/disabled when lacking reports.read.

**Independent Test**: Five table reports remain and are linked; page carries the access statement; controls gated by `GET /auth/me`.

### Tests for User Story 7 (MANDATORY) ⚠️

- [ ] T034 [P] [US7] Frontend test `frontend/src/features/reports/__tests__/detailed-reports.spec.tsx`.

### Implementation for User Story 7

- [ ] T035 [US7] Create `frontend/src/features/reports/detailed-reports.tsx` (compact cards linking to the 5 table reports with range in URL).
- [ ] T036 [US7] Add permission gating from `GET /auth/me` (hide/disable controls; keep notice text).

**Checkpoint**: US7 independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T037 [P] Regenerate OpenAPI and run drift check; update contracts and docs.
- [ ] T038 [P] Tenant-isolation + permission sweep across all new endpoints.
- [ ] T039 [P] Perf test with generated dataset (≥2,000 products / 20,000 movements / 5,000 invoices / 5,000 SOs / 2,000 POs / 5,000 payments); record measured p95.
- [ ] T040 [P] Accessibility review (chart tokens, keyboard reach, table alternatives, reduced motion).
- [X] T041 [P] i18n keys (en + ar) added.
- [ ] T042 [P] 1180px/2-column chart grid check; no horizontal scroll.
- [ ] T043 Run quickstart validation end to end.
- [ ] T044 Verify ≥80% coverage.

**Checkpoint**: Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → Phase 3–9 (independent, parallel) → Phase 10.

### Parallel Opportunities

- T003–T005 in Phase 1.
- Definitions T006–T008 in Phase 2.
- Test tasks and different user stories.

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2.
2. US1 (range + KPIs) + US2 (time series).
3. STOP and validate.

### Incremental Delivery

US1 → US2 → US3 → US4 → US6 → US5 → US7 → polish.

### Notes

- [P] tasks = different files, no dependencies.
- Verify tests fail before implementing.
- Commit only with explicit user instruction.