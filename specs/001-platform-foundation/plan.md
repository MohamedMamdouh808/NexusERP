# Implementation Plan: Platform Foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-platform-foundation/spec.md`

## Summary

Deliver the NexusERP platform foundation: one repository holding a NestJS service and a React web
app in npm workspaces, a locally installed PostgreSQL 17 server for development, Prisma migrations
with idempotent reference data, a GitHub Actions pipeline that gates every merge, and the
cross-cutting HTTP concerns every later feature depends on — a single error envelope, request
identifiers, structured JSON logging, a health endpoint, and a generated OpenAPI contract.

The specification's four user stories map onto four deliverables: a one-command local environment
(User Story 1), a uniform and traceable API contract (User Story 2), an un-bypassable verification
pipeline (User Story 3), and a single coherent repository with a generated contract (User Story 4).

This feature deliberately builds **no business capability and no tenant-owned table**. It builds the
machinery that makes the business features safe to write: a unit of work so transactions compose,
a default-deny guard chain, a permission catalog, an error filter that cannot leak internals, and
a pipeline that proves all of it. Authentication, sessions, organizations, and business modules are
separate features with their own specifications; see [research.md R-015](research.md) and
[R-016](research.md) for what is deferred and why.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS, both workspaces, ES2023 target

**Primary Dependencies**:
Service — NestJS 11, Prisma 6, PostgreSQL driver via Prisma, `@nestjs/swagger`, `pino` (through
`nestjs-pino`), `pino-http` for request logging, `cookie-parser`, `class-validator` with
`class-transformer`, `decimal.js` (reached through `Prisma.Decimal`).
Web — React 18, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form with Zod.
Shared — Zod only, plus TypeScript types.
Exact patch versions are pinned in the committed `package-lock.json`; see
[research.md R-018](research.md).

**Storage**: PostgreSQL 17, the single system of record for all business state. Sessions,
idempotency records, and rate-limit counters live in PostgreSQL, not Redis. Development, test, and
production databases are separate. This feature stores only the global reference tables; the
sessions, idempotency records, and rate-limit counters named above belong to the features that
implement them, and this feature builds no rate-limiting mechanism.

**Testing**:
Service — Jest with two projects in one configuration: `unit` (no database) and `integration`
(Supertest against a booted application and a real PostgreSQL instance, migrations applied).
Web — Vitest with React Testing Library for components and hooks; Playwright for the smoke test.
Coverage thresholds enforced inside the runners: 80% for critical paths, reported as a CI artifact.

**Target Platform**: Node.js LTS. The service runs on Railway or Render with
managed PostgreSQL; selection is deferred to the deployment and operations work
([research.md R-019](research.md)). The web app is a static build. Browser support is Chrome 100+,
Safari 15+, Firefox 100+, Edge (Chromium), at desktop (1024px+) and tablet (768–1023px) widths.
Light mode only in v1.

**Project Type**: Single deployable modular-monolith service plus a single-page web application,
in one npm-workspace repository.

**Performance Goals**:
**None of the goals below is a requirement of this feature.** Each is either inherited verbatim from
PRD Section 8 and verified in the hardening spec (016), or is non-binding here. No success criterion
in this feature's specification asserts any of them, and no task in `tasks.md` measures them —
which is deliberate, because a goal with no measurement method is not verifiable.

| Goal | Status | Verified by |
|---|---|---|
| API responds within 500 ms at p95, excluding reports, imports, and exports | Inherited from PRD Section 8; not a requirement of this feature | Hardening spec (016) |
| Pages reach a usable state within 2 seconds at p95 | Inherited from PRD Section 8; not a requirement of this feature | Hardening spec (016) |
| Health check completes within 1 second at p95 | **Non-binding.** Removed: this value appears in neither the PRD nor the specification, and nothing here measures it | — |
| Structured logging adds under 5 ms per request at p95 | **Non-binding.** Removed: same reason | — |
| The pipeline completes a mandatory-check run in under 10 minutes | **Non-binding.** Removed: this is a pipeline ergonomics target, not a product outcome, and it depends on hosted runner capacity chosen later | — |

The foundation guarantees only what its specification asserts: that logging overhead is measurable
rather than assumed (FR-036 to FR-040) and that the health check completes fast enough to be used
as a probe. Latency budgets are established when the features that have user-facing latency
requirements exist.

**Constraints**:
- Integration tests MUST run against a real PostgreSQL instance. SQLite, in-memory substitutes,
  and mocked persistence layers are unacceptable substitutes for critical-path tests
  (Constitution Principle V, FR-047).
- Money MUST use `NUMERIC(14,2)`, unit price and unit cost `NUMERIC(14,4)`, quantity
  `NUMERIC(14,3)`. A JavaScript number MUST NOT carry a monetary or quantity value at any point —
  columns, types, contracts, fixtures, or tests. Values cross the API as strings
  (Constitution Principle IV, [research.md R-004](research.md)).
- No microservices, message brokers, Kubernetes, or Redis in v1. Sessions, idempotency records,
  and rate-limit counters live in PostgreSQL. Adding infrastructure requires a measured
  requirement, a recorded decision, and a constitution amendment (Constitution Principle VI).
- Every endpoint declares its required permission; an undeclared endpoint fails the suite.
  Authorization is default deny (Constitution Principle II).
- Any operation touching more than one record runs in one transaction obtained from the unit of
  work; a partially committed operation is never acceptable (Constitution Principle III).
- The build order for every module involved follows PRD Section 11: authentication and tenant
  isolation precede every business module; roles and audit precede inventory, purchasing, sales,
  and invoicing; idempotency and numbering precede the first posting endpoint; contacts and
  products precede documents referencing them. This feature contributes only platform-level
  infrastructure, which precedes all of them.
- P1 work starts only after the preceding phase's exit criteria are met; P3 is never implemented in
  v1 (Constitution Principle IX).

**Scale/Scope**:
Pilot dataset target is 10,000 products, 100,000 stock movements, and 50,000 invoices. This
feature creates three global reference tables and no tenant-owned table. Expected output is one
service package, one web package, one shared package, and one pipeline workflow.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle
before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result | Answer for this feature |
|-----------|---------------|--------|--------------------------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | PASS | No tenant-owned table is created. See gate note 1 below. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | PASS | One endpoint: `GET /api/v1/health`, declared `public` explicitly. No state transitions exist. See gate note 2. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | PASS | No posting operation, so no endpoint requires a key. The unit of work is established now. See gate note 3. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | PASS | No monetary or quantity column is created. The `decimalString` schema and the precision conventions are established now. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | PASS | Tests for the envelope, request identifier, health states, log redaction, migration idempotency, and drift are written first and observed failing. Target 80% on `common` and `platform`. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | PASS | `PlatformModule` only. No domain module is created and no table is written by another module. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | PASS | No invoice, document, or claim surface is produced. Documentation states the limitation explicitly (FR-054). |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | PASS | Tokens are referenced, never restated. Shell implements the loading, error, and empty-state rules; keyboard operable with visible focus. See gate note 4. |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | PASS | P0. Nothing P1, P2, or P3 is included. See gate note 5. |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests,
no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the
Phase 4 build order for the modules involved.

### Gate notes

1. **Tenant isolation passes vacuously, not by omission.** An organization-owned table cannot exist
   before `Organization`, which is P0-F002. This feature creates three *global* reference tables
   with no `organization_id`, so there is no organization data to isolate and no isolation test to
   write. What it does contribute is the mechanism: the tenant-scoping convention
   (`organization_id` NOT NULL, composite foreign keys over `(organization_id, id)`, index on
   `organization_id`) recorded in [data-model.md](data-model.md), and the rule that a repository
   query without a resolved tenant context fails rather than reading unscoped. The first isolation
   test arrives with the first tenant-owned table, and the pipeline built here is the suite that
   will carry it.
2. **The health endpoint is declared public, not left public by omission.** Constitution Principle
   II requires default deny, so a route that is reachable without a permission must say so
   explicitly. It is the single declared exception in this feature, it reads no organization data,
   and it returns no version, hostname, connection string, or credential
   ([contracts/openapi.yaml](contracts/openapi.yaml), FR-035).
3. **Transactional integrity is established, not exercised.** No posting endpoint exists, so no
   endpoint requires an `Idempotency-Key` and no posted record is created. The unit of work — one
   Prisma transaction per request propagated through `AsyncLocalStorage`
   ([research.md R-003](research.md)) — is built here so that every later posting endpoint inherits
   the guarantee by construction. The reference-data seed runs in one transaction, so a partial
   seed is impossible.
4. **Design tokens are referenced, never restated.** The web app reads the design system's CSS
   custom properties through the Tailwind theme ([research.md R-014](research.md)); no hex value,
   font declaration, or spacing value is introduced in feature code, and a test asserts this. The
   application shell implements the PRD Section 7.3 loading skeleton, error panel with retry, and
   empty-state rules, and meets WCAG 2.1 AA for keyboard operation, visible focus, labeled fields,
   and contrast.
5. **Scope discipline is the reason this feature is small.** P0 items excluded and deferred to
   their own specifications: authentication and sessions, organizations and tenant isolation, RBAC,
   contacts, products, inventory, purchasing, sales, shipments, invoicing, payments, audit, and
   reporting. P1, P2, and P3 items are excluded entirely. The one item that needs confirmation is
   recorded below.

### Post-design re-check

Re-evaluated after Phase 1 produced [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), and [quickstart.md](quickstart.md).

| Principle | Pre-design | Post-design | Change |
|-----------|-----------|-------------|--------|
| I. Tenant Isolation | PASS | PASS | Reinforced. Design confirmed that a global-only schema is the only option available; the composite-key convention is now written down rather than implied. |
| II. Server-Enforced Authority | PASS | PASS | Unchanged. One endpoint, explicitly public. |
| III. Transactional Integrity | PASS | PASS | Strengthened. The unit of work and the append-only privilege-revoke approach were designed, not deferred. |
| IV. Exact Decimals | PASS | PASS | Strengthened. `decimalString` in the shared package makes string-only transport structural, not advisory. |
| V. Test-First | PASS | PASS | Unchanged, now with named test targets and two coverage tiers. |
| VI. Modular Boundaries | PASS | PASS | Unchanged. `PlatformModule` owns no business table. |
| VII. Honest Boundaries | PASS | PASS | Unchanged. |
| VIII. Design System & A11y | PASS | PASS | Unchanged, now backed by the token-reference decision and an automated no-hex-literal assertion. |
| IX. Scope Discipline | PASS | PASS | Deviation resolved by `/speckit.clarify` on 2026-10-18; see below. |

**No gate failed.** The plan proceeds.

### Clarified: reference data scope and the pre-authentication interface

`/speckit.clarify` on 2026-10-18 resolved the one item this plan had flagged as an open question.

The specification's Assumptions had stated that reference data includes "a small demonstration
workspace sufficient to exercise the interface". A demonstration workspace requires the
`Organization` table, which belongs to P0-F002. The confirmed scope is now:

- Reference data is the **global permission catalog and the default role templates only**. No
  tenant-bearing workspace is produced here; it arrives with the organization feature
  ([research.md R-016](research.md)).
- The web app delivers the **application shell plus one health status panel**. Because no user and
  no organization exist yet, the organization switcher and user menu render as clearly labelled
  unavailable placeholders, and no control appears to perform a business action.
- No sign-in screen is delivered. A sign-in screen that submits nowhere is a screen the
  authentication feature would have to delete.

This confirms the plan's design; no architectural decision changes. The specification now carries
FR-019a through FR-019d, SC-017, and SC-018 for the clarified behaviour.

Four further clarifications in the same session confirmed decisions the plan had already made, so
none of them altered the design:

- **Deployment** — the pipeline stops at verification. [research.md R-013](research.md) already
  listed seven mandatory verification jobs and no deploy stage, and R-019 already deferred hosting.
  The specification now states the prohibition explicitly in FR-050a so it cannot be read as an
  omission.
- **Rate limiting** — the error shape ships, the mechanism does not. [research.md R-005](research.md)
  already defined the catalogued codes, and R-020 already excluded a limiter. The specification now
  adds FR-022a/FR-022b and SC-021 so the client is correct before any limiter exists.
- **Analytics and error monitoring** — neither is wired. R-007 already committed to a vendor-neutral
  structured log format on stdout, which is precisely what makes adding either service a
  configuration change rather than a format change. The specification now pins that with
  FR-055/FR-055a and SC-022/SC-023.
- **Availability** — no uptime, backup, or recovery target attaches here. R-008 already made the
  health endpoint fail closed and withheld version and host detail; the specification now adds
  FR-034a/FR-034b and SC-024/SC-025, and explicitly separates "invalid configuration stops startup"
  from "an unreachable database is waited out and retried", which FR-007 already required.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (/speckit.specify command output)
├── research.md          # Phase 0 output: 20 decisions with rationale and rejected alternatives
├── data-model.md        # Phase 1 output: reference tables, conventions, explicitly deferred tables
├── quickstart.md        # Phase 1 output: setup, commands, configuration, troubleshooting
├── checklists/
│   └── requirements.md  # Specification quality checklist (/speckit.specify command output)
├── contracts/
│   ├── openapi.yaml     # Generated API contract, committed and diff-checked in CI
│   └── error-catalog.md # Human-readable error semantics the schema cannot express
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
NexusERP/
├── package.json                     # npm workspaces root; orchestrates both apps
├── package-lock.json                # Single committed lockfile; CI uses npm ci
├── .nvmrc                           # Node 24
├── .env.example                     # Every required variable with a safe development default
├── .gitignore
├── README.md                        # Entry point: quickstart link, error codes, health address
│
├── .github/workflows/
│   ├── ci.yml                       # Mandatory job graph; see research.md R-013
│   └── __tests__/
│       └── ci-no-deploy.spec.ts     # Asserts the workflow deploys nothing (FR-050a, T111)
│
├── apps/
│   ├── api/                         # NestJS service (the only consumer of the database)
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── eslint.config.mjs
│   │   ├── jest.config.ts           # Two projects: unit and integration
│   │   ├── openapi.json             # GENERATED and committed; CI diffs it
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Global reference tables + documented conventions
│   │   │   ├── migrations/          # Version-controlled, ordered
│   │   │   ├── migrations_lock.toml
│   │   │   └── seed.ts              # Idempotent upsert; single seeding entry point
│   │   ├── src/
│   │   │   ├── main.ts              # Bootstrap: global prefix, pipes, filters, shutdown hooks
│   │   │   ├── app.module.ts
│   │   │   ├── config/              # Validated configuration; fails fast, names the variable
│   │   │   ├── common/
│   │   │   │   ├── errors/          # Error envelope, error-code catalog, exception filter
│   │   │   │   ├── logging/         # pino setup, redaction list, request-id middleware
│   │   │   │   ├── dto/             # Error envelope DTO for OpenAPI generation
│   │   │   │   └── decorators/      # @RequirePermission seam, reserved for P0-F003
│   │   │   ├── platform/            # PlatformModule: owns config, health, prisma, unit of work
│   │   │   │   ├── platform.module.ts
│   │   │   │   ├── health/          # HealthController + HealthService (SELECT 1 + latency)
│   │   │   │   ├── prisma/          # PrismaService: lifecycle + per-request client
│   │   │   │   └── transaction/     # Unit of work over AsyncLocalStorage (research.md R-003)
│   │   │   └── modules/             # Created by each domain feature, NOT by this feature — see below
│   │   ├── scripts/
│   │   │   ├── check-schema-numeric-types.ts      # Fails on any Float column in schema.prisma (T110)
│   │   │   └── __tests__/
│   │   │       └── schema-numeric-types.spec.ts  # Rejects Float; accepts Decimal at the documented precision (T107)
│   │   └── test/
│   │       ├── integration/         # Supertest + real PostgreSQL
│   │       └── fixtures/            # Database reset and fixtures for integration tests
│   │
│   └── web/                         # React single-page application
│       ├── package.json
│       ├── vite.config.ts           # Dev server proxies /api to the service
│       ├── tsconfig.json
│       ├── eslint.config.mjs
│       ├── playwright.config.ts
│       ├── index.html
│       ├── e2e/                     # Playwright smoke test
│       ├── scripts/
│       │   └── __tests__/
│       │       └── no-raw-design-values.spec.ts  # Fails on any raw color or font value in web src (T082)
│       └── src/
│           ├── main.tsx
│           ├── app/                 # Router, TanStack Query client, error boundary
│           ├── styles/
│           │   ├── tokens.css       # Transcribed from design-system; the single value source
│           │   └── app.css          # Tailwind entry with @theme mapped to the tokens
│           ├── components/
│           │   │   ├── ui/          # Button, card, input, badge, table, dialog, skeleton
│           │   │   └── shell/       # Sidebar, top bar, content area, error panel, empty state
│           ├── features/
│           │   └── health/          # Health status panel; first real screen
│           └── lib/
│               ├── api-client.ts     # Error mapping, CSRF header slot, idempotency-key reuse
│               └── format.ts        # Decimal-string formatting for display
│
├── packages/
│   └── shared/                      # Contract-only: Zod schemas, error codes, types. No DB, no framework.
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── errors/              # ErrorCode constants + ErrorEnvelope type
│           ├── schemas/             # Zod schemas, incl. decimalString (research.md R-004)
│           └── permissions/         # Permission catalog + default role templates
│
├── design-system/                   # Persisted design system; authoritative for all visual values
│   └── nexuserp/
│       ├── MASTER.md
│       └── pages/
│
├── docs/
│   └── PRD.md
│
└── .specify/                        # Speckit configuration and constitution
```

Three directories named in earlier drafts of this plan are deliberately absent: there is no
`apps/api/src/common/filters/` (the single exception filter lives in `common/errors/`), no
`packages/shared/src/types/` (shared types are exported from the directories that own them), and no
`docs/api/` (the human-readable contract is served at runtime from `/api/docs`, generated from the
same source as the committed artifact, so there is nothing to check into a `docs` folder).

Co-located `__tests__/` directories sit beside any `src/` directory that has tests and are not
enumerated individually; the `scripts/` test directories are listed because they are standalone
checks, not co-located unit tests.

Three directories exist purely to make a prohibition enforceable rather than advisory, and each
holds exactly one file:

| Directory | Holds | Why it exists |
|---|---|---|
| `apps/api/scripts/` | `check-schema-numeric-types.ts` and its test | Makes Constitution Principle IV structural: a `Float` column in the schema fails the lint command, so a later feature cannot introduce floating-point storage silently (T107, T110) |
| `apps/web/scripts/` | `__tests__/no-raw-design-values.spec.ts` | Makes Constitution Principle VIII structural: a raw color or font value anywhere under `apps/web/src` fails the test, so the token pipeline cannot be bypassed by pasting a hex value into a component (T082) |
| `.github/workflows/__tests__/` | `ci-no-deploy.spec.ts` | Makes FR-050a enforceable: the assertion reads the workflow definition, so the pipeline cannot acquire a deploy step without failing its own test (T111) |

**Structure Decision**: npm workspaces with `apps/api`, `apps/web`, and `packages/shared` as
suggested, adopted unchanged. Two adjustments to the suggestion, both recorded in
[research.md R-001](research.md):

1. **Prisma lives in `apps/api/prisma`, not in a shared package.** The service is the only consumer
   of the database, so colocating the schema and migrations there keeps the generated client from
   crossing a workspace boundary — the usual source of stale-client and dual-instance bugs — and
   makes "who owns the schema" unambiguous.
2. **`packages/shared` is contract-only.** It carries Zod schemas, error codes, permission
   definitions, and types. It carries no database access, no framework imports, and no domain
   logic. A shared package with domain logic would be an invisible path around the module
   boundaries that Constitution Principle VI requires.

Domain modules (`AuthModule`, `OrganizationsModule`, `UsersModule`, `AccessControlModule`,
`ContactsModule`, `ProductsModule`, `InventoryModule`, `PurchasingModule`, `SalesModule`,
`InvoicingModule`, `ReportingModule`, `AuditModule`) are **not** scaffolded here. Each is created
by its own feature, so no empty module accumulates untested registration code. `apps/api/src/modules/`
is shown in the tree above as the documented destination only: **the directory does not exist in
this feature and no task in `tasks.md` creates it.** It first appears when the authentication
feature lands.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No constitution violations.** The Constitution Check passed pre-design and passed post-design,
with one deviation recorded as an open item for `/speckit.clarify` rather than as a violation. The
table below is intentionally empty; it is populated only when a gate fails or a principle must be
set aside.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|

---

## Phase 0 — Research

Complete. See [research.md](research.md): 20 decisions, each with rationale and rejected
alternatives, covering repository layout, runtime pins, the transaction unit of work, decimal
handling, the error envelope, request identity, structured logging, the health contract, OpenAPI
generation and drift detection, the migration lifecycle, idempotent seeding, the local
development environment, the CI job graph and blocking policy, the design-token bridge, the session scope
boundary, the reference-data scope boundary, coverage thresholds, reproducible installs, hosting
portability, and the test-layer split. No `NEEDS CLARIFICATION` item remains unresolved.

## Phase 1 — Design and Contracts

Complete. See [data-model.md](data-model.md) for the three global reference tables, the seeded
permission and role-template sets, the schema conventions every later table inherits (tenant
scoping, exact decimals, append-only immutability, transaction boundary, numbering, timestamps),
and the explicit list of tables deferred to their owning features. See
[contracts/openapi.yaml](contracts/openapi.yaml) for the generated contract and
[contracts/error-catalog.md](contracts/error-catalog.md) for error semantics, the 403-versus-404
distinction, and decimal transport. See [quickstart.md](quickstart.md) for setup, commands,
configuration, and troubleshooting.

Agent context updated: `AGENTS.md` now points to this plan between the `<!-- SPECKIT START -->`
and `<!-- SPECKIT END -->` markers.