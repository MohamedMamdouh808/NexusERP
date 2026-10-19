---

description: "Task list for the NexusERP staging deployment"
---

# Tasks: Staging Deployment

**Feature**: Staging Deployment (`003-staging-deployment`)
**Branch**: `003-staging-deployment`
**Input**: Design documents from `/specs/003-staging-deployment/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user
story MUST include its tests, written before the implementation and observed failing. Tests run
against a real PostgreSQL instance; SQLite, in-memory substitutes, and mocked persistence layers
are not acceptable substitutes for critical-path tests.

**Mandatory task types** (Constitution Principles I–VI, VIII, IX). Each is recorded here with
its status in this feature, following the foundation's precedent of stating a non-applicability
rather than omitting it:

- **Tenant isolation test** for every endpoint, report, and export added (Principle I) — **N/A**:
  no organization-owned table is created, no query path is added, and no endpoint reads
  organization data. The feature instead *closes* an out-of-band bypass by switching the managed
  provider's automatic data surface off and proving it (T030–T033).
- **Permission declaration plus default-deny test** for every endpoint (Principle II) — **N/A**:
  no endpoint is added. The health address remains the only declared-public route and
  `backend/test/integration/default-deny.spec.ts` continues to assert it. Proxy trust is treated
  as an authority decision rather than a convenience (T008, T013).
- **Idempotency test** for every posting endpoint (Principle III) — **N/A**: no posting endpoint
  exists. The analogous property is that a deploy re-run applies no migration twice and changes
  no data (T029).
- **Transaction rollback test** for every multi-record operation (Principle III) — **N/A**: no
  multi-record operation is added. The analogous property is that a failed migration aborts the
  deploy and leaves the database at its last applied state (T026–T028).
- **Concurrency test** for stock reservation, shipment, and payment allocation — **N/A**: no such
  operation exists in this feature.
- **Decimal calculation test vectors** with half-up rounding (Principle IV) — **N/A**: no
  monetary or quantity value is stored, computed, or transported, and no definition introduces a
  numeric literal. The schema and its `NUMERIC` conventions are deployed unchanged.
- **Immutability test** proving posted records cannot be updated or deleted (Principle III) —
  **N/A**: no posted record exists.
- **Audit-record test** proving the audit row commits with the business change (Principle III) —
  **N/A**: no audited business action exists.
- **UX and accessibility tasks** for design-system tokens, PRD 7.3 states, and WCAG 2.1 AA
  (Principle VIII) — the only surface this feature adds is **documentation**, which must be
  plain, structured, and readable without relying on color or on formatting alone (T040–T048).
  No interface is designed or changed; the health panel's existing accessible behaviour is
  unchanged.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each story. Task IDs are local to this feature (`T001`…), as they are in
`001-platform-foundation` and `002-repo-restructure`; a task that needs to point at work from
another feature names that feature explicitly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Workspace root**: `render.yaml`, `.env.example`, `package.json`, `scripts/`,
  `.github/workflows/`
- **Service**: `backend/src/`, with `backend/src/config/` for the validated environment;
  `backend/scripts/__tests__/` for the deploy-definition and configuration specifications;
  `backend/test/integration/` for the real-database specifications
- **Web**: `frontend/`, with `frontend/vercel.json` in the project's Root Directory
- **Documentation**: `docs/`
- **Feature documents**: `specs/003-staging-deployment/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the ground the feature stands on. It adds no project, package, or
scaffolding, so setup is verification rather than creation.

- [ ] T001 Verify the feature branch is `003-staging-deployment` and the working tree is clean
  (`git branch --show-current`, `git status --short`), so every later diff is attributable to
  this feature.
- [ ] T002 [P] Confirm neither `render.yaml` nor `vercel.json` exists anywhere in the repository
  (`Glob **/render.yaml`, `Glob **/vercel.json`), so the definition specifications written in
  T006 and T007 are observed failing because the artefact is absent rather than because of a
  parser mistake.
- [ ] T003 [P] Confirm the toolchain every new check needs is available and record what was
  found: `node` and `npm` for every check, and a POSIX `sh` for
  `scripts/check-supabase-data-api.sh` (T030). Record what was found rather than assuming it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two prerequisites that block **every** story. Neither creates behaviour; both
decide whether the work that follows is describing the repository that actually gets deployed.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Merge `002-repo-restructure` into `main` (or confirm it is already merged), then
  create or refresh `003-staging-deployment` from that `main`. **Why blocking**: every deploy
  definition, path, and command in this feature describes the post-restructure layout
  (`backend/`, `frontend/`, `database/`, `shared/`), both hosts deploy from `main`, and the
  branch protection in T022 protects `main` (FR-009, FR-010, FR-013). A definition merged onto a
  branch the hosts never build is a definition that is never applied — and the failure is
  silent.
- [ ] T005 Record the pre-change baseline of the existing gate set on `main`, one command at a
  time: `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:integration`, `npm run build`, and
  `node .github/workflows/__tests__/ci-no-deploy.spec.ts`. FR-043 requires the
  existing suites to keep passing, and a red baseline makes every later failure
  unattributable. Record the observed result per command rather than asserting that it is green
  — a pre-existing failure is a finding, not something to fix silently inside this feature
  (Principle IX).

**Checkpoint**: The repository the definitions describe is on `main`, and a failure later can be
attributed to this feature or ruled out as pre-existing.

---

## Phase 3: User Story 1 - A Live Staging URL Exists (Priority: P1) 🎯 MVP

**Goal**: The staging address serves the application shell over HTTPS from the frontend host,
the API answers from the backend host through that same single origin, and the database is a
managed PostgreSQL 17 instance.

**Independent Test**: Open the staging address in a browser and confirm the shell renders with
the health panel reporting the database as ok; then request the health path at that same address
and confirm a successful response whose database check is ok.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [P] [US1] Write FAILING unit test `backend/scripts/__tests__/render-blueprint.spec.ts`.
  Hand-parse the `render.yaml` subset with a small explicit parser — **no YAML dependency is
  added**, following `.github/workflows/__tests__/ci-no-deploy.spec.ts`. Assert **structurally**,
  not by substring: exactly one service and its type is `web`; `runtime: node`; the build and
  start commands are the repository's own, and the start command applies migrations before it
  starts the API;
  `plan: free`; `healthCheckPath` **equals the route derived from source** — the global prefix
  read from `backend/src/main.ts`'s `setGlobalPrefix('api/v1')` composed with the health
  controller's declared path in `backend/src/platform/health/health.controller.ts` — rather than
  a second copy of the literal; `autoDeployTrigger` is `checksPass`; `PORT` is absent; no
  `preDeployCommand` is present; and the plain values carry no wildcard cross-origin rule. Fails
  while `render.yaml` does not exist. See
  [contracts/deploy-definitions.md](contracts/deploy-definitions.md) §1 and
  [research.md R-008](research.md). (FR-013, FR-015, FR-023, FR-024, FR-034; the
  `checksPass` assertion serves FR-010, authored here because the definition is authored once.)

- [ ] T007 [P] [US1] Write FAILING unit test `backend/scripts/__tests__/vercel-config.spec.ts`.
  Assert on the parsed JSON: `rewrites` is a non-empty ordered array; the **first** rewrite's
  source is `/api/:path*` — the `/api` path **segment**, not a string prefix such as `api*`; its
  destination is an absolute service URL ending in the same `/api/…` path; the **second** rewrite
  is `/(.*)` → `/index.html`; the API rule's index is strictly less than the fallback's; the
  `installCommand` changes up out of the Root Directory and runs `npm ci --frozen-lockfile`; the
  `buildCommand` builds `@nexuserp/shared` **before** `@nexuserp/web`; `outputDirectory` is
  `dist`; and `framework` is `vite`. Fails while
  `frontend/vercel.json` does not exist. The assertion must not pin the service's hostname,
  which is account-specific. See
  [contracts/deploy-definitions.md](contracts/deploy-definitions.md) §2 and
  [research.md R-005](research.md). (FR-005, FR-006, FR-008)

- [ ] T008 [P] [US1] Write FAILING unit test `backend/scripts/__tests__/trust-proxy.spec.ts`.
  Assert that the validated environment schema in `backend/src/config/configuration.ts` defaults
  `TRUST_PROXY` to off when the variable is absent; accepts `false` and a positive integer
  naming a hop count; rejects anything else with a message that **names the variable**; and that
  the value the bootstrap passes to `app.set('trust proxy', …)` is the parsed configuration value
  rather than a literal. Fails while `TRUST_PROXY` is absent from the schema. See
  [research.md R-006](research.md). (FR-007, FR-031, SC-008)

- [ ] T009 [US1] Write FAILING integration test
  `backend/test/integration/boot-smoke.spec.ts`. Run the service against a real PostgreSQL 17,
  with the repository's migration route applied first and then the API started, and assert that
  the health path returns `200` with a healthy report and that a request to a route that declares
  no permission is refused. Because the plan records FR-034 as **already satisfied by the
  service's bootstrap** (a deliberate non-change), a green first run is expected — start the
  service on a port other than the one provided and confirm the test can fail. See
  [research.md R-014](research.md). (FR-015, FR-023, FR-034)

### Implementation for User Story 1

- [ ] T010 [US1] Create `render.yaml` at the repository root with the content fixed by
  [contracts/deploy-definitions.md](contracts/deploy-definitions.md) §1: one `web` service named
  `nexuserp-api-staging`, `runtime: node`, `plan: free`, `buildCommand: npm ci && npm run build
  --workspace @nexuserp/shared && npm run build --workspace @nexuserp/api`, `startCommand: npm
  run db:migrate && npm run start --workspace @nexuserp/api`, `healthCheckPath: /api/v1/health`,
  `autoDeployTrigger: checksPass`, and an `envVars` list carrying `NODE_ENV: production`,
  `LOG_LEVEL: info`, `CORS_ORIGINS`, `TRUST_PROXY: "1"` as plain values, `DATABASE_URL` as
  `sync: false`, and `SESSION_SECRET`/`CSRF_SECRET` as `generateValue: true`. **No `PORT`** — the
  platform provides it and declaring it here would override the platform's value (FR-034). **No
  `preDeployCommand`** — the free plan provides none, so the start command is the single
  migration route (FR-015). Reverse T006. (FR-013, FR-023, FR-027, FR-028)

- [ ] T011 [P] [US1] Create `frontend/vercel.json` — **inside** the Root Directory, because
  Vercel honours a configuration file only there — with `framework: vite`, `installCommand:
  "cd .. && npm ci --frozen-lockfile"`, `buildCommand: "cd .. && npm run build --workspace
  @nexuserp/shared && npm run build --workspace @nexuserp/web"`, `outputDirectory: "dist"`, and
  the two-element `rewrites` array in the order the contract fixes: the API forwarding rule
  first, the single-page fallback second. Leave the destination hostname as the account-specific
  substitution T017 fills in. Reverse T007. (FR-005, FR-006, FR-013)

- [ ] T012 [P] [US1] Add `TRUST_PROXY` to `environmentSchema` in
  `backend/src/config/configuration.ts`: default `false`, accepting `false` or a positive
  integer hop count, rejecting every other value with a message that names the variable. The
  default must stay `false` so a newly-provisioned or misconfigured environment fails closed —
  it records the caller's socket address rather than a spoofable forwarded header. Do **not**
  gate the setting on `NODE_ENV === 'production'`: the deploy sets `NODE_ENV=production` on
  staging deliberately, so that gate would switch trust **on** in the one environment the
  specification says must not have it. Reverse T008. See [research.md R-006](research.md).
  (FR-007, FR-031)

- [ ] T013 [US1] Replace the hardcoded `app.set('trust proxy', false)` in
  `backend/src/main.ts` with the parsed configuration value, so the setting is configuration
  rather than a constant compiled into the service. Confirm the global prefix, the CORS
  allowlist, and the `0.0.0.0` binding are untouched, and that the health address stays the only
  route declared public. (depends on T012) (FR-007, FR-034)

- [ ] T014 [US1] Create the Supabase project for staging on **PostgreSQL major version 17** —
  the version the foundation pinned — and record the **session-mode** pooler connection address
  as the one address used for both application traffic and migrations. The transaction-mode
  pooler is not used, because it does not keep the session a schema change needs. The project
  must be independent of every other environment: its own database, its own configuration, no
  credential shared with development or test. (FR-001, FR-002, FR-003)

- [ ] T015 [US1] Create the Render service by applying the repository's Blueprint (T010).
  Enter `DATABASE_URL` when the Dashboard prompts for it — `sync: false` is the prompt, which is
  how the connection string, which embeds a credential, stays out of the repository — and let
  Render generate `SESSION_SECRET` and `CSRF_SECRET`. Confirm the service is built from the
  repository's own build command rather than a second build, and record the service's
  address for T017. (depends on T010, T014) (FR-013, FR-027)

- [ ] T016 [US1] Create the Vercel project for staging with the **Root Directory** set to the
  frontend workspace and **"Include source files outside of the Root Directory in the Build
  Step"** enabled — the frontend's build resolves `@nexuserp/shared`, which sits outside the Root
  Directory, so a build that sees only the frontend directory cannot resolve it. Set the
  production branch to `main`. Record the project's default domain for T017. See
  [research.md R-003](research.md). (FR-001, FR-005)

- [ ] T017 [US1] Fill the two account-specific non-secret substitutions that only exist once
  both hosts exist, then commit them: the service's address into the API rewrite's destination
  in `frontend/vercel.json` (T015), and the interface's origin into `CORS_ORIGINS` in
  `render.yaml` (T016) as an explicit allowlist, never a wildcard. Re-run T006 and T007 to
  confirm the real values still satisfy both specifications. Neither value is a secret. (depends
  on T015, T016) (FR-005, FR-006, FR-027)

- [ ] T018 [US1] Verify US1's first acceptance scenario on the deployed staging address: the
  application shell loads over HTTPS with a valid certificate and renders, the health panel
  reports the database as ok, and no console error is caused by a blocked or cross-origin
  request. A blocked request here means the rewrite is wrong, not that CORS needs widening. (FR-001,
  FR-008, FR-025, SC-002)

- [ ] T019 [US1] Verify US1's remaining scenarios: request `/api/v1/health` at the staging
  address and confirm a success response whose database check is ok, delivered through the
  interface host rather than the service's own address; then query the running database for its
  major version and confirm it is **17**, so a migration verified locally cannot fail only
  because staging differs. (FR-002, FR-023, FR-025, SC-003)

**Checkpoint**: The staging address serves the product to a reviewer, and the first deploy has
applied the full migration history from an empty database.

---

## Phase 4: User Story 2 - A Merge Ships It (Priority: P1)

**Goal**: Once the mandatory checks pass on a merge to `main`, staging updates by itself. No
dashboard is opened, no deploy command is run, nothing is copied by hand — and the pipeline still
deploys nothing.

**Independent Test**: Merge a trivial change into `main` with all mandatory checks green and,
with no manual step, confirm the version serving on staging is the merge commit.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: The definition-side assertion for this story — `autoDeployTrigger: checksPass` — is
> carried by T006, because the Blueprint is authored once and parsing it twice would be a second
> copy of the same assertion. The tasks below cover the two properties T006 cannot: the
> pipeline's deploy-freedom, and the protection that actually holds the gate.

- [ ] T020 [P] [US2] Extend `.github/workflows/__tests__/ci-no-deploy.spec.ts` so it keeps
  proving the pipeline's deploy-freedom after this feature edits the workflow: assert no job
  pushes or publishes a build artefact, logs in to a registry, or contains a deploy, release,
  or restart step, and
  that the job this feature adds (T038) runs only a repository-local command. Observe the
  assertion **failing** against a deliberately introduced deploy step, record the output, then
  remove it. This file already exists and is run by the `workflow` job; do not weaken an existing
  assertion to make room for the new one. (FR-011, SC-013)

### Implementation for User Story 2

- [ ] T021 [US2] Verify the pull-request preview boundary: open or update a pull request and
  confirm any preview it produces reads, writes, and migrates nothing on staging — no staging
  `DATABASE_URL` is present in the preview's environment and no `db:migrate` step runs there —
  so the preview is view-only with respect to staging data. (FR-012)

- [ ] T022 [US2] Set up branch protection on `main`: every mandatory check declared a **required
  status check**, the branch **required to be up to date before merging**, and **direct pushes
  disallowed**. The required list is the nine existing checks plus the `Secret scan` job T038
  adds, so this task depends on T038. This is a one-time, human, provider-side setup that cannot
  be expressed in the repository, which is why it is a task rather than a file. (depends on T038)
  (FR-010)

- [ ] T023 [US2] Verify the protection rather than asserting it: a pull request carrying a
  deliberately failing mandatory check must be **unable to merge** — record the observed refusal,
  including which check was reported and which setting refused the merge. An unverified
  protection setting is indistinguishable from an absent one, so this observation is the
  evidence SC-016 asks for. (depends on T022) (FR-010, SC-016)

- [ ] T024 [US2] Confirm each host deploys on push to `main` and that a merge ships with no
  manual step. Render holds the deploy until the commit's checks report success
  (`autoDeployTrigger: checksPass`, asserted by T006); the Vercel project's production branch is
  `main`. Then merge a trivial change whose checks are green and confirm, with no manual action,
  that the version serving on staging is the merge commit. Confirm in the other direction as
  well: a change whose checks are failing or incomplete reaches no staging component. (depends on
  T022) (FR-009, FR-014, SC-001)

**Checkpoint**: The release path is automatic and its gate is verified, and the pipeline still
deploys nothing.

---

## Phase 5: User Story 3 - A Bad Migration Cannot Take Staging Down (Priority: P1)

**Goal**: A migration that fails aborts the deploy; the version already serving keeps serving;
the database stays at its last applied state.

**Independent Test**: Deploy a deliberately failing migration to staging, then confirm the
address still serves the previously deployed version and the database records no partially
applied migration.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

- [ ] T025 [P] [US3] Confirm the migration route is single and fail-fast **by test rather than by
  reading**: run `backend/test/integration/boot-smoke.spec.ts` and the `integration` project's
  real-PostgreSQL specifications — which apply the repository's migrations and then start the
  API — against a migration whose SQL cannot apply, and assert both a non-zero exit and that
  nothing listened on the port. The repository's build and start commands are deliberate
  non-changes, so these must pass **unmodified**; a failure here is a finding to report, not a
  signal to add a second migration route. (FR-015, FR-017)

### Verification for User Story 3

- [ ] T026 [US3] Rehearse the deliberately failing migration against staging. Do it **without
  weakening the permanent protection**: branch protection will refuse to merge a migration that
  fails the `Migration validation` check, so rehearse by temporarily pointing the Render
  service's deploy branch at a rehearsal branch carrying a migration that cannot apply, rather
  than by relaxing the protection on `main`. Observe and record exactly what happens: the deploy
  aborts, and — the point of the exercise — **what the staging address does while the attempt
  ends**. Record any interruption honestly; the requirement is **restoration, not continuity**,
  and a free instance does not promise an interruption-free replacement. (FR-016, FR-044, SC-004)

- [ ] T027 [US3] Inspect the database's applied-migration history after the failed deploy: the
  failed migration must **not** be recorded as applied and no partial change may be left behind.
  Check the provider's own migration table directly and run `npm run check:migrations` against
  the staging database, which compares the applied history with the repository. (depends on T026)
  (FR-017)

- [ ] T028 [US3] Confirm the staging address still serves the **previously deployed** version
  once the attempt ends — not the failed one, and not a half-live combination — and that the
  new version never took traffic because it did not pass the platform health check. Then restore
  the service's deploy branch to `main` and delete the rehearsal branch. (depends on T026)
  (FR-016, FR-018)

- [ ] T029 [US3] Confirm a re-run of an already-successful deploy changes no data and applies no
  migration twice: deploy the restored commit a second time and compare the database's applied
  migration history and a seeded row count before and after. (depends on T028) (FR-019)

**Checkpoint**: The deploy path cannot quietly destroy the environment it serves, and the
observation behind that claim is written down rather than assumed.

---

## Phase 6: User Story 4 - Staging Is Reachable Only Through the Product (Priority: P1)

**Goal**: The managed database's broad data-access surface is switched off, the backend API is
the only way to read or write through the product, and an anonymous request to the provider's own
surface is demonstrated to disclose nothing.

**Independent Test**: Send an anonymous request to the managed database's REST surface for a
known table at the staging project and confirm the response contains no data — and confirm the
project itself reports the surface disabled.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

- [ ] T030 [US4] Write `scripts/check-supabase-data-api.sh` — POSIX shell, runnable by a reader
  with only `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN`, and requiring no deployment and
  no CI credentials (FR-042). It performs **two** assertions and fails unless **both** hold:
  (1) an anonymous request naming a known table at the project's own REST surface is **refused**
  and the response discloses no rows, with the observed status **recorded** rather than compared
  against a guessed code, so the assertion is pinned to a response the provider actually returns;
  and (2) the provider's Management API reads the project's Data API configuration as
  **disabled**. The second is what makes the check non-vacuous: a mistyped address, a missing
  project, and an unrelated error all produce "no rows" (FR-021). See
  [research.md R-013](research.md). (FR-020, FR-021, SC-005)

- [ ] T031 [US4] Observe the check failing **before** the setting is changed: Supabase enables the
  Data API by default, so running T030's script now must fail its second assertion. Record the
  failing output — this is the observation that proves the check is a check rather than a
  formality. (depends on T030) (Principle V, SC-005)

### Implementation for User Story 4

- [ ] T032 [US4] Disable the Data API at the Supabase staging project level. This is what keeps
  the schema's tenant and permission guarantees from being bypassed by a request that never
  reaches the application — the provider's surface enforces none of the product's rules. Note
  that the service's own connection is unaffected, because it does not pass through the data
  surface. (depends on T031) (FR-020)

- [ ] T033 [US4] Run `sh scripts/check-supabase-data-api.sh` against the staging project and
  record **both** assertions passing. Then confirm the setting exposed nothing the service needs:
  request the health path at the staging address and confirm the database check is still ok.
  (depends on T032) (FR-020, FR-021, SC-005)

**Checkpoint**: The database is reachable only through the product, and that is demonstrated by
a command a reader can run rather than asserted in prose.

---

## Phase 7: User Story 5 - Configuration Is Legible and Secret-Free (Priority: P1)

**Goal**: Every variable staging consumes is listed with the platform that sets it, every secret
exists only in a platform secret store, a scan of the repository finds no secret, and a missing
required variable stops the service rather than letting it serve half-configured.

**Independent Test**: Read the repository and reconstruct a complete staging configuration
without opening a dashboard, except to read the secret values themselves; then run the secret
scan and confirm it reports nothing.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

- [ ] T034 [P] [US5] Write FAILING unit test `backend/scripts/__tests__/deploy-secrets.spec.ts`.
  Parse **both** definitions structurally — reusing the hand-rolled parsers from T006 and T007,
  with no YAML dependency — and assert: every `envVars` entry carries a `key` and **exactly one**
  of `value`, `sync: false`, or `generateValue: true`; every secret-bearing entry uses
  `sync: false` or `generateValue: true` and carries **no** `value`; `SESSION_SECRET` and
  `CSRF_SECRET` use `generateValue: true`; the database connection variable uses `sync: false`;
  and no value anywhere in either definition matches a secret-shaped pattern — a connection
  string carrying a password, a long base64 or hex blob, or a provider-prefixed key. Asserting
  the **mode** rather than searching for a password is what makes this structural: it fails the
  moment someone adds a `value:` to a secret entry, whatever that value happens to look like. See
  [research.md R-011](research.md). (FR-027, FR-028, SC-006)

### Implementation for User Story 5

- [ ] T035 [P] [US5] Create `scripts/check-secrets.mjs`: a self-contained scan that walks the
  repository's tracked files, applies an explicit and documented pattern set — provider-prefixed
  keys, private-key blocks, connection strings carrying a password, and long high-entropy tokens
  — with an allowlist for the documented placeholders `.env.example` is **required** to carry,
  reports each finding with its file and line, and exits non-zero when it finds one. It must run
  with no arguments and no `npm ci`, so it exists the moment the file does rather than depending
  on a tool being installed. An allowlist is what keeps it honest in the other direction: a scan
  that flags the placeholders FR-029 mandates is a scan someone disables, and a disabled scan
  reports nothing for the wrong reason. See [research.md R-012](research.md). (FR-030)

- [ ] T036 [US5] Prove the scan can fail: add a line matching a pattern to a tracked file, run
  `node scripts/check-secrets.mjs`, record the non-zero exit and the reported finding, then
  restore the file exactly. A scan that has only ever reported nothing is indistinguishable from
  a scan that cannot report. (depends on T035) (Principle V, FR-030)

- [ ] T037 [P] [US5] Update `.env.example` so every variable the deployment needs appears with a
  safe placeholder **and** an indication of which platform sets it: `NODE_ENV`, `PORT`,
  `DATABASE_URL`, `LOG_LEVEL`, `CORS_ORIGINS`, the new `TRUST_PROXY`, `SESSION_SECRET`, and
  `CSRF_SECRET`. `TRUST_PROXY` must document that it is off by default, that a positive integer
  is a hop count rather than a switch, and that setting it wider than the real hop count trusts
  an entry a caller can supply. Cross-check the list against
  [contracts/environment-variables.md](contracts/environment-variables.md) §Rules 1 so a variable
  the schema reads cannot be missing here. (FR-026, FR-029)

- [ ] T038 [US5] Add the secret scan to the mandatory checks: a job named for the scan in
  `.github/workflows/ci.yml` running `node scripts/check-secrets.mjs`, with the same checkout and
  Node setup as its neighbours and **no** registry login, push, or deploy step. Then run
  `node .github/workflows/__tests__/ci-no-deploy.spec.ts` and confirm the added job leaves the
  pipeline's deploy-freedom assertion passing — adding a verification step must not make the
  pipeline a deployer. (FR-030, FR-011)

- [ ] T039 [US5] Extend `backend/src/config/__tests__/config.spec.ts` to assert the refusal
  explicitly: starting with `DATABASE_URL` absent must stop the service with a message naming the
  variable rather than letting it serve against an unconfigured database. Observe the new case
  failing if the schema's refusal is removed, then restore. (FR-031, SC-008)

**Checkpoint**: A reader can reconstruct staging's configuration from the repository alone except
for the secret values, and the repository is scanned for secrets on every change.

---

## Phase 8: User Story 6 - The Documented Way Into Staging (Priority: P2)

**Goal**: Someone who has never deployed this project can create the three projects, set the
variables, run the first deploy, verify it, and roll back, by following one document — which also
states what the plans cost and what backup protection actually exists.

**Independent Test**: Follow the runbook on fresh provider accounts and reach a serving staging
address, then perform a rollback.

### Implementation for User Story 6

- [ ] T040 [US6] Create `docs/staging-deployment.md` — beside `docs/PRD.md`, not inside the
  feature directory, because its purpose is to let someone *rebuild* staging after this feature
  is archival — with the creation, configuration, first-deploy, and verification sections:
  creating the three projects; the one-time provider-side settings that cannot be expressed in
  the repository (the Vercel Root Directory and the outside-source-files setting, T016); every
  variable with the platform that sets it and what it controls, cross-checked against
  [contracts/environment-variables.md](contracts/environment-variables.md) and T037; the first
  deploy **including that it applies the full migration history from an empty database**; and
  verification (health at the staging address, the database major version, the data-surface
  check). (depends on T037, T033) (FR-037, FR-026, FR-029, FR-002, FR-025)

- [ ] T041 [US6] Add the rollback section: the procedure the platforms' own deploy history
  supports, that it restores the previously deployed version **without a manual database edit**,
  and that it **cannot undo a schema change** — migrations are forward-only, so a migration a
  rollback must survive is limited to additive, backward-compatible changes. Record what was
  actually observed during the T026 rehearsal rather than claiming zero downtime: the requirement
  is restoration, not continuity. (depends on T026) (FR-041, FR-016, SC-004)

- [ ] T042 [US6] Add the branch-protection section: required status checks (listing the ten
  checks, including the secret scan), the branch required to be up to date before merging, direct
  pushes disallowed, the reason this — rather than a deploy step — is what gates the deploy, and
  the verification by an attempted forbidden merge from T023, with its observed refusal recorded.
  (depends on T023) (FR-010, SC-016)

- [ ] T043 [US6] Add the plan-and-cost table: each component, the plan selected, what that plan
  includes, and its cost — and any upgrade marked **not purchased**, so the table cannot be read
  as an assumption. Include the entry-plan facts a reader will observe and pay for: the free
  service instance's CPU and memory, and any plan-level limit on deploy history, and the fact
  that the free plan provides no pre-deploy step (so migrations run in the start command).
  (FR-038)

- [ ] T044 [US6] Add the backup statement: what the chosen providers **actually give** for
  staging, explicitly what they **do not** give, and the retention gap — the difference between
  what the providers retain and what the product requirements will eventually need — recorded as
  an **open product-requirements decision** rather than resolved here or left unstated. Claim no
  restoration guarantee the providers do not offer. (FR-039, FR-045)

- [ ] T045 [US6] Add the scope section: identify the environment as **staging** and state that it
  is not production, and enumerate what is out of scope — a production environment, a custom
  domain, paid plan upgrades, backups beyond what the providers give, a monitoring vendor, and
  authentication — so no reader infers more than the feature delivers. (FR-004, FR-040)

- [ ] T046 [US6] Add the observed entry-plan behaviour section: a database project that pauses
  after inactivity, a service instance that stops when idle, the resulting cold start on the next
  request, and the wake-up procedure for each. State these as observed behaviour rather than as
  defects, because the feature may not buy its way out of them — a silent runbook reads as a
  guarantee, and a pause or a cold start the document does not name reads as an outage the
  document promised would not happen. (FR-045, Constitution Principle VII)

- [ ] T047 [US6] Document the data-surface check as a runnable command, including the two
  environment variables it needs and how to interpret both assertions, and state **what would
  become reachable if the Data API were enabled** — every table through a surface that enforces
  none of the product's tenant or permission rules — so re-enabling it is a deliberate and
  informed decision rather than a toggle. (depends on T030) (FR-021, FR-022)

- [ ] T048 [US6] Document the checks a reader can run without deploying (the definition
  specifications, the real-PostgreSQL integration check, the secret scan, and the data-surface
  check), and the secret-rotation rule: a rotated secret is
  completed by redeploying or restarting the service, because a running service keeps the value
  it started with. Then read the whole document for readability without reliance on color or on
  formatting alone. (FR-042, FR-027; Constitution Principle VIII)

- [ ] T049 [US6] Walk the runbook end to end as its reader: from empty provider accounts, follow
  it to a serving staging address with the database check ok, then perform the documented
  rollback and confirm the previous version serves again without a manual database edit. Record
  every place the document was wrong, silent, or assumed knowledge, and fix the document — the
  walkthrough is this story's test, and an unwalked runbook is prose. (FR-037, FR-041, SC-014)

**Checkpoint**: The environments can be rebuilt from the repository plus the runbook, and the
document's silence is not read as a guarantee.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and verifications that span every story.

- [ ] T050 [P] Run the full local gate set and record the result per command: `npm ci`,
  `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:integration`, `npm run build`,
  `node .github/workflows/__tests__/ci-no-deploy.spec.ts`, and
  `node scripts/check-secrets.mjs`. Compare against the T005 baseline, so a pre-existing failure
  is not mistaken for a regression and a new one is not missed. (FR-043, SC-012)

- [ ] T051 [P] Confirm local development is unchanged: `npm run dev` starts the API and the
  interface together against a local PostgreSQL 17, the same defaults, and the same documented
  commands. Confirm `frontend/vite.config.ts` still proxies `/api` in both `server` and `preview`,
  which is the development-side expression of the same single-origin rule the production rewrite
  implements. (FR-032, SC-009)

- [ ] T052 [P] Confirm the deployable artefact is built by the repository's own commands: the
  Blueprint's `buildCommand` and `startCommand` are the same commands the pipeline's `build` job
  and the `integration` project run, and the schema's `NUMERIC` conventions run unchanged because
  this feature writes no monetary or quantity value. (FR-013, FR-015; Principle IV)

- [ ] T053 [P] Run the providers' own validators as a **complementary** step, not as the
  assertion: `render blueprints validate render.yaml`. Record the result and confirm it is
  understood as validating the provider's schema rather than this feature's requirements — a
  definition can satisfy the schema and still declare the wrong health path or the wrong trigger,
  which is why T006 asserts those directly. (FR-013, FR-023)

- [ ] T054 [P] Audit every document this feature produces — `docs/staging-deployment.md`, the
  `specs/003-staging-deployment/` artifacts, and the repository's `README.md` where it touches
  the deployment — for any availability, backup, recovery, or uptime claim beyond what is
  actually delivered, and remove or reword each one found. (FR-045; Principle VII)

- [ ] T055 Re-break each guard this feature adds, record the failing output, then restore:
  change `healthCheckPath` in `render.yaml` and confirm T006 fails; swap the two `rewrites` and
  confirm T007 fails; add a `value:` to a secret entry and confirm T034 fails; start the service
  on a port other than the one provided and confirm T009 fails; enable the Data API and confirm
  T030's script fails. A guard that has not been observed failing is a guard nobody has tested.
  (Principle V)

- [ ] T056 Run the quickstart validation: every command in
  `specs/003-staging-deployment/quickstart.md` runs and behaves as the table beside it describes,
  including the documented troubleshooting entries. Fix the document where it does not.
  (FR-042)

- [ ] T057 Re-check every success criterion SC-001…SC-016 against observed evidence rather than
  intent, and record the result with the observation it rests on — naming any criterion that was
  not observed and why, rather than marking it met. (SC-001…SC-016)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**, because T004
  decides which repository shape the definitions describe and T005 decides whether a later
  failure is attributable
- **User Stories (Phase 3–8)**: All depend on Foundational
  - Can proceed in parallel (if staffed) or sequentially in priority order (P1 → P2)
- **Polish (Phase 9)**: Depends on all desired user stories, and specifically on T038 (the
  pipeline edit), T033 (the data-surface check), and T040–T049 (the documents T054 audits)

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependency on another story. It provisions the
  three hosted components every other story observes.
- **US2 (P1)**: Can start after Foundational — **one dependency on US5**: T022 declares the
  secret-scan job (T038, US5) a required status check, so the branch protection cannot be
  completed before that job exists. T020's pipeline assertion is independent.
- **US3 (P1)**: Can start after Foundational — its rehearsal (T026) needs US1's deployed service
  and its `main` deploy path, so it follows T024 in practice, though it tests a different
  property.
- **US4 (P1)**: Can start after Foundational — its project exists from T014 (US1); its
  assertions are independent of every other story.
- **US5 (P1)**: Can start after Foundational — independent of the others except that its
  definitions assertion (T034) parses the files US1 authors (T010, T011).
- **US6 (P2)**: Depends on US3, US4, and US5 by content, not by mechanism: T041 needs T026's
  recorded observation, T047 needs T030's script, and T040/T042 need T037 and T023. This is why
  it is P2 — it documents what the P1 stories make true, and documenting it first would mean
  writing down an intention.

### Within Each User Story

- Tests MUST be written first and observed to FAIL before implementation (Principle V). Where a
  test cannot fail first because the property already holds — T009 asserts a bootstrap the plan
  records as already satisfying FR-034, T031 observes a check before the setting it asserts is
  changed — the task states that and requires the failure to be produced deliberately before the
  test is accepted.
- Definitions before the providers that consume them
- The service's own change (T012, T013) before the deploy that exercises it
- Story complete before moving to the next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- T006, T007, T008 can run in parallel: three different files, no shared state
- T011, T012 can run in parallel with T010: different files
- T015 and T016 can run in parallel once T014 exists: two independent provider projects
- T020, T025, T034, T035, T037, T050–T054 are all marked [P] and touch different files
- Different user stories can be worked on in parallel by different team members, with the two
  declared exceptions above (T022 → T038; T026 → T041)

---

## Parallel Example: User Story 1

```bash
# Launch all three definition and configuration specifications together (tests are mandatory):
Task: "Write FAILING unit test backend/scripts/__tests__/render-blueprint.spec.ts that hand-parses render.yaml and asserts the health path equals the route derived from source"
Task: "Write FAILING unit test backend/scripts/__tests__/vercel-config.spec.ts that asserts the API rewrite precedes the single-page fallback and matches the /api segment"
Task: "Write FAILING unit test backend/scripts/__tests__/trust-proxy.spec.ts that asserts TRUST_PROXY defaults to off and rejects an invalid hop count by name"

# Launch the two independent definitions together:
Task: "Create render.yaml at the repository root with runtime node, plan free, the repository's own build and start commands, healthCheckPath /api/v1/health, autoDeployTrigger checksPass, and no PORT"
Task: "Create frontend/vercel.json with the API rewrite first, the SPA fallback second, and the shared-then-frontend build command"

# Launch the two provider projects together once the database exists:
Task: "Create the Render service by applying the Blueprint and enter DATABASE_URL when prompted"
Task: "Create the Vercel project with Root Directory set to the frontend workspace and outside-source-files enabled"
```

## Parallel Example: User Story 5

```bash
# The definition-secrecy assertion and the repository scan touch different files:
Task: "Write FAILING unit test backend/scripts/__tests__/deploy-secrets.spec.ts asserting every secret entry uses sync or generateValue and carries no value"
Task: "Create scripts/check-secrets.mjs, a self-contained scan with a documented pattern set and an allowlist for the .env.example placeholders"
Task: "Update .env.example with every variable, a safe placeholder, the platform that sets it, and the new TRUST_PROXY entry"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: open the staging address and confirm the shell and the health panel
   work, then request the health path at that address directly
5. Deploy/demo if ready — the address alone is already the deliverable every later feature needs

### Incremental Delivery

1. Complete Setup + Foundational → the repository on `main` is the one the definitions describe
2. Add US1 → a live staging address exists
3. Add US2 → a merge ships it, with the gate verified rather than assumed
4. Add US3 → the deploy path cannot quietly destroy the environment
5. Add US4 → the database is reachable only through the product
6. Add US5 → the configuration is legible and secret-free
7. Add US6 → the environment can be rebuilt by someone else, including its honest limits
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

This feature is small and its stories share the same three hosted components, so the realistic
split is by *artifact family* rather than by story:

1. The team completes Setup and Foundational together — T004 is a decision, not a file
2. Then:
   - Developer A: US1 (definitions, provider provisioning, the bootstrap change)
   - Developer B: US5 (the secrecy assertion, the scan, `.env.example`, the pipeline job)
   - Developer C: US4 (the data-surface check) and US3 (the migration rehearsal), which both
     need US1's deployed environment and can proceed as soon as it exists
   - Developer D: US6 (the runbook), which needs the artifacts the others produce
3. US2 closes last among the P1 stories, because its branch protection names every check

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps a task to a specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing — and where a property already holds, produce the
  failure deliberately rather than accepting a test that has only ever passed
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- **Manual, provider-side tasks are tasks.** Several steps in US1, US2, US3, and US4 are
  performed in a dashboard and cannot be expressed as a file (creating the three projects,
  entering a secret once, setting the Root Directory, enabling the outside-source-files setting,
  branch protection). They are listed as tasks because the feature's success criteria are
  observed there, and US6 is what makes them repeatable.
- **Nothing in this feature deploys from the pipeline.** The one workflow edit (T038) adds a
  verification step only, and `ci-no-deploy.spec.ts` keeps asserting it (T020)
- **Two deliberate non-changes**: `frontend/vite.config.ts`, and the workflow, which gains only a
  verification step and never a deploy step. A task that would have to modify either to pass is a
  task that has misread the plan
- Avoid: vague tasks, same-file conflicts between stories, and cross-story dependencies that
  break independence — the two that exist (T022 → T038, T041 → T026) are declared above rather
  than discovered

---

**Generated**: 2026-10-19
**Feature**: `003-staging-deployment`
**Branch**: `003-staging-deployment`
**Spec**: `specs/003-staging-deployment/spec.md`
**Plan**: `specs/003-staging-deployment/plan.md`
**Total Tasks**: 57 tasks across 9 phases (3 setup, 2 foundational, 14 + 5 + 5 + 4 + 6 + 10 user
story, 8 polish)
