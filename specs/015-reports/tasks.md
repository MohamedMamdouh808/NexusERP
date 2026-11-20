# Tasks: Reports Page End to End

**Input**: Design documents from `/specs/015-reports/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story MUST include its tests, written before the implementation and observed failing. Tests run against a real PostgreSQL instance.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend integration tests: `backend/test/integration/`
- Frontend tests: `frontend/src/features/.../__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Indexes and module scaffolding preparation.

- [X] T001 Create migration `database/prisma/migrations/20261117000001_reports_indexes/migration.sql` adding indexes: `stock_balances(organization_id, warehouse_id)`, `stock_movements(organization_id, product_id, created_at)`, `stock_movements(organization_id, warehouse_id, created_at)`, `invoices(organization_id, status, due_date)`. Append-only.
- [X] T002 Run `npm run db:migrate --workspace @nexuserp/database` to apply the new migration to the dev schema.
- [X] T003 [P] Create `backend/src/modules/reports/reports.module.ts`, `reports.controller.ts`, `reports.service.ts`, `dto/reports.dto.ts` (scaffold).
- [X] T004 [P] Register the Reports module in `backend/src/app.module.ts`.
- [X] T005 [P] Create `frontend/src/services/reports-client.ts` and `frontend/src/features/reports/use-reports.ts` (scaffold).

**Checkpoint**: Module scaffolding ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers (date validation, decimal helpers, read-consistent transaction wrapper) used by all reports.

- [X] T006 Implement a shared `withReadTransaction` helper in `backend/src/modules/reports/reports.service.ts` (read-consistent `$transaction`, `SET LOCAL statement_timeout = '10s'`, pageSize cap 100).
- [ ] T007 [P] Implement date-range validation (end not before start → 400 naming the field) reusable across endpoints.
- [ ] T008 [P] Implement decimal-string serialization helpers (no JS floats) for quantities and money.
- [X] T009 [P] Implement frontend report primitives: toolbar, table skeleton, empty state, error state with Retry, totals labelled "Outstanding in this selection".

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - Reports hub (Priority: P1) 🎯 MVP

**Goal**: Hub of five cards, each opening its report; sidebar entry available.

**Independent Test**: Open `/reports`, confirm five cards link to their screens; member without `reports.read` gets 403 and no sidebar entry.

### Tests for User Story 1 (MANDATORY) ⚠️

- [ ] T010 [P] [US1] Backend integration test `backend/test/integration/reports-permission.spec.ts`: every `/reports/*` endpoint declares `reports.read` (403 without it, 200 with it); tenant isolation (cross-org → 404).
- [ ] T011 [P] [US1] Frontend test `frontend/src/features/reports/__tests__/reports-hub.spec.tsx`: five cards render, links navigate, hidden when no `reports.read`.

### Implementation for User Story 1

- [X] T012 [US1] Create `frontend/src/features/reports/reports-hub-page.tsx` with five cards.
- [X] T013 [US1] Add `/reports` route and sidebar entry (gated on `reports.read`).
- [X] T014 [US1] Add the note: "A member who can read reports can see the figures they contain."

**Checkpoint**: US1 independently functional.

---

## Phase 4: User Story 2 - Stock on hand (Priority: P1)

**Goal**: Per (product, warehouse) on hand/reserved/available with filters, sort, paging, totals (mixed-unit aware).

**Independent Test**: Open report, filter/sort/page, confirm totals for the whole filtered selection (sums only within a unit; otherwise row count).

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T015 [P] [US2] Backend integration test `backend/test/integration/reports-stock-on-hand.spec.ts`: known dataset totals equality, mixed units → row count only, archived toggle, tenant isolation, pageSize cap 400, empty org → empty.
- [ ] T016 [P] [US2] Frontend test `frontend/src/features/reports/__tests__/stock-on-hand.spec.tsx`.

### Implementation for User Story 2

- [X] T017 [US2] Implement `GET /reports/stock-on-hand` in controller + service.
- [X] T018 [US2] Create `frontend/src/features/reports/stock-on-hand-page.tsx` (toolbar, table, skeleton, empty, error+Retry, totals).

**Checkpoint**: US2 independently functional.

---

## Phase 5: User Story 3 - Stock movements (Priority: P1)

**Goal**: Movements for product/warehouse over a date range, type filter, paging; delegates to Inventory Movements service.

**Independent Test**: Same inputs as Inventory Movements tab produce identical results; end-before-start → 400.

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T019 [P] [US3] Backend integration test `backend/test/integration/reports-stock-movements.spec.ts`: delegation equality, date validation, tenant isolation.
- [ ] T020 [P] [US3] Frontend test `frontend/src/features/reports/__tests__/stock-movements.spec.tsx`.

### Implementation for User Story 3

- [X] T021 [US3] Implement `GET /reports/stock-movements` delegating to Inventory Movements service.
- [X] T022 [US3] Create `frontend/src/features/reports/stock-movements-page.tsx`.

**Checkpoint**: US3 independently functional.

---

## Phase 6: User Story 4 - Outstanding invoices (Priority: P1)

**Goal**: ISSUED/PARTIALLY_PAID with balance > 0, aging buckets, totals matching the Invoicing list.

**Independent Test**: Rows, totals, and aging equal the Invoicing list for the same selection.

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T023 [P] [US4] Backend integration test `backend/test/integration/reports-outstanding-invoices.spec.ts`: totals/aging equality with invoice list, filters, tenant isolation, empty org.
- [ ] T024 [P] [US4] Frontend test `frontend/src/features/reports/__tests__/outstanding-invoices.spec.tsx`.

### Implementation for User Story 4

- [X] T025 [US4] Implement `GET /reports/outstanding-invoices` reusing shared balance/overdue definition.
- [X] T026 [US4] Create `frontend/src/features/reports/outstanding-invoices-page.tsx`.

**Checkpoint**: US4 independently functional.

---

## Phase 7: User Story 5 - Document statuses (Priority: P2)

**Goal**: Per-status counts/totals for POs, SOs, invoices, payments + shipments/goods receipts in a date range, single snapshot.

**Independent Test**: Counts/totals per status and shipments/receipts counts for a known date range.

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T027 [P] [US5] Backend integration test `backend/test/integration/reports-document-statuses.spec.ts`: per-status counts/totals, snapshot consistency, date validation, tenant isolation.
- [ ] T028 [P] [US5] Frontend test `frontend/src/features/reports/__tests__/document-statuses.spec.tsx`.

### Implementation for User Story 5

- [X] T029 [US5] Implement `GET /reports/document-statuses`.
- [X] T030 [US5] Create `frontend/src/features/reports/document-statuses-page.tsx`.

**Checkpoint**: US5 independently functional.

---

## Phase 8: User Story 6 - Stock reconciliation (Priority: P2)

**Goal**: Discrepancies (on hand vs movements, reserved vs active reservations, reserved > on hand) with both figures, total, checkedAt; empty success state.

**Independent Test**: Clean schema → empty + checkedAt; corrupt a balance → row appears; repair → empty.

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T031 [P] [US6] Backend integration test `backend/test/integration/reports-reconciliation.spec.ts`: empty on clean, corruption appears, repair empties, tenant isolation.
- [ ] T032 [P] [US6] Frontend test `frontend/src/features/reports/__tests__/reconciliation.spec.tsx`: "No discrepancies found, checked at <time>" + discrepancy explanation.

### Implementation for User Story 6

- [X] T033 [US6] Implement `GET /reports/stock-reconciliation`.
- [X] T034 [US6] Create `frontend/src/features/reports/stock-reconciliation-page.tsx`.

**Checkpoint**: US6 independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Add new indexes migration applied + verify `check:migrations`.
- [X] T036 [P] Regenerate OpenAPI and run drift check.
- [ ] T037 [P] Tenant-isolation + permission sweep across all 5 endpoints.
- [ ] T038 [P] Mixed-units and archived-products tests.
- [ ] T039 [P] Performance test with generated dataset (≥2,000 products, 20,000 movements, 5,000 invoices); record measured p95 for every endpoint.
- [ ] T040 [P] 1180px layout check (no horizontal scroll).
- [ ] T041 [P] Row links to records where readable.
- [ ] T042 [P] Accessibility/UX review (PRD 7.3, WCAG 2.1 AA).
- [ ] T043 Run quickstart.md validation end to end.
- [ ] T044 Verify critical-path coverage ≥80%.

**Checkpoint**: Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1.
- **Phase 3–8 (User Stories)**: Depend on Phase 2; can proceed in parallel.
- **Phase 9 (Polish)**: Depends on all desired stories.

### User Story Dependencies

- US1 (hub) → after Phase 2.
- US2–US6 → after Phase 2; independent of each other.

### Parallel Opportunities

- T003–T005 in Phase 1.
- T007–T009 in Phase 2.
- All test tasks within a story marked [P].
- Polish tasks T035–T042 parallel.

---

## Parallel Example: User Story 2

```bash
Task: "T015 [US2] backend stock-on-hand tests"
Task: "T016 [US2] frontend stock-on-hand tests"
Task: "T017 [US2] implement GET /reports/stock-on-hand"
Task: "T018 [US2] create stock-on-hand page"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Phase 1 + Phase 2.
2. US1 (hub) + US2 (stock on hand).
3. STOP and validate.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → hub works.
3. US2 → stock on hand works.
4. US3 → stock movements works.
5. US4 → outstanding invoices works.
6. US5 → document statuses works.
7. US6 → reconciliation works.
8. Polish → contracts, perf, a11y, coverage.

### Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story.
- Verify tests fail before implementing.
- Commit only with explicit user instruction.