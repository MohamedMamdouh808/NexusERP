# Implementation Plan: Performance Measurement and Optimization End to End

**Branch**: `main` (feature directory: `specs/019-performance-measurement-optimization`; selected by `.specify/feature.json`) | **Date**: 2026-11-20 | **Spec**: `specs/019-performance-measurement-optimization/spec.md`
**Input**: Feature specification from `specs/019-performance-measurement-optimization/spec.md`

## Summary

Make the product measurably faster without changing what it does. Phase 1 instruments the application (per-request query count, DB time, non-DB time, `Server-Timing` header, per-query masked text and duration) and baselines every endpoint and every screen on a generated dataset (2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 purchase orders, 5,000 payments), producing `docs/performance-baseline.md` with the network floor reported separately. Phase 2 applies only the optimisations the baseline justifies — one round trip for per-request context, parallel independent queries, set-based aggregations, targeted indexes (trigram for substring searches), connection-pool warming, response compression, conditional requests for stable reference data, and lazy-loaded routes/charts — each with a before/after number. Phase 3 protects the gains with per-endpoint query-count and per-route bundle-size budgets in CI, a committed after-report, and an honest "where the remaining time goes" section. Behaviour, security, data integrity, contracts, permissions, tenant isolation, audit, idempotency, append-only guards, RLS, exact decimals and every existing test/guard/invariant are preserved.

## Technical Context

**Language/Version**: Node.js >=22.13.0, TypeScript; NestJS 11 backend, React 18 + Vite frontend
**Primary Dependencies**: NestJS, Prisma 6 over PostgreSQL (managed PG 17), Zod 3, TanStack Query 5, React Hook Form 7, Jest 29 + Supertest 7, Vitest 2 + React Testing Library, Vite build. No new production dependency is added unless a measurement justifies it and its licence is recorded.
**Storage**: PostgreSQL — dev `public`, integration tests strictly in the isolated `nexuserp_test` schema (same API-role grants as public). Measurement uses the isolated schema only.
**Testing**: Jest + Supertest against real PostgreSQL for integration (tenant isolation, permissions, races, trigger behaviour, query counts); Vitest + RTL for frontend (bundle sizes, query counts); guard scripts for design values, CSS classes, no-gallery, structure, boundaries, naming, secrets and no-sample-imports; `EXPLAIN (ANALYZE, BUFFERS)` for index justification.
**Target Platform**: Linux server; web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge, desktop and tablet.
**Project Type**: Web service (NestJS modular monolith) + React web application.
**Performance Goals**: p95 of every list and report endpoint under 500 ms of application time at concurrency 1 on the generated dataset (report real numbers and misses); at most 2 context queries per authenticated request (target 1); list endpoints at most 3 queries; dashboard's 8 parallel requests not serialised by the pool at the recommended size.
**Constraints**: Real-PostgreSQL integration tests only; no floating-point money or quantities; no microservices/Redis/Kubernetes in v1; migrations immutable; no writes to `public` from tests and public row counts unchanged; no commit without explicit instruction; password-hashing parameters unchanged; authorization never cached across requests; production-like build (`nest build` then `node dist/main.js`, `NODE_ENV=production`, built frontend) for all measurement; no new dependency without measurement justification and licence record.
**Scale/Scope**: P1 (hardens the already-shipped P0 surface without adding new capability); 30 functional requirements, 12 success criteria, 5 user stories; depends on Auth, Organizations, AccessControl/RBAC, Audit and all domain modules already delivered in Features 001–018.

Constraints carried from the constitution: real-PostgreSQL integration tests are mandatory; no JS floats for money/quantities; no microservices, Redis or Kubernetes in v1; the module build order is unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | Pass: no new org-owned tables; `organization_modules` already carries `organization_id` with an FK to `organizations(id)` and a composite primary key `(organization_id, module_key)`; tenant scope still enters via `requireOrganizationId()` from the ambient request context populated by `SessionGuard`; any new index is composite with organization first. Every endpoint keeps its two-organization isolation test. Cross-org reads still return 404. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | Pass: no new endpoints are added; instrumentation, budgets and the generator are infrastructure. Authorization stays default deny and is never cached across requests — per-request memoisation only, keyed by organization, with an immediate-invalidation test. Disabled modules still return 403 `MODULE_DISABLED`. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | Pass: no new posted/immutable record; the generator writes seed data in the isolated schema only. Transactions stay as short as possible with the lock order unchanged; audit and idempotency writes stay inside their transaction; batch inserts of lines and movements are added. No `Idempotency-Key` change. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | Pass: no new money/quantity columns or rounding. Indexes are on keys and filters, never on decimal values. Decimals still travel as strings. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | Pass: the query-count and bundle-size budgets are written as failing tests before the optimisations that satisfy them; critical-path coverage stays at least 80%; CI still gates on lint, type check, unit tests, PostgreSQL integration tests, migration validation and build verification; no mandatory check is removed or weakened. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | Pass: the modular monolith is unchanged; each module still exposes explicit service interfaces and never reads another module's tables directly; no circular dependency is introduced; the per-request context loader is an explicitly owned Platform interface. No new infrastructure dependency without a measured requirement, a recorded decision and an amendment. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | Pass: no tax, e-invoicing or accounting claim is added; invoice labelling and limitations are unchanged. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | Pass: no new UI components; lazy-loading and bundle reduction do not remove any accessible control or its label; the design system tokens still govern; WCAG 2.1 AA is not regressed. |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | Pass: P1 — hardens the already-shipped P0 surface without adding new capability. No P3 work. Time zone, multiple currencies, branding, locale settings, organization deletion, billing/plans and ownership transfer remain out of scope, as do caching business data in a separate store, changing hosting or regions, a read replica, rewriting the ORM and background job queues. |

No violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/019-performance-measurement-optimization/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (instrumentation, budget contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/src/platform/observability/          # per-request instrumentation (query count, DB time, Server-Timing)
backend/src/platform/transaction/            # pool warm-up at startup
backend/src/common/guards/                    # (unchanged) module guard
backend/src/modules/*/                       # parallelised queries, set-based aggregations, selected columns
database/prisma/migrations/<ts>_performance_indexes/  # justified indexes, trigram extension
scripts/generate-perf-dataset.mjs             # deterministic generator for the isolated schema
docs/performance-baseline.md                  # Phase 1 output
docs/performance-after.md                     # Phase 3 output
frontend/src/lib/                             # request dedup/cancellation, lazy-loading
frontend/src/features/*/                      # debounced search, parallel independent data
frontend/scripts/check-bundle-budget.mjs      # per-route bundle-size budget check
backend/test/integration/                    # query-count budget tests per endpoint
```

**Structure Decision**: Web application (backend + frontend). No new modules or tables; the work is concentrated in the existing Platform, Auth, Organizations, Contacts, Products, Inventory, Purchasing, Sales, Invoicing, Reports and Audit modules, plus a new Platform/Observability component and a root-level dataset generator script. The static navigation list and design-system master file are untouched.

## Complexity Tracking

No violations. All principles pass; no entries required.
