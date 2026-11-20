# Tasks: Performance Measurement and Optimization End to End

**Input**: Design documents from `specs/019-performance-measurement-optimization/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/instrumentation.md`, `contracts/budgets.md`, `quickstart.md`

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Backend tests run against real PostgreSQL in the isolated `nexuserp_test` schema with the same API-role grants as `public`; no mocked persistence substitutes for critical-path tests. Performance budgets are deterministic (query counts, bytes) and never time-based.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps to the user story in `spec.md` (US1–US5)
- Every task names the exact file or command it touches

## Path Conventions

- Backend: `backend/src/`, `backend/test/`
- Frontend: `frontend/src/`, `frontend/scripts/`
- Shared contracts: `shared/src/`
- Database: `database/prisma/`
- Repository scripts: `scripts/`
- Docs: `docs/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared vocabulary, instrumentation types and baselines all stories consume.

- [ ] T001 Confirm `.specify/feature.json` selects `specs/019-performance-measurement-optimization`, confirm `AGENTS.md` points at its plan, and record baseline public row counts with `node scripts/snapshot-public-counts.mjs` (FR-026)
- [ ] T002 [P] Add `PERF_INSTRUMENTATION` env handling and a `PerformanceContext` type (`queryCount`, `dbTimeMs`, `startedAt`) to `backend/src/common/logging/request-context.ts` (FR-001)
- [ ] T003 [P] Create `backend/src/platform/observability/` module with an interceptor and a Prisma `$extends` query hook that increments the per-request counter/timer in `AsyncLocalStorage`; export from `PlatformModule` (FR-001)
- [X] T004 [P] Create `scripts/measure-network-floor.mjs` that runs `SELECT 1` 100 times against the configured database and reports median and p95 round-trip time (FR-002)
- [X] T005 [P] Create `scripts/generate-perf-dataset.mjs` that deterministically seeds the isolated test schema with at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders and 5,000 payments, with safety checks aborting unless the target is `nexuserp_test` (FR-028)
- [X] T006 [P] Add `@nestjs/swagger`/decorator wiring and a `scripts/check-bundle-budget.mjs` skeleton that reads `dist/assets/*.js` sizes and fails when a route exceeds its budget (FR-015)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The generated dataset, instrumentation and pool warm-up that every story measures against.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

### Tests for the Foundation (write first, observe failure)

- [X] T007 [P] Add a failing unit test in `backend/src/platform/observability/__tests__/instrumentation.spec.ts` proving the interceptor emits `Server-Timing` with `db` and `app` durations, `X-Query-Count` in development, and that query text is masked (no secrets/passwords/personal data) (FR-001)
- [ ] T008 [P] Add a failing integration test in `backend/test/integration/perf-context.spec.ts` proving every authenticated request needs at most 2 context queries (target 1) before its own work, and that a deactivation, role change, module disable and session end take effect on the next request (FR-006, FR-007, FR-019, FR-029)

### Implementation

- [X] T009 Implement the instrumentation interceptor + Prisma extension in `backend/src/platform/observability/`, register it globally in `AppModule` as an `APP_INTERCEPTOR` behind `NODE_ENV !== 'production'` or `PERF_INSTRUMENTATION=1` (FR-001)
- [X] T010 Implement the per-request context loader (one round trip for session, membership, roles, effective permissions, module state, organization settings) in `backend/src/common/logging/request-context.ts` and `backend/src/modules/auth/auth.service.ts`, memoised on the request context for the lifetime of the request only (FR-006, FR-007, FR-019)
- [ ] T011 Wire the generator into the integration test setup (`pretest:integration` runs it) and confirm it runs only against the isolated schema; add a guard refusing `public`/production targets (FR-028)
- [ ] T012 Add `backend/test/integration/perf-budget.spec.ts` skeleton (test file + per-endpoint budget constants placeholder) wired into `test:integration`; thresholds are filled after the US1 baseline (FR-015, FR-021, FR-025)

**Checkpoint**: Instrumentation, context loader, generator and query budgets are in place; measurement can begin.

---

## Phase 3: User Story 1 - Measure before optimising (Priority: P1)

**Goal**: Produce `docs/performance-baseline.md` with the network floor, per-endpoint and per-screen measurements, and a ranked list of the biggest costs — before any fix.

**Independent Test**: Run the measurement suite against the isolated schema with the generated dataset and confirm `docs/performance-baseline.md` exists with median and p95 latency, queries per request and payload size at concurrency 1 and 8 for every endpoint, the network floor reported separately, the interface baseline per screen, and a ranked list of the biggest costs with evidence. Confirm no endpoint's contract, permissions, tenant isolation, idempotency, rollback, append-only guard or invariant changes.

### Tests for User Story 1 (MANDATORY — write first, observe failure) ⚠️

- [ ] T013 [P] [US1] Add `scripts/measure-network-floor.mjs` test in `scripts/__tests__/measure-network-floor.spec.mjs` asserting it reports median and p95 and refuses non-test schemas (FR-002)
- [ ] T014 [P] [US1] Add `scripts/__tests__/generate-perf-dataset.spec.mjs` asserting the generator aborts on `public`/production targets and produces the required row counts in the isolated schema (FR-028)

### Implementation for User Story 1

- [X] T015 [US1] Implement `scripts/measure-network-floor.mjs` (100 `SELECT 1` round trips, median + p95, never prints DATABASE_URL) (FR-002)
- [X] T016 [US1] Implement `scripts/generate-perf-dataset.mjs` (deterministic seed, batch inserts, safety guard) (FR-028)
- [ ] T017 [US1] Implement the measurement harness (`backend/test/integration/perf-baseline.spec.ts`) that records, for every endpoint, median and p95 latency, queries per request and payload size at concurrency 1 and 8, plus login/registration separately (FR-003)
- [ ] T018 [US1] Implement the interface baseline harness (`frontend/e2e/perf-baseline.spec.ts` or a Vitest script) recording requests per page, sequential-vs-parallel requests, bundle size per route and time-to-usable on a throttled profile (FR-004)
- [ ] T019 [US1] Run the baseline and write `docs/performance-baseline.md` with the network floor, per-endpoint and per-screen measurements, and a ranked list of the biggest costs with evidence (FR-003, FR-004, FR-005)

**Checkpoint**: The baseline is committed evidence; no fix has been applied yet.

---

## Phase 4: User Story 2 - Optimize per-request overhead (Priority: P1)

**Goal**: Load the per-request context in one round trip and memoise within the request only, with a test proving immediate invalidation.

**Independent Test**: A test shows a deactivated member, a changed role, a disabled module and an ended session take effect on the very next request, and each authenticated request needs at most 2 context queries (target 1) before its own work. Before and after numbers are recorded per endpoint.

### Tests for User Story 2 (MANDATORY — write first, observe failure) ⚠️

- [ ] T020 [P] [US2] Add `backend/test/integration/perf-context-invalidation.spec.ts` proving a deactivation, role change, module disable and session end take effect on the next request (FR-007, FR-029)
- [ ] T021 [P] [US2] Add `backend/test/integration/perf-context-count.spec.ts` asserting the context loader uses at most 2 queries (target 1) per authenticated request (FR-006, FR-019)

### Implementation for User Story 2

- [ ] T022 [US2] Refactor `AuthService.me()` and `AccessControlService.getEffectivePermissions()` to load session, membership, roles, permissions, module state and organization settings in one round trip, memoised on the request context (FR-006, FR-019)
- [ ] T023 [US2] Update `ModuleStateService` and `OrganizationLockService` to reuse the per-request memoised state (no second DB read) (FR-006)
- [ ] T024 [US2] Run the per-request overhead measurement and record before/after in `docs/performance-after.md` (FR-016)

**Checkpoint**: Per-request context is 1 round trip; authorization still takes effect on the next request.

---

## Phase 5: User Story 3 - Optimize queries, indexes and transactions (Priority: P1)

**Goal**: List and report screens finish quickly on the large dataset, with indexes justified by `EXPLAIN` and a pool that does not serialise the dashboard.

**Independent Test**: Re-run the baseline and record before/after for every changed endpoint. The 10 slowest endpoints each show a measured improvement or a written reason. List endpoints use at most 3 queries. The p95 of every list and report endpoint is reported, including misses. The dashboard's 8 parallel requests are not serialised by the pool at the recommended size.

### Tests for User Story 3 (MANDATORY — write first, observe failure) ⚠️

- [ ] T025 [P] [US3] Add `backend/test/integration/perf-list-budget.spec.ts` asserting every list endpoint uses at most 3 queries and no N+1 pattern (FR-008, FR-021, FR-023)
- [ ] T026 [P] [US3] Add `backend/test/integration/perf-pool.spec.ts` measuring p95 at concurrency 8 across pool sizes and asserting the dashboard's 8 requests are not serialised at the recommended size (FR-010, FR-022, FR-016)
- [ ] T027 [P] [US3] Add `backend/test/integration/perf-indexes.spec.ts` asserting each new index improves its target query's plan (no seq scan on the filtered column) (FR-009)

### Implementation for User Story 3

- [ ] T028 [US3] Parallelise independent queries in `PurchasingService`, `SalesService`, `InvoicingService`, `InventoryService`, `ReportsService` and `ContactsService` (replace sequential awaits with `Promise.all`) (FR-008)
- [ ] T029 [US3] Replace N+1 patterns with set-based queries and add Prisma `select` for the needed columns only (FR-008)
- [ ] T030 [US3] Replace multi-query list-plus-count and report aggregations with one or two set-based queries with totals consistent in one snapshot (FR-008)
- [ ] T031 [US3] Run `EXPLAIN (ANALYZE, BUFFERS)` on the slowest queries and create `database/prisma/migrations/20261120000001_performance_indexes/migration.sql` with the justified indexes (composite, organization first) and `CREATE EXTENSION IF NOT EXISTS pg_trgm` with trigram indexes for substring searches; drop no existing index without proof (FR-009)
- [ ] T032 [US3] Batch line and movement inserts in `PurchasingService`, `SalesService`, `InvoicingService` and `InventoryService` using `createMany`; keep audit and idempotency writes inside their transaction; keep lock order unchanged (FR-011)
- [X] T033 [US3] Add pool warm-up at startup (`SELECT 1` in `PlatformModule.OnModuleInit`) and document the recommended `connection_limit` value in `docs/performance-after.md` (FR-010)
- [ ] T034 [US3] Run the query/index/pool measurements and record before/after in `docs/performance-after.md` (FR-016, FR-020, FR-023)

**Checkpoint**: List and report endpoints improve or carry a written reason; indexes justified by plans; pool measured.

---

## Phase 6: User Story 4 - Optimize HTTP and the interface (Priority: P1)

**Goal**: Screens become usable quickly and feel responsive, with compression, conditional requests, debounce, lazy-loading and cheap logging.

**Independent Test**: The interface baseline and the after measurement are recorded side by side: requests per page, sequential-vs-parallel requests, bundle size per route, and time-to-usable on a throttled profile. Hashed assets are cacheable. The query-count and bundle-size budgets pass in CI.

### Tests for User Story 4 (MANDATORY — write first, observe failure) ⚠️

- [ ] T035 [P] [US4] Add `frontend/scripts/__tests__/bundle-budget.spec.ts` asserting the bundle-size budget check fails when a route exceeds its budget and passes on the clean tree (FR-015, FR-025)
- [ ] T036 [P] [US4] Add `backend/test/integration/perf-logging.spec.ts` measuring the request logger and secret scrubbing cost per request and failing if it exceeds a small budget (FR-013)

### Implementation for User Story 4

- [ ] T037 [US4] Enable response compression for JSON in `backend/src/main.ts` (or `AppModule`), add `ETag` + `If-None-Match` handling for stable reference data (organization, roles, permissions, units, categories, warehouses) scoped by organization and version columns, set `Cache-Control: private, no-store` on personal data, and declare a maximum payload size per endpoint (FR-012)
- [ ] T038 [US4] Confirm the request logger and secret scrubbing are cheap; fix the cost if the baseline shows otherwise without weakening redaction (FR-013)
- [ ] T039 [US4] Debounce search inputs and cancel superseded requests in `frontend/src/features/*/` list pages using TanStack Query's `signal`/`abort`; keep previous data while paging (`keepPreviousData`) (FR-014)
- [ ] T040 [US4] Set sensible `staleTime` (5 min) for reference data and disable `refetchOnWindowFocus` for heavy lists in `frontend/src/services/*-client.ts` and `use-*` hooks (FR-014)
- [ ] T041 [US4] Request independent data in parallel and remove waterfalls and duplicate requests in `frontend/src/features/overview/dashboard-page.tsx` and `frontend/src/features/reports/reports-page.tsx` (FR-014)
- [ ] T042 [US4] Lazy-load every route with `React.lazy` + `Suspense` in `frontend/src/app/router.tsx` and dynamically import the chart library (`recharts`) in `frontend/src/features/reports/*` and `frontend/src/features/overview/*` (FR-014)
- [ ] T043 [US4] Verify hashed assets are cacheable and add the cache headers in the hosting config (Vercel/Render); record the configuration (FR-014)
- [ ] T044 [US4] Run the interface measurement and record before/after in `docs/performance-after.md` (FR-016, FR-014)

**Checkpoint**: Screens become usable quickly; bundle ships the least code first.

---

## Phase 7: User Story 5 - Protect the gains (Priority: P1)

**Goal**: Query-count and bundle-size budgets in CI, the after report committed, and an honest "where the remaining time goes" section.

**Independent Test**: Every endpoint declares its maximum number of queries and every route declares its maximum bundle size; the CI check fails when either is exceeded. `docs/performance-baseline.md` and `docs/performance-after.md` are committed with before/after for every changed endpoint and screen, including non-improvements and their reasons, plus a "Where the remaining time goes" section naming the network floor, hosting regions, cold starts and the frontend rewrite hop as recommendations.

### Tests for User Story 5 (MANDATORY — write first, observe failure) ⚠️

- [X] T045 [P] [US5] Add `frontend/scripts/check-bundle-budget.mjs` (per-route bundle-size budget) with a failing fixture in `frontend/scripts/__tests__/bundle-budget.spec.ts` (FR-015, FR-025)
- [X] T046 [P] [US5] Wire the query-count budget test into CI (`.github/workflows/ci.yml`) and the bundle-size check into the frontend `build` script and `npm run check:guards` (FR-015, FR-025, FR-018)

### Implementation for User Story 5

- [X] T047 [US5] Wire the query-count budget test (`backend/test/integration/perf-budget.spec.ts`) into `npm run test:integration` and CI (FR-015, FR-025)
- [ ] T051 [US5] Fill the per-endpoint query-count thresholds in `perf-budget.spec.ts` from the baseline numbers (context ≤ 2, list ≤ 3, detail ≤ 2, reports ≤ 3); fail when exceeded (FR-015, FR-021, FR-025)
- [ ] T048 [US5] Re-run the baseline and write `docs/performance-after.md` with before/after for every changed endpoint and screen, including non-improvements and their reasons (FR-016, FR-019, FR-020, FR-023)
- [ ] T049 [US5] Add the "Where the remaining time goes" section to `docs/performance-after.md` (network floor, hosting regions, cold starts, frontend rewrite hop) as recommendations, not changes (FR-017)
- [ ] T050 [US5] Run the full gate set: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run verify:invariants:test`, `npm run verify:invariants`, `npm run openapi:diff`, `npm run build`, `npm run check:guards`, plus the query-count and bundle-size budgets; confirm public row counts unchanged (FR-018, FR-026, SC-011, SC-012)

**Checkpoint**: The gains are protected by CI budgets; the before/after report is committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks every user story.
- **US1 (Phase 3)**: depends on Foundational; delivers the baseline evidence.
- **US2 (Phase 4)**: depends on Foundational; integrates with US1's instrumentation.
- **US3 (Phase 5)**: depends on Foundational and US1 (baseline identifies the slowest queries); integrates with US2.
- **US4 (Phase 6)**: depends on Foundational; integrates with US1's interface baseline.
- **US5 (Phase 7)**: depends on US1–US4 (needs the before/after numbers).

### Within Each Story

- Tests first; observe them failing before implementation.
- Instrumentation → measurement → optimisation → budget → report.
- A story is complete only when its independent test passes and no earlier story regressed.

### Parallel Opportunities

- Setup: T002/T003/T004/T005/T006.
- Foundational tests: T007/T008.
- US1 tests: T013/T014; US3 tests: T025/T026/T027; US4 tests: T035/T036; US5 tests: T045/T046.
- Backend and frontend work within a story can proceed in parallel once the contract is fixed.
- US2, US3 and US4 can be staffed in parallel after Foundational, respecting US3's dependency on US1's baseline.

---

## Parallel Example: User Story 3

```text
Task: "Add backend/test/integration/perf-list-budget.spec.ts ..."
Task: "Add backend/test/integration/perf-pool.spec.ts ..."
Task: "Add backend/test/integration/perf-indexes.spec.ts ..."
```

## Parallel Example: User Story 1

```text
Task: "Add scripts/__tests__/measure-network-floor.spec.mjs ..."
Task: "Add scripts/__tests__/generate-perf-dataset.spec.mjs ..."
```

---

## Implementation Strategy

### MVP First (Setup + Foundation + US1)

1. Complete Setup and Foundational phases.
2. Complete US1 and publish `docs/performance-baseline.md` with the ranked list of biggest costs.
3. Stop and review the baseline before any optimisation is applied.

### Incremental Delivery

1. Setup + Foundational → instrumentation, context loader, generator and budgets ready.
2. US1 → baseline evidence (no code changes yet).
3. US2 → per-request overhead (1 round trip).
4. US3 → queries, indexes, transactions.
5. US4 → HTTP and interface.
6. US5 → budgets in CI, after report, remaining-time attribution.

---

## Requirement Coverage Map

| Requirement | Tasks |
|-------------|-------|
| FR-001 (instrumentation) | T002, T003, T007, T009 |
| FR-002 (network floor) | T004, T013, T015, T019 |
| FR-003 (endpoint baseline) | T005, T011, T016, T017, T019 |
| FR-004 (interface baseline) | T018, T019 |
| FR-005 (ranked costs) | T019 |
| FR-006 (one round trip) | T008, T010, T021, T022, T023 |
| FR-007 (authorization next request) | T008, T020, T022 |
| FR-008 (parallel queries, N+1, set-based) | T025, T028, T029, T030 |
| FR-009 (indexes, trigram) | T027, T031 |
| FR-010 (pool, warm-up) | T009, T026, T033 |
| FR-011 (transactions, batching) | T032 |
| FR-012 (HTTP compression, ETag, cache-control, payload size) | T037 |
| FR-013 (logging cost) | T036, T038 |
| FR-014 (interface debounce, lazy-load, bundle) | T035, T039, T040, T041, T042, T043, T044 |
| FR-015 (query-count + bundle budgets) | T006, T012, T045, T046, T047 |
| FR-016 (committed reports) | T019, T034, T044, T048 |
| FR-017 (remaining time) | T049 |
| FR-018 (no test weakened) | T050 |
| FR-019 (≤2 context queries) | T008, T010, T021, T022 |
| FR-020 (10 slowest improve) | T028, T029, T030, T031, T034 |
| FR-021 (list ≤3 queries) | T025, T028, T029, T030 |
| FR-022 (pool not serialised) | T026, T033 |
| FR-023 (p95 reported incl. misses) | T017, T034 |
| FR-024 (password params unchanged) | T017, plan.md (constraint) |
| FR-025 (budgets in CI) | T012, T046, T047 |
| FR-026 (isolated schema, public counts) | T001, T050 |
| FR-027 (authorization next request) | T008, T020, T022 |
| FR-028 (generator script) | T005, T011, T014, T016 |

---

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- Backend integration tests always use the isolated schema; never point a test at `public`.
- No new dependencies and no raw colour values; every new class uses existing design tokens.
- Migrations are immutable once merged; the new migration is created once in T031.
- Commit only when explicitly instructed.
- The "Where the remaining time goes" items (hosting regions, cold starts, frontend rewrite hop) are recommendations, not changes.
