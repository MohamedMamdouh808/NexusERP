---

description: "Task list for the NexusERP platform foundation"
---

# Tasks: Platform Foundation

**Input**: Design documents from `/specs/001-platform-foundation/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story
MUST include its tests, written before the implementation and observed failing. Tests run against a
real PostgreSQL instance; SQLite, in-memory substitutes, and mocked persistence layers are not
acceptable substitutes for critical-path tests.

**Mandatory task types** (Constitution Principles I-VI, VIII, IX):

- **Tenant isolation test** for every endpoint, report, and export added (Principle I) — N/A in this
  feature: it creates no organization-owned table and no endpoint reading organization data. The
  schema conventions are recorded instead (T096) and the first isolation test arrives with the
  organization feature.
- **Permission declaration** plus default-deny test for every endpoint (Principle II)
- **Idempotency test** for every posting endpoint, plus duplicate-request and 422 tests
  (Principle III) — N/A in this feature: no posting endpoint exists. The unit of work that later
  posting endpoints depend on is built and tested here (T023, T024).
- **Transaction rollback test** for every multi-record operation (Principle III)
- **Concurrency test** for stock reservation, shipment, and payment allocation — N/A: no such
  operation exists in this feature.
- **Decimal calculation test vectors** with half-up rounding for money and quantities
  (Principle IV) — this feature defines the string transport that forbids floats; the rounding
  vectors arrive with the first business document.
- **Immutability test** proving posted records cannot be updated or deleted (Principle III) — N/A:
  no posted record exists.
- **Audit-record test** proving the audit row commits with the business change (Principle III) —
  N/A: no audited business action exists.
- **UX and accessibility tasks** for design-system tokens, PRD 7.3 states, and WCAG 2.1 AA
  (Principle VIII)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing
of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Workspace root**: `package.json`, `package-lock.json`, `.nvmrc`, `.env.example`,
  `docker-compose.yml`, `docker/`, `.github/workflows/`
- **Service**: `apps/api/`, with `apps/api/prisma/` for the schema, migrations, and seed
- **Web**: `apps/web/`, with `apps/web/src/` and `apps/web/e2e/`
- **Shared contracts**: `packages/shared/src/`
- **Tests**: `apps/api/test/integration/`, `apps/api/test/fixtures/`,
  `apps/web/src/**/__tests__/`, `apps/web/e2e/`
- Paths below follow this layout

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace scaffolding so three packages can install, build, and run independently.
No behavior yet.

- [ ] T001 Create npm workspaces root manifest with `workspaces: ["apps/*", "packages/*"]` and orchestration scripts in `package.json`
- [ ] T002 Add Node 24 pin in `.nvmrc` and `engines` in `package.json`; add `.gitignore` and `.dockerignore` at repository root
- [ ] T003 [P] Create formatting config at `.prettierrc` and `.prettierignore`
- [ ] T004 Create `apps/api/package.json` with NestJS, Prisma, `@nestjs/swagger`, `pino`, `cookie-parser`, `class-validator`, and dev dependencies in `apps/api/package.json`
- [ ] T005 Create `apps/api/tsconfig.json` and `apps/api/tsconfig.build.json` targeting ES2023 with decorator metadata
- [ ] T006 [P] Create `apps/api/nest-cli.json` and `apps/api/eslint.config.mjs`
- [ ] T007 Create `apps/web/package.json` with React 18, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form, and Zod in `apps/web/package.json`
- [ ] T008 Create `apps/web/tsconfig.json` and `apps/web/vite.config.ts`
- [ ] T009 [P] Create `apps/api/eslint.config.mjs` flat config and `apps/web/eslint.config.mjs` flat config
- [ ] T010 Create `packages/shared/package.json` and `packages/shared/tsconfig.json` with Zod as its only runtime dependency
- [ ] T011 Create `.env.example` listing every required variable with safe development defaults and no real secrets

**Checkpoint**: `npm install` completes and all three workspaces resolve; nothing runs yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The contracts, schema, and request pipeline every user story depends on. No user
story work can begin until this phase is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T012 [P] Define error-code constants and the error envelope type in `packages/shared/src/errors/index.ts`
- [ ] T013 [P] Define Zod schemas for the error envelope, decimal string, health report, and check result in `packages/shared/src/schemas/index.ts`
- [ ] T014 [P] Define the permission catalog and the five default role templates in `packages/shared/src/permissions/index.ts`
- [ ] T015 [P] Write FAILING unit test rejecting JavaScript numbers and accepting decimal strings in `packages/shared/src/__tests__/decimal-string.spec.ts`
- [ ] T016 [P] Write FAILING unit test asserting the envelope has exactly four keys and always carries a details array in `packages/shared/src/__tests__/error-envelope.spec.ts`
- [ ] T017 [P] Write FAILING unit test asserting every permission code is well formed and every role template's permissions exist in the catalog in `packages/shared/src/__tests__/permissions.spec.ts`
- [ ] T018 Build `packages/shared` with `tsc` and add it as a workspace dependency in `apps/api/package.json` and `apps/web/package.json`
- [ ] T019 Create the Prisma schema with `Permission`, `RoleTemplate`, and `RoleTemplatePermission` in `apps/api/prisma/schema.prisma` per `data-model.md`, with `code` and `key` unique and a composite primary key on the join; document the numeric conventions in a header comment — money `NUMERIC(14,2)`, unit price and unit cost `NUMERIC(14,4)`, quantity `NUMERIC(14,3)`, all mapped as `Prisma.Decimal`, with no monetary or quantity column permitted to use `Float` (verified by T107 and T108)
- [ ] T020 Author the initial migration and `apps/api/prisma/migrations_lock.toml` in `apps/api/prisma/migrations/`
- [ ] T021 Create the two-project Jest configuration and the database reset helper in `apps/api/jest.config.ts` and `apps/api/test/fixtures/database.ts`
- [ ] T022 [P] Write FAILING unit test asserting startup configuration errors name the missing or invalid variable, and that an already-bound port fails startup with a message naming that port in `apps/api/src/config/__tests__/config.spec.ts` (FR-009)
- [ ] T023 [P] Write FAILING integration test asserting a thrown error inside the unit of work rolls back every write in `apps/api/test/integration/unit-of-work.spec.ts`
- [ ] T024 [P] Write FAILING integration test asserting the **idempotency guarantee** that two consecutive seed runs leave no duplicate permission, role template, or role-to-permission grant in `apps/api/test/integration/seed-idempotency.spec.ts` (distinct from T032, which proves what a single load's content must be)
- [ ] T107 [P] Write FAILING unit test asserting the schema numeric-type checker rejects a sample schema containing a `Float` column and accepts one using `Decimal` with the documented precisions in `apps/api/scripts/__tests__/schema-numeric-types.spec.ts` (depends on T019, which must exist for the checker to have a real file to read; Constitution Principle IV)
- [ ] T025 Create the configuration module with a validated environment schema that fails fast naming the offending variable, and surfaces a bound-port conflict as a startup error naming the port, in `apps/api/src/config/configuration.ts` and `apps/api/src/config/configuration.module.ts`
- [ ] T026 Create the Prisma service lifecycle and the `AsyncLocalStorage` transaction unit of work in `apps/api/src/platform/prisma/prisma.service.ts` and `apps/api/src/platform/transaction/transaction.service.ts`
- [ ] T027 Create the idempotent seed entry point upserting on natural keys inside one transaction in `apps/api/prisma/seed.ts`
- [ ] T110 Create the schema numeric-type checker that fails when `apps/api/prisma/schema.prisma` declares a `Float` column, and wire it into the lint command in `apps/api/scripts/check-schema-numeric-types.ts` and `package.json` (depends on T107; Constitution Principle IV — without it, a later feature can introduce floating-point storage undetected)
- [ ] T028 Create the application root module and bootstrap with the `/api/v1` prefix, global validation pipe, cookie parser, and shutdown hooks in `apps/api/src/app.module.ts` and `apps/api/src/main.ts`
- [ ] T029 Run `npm run db:migrate`, `npm run db:seed`, and `npm test` to confirm the foundational tests now pass

**Checkpoint**: Foundation ready — the service boots against a real database, the shared contracts
compile, and the unit-of-work and seed tests pass. User story work can begin.

---

## Phase 3: User Story 1 - Start a Working Local Environment (Priority: P1) 🎯 MVP

**Goal**: One documented command brings up database, service, and interface from a clean checkout
with no preinstalled database server, with the schema current and reference data loaded.

**Independent Test**: From a clean checkout with no local database, run the documented startup
command, then confirm the service answers a health request and the permission catalog and role
templates are queryable. Deliverable value: a working, reproducible development environment.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T030 [P] [US1] Write FAILING integration test asserting the migration history applies cleanly to an empty database, that re-applying it changes no data, that the applied history shows no drift from `apps/api/prisma/schema.prisma`, and that a named volume preserves existing rows across a re-run in `apps/api/test/integration/migrations-from-empty.spec.ts` (merged from the former T061; FR-006, FR-008, FR-012, FR-013, FR-048)
- [ ] T031 [P] [US1] Write FAILING integration test asserting an out-of-order or missing migration history is refused and names the offending migration in `apps/api/test/integration/migrations-history.spec.ts`
- [ ] T032 [P] [US1] Write FAILING integration test asserting the **content invariants** of the seed — exactly five role templates, every catalog permission granted by the administrator template, no duplicate grant within a template — in `apps/api/test/integration/seed-content.spec.ts` (distinct from T024, which proves the idempotency guarantee that repeated loads create nothing twice)

### Implementation for User Story 1

- [ ] T033 [P] [US1] Create the multi-stage service image that installs with the lockfile, builds, and runs migrations before serving in `docker/api.Dockerfile`
- [ ] T034 [P] [US1] Create the multi-stage web image that builds static assets and serves them in `docker/web.Dockerfile`
- [ ] T035 [US1] Create the Compose environment with a healthchecked database pinned to the same PostgreSQL major version used in production, a named volume so data survives a re-run, a service gated on database health, and the web app in `docker-compose.yml` (FR-006, FR-007, FR-008)
- [ ] T036 [US1] Add the database, seed, development, and build scripts to `package.json` so migrations and seeding run as documented commands
- [ ] T037 [P] [US1] Configure the development server to proxy `/api` to the service in `apps/web/vite.config.ts`
- [ ] T038 [US1] Wire the Compose services so `docker compose up -d --wait` returns only after all three report healthy in `docker-compose.yml` (depends on T035)
- [ ] T039 [US1] Document the one-command startup, every available command, and the failure modes in `README.md`

**Checkpoint**: A clean checkout reaches a running environment with one command; re-running it
preserves data and creates no duplicates.

---

## Phase 4: User Story 2 - Understand Every API Response and Failure (Priority: P2)

**Goal**: Every failing response uses one envelope, every request carries one identifier through
response and logs, the health address reports application and database state separately, and no
failure ever leaks internals or contacts a third party.

**Independent Test**: Trigger a validation failure, a not-found, a conflict, an unexpected failure,
and a rate-limit response against a running environment; confirm each carries the same fields and a
usable identifier that also appears in the server logs. Deliverable value: predictable, traceable
API behavior.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

- [ ] T040 [P] [US2] Write FAILING integration test asserting every failing response carries exactly code, message, details, and request identifier, that a validation failure carries a dotted path naming the offending field, and that an internal-error message includes the request identifier in `apps/api/test/integration/error-envelope.spec.ts` (FR-021, FR-023, FR-024, FR-031)
- [ ] T041 [P] [US2] Write FAILING integration test asserting no error response contains a stack trace, file path, query, hostname, or driver version in `apps/api/test/integration/error-leakage.spec.ts`
- [ ] T042 [P] [US2] Write FAILING integration test asserting a supplied request identifier is echoed, an absent one is generated, and a malformed one is replaced rather than rejected in `apps/api/test/integration/request-id.spec.ts`
- [ ] T043 [P] [US2] Write FAILING integration test asserting the envelope identifier matches the `x-request-id` response header in `apps/api/test/integration/request-id-correlation.spec.ts`
- [ ] T044 [P] [US2] Write FAILING integration test asserting health reports healthy with a reachable database and 503 in the envelope when the database is stopped mid-run in `apps/api/test/integration/health.spec.ts`
- [ ] T045 [P] [US2] Write FAILING integration test asserting health fails closed when a check cannot be measured and leaks no version, hostname, or connection string in `apps/api/test/integration/health-fail-closed.spec.ts`
- [ ] T046 [P] [US2] Write FAILING integration test asserting request handling and the failure path produce zero outbound calls to any third party in `apps/api/test/integration/no-third-party-egress.spec.ts`
- [ ] T047 [P] [US2] Write FAILING unit test asserting passwords, tokens, cookies, and secrets never appear in log output in `apps/api/src/common/logging/__tests__/redaction.spec.ts`
- [ ] T048 [P] [US2] Write FAILING unit test asserting each request log record carries the identifier, route, status, and elapsed time in `apps/api/src/common/logging/__tests__/request-log-record.spec.ts`
- [ ] T049 [P] [US2] Write FAILING unit test asserting a rate-limit response is renderable from the standard shape alone, including `Retry-After`, in `apps/web/src/lib/__tests__/api-client.spec.ts`
- [ ] T106 [P] [US2] Write FAILING integration test asserting an endpoint that declares no permission is denied with 403 by default, and that `GET /api/v1/health` is reachable only because it carries an explicit public marker — removing that marker must make the health route return 403 in `apps/api/test/integration/default-deny.spec.ts` (depends on T055 and T056, so it is written as soon as the decorator and guard exist; Constitution Principle II requires an undeclared endpoint to fail the suite)

### Implementation for User Story 2

- [ ] T050 [US2] Create the request context store and the request identifier middleware that adopts, generates, sanitizes, and echoes the identifier in `apps/api/src/common/logging/request-context.ts` and `apps/api/src/common/logging/request-id.middleware.ts`
- [ ] T051 [US2] Configure the structured JSON logger with the redaction list and identifier correlation in `apps/api/src/common/logging/logger.ts` (emit `userId` and `organizationId` as null until authentication ships, so the field set does not change when FR-038 becomes active)
- [ ] T052 [US2] Create the global exception filter mapping every failure class to a catalogued code with a fixed non-internal message in `apps/api/src/common/errors/all-exceptions.filter.ts`
- [ ] T053 [US2] Create the envelope and check result response DTOs with contract annotations in `apps/api/src/common/dto/error-envelope.dto.ts` and `apps/api/src/common/dto/health-report.dto.ts`
- [ ] T054 [US2] Create the health service running the reachability query with timing and failing closed on an unmeasured result in `apps/api/src/platform/health/health.service.ts`
- [ ] T055 [US2] Create the health controller declared explicitly public with contract annotations in `apps/api/src/platform/health/health.controller.ts`
- [ ] T056 [US2] Create the permission declaration decorator and the guard chain that denies every request lacking a declared permission in `apps/api/src/common/decorators/require-permission.decorator.ts` and `apps/api/src/common/guards/permission.guard.ts`
- [ ] T057 [US2] Mount the middleware, filters, and guards in the correct order in `apps/api/src/app.module.ts` and `apps/api/src/main.ts` so a guard failure still carries an identifier
- [ ] T058 [US2] Create the web API client mapping every response into the envelope and honoring `Retry-After` in `apps/web/src/lib/api-client.ts`
- [ ] T059 [US2] Verify unit and integration suites are green and critical-path coverage is at least 80% by running `npm test` and `npm run test:integration`

**Checkpoint**: Every failure path produces the same shape with a traceable identifier; health
reports both components separately and fails closed.

---

## Phase 5: User Story 3 - Ship Only Changes That Pass Every Check (Priority: P3)

**Goal**: No change merges unless it passes lint, type check, unit tests, integration tests against
a real database, migration validation, contract drift detection, build, and image build — and the
pipeline never deploys.

**Independent Test**: Break each check in turn on a throwaway branch and confirm the pipeline
refuses with a message naming the failed check; then confirm a clean change passes end to end.
Deliverable value: a merge gate nobody can bypass.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

> **NOTE:** This phase carries no failing test of its own. Every assertion it needs is written and
> observed failing in another phase: migration-from-empty and drift moved into User Story 1 (T030,
> formerly duplicated as T061), the contract drift check moved into User Story 4 (T062, moved after
> T089), and the duplicate raw-design-value test was deleted (T060, single home now T082). What this
> phase adds is the pipeline that runs them, plus its own negative assertions (T111).

### Implementation for User Story 3

- [ ] T063 [P] [US3] Wire the coverage thresholds that fail below 80% on critical paths in `apps/api/jest.config.ts`
- [ ] T064 [P] [US3] Configure the web test runner with component tests and coverage thresholds in `apps/web/vitest.config.ts`
- [ ] T065 [P] [US3] Configure the end-to-end runner as an advisory check in `apps/web/playwright.config.ts`
- [ ] T066 [US3] Add the repository rule and type check commands to `package.json` so both workspaces are covered
- [ ] T067 [US3] Create the lint and type check pipeline job in `.github/workflows/ci.yml`
- [ ] T068 [US3] Create the unit test job with a coverage artifact in `.github/workflows/ci.yml`
- [ ] T069 [US3] Create the integration test job provisioning a real database service container in `.github/workflows/ci.yml`
- [ ] T070 [US3] Create the migration validation job covering empty apply, re-apply, and drift detection in `.github/workflows/ci.yml`
- [ ] T071 [US3] Create the contract drift job regenerating and comparing the committed contract in `.github/workflows/ci.yml`
- [ ] T072 [US3] Create the build job for the service and the static web assets in `.github/workflows/ci.yml` (this is the verification task for FR-001 and FR-002: one repository, one version history, both parts independently buildable from it)
- [ ] T073 [US3] Create the image build job that builds both images without publishing them in `.github/workflows/ci.yml`
- [ ] T109 [P] [US3] Install dependencies in every pipeline job with `npm ci --frozen-lockfile`, and add a check that `package-lock.json` is committed and is byte-identical after each install in `.github/workflows/ci.yml` (FR-049; depends on T067 through T073 — the jobs it modifies must exist first)
- [ ] T111 [P] [US3] Write FAILING test asserting registry and release semantics rather than raw substrings, in `.github/workflows/__tests__/ci-no-deploy.spec.ts`: the workflow MUST contain no step that pushes an image to a registry (no `docker push`, no registry login step, no build-and-push action with push enabled), no job named or behaving as deploy or release, and no output of a deployed environment URL; building an image without pushing it, `actions/checkout`, and cache steps MUST pass. The same test MUST assert that a skipped integration job fails the pipeline (depends on T067 through T073 — the workflow definition must exist first; SC-011, SC-019)
- [ ] T108 [US3] Run the built service image in a clean environment configured only from `.env.example`, confirm it starts, and confirm `GET /api/v1/health` responds, in `.github/workflows/ci.yml` or a local script under `scripts/verify-image-portability.sh` (SC-020, depends on T073)
- [ ] T074 [US3] Declare the mandatory checks as required status checks and document the setup in `README.md`
- [ ] T075 [US3] Verify each mandatory check fails when deliberately broken and passes when fixed, recording the result in `README.md`

**Checkpoint**: No change can merge with a mandatory check failing, incomplete, or skipped; the
pipeline's terminal action is a verified image and nothing else.

---

## Phase 6: User Story 4 - Develop Interface and Service as One Project (Priority: P4)

**Goal**: Both parts build and run from one checkout against a generated contract, and the web app
delivers exactly the application shell and a health status panel, built entirely from the persisted
design system.

**Independent Test**: Start both parts from one checkout, open the web app and confirm the shell
renders with unavailable organization and user placeholders plus a live health panel, then confirm
the generated contract describes the service's endpoints accurately. Deliverable value: a single
coherent, documented project.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

- [ ] T076 [P] [US4] Write FAILING component test asserting the shell renders sidebar, top bar, and content area on first load in `apps/web/src/components/shell/__tests__/app-shell.spec.tsx`
- [ ] T077 [P] [US4] Write FAILING component test asserting the organization switcher and user menu state that none is available rather than presenting a working control in `apps/web/src/components/shell/__tests__/top-bar.spec.tsx`
- [ ] T078 [P] [US4] Write FAILING component test asserting no navigation entry or control implying a business action is present in `apps/web/src/components/shell/__tests__/no-business-controls.spec.tsx`
- [ ] T079 [P] [US4] Write FAILING component test asserting the health panel shows a skeleton while fetching in `apps/web/src/features/health/__tests__/health-panel-loading.spec.tsx`
- [ ] T080 [P] [US4] Write FAILING component test asserting the health panel shows the failure with a retry action when the service is unreachable in `apps/web/src/features/health/__tests__/health-panel-error.spec.tsx`
- [ ] T081 [P] [US4] Write FAILING component test asserting the health panel shows the service report with no sign-in screen anywhere in `apps/web/src/features/health/__tests__/health-panel-healthy.spec.tsx`
- [ ] T082 [P] [US4] Write FAILING test asserting no raw design value appears anywhere under `apps/web/src` in `apps/web/scripts/__tests__/no-raw-design-values.spec.ts` (single home for this check; the former duplicate T060 is deleted)

### Implementation for User Story 4

- [ ] T083 [US4] Transcribe the persisted design system tokens as the single value source in `apps/web/src/styles/tokens.css`
- [ ] T084 [US4] Map the theme to those tokens so utility classes resolve to them in `apps/web/src/styles/app.css`
- [ ] T085 [P] [US4] Create the reusable interface components built from the design system in `apps/web/src/components/ui/`
- [ ] T086 [US4] Create the sidebar, top bar with organization switcher and user menu placeholders, and content area in `apps/web/src/components/shell/`
- [ ] T087 [US4] Create the health status panel wired to the health endpoint with loading, healthy, and failure states in `apps/web/src/features/health/`
- [ ] T088 [P] [US4] Create the router, query client, and error boundary in `apps/web/src/app/` and `apps/web/src/main.tsx`
- [ ] T089 [US4] Add the contract generation command and commit the generated document in `apps/api/package.json` and `apps/api/openapi.json`
- [ ] T090 [US4] Add the contract comparison command that fails on drift in `apps/api/package.json`
- [ ] T062 [P] [US4] Write FAILING integration test asserting the generated contract matches the committed artifact and that a changed endpoint produces a diff in `apps/api/test/integration/contract-drift.spec.ts` (depends on T089 — it cannot be written before the committed artifact exists)
- [ ] T091 [US4] Serve the human-readable contract page in development from the same generation source in `apps/api/src/main.ts`
- [ ] T092 [US4] Add the decimal string formatter that never converts through a floating-point number in `apps/web/src/lib/format.ts`
- [ ] T093 [US4] Write the end-to-end smoke test covering shell render and health read in `apps/web/e2e/smoke.spec.ts`
- [ ] T094 [US4] Verify the generated contract matches the committed artifact, the raw design value check passes, and the shell renders in `apps/api/package.json` and `apps/web`

**Checkpoint**: One checkout runs both parts; the shell and health panel render from design system
tokens; the contract is generated and drift is impossible to merge silently.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T095 [P] Documentation updates covering setup, layout, commands, error codes, and the health address in `README.md`, including the stable set of fields a structured log record always carries (FR-053, SC-023)
- [ ] T096 Documentation of the schema conventions later features inherit — tenant scoping with composite keys, exact decimals, append-only immutability, transaction boundary — in `README.md` and `specs/001-platform-foundation/data-model.md`
- [ ] T097 [P] Verification that the implemented error codes, the status mapping, and the 403-versus-404 rule match the published catalog in `specs/001-platform-foundation/contracts/error-catalog.md`
- [ ] T112 [P] Audit every documentation file this feature produces for any availability, backup, or recovery claim, and remove or reword any found, so the product claims no uptime or recovery target (FR-034b, SC-025; depends on T039 and T095 — the documents it audits must exist first)
- [ ] T098 [P] Statement in the documentation that the product makes no tax-compliance, e-invoicing, or complete-accounting claim in `README.md`
- [ ] T099 Documentation of what each mandatory pipeline check covers and how to reproduce a failure locally in `README.md`
- [ ] T100 [P] Code cleanup and refactoring across `apps/api/src/` and `apps/web/src/`
- [ ] T101 [P] Performance optimization across `apps/api/src/common/`, `apps/api/src/platform/`, and `apps/web/src/`
- [ ] T102 [P] Accessibility audit of the shell and health panel against WCAG 2.1 AA — labeled fields, contrast, visible focus, keyboard operation, announced errors — in `apps/web/src/`
- [ ] T103 [P] Security hardening: explicit origin allowlist, security headers, and content security policy in `apps/api/src/main.ts`
- [ ] T104 Run the quickstart validation end to end from a clean checkout per `specs/001-platform-foundation/quickstart.md`
- [ ] T105 Final verification against every success criterion in `specs/001-platform-foundation/spec.md`, recording the result in `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - **Not fully independent of
  User Story 4.** The lint, type check, unit, and build jobs stand alone, but two of its gates
  cannot be verified until US4 exists: the contract drift job needs the generated artifact from
  T089, and the image portability task needs the image contents US4 finalizes. Its own failing
  tests therefore live in US1 and US4, not here. This phase is meaningfully complete once US1,
  US2, and US4 artifacts exist.
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Its health panel depends on the
  health endpoint from User Story 2, and its contract tasks (T089, T090, T062) depend on the
  annotated endpoint. The shell components, token bridge, and raw design value check do not depend
  on another story.

### Within Each User Story

- Tests MUST be written first and observed to FAIL before implementation (Principle V)
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together (tests are mandatory):
Task: "Write FAILING integration test asserting every failing response carries exactly code, message, details, and request identifier in apps/api/test/integration/error-envelope.spec.ts"
Task: "Write FAILING integration test asserting a supplied request identifier is echoed, an absent one is generated, and a malformed one is replaced rather than rejected in apps/api/test/integration/request-id.spec.ts"
Task: "Write FAILING integration test asserting health reports healthy with a reachable database and 503 in the envelope when the database is stopped mid-run in apps/api/test/integration/health.spec.ts"
Task: "Write FAILING unit test asserting passwords, tokens, cookies, and secrets never appear in log output in apps/api/src/common/logging/__tests__/redaction.spec.ts"

# Launch all models for User Story 2 together:
Task: "Create the envelope and check result response DTOs with contract annotations in apps/api/src/common/dto/error-envelope.dto.ts and apps/api/src/common/dto/health-report.dto.ts"
Task: "Create the request context store and the request identifier middleware that adopts, generates, sanitizes, and echoes the identifier in apps/api/src/common/logging/request-context.ts and apps/api/src/common/logging/request-id.middleware.ts"
```

## Parallel Example: User Story 4

```bash
# Launch all tests for User Story 4 together (tests are mandatory):
Task: "Write FAILING component test asserting the shell renders sidebar, top bar, and content area on first load in apps/web/src/components/shell/__tests__/app-shell.spec.tsx"
Task: "Write FAILING component test asserting the organization switcher and user menu state that none is available rather than presenting a working control in apps/web/src/components/shell/__tests__/top-bar.spec.tsx"
Task: "Write FAILING component test asserting the health panel shows a skeleton while fetching in apps/web/src/features/health/__tests__/health-panel-loading.spec.tsx"

# Launch all tokens for User Story 4 together:
Task: "Transcribe the persisted design system tokens as the single value source in apps/web/src/styles/tokens.css"
Task: "Map the theme to those tokens so utility classes resolve to them in apps/web/src/styles/app.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: From a clean checkout, confirm one command reaches a running environment
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (environment and migrations)
   - Developer B: User Story 2 (error envelope, request identifiers, health, logging)
   - Developer C: User Story 4 (design tokens, shell, health panel)
   - Developer D: User Story 3 (pipeline), starting once A and B have something to run
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- **Single owner constraint**: this feature is staffed by one primary developer. The parallel
  markers describe what *may* run concurrently, not what will. Execute sequentially in priority
  order and use the markers only when taking a second pass over independent work.
- **Out of scope reminders while implementing**: no rate limiter, no third-party analytics or error
  monitoring call, no deploy stage, no availability claim, no organization-owned table, no
  sign-in screen. Several of these have tests that assert their *absence*; adding them fails the
  suite rather than passing it.