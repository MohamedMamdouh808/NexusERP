# Implementation Plan: Staging Deployment

**Branch**: `003-staging-deployment` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-staging-deployment/spec.md`

## Summary

Make the verified build from the platform foundation actually run. Three hosted
components — Vercel for the interface, Render for the service, Supabase for
PostgreSQL 17 — are configured entirely from version-controlled definitions that carry no
secret values, so that a merge to `main` updates staging with no manual step and a failing
migration cannot take the environment down.

The specification's six user stories deliver four things:

1. **The deploy definitions.** A Render Blueprint at the repository root and a Vercel
   configuration inside the frontend's Root Directory, plus the interface host's `/api`
   forwarding rule that makes the browser see a single origin (User Stories 1 and 2).
2. **The service change.** Proxy trust becomes configuration rather than a constant compiled
   into the service, and the service keeps binding the platform-provided port on `0.0.0.0`
   (FR-007, FR-034).
3. **The verification that makes the definitions self-checking.** Parsers assert that the
   declared health path is the route the service actually serves, that the API rewrite
   precedes the single-page fallback, and that neither definition carries a secret value; a
   real-PostgreSQL integration test exercises the service end to end; a documented command
   proves the provider's data surface is closed (User Stories 4 and 5).
4. **The runbook and the honest limits** — plan and cost table, backup statement, and the
   explicit list of what is out of scope (User Story 6).

This feature builds **no application capability**. It changes one bootstrap line, adds
`TRUST_PROXY` to the validated environment, and adds configuration, tests, and
documentation. It is the terminal step the platform foundation deferred to it.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS. The root `engines.node` is
`>=22.13.0` and `.nvmrc` is `24`; the pipeline's `node-version: "22"` pin is a separate,
pre-existing inconsistency that this feature records rather than silently changes
([research.md R-010](research.md)).

**Primary Dependencies**: NestJS 11 and Prisma 6 are unchanged. This feature adds **no npm
dependency**: the Render Blueprint and the Vercel configuration are read as *data*, and the
specifications that assert their shape are self-contained parser tests following the pattern
the repository already established in `.github/workflows/__tests__/ci-no-deploy.spec.ts`.
Provider-side surfaces are the Render Blueprint schema, the Vercel project settings, and the
Supabase Management API.

**Storage**: Supabase managed **PostgreSQL 17**, reached through the provider's
**session-mode pooler** for both application traffic and migrations — one address, one mode;
the transaction-mode pooler is not used, because it does not keep the session a schema change
needs. The provider's automatic REST surface (the **Supabase Data API**) is **disabled at the
project level**, so the backend API is the only way to read or write. No table is created,
altered, or dropped by this feature.

**Testing**:

- **Unit** (Jest `unit` project, no database, no server) — `render-blueprint.spec.ts` and
  `vercel-config.spec.ts` parse the two definitions and assert that the health path equals the
  route the service actually serves, that `autoDeployTrigger` is `checksPass`, that the API
  rewrite precedes the single-page fallback, and that no secret-looking value is present;
  `trust-proxy.spec.ts` pins the new configuration's parsing and its off-by-default behavior.
- **Documented runnable check** — `scripts/check-supabase-data-api.sh` proves the data surface
  is closed by both observing the anonymous refusal and reading the project's own setting, so
  it cannot pass vacuously (FR-021, SC-005).
- **Secret scan** — `scripts/check-secrets.mjs`, runnable locally and wired into the
  mandatory checks (FR-030).
- **Unchanged** — Vitest for the interface, and every existing suite.

**Target Platform**: Vercel (static interface build plus an `/api` rewrite over the frontend's
own default domain), Render (**native Node runtime**, **free instance: 0.1 CPU / 512 MB**, cold
starts accepted), Supabase (managed PostgreSQL 17, Data API disabled).

**Project Type**: the existing npm-workspaces repository (`frontend`, `backend`, `database`,
`shared`) is unchanged. This feature adds version-controlled deployment configuration at the
repository root and inside the frontend workspace, one bootstrap change, verification, and
documentation. It creates no new project, package, or runtime service.

**Performance Goals**: **None.** This feature asserts no latency, throughput, availability,
backup, or recovery target. Staging runs on the free instance, and its cold starts, paused
database projects, and idle-stopped service instances are documented as observed behavior
rather than measured against a target (FR-045, Constitution Principle VII, and the
foundation's rule that uptime and recovery claims attach only when they are real).

**Constraints**:

- **Integration tests MUST run against a real PostgreSQL instance.** SQLite, in-memory
  substitutes, and mocked persistence are not acceptable for critical rules (Constitution
  Principle V).
- **No floating-point money or quantities.** This feature stores and computes none; it runs the
  same schema and the same database major version as every other environment, so the
  foundation's `NUMERIC(14,2)` / `NUMERIC(14,4)` / `NUMERIC(14,3)` conventions are exercised
  unchanged and no deployment definition introduces a numeric value (Constitution Principle
  IV).
- **No microservices, message brokers, Kubernetes, or Redis in v1.** This feature adds no
  broker, cache, worker, orchestrator, or additional runtime service; sessions, idempotency
  records, and rate-limit counters remain in PostgreSQL (Constitution Principle VI).
- **The Phase 4 build order holds (PRD Section 11).** Authentication and tenant isolation
  precede every business module; roles and audit precede inventory, purchasing, sales, and
  invoicing; idempotency and numbering precede the first posting endpoint. This feature
  touches only platform-level deployment and verification, which precedes all of them, so it
  moves no business module and reorders no dependency.
- **No secret value in a version-controlled file.** The deploy definitions carry variable
  names and non-secret settings only (FR-028); secrets exist only in the platforms' secret
  stores (FR-027).
- **Migrations are forward-only and applied exactly once on deploy** — applied by the
  platform's start command, because the free plan provides no pre-deploy step (FR-015).
- **The pipeline never deploys.** Adding a secret scan is a verification action, so the
  foundation's FR-050a remains true and `ci-no-deploy.spec.ts` keeps passing (FR-011).

**Scale/Scope**: three hosted components; one Render Blueprint at the repository root; one
`vercel.json` inside the frontend Root Directory; one new environment-variable contract
(`TRUST_PROXY`) plus the `.env.example` entries that document it; three new automated
specifications; one documented data-surface check; one secret scan; one deployment runbook
carrying the plan-and-cost table, the rollback procedure, and the backup statement.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle
before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result | Answer for this feature |
|-----------|---------------|--------|--------------------------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | PASS | No table is created or altered; no query path is added. The staging database is separate and the provider's own data surface is disabled. See gate note 1. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | PASS | No endpoint and no permission changes. The health address stays the single declared-public route. Proxy trust is treated as an authority decision. See gate note 2. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | PASS | No posting operation and no `Idempotency-Key` endpoint. The foundation's fail-safe migration rule is made operational at deploy time. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | PASS | No monetary or quantity value is stored, computed, transported, or introduced in any definition. The foundation's precisions run unchanged. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | PASS | The deploy-definition parsers, the real-PostgreSQL integration behaviour, the data-surface check, and the misconfigured-startup test are written and observed failing first. See gate note 5. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | PASS | No module is added, touched, or reordered. No dependency direction changes; no broker, cache, worker, or orchestrator is introduced. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | PASS | No invoice, document, or claim surface is produced. The runbook states the free-tier behavior and claims nothing beyond it. See gate note 3. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | PASS | No interface is designed or changed. The new surface is documentation, which is plain and structured and relies on neither color nor formatting alone. |
| IX. Scope Discipline | What is this feature's P0/P1/P2/P3 classification, and is the preceding phase's exit criteria met for P1 work? | PASS | P0 — the deployment and operations work the foundation deferred. Nothing from P1, P2, or P3 is included. See gate note 4. |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests,
no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the
Phase 4 build order for the modules involved.

### Gate notes

1. **Tenant isolation is untouched, and the deployment posture strengthens it.** This feature
   creates no organization-owned table, adds no query path, and therefore adds no new way to
   read across tenants. What it does contribute is the *closure of an out-of-band bypass*: the
   managed provider ships an automatic REST surface over every table, and that surface
   enforces none of the product's tenant or permission rules. Disabling it at the project
   level (FR-020) is what keeps the tenant rules the schema enforces from being bypassed by a
   request that never reaches the application. The staging database is also required to be
   separate from every developer's data and to hold no real organization's records
   (specification Constitution Compliance I).
2. **Proxy trust is an authority decision, not a convenience.** `app.set('trust proxy', ...)`
   currently reads a hardcoded `false` ([main.ts:56](file:///d:/web-projects/NexusERP/backend/src/main.ts#L53-L56)).
   A service behind a forwarding proxy that does not trust it records the *proxy's* address,
   and a service that trusts too widely lets the caller dictate the address it records — which
   is precisely the input rate limiting and audit will later rely on. FR-007 therefore moves
   the setting into validated configuration: off by default, and set in staging to the number
   of proxy hops actually in front of the service rather than a blanket `true`. The health
   address remains the only unauthenticated endpoint and stays declared `@Public()`
   explicitly, so default deny is unbroken.
3. **The honest boundaries are the deliverable, not a disclaimer.** Staging runs on entry
   plans because paid upgrades are out of scope, so the runbook states what a reviewer will
   observe — a database project that pauses when idle, a service instance that stops when
   idle, a cold start on the next request, and any plan-level limit on deploy history or on a
   pre-deploy step — instead of hiding it. Migrations are forward-only, so the rollback
   section states what a rollback cannot undo. The backup section claims only the providers'
   own retention and records the retention gap as an open product-requirements decision
   (FR-039). No surface produced here states that staging is production-ready.
4. **Scope discipline is why this feature is small.** It is P0: the platform foundation
   produced a verified build and explicitly deferred running it to this feature.
   Excluded and remaining deferred: a production environment, a custom domain, paid plan
   upgrades, backups beyond the providers' own, a monitoring vendor, and authentication.
   Nothing from P1, P2, or P3 is included.
5. **Test-first is satisfied by tests that could not have passed before the change.** Each new
   specification is written against a definition that does not yet exist or a behavior that
   does not yet hold, and is observed failing first:
   - the parsers fail while `render.yaml` and `vercel.json` are absent;
   - the health-path assertion fails if the declared path and the route the service serves
     disagree — the property FR-023 exists to guarantee;
   - the rewrite-order assertion fails if the single-page fallback is evaluated first;
   - the data-surface check fails if the anonymized request is answered.
   The existing coverage threshold continues to apply and no suite is skipped to make the
   deploy path look green.

### Post-design re-check

Re-evaluated after Phase 1 produced [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), and [quickstart.md](quickstart.md).

| Principle | Pre-design | Post-design | Change |
|-----------|-----------|-------------|--------|
| I. Tenant Isolation | PASS | PASS | Reinforced. The design pins the data surface closed at the project level and keeps the staging database separate; no table and no query path is added. |
| II. Server-Enforced Authority | PASS | PASS | Unchanged. One endpoint, explicitly public; proxy trust now comes from validated configuration instead of a constant. |
| III. Transactional Integrity | PASS | PASS | Strengthened. The single migration route and the start command's failing exit are the mechanism, and the rollback wording is pinned to restoration rather than continuity. |
| IV. Exact Decimals | PASS | PASS | Unchanged. Verified that no definition introduces a numeric value. |
| V. Test-First | PASS | PASS | Unchanged, now with named specifications and named hosts (`unit` for the parsers, `integration` for the real-PostgreSQL behaviour). |
| VI. Modular Boundaries | PASS | PASS | Unchanged. Deploy configuration lives beside the code as data; no module is touched. |
| VII. Honest Boundaries | PASS | PASS | Strengthened. The runbook's plan, cost, backup, and rollback sections are contract items, not prose the plan hopes for. |
| VIII. Design System & A11y | PASS | PASS | Unchanged. No interface surface is produced; the documentation is plain and structured. |
| IX. Scope Discipline | PASS | PASS | Unchanged. P0, with the excluded set enumerated in the runbook so the omission cannot be read as a guarantee. |

**No gate failed.** The plan proceeds with an intentionally empty Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/003-staging-deployment/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (/speckit.specify command output)
├── research.md          # Phase 0 output: 15 decisions with rationale and rejected alternatives
├── data-model.md        # Phase 1 output: the configuration entities, and the explicit non-tables
├── quickstart.md        # Phase 1 output: how to run every check this feature adds
├── checklists/
│   └── requirements.md  # Specification quality checklist (/speckit.specify command output)
├── contracts/
│   ├── deploy-definitions.md   # The required shape of the Blueprint and the Vercel config the tests enforce
│   └── environment-variables.md# Every variable, the platform that sets it, and whether it is secret
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
NexusERP/
├── render.yaml                          # NEW  Render Blueprint, repository root (FR-013)
├── .env.example                         # EDIT add TRUST_PROXY; name the platform per variable (FR-029)
│
├── frontend/
│   ├── vercel.json                      # NEW  must live in the Root Directory to take effect
│   └── vite.config.ts                   # UNCHANGED  already proxies /api in dev and preview
│
├── backend/
│   ├── src/
│   │   ├── main.ts                      # EDIT  trust proxy from configuration (FR-007)
│   │   └── config/
│   │       └── configuration.ts         # EDIT  TRUST_PROXY in the validated schema
│   └── scripts/__tests__/
│       ├── render-blueprint.spec.ts     # NEW  parses render.yaml (unit)
│       ├── vercel-config.spec.ts        # NEW  parses vercel.json (unit)
│       └── trust-proxy.spec.ts          # NEW  TRUST_PROXY parsing and off-by-default (unit)
│
├── scripts/
│   ├── check-supabase-data-api.sh       # NEW  the documented, runnable data-surface check (FR-021)
│   └── check-secrets.mjs                # NEW  the runnable secret scan (FR-030)
│
├── .github/workflows/
│   └── ci.yml                           # EDIT  run the secret scan as a mandatory check only
│
└── docs/
    └── staging-deployment.md            # NEW  runbook, plan-and-cost table, backup statement, rollback
```

Documentation is placed at `docs/staging-deployment.md` because the runbook is the single
document FR-037 requires and it belongs beside `docs/PRD.md`, not inside the feature's
specification directory: it is the artefact a reader follows to *rebuild* staging, so it must
outlive this feature's directory. Its three contract sections — plan and cost, backup, and
rollback — carry the honest-boundary content the specification names in FR-038, FR-039, and
FR-041.

### Structure Decision

The repository layout is **unchanged**: npm workspaces `frontend`, `backend`, `database`, and
`shared` at the root, exactly as `002-repo-restructure` left them. This feature adds files
inside that layout and touches two source files, and the placement of each new file is
dictated by a provider's rule rather than by preference:

| New file | Location | Why it must be there |
|---|---|---|
| `render.yaml` | repository root | A Render Blueprint defaults to `render.yaml` at the repository root; a Blueprint elsewhere must be registered by path. Root placement is what makes FR-013's "version-controlled deploy definition" work with no extra step. |
| `frontend/vercel.json` | inside the Root Directory | Vercel **ignores** a `vercel.json` that is not in the project's Root Directory. Since the Root Directory is set to the frontend workspace, the file's home is fixed by that setting; putting it at the repository root would be silently inert. |
| `docs/staging-deployment.md` | `docs/` | It is the deployment runbook FR-037 requires and the documented home of the cost and backup statements; it must remain findable after this feature's directory is archival. |
| `backend/scripts/__tests__/*.spec.ts` | backend unit project | The Jest `unit` project's `testMatch` includes `backend/scripts/**/*.spec.ts`, so these parsers run in the existing mandatory `unit` check with no pipeline change — the same placement and the same self-contained-parser approach as `check-migration-history.spec.ts`. |
| `scripts/check-supabase-data-api.sh`, `scripts/check-secrets.mjs` | repository `scripts/` | Both are standalone, runnable checks outside any workspace, following the precedent of `check-structure.ts`. |

Two deliberate **non-changes** keep the feature honest:

- **`frontend/vite.config.ts` is not touched.** It already proxies `/api` in both `server` and
  `preview`, which is the development-side expression of the same single-origin rule the
  production rewrite implements.
- **No workflow gains a deploy step.** The only pipeline edit adds a verification step, and
  `ci-no-deploy.spec.ts` continues to assert that no step pushes, deploys, or releases.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No constitution violations.** The Constitution Check passed pre-design and passed the
post-design re-check, with no deviation requiring justification. The table below is
intentionally empty; it is populated only when a gate fails or a principle must be set aside.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

---

## Phase 0 — Research

Complete. See [research.md](research.md): 15 decisions, each with its rationale and the
alternatives considered and rejected, covering the Blueprint's shape and placement, the
single migration route on an entry plan, Vercel's Root Directory and configuration placement,
the monorepo install and build commands, the rewrite order and the API-prefix collision, proxy
trust as configuration, port binding, keeping the declared health path and the real route in
agreement, the self-contained parser tests, the Node-version pin inconsistency, secret
handling and the no-secret-value assertion, the secret scan, the data-surface check, the deploy
trigger, and the runbook's home and boundaries. No
`NEEDS CLARIFICATION` item remains unresolved.

## Phase 1 — Design and Contracts

Complete. See [data-model.md](data-model.md) for the configuration entities the specification
defines — staging environment, deploy definition, environment variable, secret, migration,
health check, rollback, and runbook — modelled as configuration rather than database tables,
and for the explicit statement that this feature creates no table. See
[contracts/deploy-definitions.md](contracts/deploy-definitions.md) for the required shape of
the Blueprint and the Vercel configuration that the unit specifications enforce, and
[contracts/environment-variables.md](contracts/environment-variables.md) for every variable,
the platform that sets it, and whether it is a secret. See [quickstart.md](quickstart.md) for
how to run each check this feature adds.

Agent context updated: `AGENTS.md` and `.trae/rules/project_rules.md` now point to this plan
between their `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers.
