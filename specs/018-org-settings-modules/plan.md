# Implementation Plan: Organization Settings and Module Controls End to End

**Branch**: `main` (feature directory: `specs/018-org-settings-modules`; pre-specify hook created branch `018-org-settings-modules` for tooling) | **Date**: 2026-11-19 | **Spec**: `specs/018-org-settings-modules/spec.md`
**Input**: Feature specification from `specs/018-org-settings-modules/spec.md`

## Summary

Complete the organization workspace (P0-F002). Add authoritative organization settings with optimistic locking, same-transaction audit, a currency lock once any document exists, and per-organization module availability with dependency and open-document rules. One shared server guard derives module state from `/auth/me`-backed state and returns `MODULE_DISABLED` for every endpoint of a disabled switchable module; the interface follows that state in the sidebar, routes, Overview, Reports and quick actions. Registration creates module rows and accepts optional name/currency; a migration backfills existing organizations. Finally, remove every production sample-data path and add a guard that fails on a production sample/mock import. The work follows the established pattern: snake_case columns, composite organization keys, version numbers, audit entries in the same transaction, RLS with no policies, immutable migrations, real-PostgreSQL integration tests in the isolated schema, and a regenerated OpenAPI contract.

## Technical Context

**Language/Version**: Node.js >=22.13.0, TypeScript; NestJS 11 backend, React 18 + Vite frontend
**Primary Dependencies**: NestJS, Prisma 6 over PostgreSQL (managed PG 17), Zod 3, TanStack Query 5, React Hook Form 7, Jest 29 + Supertest 7, Vitest 2 + React Testing Library
**Storage**: PostgreSQL — dev `public`, integration tests strictly in the isolated `nexuserp_test` schema (same API-role grants as public)
**Testing**: Jest + Supertest against real PostgreSQL for integration (tenant isolation, permissions, races, trigger behaviour); Vitest + RTL for frontend; guard scripts for design values, CSS classes, no-gallery, structure, boundaries, naming, secrets and the new no-sample-imports guard
**Target Platform**: Linux server; web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge, desktop and tablet
**Project Type**: Web service (NestJS modular monolith) + React web application
**Performance Goals**: p95 API < 500 ms excluding reports; a settings save completes in < 10 s end to end; module toggle reflected on the next page load; module guard reads module state once per request
**Constraints**: Real-PostgreSQL integration tests only; no floating-point money or quantities; no microservices/Redis/Kubernetes in v1; migrations immutable; no writes to `public` from tests and public row counts unchanged; no commit without explicit instruction; Phase 4 build order — Organizations/settings precedes dependable use of Inventory, Purchasing, Sales, Invoicing and Reports
**Scale/Scope**: P0 (P0-F002); nine module keys per organization (5 switchable + 4 always-on); depends on Auth, AccessControl/RBAC, Audit and Platform transaction infrastructure already delivered in Features 001–006

Constraints carried from the constitution: real-PostgreSQL integration tests are mandatory; no JS floats for money/quantities; no microservices, Redis or Kubernetes in v1; the module build order is Organizations/settings before the domain modules it gates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | Pass: `organization_modules` carries `organization_id` with an FK to `organizations(id)` and a composite primary key `(organization_id, module_key)`; tenant scope enters via `requireOrganizationId()` from the ambient request context (`AsyncLocalStorage`) populated by `SessionGuard`; every new endpoint gets a two-org isolation test and cross-org reads return 404 (FR-029) |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | Pass: reads require membership; settings PUT and module toggle PUT declare `settings.manage`; version, name/currency/terms validation, currency lock, dependency and in-use checks are server-side; a disabled module returns 403 `MODULE_DISABLED` on every switchable-module endpoint including reads; interface hiding is explanatory only |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | Pass: settings save + audit, module toggle + audit, and the open-document/currency-lock checks + writes each run in one `TransactionService.runInTransaction` with row locks that serialize against document creation; no new posted/immutable record and no `Idempotency-Key` needed (these are settings operations, not postings); a failed audit write rolls back the change; toggles never delete data |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | Pass: no new money/quantity columns; currency is a 3-character code, payment terms an integer, version an integer; existing invoice due dates are not recomputed, so no new rounding occurs |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | Pass: isolation, permission matrix, stale-version, currency lock across statuses and the `Promise.all` race, module dependency and in-use refusals with counts, toggle race, `MODULE_DISABLED` across every switchable endpoint, re-enablement, and the no-sample-import guard are written first and observed failing; ≥80% critical-path coverage via existing coverage gate |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | Pass: Organizations owns settings and module availability; the shared module guard lives in `common/guards` and reads module state once per request; domain modules keep their guards as thin decorators delegating to the shared guard; cross-module reads use owning services; no circular dependency |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | Pass: currency codes are for display only with no conversion; invoice labelling and the "not a tax invoice" limitation are untouched; no compliance or accounting claim added |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | Pass: two cards from design-system tokens; labelled name/currency/terms fields, disabled state with reason, in-flight spinner, inline errors, stale reload prompt, success toast, table of switches and ConfirmDialog for a turn-off; visible focus and keyboard operation; refusals conveyed as text; static navigation list and master file unchanged |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | Pass: P0 (P0-F002) completes the foundation; all preceding P0 features (001–006 foundation/RBAC/audit and the domain modules) are delivered; time zone, multi-currency, branding, locale, organization deletion, billing/plans and ownership transfer are out of scope |

No violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/018-org-settings-modules/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (endpoint contracts + session payload)
└── tasks.md             # Phase 2 output (created by /speckit.tasks, not this command)
```

### Source Code (repository root)

```text
backend/src/modules/organizations/          # settings + module endpoints (new controller/DTOs, service extension)
backend/src/common/guards/                  # shared module guard + per-module decorators (purchasing/sales/invoicing/inventory/reports)
backend/src/modules/auth/                   # register DTO/service (optional name/currency, module rows), /auth/me payload
backend/src/modules/audit/                  # AUDIT_ACTIONS additions (settings/module toggle)
shared/src/errors/index.ts                  # new 409 codes: CURRENCY_LOCKED, MODULE_DEPENDENCY, MODULE_IN_USE
shared/src/audit/index.ts                   # new audit action codes
database/prisma/schema.prisma               # Organization.version, OrganizationModule model
database/prisma/migrations/<ts>_organization_settings_modules/  # version, org_modules, RLS, backfill, currency-lock trigger
backend/test/integration/                   # settings/modules isolation, permissions, races, module gate, re-enablement
backend/test/integration/contract-drift.spec.ts  # regenerated openapi.json
backend/openapi.json                        # regenerated committed contract

frontend/src/features/administration/       # Organization settings page rewrite (two cards)
frontend/src/services/                      # organization settings client, auth-session shape, catalog types
frontend/src/app/router.tsx                 # disabled-module route redirect
frontend/src/components/shell/              # sidebar runtime disabled state from session
frontend/src/features/overview/             # hide module-dependent widgets/quick actions
frontend/src/features/reports/              # hide module-dependent report sections
frontend/src/features/auth/                 # registration optional name/currency
frontend/scripts/check-no-sample-imports.ts # new guard + guard spec, wired into build
frontend/src/... (production imports)       # remove sample-catalog-service, sample-data-banner, real-modules config
scripts/verify-db-invariants.mjs            # module-row, dependency, currency-lock trigger checks
AGENTS.md                                   # SPECKIT plan pointer updated to this feature's plan
```

**Structure Decision**: Web application (backend + frontend). Settings and module availability stay inside the Organizations module; the shared module guard is in `common/guards`; the domain modules keep their existing per-module decorators delegating to the shared guard. The static `navigation.ts` and `design-system/nexuserp/MASTER.md` are not modified — runtime disabled state is layered on top from the session payload.

## Complexity Tracking

No violations. All principles pass; no entries required.
