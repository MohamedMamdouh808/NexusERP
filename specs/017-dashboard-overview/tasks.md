# Tasks: Dashboard (Overview Page) End to End

**Input**: Design documents from `/specs/017-dashboard-overview/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story MUST include its tests, written before the implementation and observed failing. Tests run against a real PostgreSQL instance.

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

- [X] T001 Extend `GET /reports/kpi-summary` in `backend/src/modules/reports/reports.service.ts` (path and every existing field unchanged): add purchases total/count, real outstanding and overdue balances with invoice counts (as of today, labelled), sales/purchase order counts created, low-stock and out-of-stock product counts, and the previous-period value + server-computed change (null when the previous value is zero) for every period-bound figure; one read-consistent transaction, decimal strings, `filters` + `asOf`.
- [X] T002 Widen the purchase order list `status` filter in `backend/src/modules/purchasing/dto/list-purchase-orders.dto.ts` to accept several statuses (repeated parameter or comma-separated), keeping the single-status form valid; honour the list in `backend/src/modules/purchasing/purchasing.service.ts`.
- [X] T003 Add `name` to the `/auth/me` membership payload in `backend/src/modules/auth/auth.service.ts` (per-membership display name).
- [X] T004 [P] Add any migration and indexes the extended KPI queries need in `database/prisma/migrations/`; apply with `npm run db:migrate --workspace @nexuserp/database`.
- [X] T005 [P] Regenerate `backend/openapi.json` and run the drift check.
- [X] T006 Delete `frontend/src/features/overview/sample-invoices.ts` and the dashboard's sample service method in `frontend/src/services/sample-catalog-service.ts`; replace `frontend/src/features/overview/use-dashboard.ts` with real endpoints.

**Checkpoint**: Backend and frontend seams ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T007 Create `frontend/src/features/overview/dashboard-widgets.tsx`: the widget frame with title, one-line definition, as-of time, skeleton, empty state, and error state with Retry carrying the request identifier.
- [X] T008 Create `frontend/src/features/overview/use-dashboard.ts` with the permission-gated widget registry: the first batch (kpi-summary, sales-over-time, documents-by-status, receivables-aging, overdue invoices, confirmed sales orders, purchase orders awaiting receipt, low-stock balances) dispatched together in parallel, and the deferred batch (reconciliation, audit, checklist counts) dispatched right after in parallel at low priority, never chained.
- [X] T009 [P] Add the shared formatting helpers for money (currency code + thousands separators, no client arithmetic) and the "As of today" versus "This period" labels in `frontend/src/lib/i18n-format.ts`.

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - Greeting and header (Priority: P1) 🎯 MVP

**Goal**: Greeting, period label, Refresh with last-update time, info line.

**Independent Test**: Open `/` and confirm the greeting, "This month", Refresh and the info line.

### Tests for User Story 1 (MANDATORY) ⚠️

- [X] T010 [P] [US1] Frontend test `frontend/src/features/overview/__tests__/dashboard-header.spec.tsx`: greeting uses the membership name, falls back to the email, the organization name appears, "This month" label, Refresh re-requests every visible widget, last-update time, info line.

### Implementation for User Story 1

- [X] T011 [US1] Implement the header block in `frontend/src/features/overview/overview-page.tsx` (greeting, organization, period label, Refresh, last-update time, info line).
- [X] T012 [US1] Wire Refresh in `frontend/src/features/overview/use-dashboard.ts` to invalidate every visible widget without polling.

**Checkpoint**: US1 independently functional.

---

## Phase 4: User Story 2 - Analytics from the Reports endpoints (Priority: P1)

**Goal**: KPI row + three charts for members holding `reports.read`, each linking to its detailed report.

**Independent Test**: As Administrator, confirm the four KPI cards equal the extended KPI endpoint, the charts render, and a member without `reports.read` sees no analytics and issues no analytics request.

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T013 [P] [US2] Backend integration test `backend/test/integration/dashboard-kpi.spec.ts`: each extended KPI field equals the sum of the underlying records; previous-period values; a zero previous value yields a null change; outstanding and overdue equal the Invoicing list's overdue-only selection; every previously existing field keeps its value; tenant isolation; permission default-deny.
- [X] T014 [P] [US2] Frontend test `frontend/src/features/overview/__tests__/dashboard-analytics.spec.tsx`: KPI cards render values and the change in words with an arrow (colour not the only signal), outstanding/overdue labelled "As of today", charts render with an accessible table alternative, each card links to its detailed report with the same range, and no analytics section (or request) exists without `reports.read`.

### Implementation for User Story 2

- [X] T015 [US2] Implement the analytics section in `frontend/src/features/overview/overview-page.tsx` (KPI cards + sales-over-time, documents-by-status and receivables-aging charts) reusing the Reports chart components and tokens.
- [X] T016 [US2] Implement the KPI cards in `frontend/src/features/overview/overview-page.tsx` with the change direction per KPI (a falling overdue balance is good) and the period labels.

**Checkpoint**: US2 independently functional.

---

## Phase 5: User Story 3 - Needs attention (Priority: P1)

**Goal**: Five permission-gated attention items from the existing list endpoints with pageSize 5, their totals, record links and "View all".

**Independent Test**: As each default role, confirm exactly the permitted items appear, each built from the existing list endpoint, and an item with nothing to show says so briefly.

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T017 [P] [US3] Backend integration test `backend/test/integration/dashboard-attention.spec.ts`: purchase order list returns CONFIRMED and PARTIALLY_RECEIVED together; low-stock count equals the Inventory low-stock filter's total; overdue figures equal the Invoicing list's overdue-only selection; tenant isolation.
- [X] T018 [P] [US3] Frontend test `frontend/src/features/overview/__tests__/dashboard-attention.spec.tsx`: only permitted items render, counts and balances come from the endpoint totals, rows link to their record, "View all" carries the filter, an empty item says so briefly, reconciliation shows a quiet "No discrepancies".

### Implementation for User Story 3

- [X] T019 [US3] Implement the attention section in `frontend/src/features/overview/attention-panel.tsx` (overdue invoices, confirmed sales orders, purchase orders awaiting receipt, low-stock products, reconciliation) with its own skeleton, empty state and error+Retry.

**Checkpoint**: US3 independently functional.

---

## Phase 6: User Story 4 - Quick actions (Priority: P2)

**Goal**: Write-permission-and-module gated actions that navigate to the existing screens.

**Independent Test**: As a member holding each write permission, confirm the matching action appears and navigates; without it, absent.

### Tests for User Story 4 (MANDATORY) ⚠️

- [X] T020 [P] [US4] Frontend test `frontend/src/features/overview/__tests__/dashboard-quick-actions.spec.tsx`: only permitted and module-available actions render, and each navigates to its existing screen.

### Implementation for User Story 4

- [ ] T021 [US4] Implement `frontend/src/features/overview/quick-actions.tsx` with the six actions gated on `sales.write`, `purchasing.write`, `products.write`, `contacts.write`, `payments.record`, `inventory.adjust` and the module availability.

**Checkpoint**: US4 independently functional.

---

## Phase 7: User Story 5 - Recent activity (Priority: P2)

**Goal**: The latest 8 audit entries for `audit.read` members, with readable labels and record links; hidden otherwise.

**Independent Test**: As a member with `audit.read`, confirm 8 entries render with links and no secrets; without it, no block and no request.

### Tests for User Story 5 (MANDATORY) ⚠️

- [X] T022 [P] [US5] Frontend test `frontend/src/features/overview/__tests__/dashboard-activity.spec.tsx`: 8 entries render, labels are readable, records link, no secret is rendered, and the block is absent without `audit.read`.

### Implementation for User Story 5

- [X] T023 [US5] Implement `frontend/src/features/overview/recent-activity.tsx` from the existing audit endpoint (deferred batch), with its skeleton from the first paint.

**Checkpoint**: US5 independently functional.

---

## Phase 8: User Story 6 - First-use checklist (Priority: P2)

**Goal**: A self-completing "Get started" checklist derived from real counts.

**Independent Test**: On an empty organization the checklist appears, ticks from real totals, and disappears when complete; nothing is stored in the browser.

### Tests for User Story 6 (MANDATORY) ⚠️

- [X] T024 [P] [US6] Frontend test `frontend/src/features/overview/__tests__/dashboard-checklist.spec.tsx`: steps appear for the member's permissions, tick from real counts, disappear when complete, are not dismissible, store nothing, and are skipped when they cannot apply.

### Implementation for User Story 6

- [X] T025 [US6] Implement `frontend/src/features/overview/first-use-checklist.tsx` (counts with pageSize 1 for the readable steps only, deferred batch, self-completing).

**Checkpoint**: US6 independently functional.

---

## Phase 9: User Story 7 - A member with no dashboard permissions (Priority: P1)

**Goal**: A plain welcome instead of a 403 wall.

**Independent Test**: Sign in as a member with none of the permissions; confirm the welcome, the name, the organization and the note, with no widget requests.

### Tests for User Story 7 (MANDATORY) ⚠️

- [X] T026 [P] [US7] Frontend test `frontend/src/features/overview/__tests__/dashboard-no-permissions.spec.tsx`: the welcome renders and no widget request is issued.

### Implementation for User Story 7

- [X] T027 [US7] Implement the plain welcome in `frontend/src/features/overview/overview-page.tsx` for a member holding none of the dashboard permissions.

**Checkpoint**: US7 independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T028 [P] Remove the Sample data banner from Overview in `frontend/src/features/overview/overview-page.tsx` and delete the remaining sample dashboard wiring; leave the sidebar and System Health unchanged.
- [X] T029 [P] Measure the request counts per default role: first-batch requests (8 for a full Administrator) and the settled total; record both numbers and assert no request returns 403.
- [X] T030 [P] Run the contract-drift check and every existing guard; confirm the public row counts are unchanged.
- [X] T031 [P] Accessibility/UX review (PRD 7.3, WCAG 2.1 AA): keyboard reach, text summaries, aria-labels, "Show as table", reduced motion, desktop/tablet layout with no horizontal page scroll.
- [X] T032 [P] Add the i18n keys (en + ar) for every new dashboard string.
- [ ] T033 Run the quickstart walk-through end to end against the dev stack.
- [ ] T034 Verify ≥80% critical-path coverage.

**Checkpoint**: Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → Phase 3–9 (independent) → Phase 10.

### User Story Dependencies

- US1 (header) → after Phase 2.
- US2 (analytics) → after Phase 2; depends on T001.
- US3 (attention) → after Phase 2; depends on T002.
- US4, US5, US6, US7 → after Phase 2; independent of each other.

### Parallel Opportunities

- T004, T005 in Phase 1.
- T009 in Phase 2.
- Test tasks and the independent user stories.

---

## Parallel Example: User Story 3

```bash
Task: "T017 [US3] backend attention tests"
Task: "T018 [US3] frontend attention tests"
Task: "T019 [US3] implement attention panel"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Phase 1 + Phase 2.
2. US1 (header), US2 (analytics), US3 (attention).
3. STOP and validate.

### Incremental Delivery

US1 → US2 → US3 → US7 → US4 → US5 → US6 → polish.

### Notes

- [P] tasks = different files, no dependencies.
- Verify tests fail before implementing.
- Commit only with explicit user instruction.

## Implementation notes (2026-11-19)

**File mapping.** The implementation kept the route's export name `OverviewPage` in `dashboard-page.tsx`; the attention items, quick actions, recent activity and the first-use checklist are components in that file plus `attention-item.tsx`, `dashboard-widgets.tsx`, `dashboard-kpi-card.tsx` and `chart-frame.tsx`. The widget registry is in `use-dashboard.ts`. The test files live in `frontend/src/features/overview/__tests__/` as `dashboard-{header,analytics,attention,quick-actions,activity,checklist,no-permissions,request-counts}.spec.tsx`; the shared canned DTO fixtures are in `dashboard-fixtures.ts`.

**Backend suites.** `dashboard-kpi.spec.ts` (5 cases) and `dashboard-attention.spec.ts` (7 cases) are green against the isolated `nexuserp_test` schema. Both suites caught and confirmed three real defects, now fixed: the KPI summary's low-stock query interpolated `Prisma.raw(...)` into a plain template literal (a 500 on every KPI request); the purchase-order multi-status transform threw a bare `Error` (a 500 instead of a validation 400 for an unknown status); and `/auth/me` carried `membership.name` while the session store dropped it (the greeting never used the display name).

**Overdue figures.** An overdue invoice cannot be manufactured inside a suite: the invoice-immutability trigger allows `due_date` changes only on drafts, and the issue operation refuses a due date before the issue date. The suites therefore assert the honest empty selection (KPI overdue `0`, overdue-only list empty) plus a nonzero equality on the unfiltered outstanding figure.

**T021 (partial).** Quick actions are gated on the real write permissions held in `/auth/me` (all six covered by tests). The module-availability half of FR-010 is **blocked**: the backend has no module table or `/modules` endpoint - module toggles remain the demonstration's own state, and wiring the live dashboard to the sample service would break the sample-isolation rules. Recording it here rather than faking it.

**T029 (measured).** Full Administrator: **8** first-batch requests, **13** settled (recorded separately, never described as 8). Sales-reader: 1/1 (only the confirmed-sales-orders list). Invoices-reader: 1/1 (only the overdue-invoices list). Products-reader: 0/1 (only its one readable checklist count; the welcome screen renders). All requests were permission-gated, so none returned 403.

**T033.** The dev stack boots cleanly: the SPA loads, the session probe gets the honest 401 while signed out, and the app redirects to `/login` with no console errors. The signed-in quickstart walk-through needs the reviewer's own account credentials and was not simulated.

**T034.** SC-014's 80% thresholds remain enforced by `backend/jest.config.ts` on the four named critical paths; the full coverage run is left to CI rather than re-running every hosted integration suite in this change.
