# Feature Specification: Performance Measurement and Optimization End to End

**Feature Branch**: `main` (active feature selected by `.specify/feature.json` → `specs/019-performance-measurement-optimization`; work integrates into `main` per the constitution)
**Created**: 2026-11-20
**Status**: Draft
**MoSCoW Priority**: P1 (performance and observability of the already-shipped P0 surface)
**Input**: User description: "Make the whole application faster, measured, without changing behaviour: reduce the latency of every API request and the time every screen takes to become usable. Backend and interface. This is measurement-driven: nothing is changed on a guess, and every change must show a before and after number."

This feature makes the product measurably faster without changing what it does. Behaviour, security, data integrity, contracts, permissions, tenant isolation, audit entries, idempotency, append-only guards, RLS, exact decimal arithmetic and every existing test, guard and invariant are preserved unchanged. No cache of authorization decisions is introduced; speed comes from fewer round trips per request, parallel queries, set-based aggregations, better indexes, connection pooling and lighter bundles — and every gain is protected by a query-count and bundle-size budget so it cannot silently regress.

## Clarifications

### Session 2026-11-20
- Q: Is password hashing cost allowed to be lowered to speed up sign-in? → A: No — the cost parameters stay unchanged; sign-in is reported separately so its cost is visible but not reduced.
- Q: Should the performance dataset generator be delivered as part of this feature? → A: Yes (Option A) — deliver a reusable, deterministic generator script that produces at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders and 5,000 payments inside the isolated test schema, with valid relationships and realistic distributions, efficient batch inserts, compatibility with the Prisma schema and business constraints, and safety checks that abort unless the target is positively identified as the isolated test schema (never public, production or unidentified; never print DATABASE_URL or credentials). Reuse the same generated dataset for the baseline and the query-count/performance tests. (FR-028)
- Q: May authorization be cached to speed up requests? → A: No — a deactivated member, changed role, disabled module or ended session must take effect on the very next request. Optimisation is by fewer round trips, not by remembering decisions. Any cache must be keyed by organization and justified with an immediate-invalidation test; the default is no cache.
- Q: May the hosted database be used for measurement? → A: No — measurement uses generated data in the isolated test schema only; the hosted database is never read, modified or run against except through the application and its tests. DATABASE_URL and passwords are never printed.
- Q: Which build is measured? → A: The production-like build only (`nest build` then `node dist/main.js`, `NODE_ENV=production`, the built frontend). Watch mode and `tsx` are never used for measurement.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Measure before optimising (Priority: P1)

As an engineer, I want the application instrumented and baselined on a realistic dataset before any change, so that every optimisation is chosen and justified by evidence rather than by guess, and so a later change can be compared against a recorded starting point.

**Why this priority**: Without a baseline, "faster" cannot be proven and regressions cannot be seen. Measurement is the precondition for every later story.

**Independent Test**: Run the measurement suite against the isolated schema with the generated dataset and confirm `docs/performance-baseline.md` exists with, for every endpoint, median and p95 latency, queries per request, payload size, at concurrency 1 and 8, plus the network floor, the interface baseline per screen, and a ranked list of the biggest costs with evidence. Confirm that no endpoint's contract, permissions, tenant isolation, idempotency, rollback, append-only guard or invariant changes.

**Acceptance Scenarios**:
1. **Given** the generated dataset, **When** instrumentation is enabled in a development or test run, **Then** every request reports its database query count, total database time, time outside the database and a `Server-Timing` header with those figures, and every query is logged with parameters masked and its duration.
2. **Given** a trivial `SELECT 1`, **When** it is measured, **Then** its round-trip time is reported separately from application time and every endpoint is reported as `queries × round-trip floor + everything else`.
3. **Given** the generated dataset, **When** every endpoint is baselined, **Then** median and p95 latency, queries per request and payload size are recorded at concurrency 1 and 8, and login and registration are reported separately with their password-hashing cost unchanged.
4. **Given** the built frontend, **When** each screen is measured, **Then** requests per page, sequential-vs-parallel requests, bundle size per route and time-to-usable on a throttled profile are recorded.
5. **Given** the baseline, **When** it is reviewed, **Then** a ranked list of the biggest costs with the evidence is published before any fix is applied.

### User Story 2 - Optimize per-request overhead (Priority: P1)

As a member, I want each request to do the smallest amount of database work needed to know who I am and what I may do, so that every endpoint — not just the slow ones — gets faster.

**Why this priority**: The session, membership, roles, effective permissions, module state and organization settings are loaded on essentially every request; doing it in several sequential round trips is the largest avoidable cost shared by all endpoints.

**Independent Test**: A test shows that a deactivated member, a changed role, a disabled module and an ended session take effect on the very next request, and that each authenticated request needs at most 2 context queries (target 1) before its own work. Before and after numbers are recorded per endpoint.

**Acceptance Scenarios**:
1. **Given** a request, **When** it is handled, **Then** the session, membership, roles, effective permissions, module state and organization settings are loaded in one round trip rather than several in sequence.
2. **Given** repeated lookups of the same identity data within one request, **When** they occur, **Then** they are served from a memoised per-request cache, not from the database.
3. **Given** a deactivated member, a changed role, a disabled module or an ended session, **When** the next request arrives, **Then** the change takes effect on that request (no stale authorization across requests).

### User Story 3 - Optimize queries, indexes and transactions (Priority: P1)

As a member, I want list and report screens to finish quickly on a large dataset, so that the product stays responsive as the organization's data grows.

**Why this priority**: List and report endpoints are the ones the pilot's daily work depends on, and they are the ones the 500 ms target applies to.

**Independent Test**: Re-run the baseline and record before/after for every changed endpoint. The 10 slowest endpoints in the baseline each show a measured improvement or a written reason. List endpoints use at most 3 queries. The p95 of every list and report endpoint on the generated dataset is reported, including any that miss the 500 ms target.

**Acceptance Scenarios**:
1. **Given** independent queries in one request, **When** they run, **Then** they run in parallel rather than in sequence.
2. **Given** a list endpoint, **When** it is executed, **Then** it uses no N+1 pattern, selects only the columns it needs, and combines its list-plus-count into at most 2 set-based queries whose totals agree in one snapshot.
3. **Given** a slow query plan, **When** `EXPLAIN (ANALYZE, BUFFERS)` is run in the isolated schema, **Then** any added index is composite with organization first, matches the filters and sorts, and no existing index is dropped without proof it is unused. Substring searches (SKU, names, emails) use a trigram index whose extension is created safely and conditionally in the migration.
4. **Given** the dashboard's 8 parallel requests, **When** they run at the recommended pool size, **Then** they are not serialised by the pool (measured).
5. **Given** transactions, **When** they run, **Then** they are as short as possible with the lock order unchanged, line and movement inserts are batched, and audit and idempotency writes stay inside their transaction.

### User Story 4 - Optimize HTTP and the interface (Priority: P1)

As a member, I want screens to become usable quickly and feel responsive while I work, so that the product is fast to use, not just fast to query.

**Why this priority**: A fast API that ships a large bundle or waits on sequential client requests still feels slow. HTTP and bundle work is the interface half of the same outcome.

**Independent Test**: The interface baseline and the after measurement are recorded side by side: requests per page, sequential-vs-parallel requests, bundle size per route, and time-to-usable on a throttled profile. Hashed assets are cacheable. The query-count and bundle-size budgets pass in CI.

**Acceptance Scenarios**:
1. **Given** JSON responses, **When** they are served, **Then** they are compressed, and stable reference data (organization, roles, permissions, units, categories, warehouses) carries `ETag` and supports conditional requests scoped by organization and its version columns, with `Cache-Control: private, no-store` on everything personal, and a maximum payload size per endpoint.
2. **Given** search inputs, **When** the user types, **Then** the input is debounced, superseded requests are cancelled, and previous data is kept while paging.
3. **Given** reference data, **When** it is fetched, **Then** it uses sensible stale times and is not refetched on window focus for heavy lists.
4. **Given** independent data on a screen, **When** it loads, **Then** it is requested in parallel with no waterfall, and duplicate requests are removed.
5. **Given** the first screen, **When** it loads, **Then** the chart library and every route are lazy-loaded so the least code ships first, and hashed assets are cacheable.
6. **Given** the request logger and secret scrubbing, **When** the baseline is measured, **Then** their per-request cost is small, or it is fixed without weakening redaction.

### User Story 5 - Protect the gains (Priority: P1)

As an engineer, I want query-count and bundle-size budgets in CI, and a before/after report committed, so that the performance work cannot silently regress and the remaining time is honestly attributed.

**Why this priority**: Measurement that is not protected is lost. The budgets and the report are what make the work durable.

**Independent Test**: Every endpoint declares its maximum number of queries and every route declares its maximum bundle size; the CI check fails when either is exceeded. `docs/performance-baseline.md` and `docs/performance-after.md` are committed with before/after for every changed endpoint and screen, including items that did not improve and why, plus a "Where the remaining time goes" section naming the network floor, hosting regions, cold starts and the frontend rewrite hop as recommendations.

**Acceptance Scenarios**:
1. **Given** an endpoint, **When** its query count exceeds its declared budget, **Then** the test fails and CI blocks.
2. **Given** a route, **When** its bundle size exceeds its budget, **Then** the build check fails.
3. **Given** the after measurement, **When** it is compared with the baseline, **Then** every changed endpoint and screen shows before and after, including non-improvements and their reasons.
4. **Given** the "Where the remaining time goes" section, **When** it is read, **Then** it names the network floor to the hosted database, the hosting regions, cold starts on a free API instance and the frontend rewrite hop as recommendations rather than changes.

### Edge Cases
- A request that fails partway through: instrumentation still records the queries that ran and the duration up to the failure, without leaking secrets, passwords or personal data.
- Concurrency 8 with the dashboard's 8 simultaneous requests: the pool must not serialize them; the measurement must show the difference between pool sizes.
- A cold start after boot or idle: connection warm-up must remove connection-setup time from the first request's measurement.
- A disabled or unavailable module: its endpoints return `MODULE_DISABLED` and are not measured as slow code.
- A list with zero rows: still runs its full query path so the budget counts it.
- The generated dataset is large (2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders, 5,000 payments): baselines use it; results are reported on it, not on the tiny seed data.
- Password hashing is slow by design: sign-in and registration are reported separately and their parameters are never lowered.
- Authorization is never cached across requests: even a warm pool or a memoised per-request cache does not carry a decision into the next request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST expose instrumentation, enabled in development and tests and off or cheap in production, reporting per request the number of database queries, total database time, time outside the database and a `Server-Timing` header with those figures, and per query the masked query text and its duration. Secrets, passwords and personal data MUST never be logged.
- **FR-002**: The network floor (round-trip time of a trivial `SELECT 1`) MUST be measured and reported separately from application time, and every endpoint MUST be reported as `queries × round-trip floor + everything else`.
- **FR-003**: Every endpoint MUST be baselined in the isolated schema on the generated dataset (at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders, 5,000 payments), recording median and p95 latency, queries per request and payload size, at concurrency 1 and 8. Login and registration MUST be reported separately and their password-hashing parameters MUST NOT be lowered.
- **FR-004**: Every screen MUST be baselined for requests per page, sequential-vs-parallel requests, bundle size per route and time-to-usable on a throttled profile.
- **FR-005**: A ranked list of the biggest costs with evidence MUST be produced before any fix is applied.
- **FR-006**: The session, membership, roles, effective permissions, module state and organization settings MUST be loaded in one round trip per request rather than several in sequence, with memoisation inside the single request only.
- **FR-007**: Authorization MUST take effect on the very next request after a deactivation, role change, module disable or session end. Optimisation MUST come from fewer round trips, not from remembering decisions. Any cache MUST be keyed by organization and justified with a test showing immediate invalidation; the default is no cache.
- **FR-008**: Independent queries within a request MUST run in parallel; N+1 patterns MUST be removed; queries MUST select only the columns needed; multi-query list-plus-count and report aggregations MUST be replaced with one or two set-based queries with totals consistent in one snapshot.
- **FR-009**: Indexes MUST be added only where `EXPLAIN (ANALYZE, BUFFERS)` on the slowest queries justifies them, in new migrations, composite with organization first and matching the filters and sorts. Substring searches (SKU, names, emails) MUST use a trigram index with the extension created safely and conditionally. No existing index may be dropped without proof it is unused.
- **FR-010**: The connection pool size MUST be measured at concurrency 8 across several values and the best value that stays well below the hosted pooler's limit MUST be recommended, with pool warm-up at startup so the first request after boot or idle pays no connection-setup time.
- **FR-011**: Transactions MUST stay as short as possible with the lock order unchanged; line and movement inserts MUST be batched; audit and idempotency writes MUST stay inside their transaction.
- **FR-012**: JSON responses MUST be compressed; stable reference data (organization, roles, permissions, units, categories, warehouses) MUST carry `ETag` and support conditional requests scoped by organization and its version columns; `Cache-Control` MUST be `private` and `no-store` for everything personal; a maximum payload size per endpoint MUST be declared. No new dependency is added unless a measurement justifies it and its licence is recorded.
- **FR-013**: The request logger and secret scrubbing MUST be confirmed cheap per request, and fixed if the baseline shows otherwise, without weakening redaction.
- **FR-014**: Search inputs MUST be debounced and superseded requests cancelled; previous data MUST be kept while paging; reference data MUST use sensible stale times and MUST NOT refetch on window focus for heavy lists; independent data MUST be requested in parallel with no waterfalls; duplicate requests MUST be removed; the chart library and every route MUST be lazy-loaded so the first screen ships the least code; hashed assets MUST be cacheable.
- **FR-015**: A query-count budget test per endpoint (deterministic, isolated schema, never time-based) MUST declare the maximum number of queries and fail when exceeded, and MUST be wired into CI. A bundle-size budget check per route MUST be wired into CI.
- **FR-016**: The baseline and the after measurement MUST be committed side by side (`docs/performance-baseline.md` and `docs/performance-after.md`), with before and after for every changed endpoint and screen, including non-improvements and their reasons.
- **FR-017**: A "Where the remaining time goes" section MUST name the network floor to the hosted database, the hosting regions, cold starts on a free API instance and the extra hop of the frontend rewrite as recommendations, not as changes.
- **FR-018**: No contract, permission, tenant-isolation, idempotency, rollback, append-only or invariant test may be removed, skipped or weakened; the contract-drift check and every existing guard must pass.
- **FR-019**: Every authenticated request MUST need at most 2 queries for its context (target 1) before its own work.
- **FR-020**: The 10 slowest endpoints in the baseline MUST each show a measured improvement or a written reason.
- **FR-021**: List endpoints MUST use at most 3 queries.
- **FR-022**: The dashboard's 8 parallel requests MUST NOT be serialised by the pool at the recommended size (measured).
- **FR-023**: The measured p95 of every list and report endpoint on the generated dataset MUST be reported, including any that miss 500 ms of application time at concurrency 1.
- **FR-024**: Password-hashing parameters MUST be unchanged.
- **FR-025**: The query-count and bundle budgets MUST run in CI.
- **FR-026**: Tests MUST run only in the isolated schema and leave the public row counts unchanged.
- **FR-027**: Authorization MUST take effect on the next request in the tests for deactivation, role change, module disable and session end.
- **FR-028**: A deterministic generator script MUST produce the required performance dataset (at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders and 5,000 payments) inside the isolated test schema, with valid relationships and realistic distributions, efficient batch inserts and compatibility with the Prisma schema and business constraints. The script MUST verify the target is the isolated test schema and abort otherwise; it MUST never modify or truncate production or public data and MUST never print DATABASE_URL or credentials. The same generated dataset MUST be reused for the baseline and the query-count and performance tests.

### Key Entities *(include if feature involves data)*

- **Performance baseline report** (`docs/performance-baseline.md`): per endpoint median and p95 latency, queries per request, payload size, at concurrency 1 and 8, plus the network floor and the interface baseline per screen, plus a ranked list of the biggest costs with evidence.
- **Performance after report** (`docs/performance-after.md`): the same measurements after the changes, with before and after for every changed endpoint and screen, including non-improvements and their reasons, plus the "Where the remaining time goes" section.
- **Query-count budget**: a per-endpoint declared maximum number of database queries, enforced by an automated test in CI.
- **Bundle-size budget**: a per-route declared maximum bundle size, enforced by an automated check in CI.
- **Generated dataset**: at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders and 5,000 payments, used for all measurement.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** No new tables gain or lose `organization_id`; tenant scope still resolves from the server-side session and a verified active membership; a client-supplied organization identifier is still ignored; cross-tenant reads still return 404. Any new index is composite with organization first. No test that proves isolation is removed or weakened.
- **II. Server-enforced authority:** Every endpoint still declares its required permission in a decorator; authorization stays default deny; module availability is still enforced server-side with `MODULE_DISABLED`; all inputs are still validated server-side. No authorization decision is cached across requests; per-request memoisation only, keyed by organization, with an immediate-invalidation test.
- **III. Transactional integrity:** Multi-record operations still run in a single PostgreSQL transaction; idempotency, append-only guards and immutability are unchanged; audit records still commit in the same transaction as the business change and a failed audit still rolls the change back; lock order is unchanged.
- **IV. Exact decimals:** No new monetary or quantity columns; existing column precisions are unchanged; decimals still travel as strings; rounding rules are unchanged. Indexes are on keys and filters, never on decimal values.
- **V. Test-first:** The query-count and bundle-size budgets are written as failing tests before the optimisations that satisfy them; critical-path coverage stays at least 80%; CI still gates on lint, type check, unit tests, PostgreSQL integration tests, migration validation and build verification; no mandatory check is removed or weakened.
- **VI. Module boundaries:** The modular monolith is unchanged; each module still exposes explicit service interfaces and never reads another module's tables directly; no circular dependency is introduced; no new infrastructure dependency is added without a measured requirement, a recorded decision and an amendment to this constitution.
- **VII. Honest boundaries:** No tax-compliance, e-invoicing or accounting claim is added; invoice labelling and limitations are unchanged.
- **VIII. Design system and accessibility:** The design system tokens and PRD 7.3 UX rules still govern; WCAG 2.1 AA is not regressed; lazy-loading and bundle reduction do not remove any accessible control or its label.
- **IX. Scope discipline:** Classified P1 because it hardens the already-shipped P0 surface without adding new capability. No P3 work is added. Time zone, multiple currencies, branding, locale settings, organization deletion, billing/plans and ownership transfer remain out of scope, as do caching business data in a separate store, changing hosting or regions, a read replica, rewriting the ORM and background job queues.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: No contract, permission, tenant-isolation, idempotency, rollback, append-only or invariant test fails and none was weakened.
- **SC-002**: Authorization takes effect on the next request in the tests for deactivation, role change, module disable and session end.
- **SC-003**: Every authenticated request needs at most 2 queries for its context (target 1) before its own work.
- **SC-004**: The 10 slowest endpoints in the baseline each show a measured improvement or a written reason.
- **SC-005**: List endpoints use at most 3 queries.
- **SC-006**: The dashboard's 8 parallel requests are not serialised by the pool at the recommended size (measured).
- **SC-007**: The measured p95 of every list and report endpoint on the generated dataset is under 500 ms of application time at concurrency 1 (report the real numbers, and the endpoints that miss it).
- **SC-008**: Password-hashing parameters are unchanged.
- **SC-009**: The query-count and bundle budgets run in CI.
- **SC-010**: The baseline and after reports are committed.
- **SC-011**: The contract-drift check and every existing guard pass.
- **SC-012**: Tests run only in the isolated schema and leave the public row counts unchanged.

## Assumptions
- The generated dataset from the Reports feature (at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders, 5,000 payments) is available or will be generated as part of this feature, and is used for all measurement.
- The isolated test schema (`nexuserp_test`) is the only schema measurement touches; the hosted database is never used for measurement.
- The production-like build (`nest build` then `node dist/main.js`, `NODE_ENV=production`, the built frontend) is the only build used for measurement; watch mode and `tsx` are not.
- Password hashing cost parameters are out of scope to change; sign-in and registration are reported separately.
- Caching business data in a separate store (Redis), changing hosting or regions, a read replica, rewriting the ORM, background job queues and lowering any security parameter are out of scope. Hosting and region recommendations are recorded, not implemented.
- Per-request memoisation is allowed; cross-request caching of authorization is not.
- Instrumentation adds at most one integer increment per query in production and emits no per-query log there.
- The interface baseline uses Chrome DevTools "Mid-tier mobile" throttling (4× CPU, Slow 3G).
- Pool sizes tested: 5, 10, 20.
- Reference-data stale time is 5 minutes.
- Maximum payload size is 100 rows (1,000 max).
- Pool serialisation is detected by comparing p95 at pool size 5 vs 20 at concurrency 8.
- The hosted pooler limit is taken as 15–20 (Supabase session pooler).
- New dependency licences are recorded in a "Dependencies" subsection of the plan.
- The "Where the remaining time goes" section names the network floor, hosting regions, cold starts and the frontend rewrite hop as recommendations, not changes.
