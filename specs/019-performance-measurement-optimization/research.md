# Research: Performance Measurement and Optimization End to End

**Feature**: `specs/019-performance-measurement-optimization/spec.md` | **Date**: 2026-11-20

All Technical Context entries were resolved from the repository itself (package manifests, schema, guards, test fixtures, CI workflow, existing service patterns), so no `NEEDS CLARIFICATION` marker remained. The decisions below settle the *how* for the ambiguities the spec leaves to design, grounded in the patterns already used by Features 001–018.

---

## 1. Instrumentation is opt-in and cheap in production

- **Decision**: A NestJS interceptor (`Platform/Observability`) counts queries and DB time per request using a Prisma client extension (`$extends` with `query` hook) that increments a per-request counter and timer stored in `AsyncLocalStorage` (the same mechanism as `RequestContext`). The interceptor emits `Server-Timing: db;dur=..., app;dur=...` and sets `X-Query-Count` in development and tests (`NODE_ENV !== 'production'`); in production the counter is still collected cheaply (a single integer increment per query) but the header and detailed log are gated behind `PERF_INSTRUMENTATION=1`. Per-query logging (masked text + duration) goes to the structured JSON logger at debug level, which is off by default in production. Query text parameters are masked to `[?]` before logging; passwords, tokens and personal data are never included (the extension only sees SQL + bind parameters, which are redacted by key name).
- **Rationale**: One implementation of the rule, one cache read per request, and the cost in production is a single integer increment. The existing `RequestContext` AsyncLocalStorage is reused so no request-scoped DI plumbing is added.
- **Alternatives considered**: (a) a separate APM agent — rejected (new dependency, violates "no new dependency without justification"); (b) Prisma's built-in query events — rejected (no per-request aggregation); (c) always-on detailed logging — rejected (cost in production).

## 2. Network floor is measured, not assumed

- **Decision**: A one-off measurement script (`scripts/measure-network-floor.mjs`) runs `SELECT 1` 100 times against the configured database using a single Prisma client and reports median and p95 round-trip time. The result is recorded in `docs/performance-baseline.md` as "round-trip floor" and every endpoint is reported as `queries × floor + everything else`. The floor is measured, not derived from endpoint latency.
- **Rationale**: Every sequential query pays the floor; confusing it with slow code leads to wrong fixes. Reporting it separately is the user's explicit requirement.
- **Alternatives considered**: (a) deriving the floor from the fastest endpoint — rejected (that endpoint may itself have overhead); (b) ignoring it — rejected (misattributes network distance to code).

## 3. Generated dataset is reproducible and isolated

- **Decision**: A deterministic generator (`scripts/generate-perf-dataset.mjs`) seeds the isolated test schema with at least 2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders and 5,000 payments, using fixed seeds (e.g. a seeded PRNG with a documented seed) and batch inserts inside a single transaction. It verifies the target schema is `nexuserp_test` (abort otherwise) and never prints DATABASE_URL or credentials. The same generated dataset is reused for the baseline and the query-count/performance tests so results are reproducible.
- **Rationale**: Reproducible measurements require reproducible data; batch inserts keep seeding fast; the isolated-schema guard matches the constitution.
- **Alternatives considered**: (a) generating data inside each test — rejected (slow, duplicated); (b) using the hosted database — rejected (constitution forbids).

## 4. Per-request context in one round trip

- **Decision**: A single SQL query (or one Prisma call with `include`) loads session, membership, roles, effective permissions, module state and organization settings together, replacing the current sequence of `membership.findUnique` → `membershipRole.findMany` → `accessControl.getEffectivePermissions` → `organization.findUnique` → `organizationModule.findMany`. The result is memoised on the request context (`AsyncLocalStorage`) for the lifetime of the request so repeated lookups within one request hit the cache; the cache is per-request (a fresh context per request), so a deactivation, role change, module disable or session end takes effect on the next request. Authorization is never cached across requests.
- **Rationale**: This is the user's explicit target ("at most 2 queries, target 1") and matches the existing `ModuleStateService` memoisation pattern. Per-request memoisation is the constitution's allowed exception ("keyed by organization and justified with a test showing immediate invalidation").
- **Alternatives considered**: (a) cross-request caching — rejected (constitution forbids); (b) keeping sequential queries but batching — rejected (still pays the network floor per query).

## 5. Parallel independent queries

- **Decision**: Audit every service method for `await` sequences between independent queries and replace them with `Promise.all`. N+1 patterns (e.g. per-line lookups) are replaced with `IN (...)` or joined queries. List endpoints combine their list-plus-count into one or two set-based queries (`findMany` + `count` in parallel, or a single query with a window function where the ORM allows). Column selection uses Prisma `select` to avoid fetching unused columns.
- **Rationale**: The network floor is paid per sequential query; parallelising removes it from the critical path. Set-based aggregations replace per-row work.
- **Alternatives considered**: (a) raw SQL everywhere — rejected (loses Prisma type safety and tenant scoping); (b) keeping list+count separate — rejected (two round trips).

## 6. Indexes only where the plan justifies

- **Decision**: Run `EXPLAIN (ANALYZE, BUFFERS)` on the slowest queries in the isolated schema. Add only the indexes the plan justifies, in new migrations, composite with organization first, matching the filters and sorts. For substring searches (SKU, names, emails) create the `pg_trgm` extension with `CREATE EXTENSION IF NOT EXISTS pg_trgm` (conditional, safe) and add `gin_trgm_ops` indexes. Drop no existing index without proof (a documented `EXPLAIN` showing it unused). Record each index with its plan and its measured delta.
- **Rationale**: Indexes are the highest-leverage change but only where the plan shows a scan. The constitution requires composite FKs and organization-first filters.
- **Alternatives considered**: (a) indexing every filtered column — rejected (write amplification, no proof); (b) a full-text search index — rejected (overkill for substring search; trigram is the right tool).

## 7. Connection pool and warm-up

- **Decision**: Measure p95 at concurrency 8 across pool sizes (e.g. 5, 10, 20) against the isolated schema, recommend the best value that stays well below the hosted pooler's limit, and record it in the baseline report (the value is a recommendation for the hosting configuration, not a code change). Warm the pool at startup by running a trivial query (`SELECT 1`) inside `OnModuleInit` of `PlatformModule` so the first request after boot or idle does not pay connection setup. The warm-up is cheap and idempotent.
- **Rationale**: The dashboard fires 8 requests at once; serialising them on a tiny pool is a measurable bottleneck. Warm-up removes a one-off cost that shows up in every cold-start measurement.
- **Alternatives considered**: (a) a larger pool by default — rejected (must stay below the pooler limit); (b) no warm-up — rejected (first-request penalty shows up in p95).

## 8. HTTP compression, ETags and cache control

- **Decision**: Enable NestJS response compression (`compression` middleware, already available via `@nestjs/platform-express`'s underlying express) for JSON responses. Add `ETag` (strong, derived from a version column) and `If-None-Match` handling for stable reference data scoped by organization (organization, roles, permissions, units, categories, warehouses), returning 304 when unchanged. Set `Cache-Control: private, no-store` on everything personal (invoices, orders, payments, contacts, products with prices, audit). Declare a maximum payload size per endpoint (e.g. 100 rows default, 1000 max) and return 413 `PAYLOAD_TOO_LARGE` when exceeded. No new dependency is added unless a measurement justifies it and its licence is recorded.
- **Rationale**: Compression and conditional requests are the standard HTTP levers for reducing payload and repeat-fetch cost; `private, no-store` on personal data is the security-correct default. Reusing the existing version columns avoids new schema.
- **Alternatives considered**: (a) a separate caching layer (Redis) — rejected (out of scope); (b) aggressive caching of personal data — rejected (security).

## 9. Frontend request hygiene and lazy loading

- **Decision**: Debounce search inputs (300 ms) and cancel superseded requests via TanStack Query's `signal`/`abort`. Set `staleTime` of 5 minutes for reference data (roles, permissions, units, categories, warehouses, organization) and disable `refetchOnWindowFocus` for heavy lists. Request independent data in parallel (TanStack Query already does this when enabled flags are independent). Lazy-load every route with `React.lazy` + `Suspense` and the chart library (`recharts`) via dynamic import. Verify hashed assets carry long cache headers. Remove duplicate requests by consolidating `useQuery` keys. Keep previous data while paging (`keepPreviousData`).
- **Rationale**: These are the standard interface levers for "time to usable" and bundle size. Lazy-loading the chart library is the single biggest bundle win (recharts is the largest dependency).
- **Alternatives considered**: (a) SSR — rejected (out of scope, no SSR in v1); (b) a different chart library — rejected (no dependency change without measurement).

## 10. Query-count and bundle budgets in CI

- **Decision**: Add a deterministic, time-independent test per endpoint that counts the queries issued (via the instrumentation counter) and fails when the declared budget is exceeded. Budgets: context ≤ 2 (target 1), list endpoints ≤ 3, detail endpoints ≤ 2, reports ≤ 3. Add a bundle-size check per route (e.g. `frontend/scripts/check-bundle-budget.mjs`) that reads the built `dist/assets/*.js` sizes and fails when a route's chunk exceeds its budget. Wire both into CI alongside the existing guards.
- **Rationale**: Budgets are the durable protection; they make regressions fail before merge. Time-independent (query counts, bytes) is the constitution's requirement ("never time-based").
- **Alternatives considered**: (a) time-based perf tests — rejected (flaky, constitution forbids); (b) no budgets — rejected (gains would regress silently).

## 11. The remaining time is hosting, not code

- **Decision**: The "Where the remaining time goes" section records: the network floor to the hosted database (measured), the hosting regions (database, API host and frontend host should be co-located and near users), cold starts on a free API instance, and the extra hop of the frontend rewrite. These are recommendations for the user, not changes made in this feature.
- **Rationale**: The user explicitly asked for this honesty. These are the honest limits of what code can do.
- **Alternatives considered**: none — this is a reporting requirement, not a design choice.
