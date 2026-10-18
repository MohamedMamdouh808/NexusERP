# Research: Platform Foundation

**Feature**: 001-platform-foundation | **Date**: 2026-10-18 | **Phase**: 0

All NEEDS CLARIFICATION items from the plan's Technical Context are resolved below. Each entry
records the decision, the rationale, and the alternatives that were evaluated and rejected.

---

## R-001 — Repository layout: npm workspaces with contract-only shared package

**Decision**: Adopt the suggested layout unchanged. npm workspaces at the repository root with
three workspaces: `apps/api`, `apps/web`, and `packages/shared`. `packages/shared` contains
**only** Zod schemas, error-code constants, and TypeScript types — no database access, no
framework imports, no domain logic. The Prisma schema, migrations, and seed script are colocated
in `apps/api/prisma`, not in a separate workspace.

**Rationale**: One lockfile and one `npm ci` make the reproducible-install requirement
(FR-049) and the single-repository requirement (FR-001) trivially true. Keeping the shared
package contract-only protects Constitution Principle VI: a shared package that carried domain
logic would become an invisible back door around module boundaries, and one that exposed the
Prisma client would couple every module to the database. Colocating Prisma with the only consumer
of the database avoids publishing a generated client across workspace boundaries, which is the
usual source of dual-instance and stale-client bugs.

**Alternatives considered**: Monorepo tools (Nx, Turborepo) — rejected as unnecessary
orchestration for three workspaces and a 16-week plan with one developer. Separate
`packages/database` workspace — rejected; it would make the API depend on two internal packages
and force the generated client to cross a workspace boundary. Single package with `src/` and
`frontend/` (the Spec Kit default) — rejected; it forces one `node_modules` for the browser
bundle and the server and makes the API contract impossible to import cleanly from both sides.

---

## R-002 — Runtime and engine pins

**Decision**: Node.js 24 LTS, pinned in `engines` in every `package.json`, in `.nvmrc`, and in
every Docker image. PostgreSQL 17 (Alpine) in development and CI, matching the managed
PostgreSQL major version on the chosen hosting platform.

**Rationale**: "Node.js LTS" in the PRD is not specific enough to build against. Pinning one
major version in three places — manifest, local hint, and image — removes the most common cause
of "works on my machine" failures in CI. PostgreSQL major versions must match development, CI,
and production or a migration that passes CI can still fail in production.

**Alternatives considered**: Pinning the current runtime at implementation time instead of
naming one now — rejected because the plan must state a target; the exact patch is resolved at
install time and recorded in the committed lockfile (see R-018).

**Locale**: Database locale is C (ASCII-only lower() and byte-order sorting); revisit collation when Arabic support is decided.

---

## R-003 — Unit of work: one transaction boundary per request

**Decision**: Implement a `TransactionService` in `PlatformModule` that stores the request's
Prisma transaction client in `AsyncLocalStorage`. `runInTransaction(callback)` opens a single
`prisma.$transaction`, makes the client visible to every repository called inside the callback,
and restores the ambient client afterwards. Repositories take the client as a parameter or read
the ambient one; they never open their own transaction.

**Rationale**: Constitution Principle III requires that any operation touching more than one
record execute in a single transaction. In NestJS, a transaction started in a service does not
reach a repository called by another service unless the client is propagated explicitly or
carried out-of-band. `AsyncLocalStorage` propagates it without threading a client parameter
through every signature, which is what keeps the interface clean and avoids the accidental
"this method opened its own transaction" bug. Establishing this now means later posting
endpoints inherit the guarantee by construction rather than by reviewer discipline.

**Alternatives considered**: Passing the client as an explicit first argument everywhere — sound
but it pollutes every service signature and is the pattern most often skipped under deadline.
Prisma's interactive transactions alone — insufficient on their own, because they still require
the client to be threaded to the callee. Per-request client via a scoped provider — workable, but
mixes request lifetime with transaction lifetime and complicates nested calls. All rejected.

---

## R-004 — Exact decimals end to end

**Decision**: No monetary or quantity value is ever represented as a JavaScript number.
`packages/shared` exports a `decimalString` Zod schema that accepts and emits decimal **strings**.
Prisma models decimal columns as `Prisma.Decimal`, and the API converts to string at the
serialization boundary. Arithmetic uses the `Decimal` type with an explicit half-up rounding mode
applied per line at the point of persistence.

**Rationale**: Constitution Principle IV prohibits floating point for money and quantities
everywhere, including types, contracts, and tests. A Zod schema is the single choke point where
both the server DTOs and the client forms validate, so making the schema string-only makes the
prohibition structural instead of advisory. Prisma's default `Decimal` maps to a decimal
implementation rather than an IEEE 754 double, so the database and application layers agree.

**Alternatives considered**: Representing decimals as integer minor units (cents) — correct, and
revisit if a precision issue appears, but it complicates quantity handling (three decimal places)
and multi-precision columns. Allowing `number` at the edge with a lint rule — rejected; a lint
rule is bypassable, a schema type is not.

---

## R-005 — Single error envelope produced by one filter

**Decision**: All failures are normalized by one global exception filter into
`{ code, message, details, requestId }` and nothing else. The filter maps every built-in
exception type (validation, not-found, unauthorized, forbidden, conflict, rate-limit,
unhandled) to a catalogued code. Unhandled exceptions map to `INTERNAL_ERROR` with a fixed generic
message; the original error is logged with its stack under the request identifier and never
returned. `details` is always present, an empty array when there is nothing field-level.

**Rationale**: FR-021 through FR-027 demand one shape, and the only reliable way to guarantee it
is to make a single component responsible for producing it. Centralizing means a new endpoint
cannot accidentally invent a different shape, and the "no stack trace in production" rule is
enforced in one place instead of per handler.

**Alternatives considered**: Per-endpoint exception filters — rejected, this is exactly the
inconsistency the requirement forbids. A response interceptor that post-processes thrown errors —
rejected because interceptors do not run for exceptions thrown inside guards and pipes reliably.
Returning `{ code, message, details }` without `requestId` — rejected by FR-021.

---

## R-006 — Request identity carried out-of-band

**Decision**: A middleware runs first on every request. It reads `x-request-id`; if the value
matches `^[A-Za-z0-9._-]{1,128}$` it is adopted, otherwise a UUID v4 is generated. The value is
stored in `AsyncLocalStorage`, echoed in the response header, attached to the error envelope, and
read by the logger. An unusable supplied value is replaced rather than rejected.

**Rationale**: FR-028 requires the same identifier in the response and in every log line for the
request, which rules out reading it from a decorator parameter at each layer. `AsyncLocalStorage`
is the mechanism already chosen for the transaction client (R-003), so the request context
travels the same way. The strict allowlist regex satisfies FR-030: it cannot contain newlines, so
it cannot forge a log line, and it cannot contain control characters that would corrupt
downstream log parsers.

**Alternatives considered**: NestJS `AsyncLocalStorage` interceptor only — it runs after guards,
so a guard failure would have no identifier; middleware runs first, so every request has one.
Trusting the header verbatim — rejected, log injection.

---

## R-007 — Structured logging with redaction

**Decision**: Use `pino` (through `nestjs-pino`) emitting one JSON object per line to stdout.
Every line includes `requestId`, `timestamp`, `level`, `route`, `status`, `durationMs`, and — when
known — `userId` and `organizationId` pulled from the request context. A redaction list covers
`password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `csrfToken`,
`sessionToken`, `authorization`, `cookie`, and `set-cookie` at every nesting depth. In production
the level is `info` and error logs carry a server-generated `err` object; the stack is logged
only in the server log, never returned to the client (R-005).

**Rationale**: FR-036 to FR-040 require machine-parseable records, request correlation, and no
secrets. stdout JSON is what Railway and Render both collect natively without a file agent, which
keeps the v1 deployment footprint minimal and matches the "no additional infrastructure" posture
of Constitution Principle VI. A redaction list configured once at the logger level is more
reliable than remembering to redact at each call site.

**Alternatives considered**: Hand-rolled JSON serializer via a NestJS interceptor — rejected,
it re-implements redaction and correlation poorly. Winston — viable; rejected only because pino's
async transport measurably adds less latency on the hot request path. Rejecting the
`fast-redact` dependency — rejected, dependency cost is trivial against a secret-leak risk.

---

## R-008 — Health endpoint: hand-rolled, no third-party health module

**Decision**: `GET /api/v1/health` is public and implemented by a small `HealthService` that runs
`SELECT 1` against PostgreSQL and times it. Healthy returns HTTP 200 with
`{ status, uptimeSeconds, checks: { application, database } }`. Unhealthy returns HTTP 503 in the
**standard error envelope** with code `SERVICE_UNAVAILABLE` and `details` listing which check
failed. The response never contains a version string, hostname, connection string, driver
version, or exception message.

**Rationale**: Two requirements pull in opposite directions — FR-022 says every failing response
uses the error envelope, while a health endpoint is conventionally a status document. Returning
the envelope on failure satisfies FR-022 without weakening the health contract, and
`details.checks` still identifies the failing component. Suppressing version and hostname detail
is what makes FR-035 satisfiable while keeping the check genuinely useful to infrastructure.

**Alternatives considered**: `@nestjs/terminus` — capable, but it emits version and error detail
in its default payload, which is exactly what FR-035 forbids; customizing it away costs more
code than writing the check. Returning HTTP 200 always with a status field — rejected, because a
load balancer cannot distinguish a healthy instance from a broken one. Two separate liveness and
readiness endpoints — rejected for v1; the PRD names one endpoint and one consumer.

---

## R-009 — OpenAPI generated from code, committed, diff-checked

**Decision**: `@nestjs/swagger` builds the document from decorators on the code, not from
hand-written YAML. A build script emits `apps/api/openapi.json`, and that generated file is
committed to the repository. CI regenerates it and fails if the result differs from the committed
file, so an accidental contract change cannot merge unreviewed. In development the document is
served at `/api/docs` using the same generation source.

**Rationale**: FR-041 requires the contract to be generated so it cannot drift, and FR-044
requires an unintended change to be visible. Generating it at build time alone would satisfy the
first but not the second — nothing would force a human to look. Committing the artifact plus a CI
diff turns drift into a reviewable diff, which is the standard practice for API-first teams that
want a stable reviewable surface.

**Alternatives considered**: Hand-maintained OpenAPI YAML — rejected, it will drift immediately.
Publishing the document only as a build artifact with no committed copy — rejected, FR-044 has
nothing to diff. Generating the human-readable docs page from the JSON — adopted, it guarantees
the page and the committed file come from one source.

---

## R-010 — Migration lifecycle and drift detection

**Decision**: `prisma migrate dev` is used locally only to author migrations;
`prisma migrate deploy` is the single command that applies migrations in CI, in containers, and
in production. `prisma migrate reset` is permitted only against a developer database. CI runs
three migration checks against a fresh PostgreSQL service: apply the full history to an empty
database; apply the history a second time and assert success with no data change; and run
`prisma migrate diff` between the migration history and the schema to prove no drift. Production
startup runs `migrate deploy` before serving traffic.

**Rationale**: FR-011 to FR-015 require ordered, repeatable, detectable migrations.
`migrate deploy` is non-interactive and never regenerates or discards a migration, which is the
correct behavior in an automated environment; `migrate dev` would create a migration as a side
effect of a deploy command, which is unacceptable in CI. The second-apply check directly proves
FR-013 (idempotency), and the drift check is the only way to catch the common failure where
someone edits the schema file and forgets to author a migration — which would otherwise ship a
database that does not match the code.

**Alternatives considered**: Auto-migrating on application boot — rejected for production, it
converts a schema problem into a startup race between multiple instances. Hand-written SQL
migrations — rejected, Prisma's migration history table gives detection and ordering for free.

---

## R-011 — Idempotent reference-data seeding

**Decision**: `apps/api/prisma/seed.ts` is the single seeding entry point, invoked by
`npm run db:seed`. It runs in one transaction and uses upsert keyed on each table's natural unique
key, so repeated runs update rather than duplicate. It loads the global permission catalog and the
default role templates defined in `packages/shared` as constants, so the seeded state is derived
from one version-controlled source rather than a hand-maintained fixture file.

**Rationale**: FR-017 to FR-020 require repeatable, non-duplicating reference data. Upsert on a
unique key is idempotent without needing to read before write, and running everything in one
transaction means a partial seed is impossible. Deriving the catalog from constants in the shared
package means the permission list is defined once and reused by the AccessControl feature when it
materializes organization-owned roles, instead of existing in two places.

**Alternatives considered**: `deleteMany` then re-insert — rejected, destructive and unsafe if
reference records are ever referenced. Checking existence before insert — rejected, upsert is one
round trip and atomic. Raw SQL seed script — rejected, typed access keeps the seed honest about
the schema.

---

## R-012 — One-command development environment

**Decision**: `docker-compose.yml` defines three services: `db` (PostgreSQL 17 with a named
volume and a `pg_isready` healthcheck), `api` (Node image running migrations then the service,
gated on `db` being healthy), and `web` (Node image running the dev server with the API proxied
to `api`). The documented command is `docker compose up -d --wait`, which returns only after all
three report healthy. Production-capable multi-stage `Dockerfile`s are provided separately for
the service and for the static web build; they are the same images the hosting platform builds.

**Rationale**: FR-005 requires one command from a clean checkout with no preinstalled database,
and FR-007 requires the service to wait for the database rather than crash-loop. Compose health
checks plus `--wait` express exactly that: readiness is declared, not timed. Using the dev server
for `web` (rather than serving static assets) keeps hot reload available, which a one-developer
team needs, while the multi-stage Dockerfile provides the production asset path.

**Alternatives considered**: Running PostgreSQL on the host and the apps in containers — rejected,
it reintroduces the "works on my machine" problem this feature exists to remove. Serving the web
app from a static container in development — rejected, it removes hot reload for no benefit.
A `docker-compose.override.yml` split — unnecessary at three services; kept in one file and noted
as a split point if it grows.

---

## R-013 — CI job graph and blocking policy

**Decision**: A GitHub Actions pipeline with these jobs, all of them mandatory and blocking a
merge except where noted:

| Job | Contents | Blocking |
|---|---|---|
| `lint` | ESLint (flat config) and Prettier check, both workspaces | yes |
| `typecheck` | `tsc --noEmit`, service and web | yes |
| `test-unit` | Jest unit projects and Vitest, no database required | yes |
| `test-integration` | PostgreSQL service container, `migrate deploy`, Jest integration projects | yes |
| `migrate-validate` | apply from empty, re-apply for idempotency, drift diff (R-010) | yes |
| `contract-check` | regenerate OpenAPI and diff against the committed artifact (R-009) | yes |
| `build` | service build and web static build | yes |
| `docker-build` | both production images | yes |
| `e2e-smoke` | Playwright smoke against the running stack | no, advisory in this feature |

Integration jobs provision PostgreSQL through a service container rather than a compose stack, so
they start in seconds and can run in parallel with unit tests. Coverage thresholds are enforced
inside `test-unit` and `test-integration` (R-017).

**Rationale**: FR-045 to FR-052 require the full set with no bypass. Splitting the database-backed
jobs from the database-free jobs means a developer editing a component test waits seconds rather
than minutes, while correctness-critical jobs still get a real database. The smoke test is
advisory here because the foundation has no user workflow to verify end to end; it becomes blocking
once the first user-facing feature exists, and that transition is recorded here so it is not
forgotten.

**Alternatives considered**: One monolithic job — rejected, every run pays the database cost and a
failure gives no signal about which gate broke. A reusable workflow consumed by other repositories
— rejected as premature. Making `docker-build` non-blocking — rejected, FR-050 is explicit.

---

## R-014 — Design tokens bridged to Tailwind

**Decision**: The design system's CSS custom properties are transcribed once into
`apps/web/src/styles/tokens.css` as the single source of truth for values, and Tailwind's theme is
defined with `@theme` in terms of those variables, so utility classes resolve to the design
tokens rather than restating hex values. The frontend's base components (button, card, input,
status badge, table) are implemented once against those tokens and reused everywhere.

**Rationale**: Constitution Principle VIII forbids restating design values in feature code. If
utility classes carried raw hex values, every screen would become a place a token could drift.
Referencing the variables keeps the persisted design system authoritative and makes a token change
propagate on rebuild. The verification check is a lint/test assertion that no component contains a
raw hex literal.

**Alternatives considered**: Copying hex values into the Tailwind config — rejected, that is
exactly the duplication Principle VIII prohibits. CSS modules with hand-written values — rejected,
same problem plus no utility consistency. A JavaScript token object as the source — rejected, the
design system is authored as CSS variables and CSS should stay the source.

---

## R-015 — Sessions and CSRF are the next feature, not this one

**Decision**: This feature does **not** implement sessions, CSRF tokens, or authentication. It
reserves the seams they need: cookie parsing middleware is mounted, a CSRF guard slot exists in the
global guard chain, and the configuration schema defines the session and CSRF settings with
development defaults. The specification for this feature explicitly excludes authentication,
organizations, memberships, and role management.

**Rationale**: The user's stack note lists sessions in PostgreSQL with HttpOnly cookies and CSRF
tokens as part of the product stack, which is correct for the product — but sessions belong to
P0-F001 Authentication and Session Management, and building them here would both contradict this
feature's own scope assumptions and violate Constitution Principle IX by pulling a P0 security
surface forward without its own specification, tests, and acceptance criteria. Reserving the seams
now means the next feature adds behavior without re-plumbing the request pipeline. The design
decisions themselves (synchronous per-session token stored as a hash, verified against the session
row, plus generic error handling) are recorded here so the next feature starts from a settled
position.

**Alternatives considered**: Building sessions now — rejected on the scope grounds above. Building
nothing and leaving no seam — rejected, it would force the next feature to re-plumb middleware
ordering, which is the expensive part to change later.

---

## R-016 — Reference data is global; organization-owned roles come later

**Decision**: The seeded tables are **global and not organization-scoped**: `Permission` (the
permission-code catalog), `RoleTemplate` (the five default role definitions), and
`RoleTemplatePermission` (the join). No `organization_id` column is introduced, because no
`Organization` table exists yet — the organization feature is P0-F002 and creates it.

**Rationale**: An organization-owned table cannot be created before `Organization` exists, and
creating the organization table here would mean implementing P0-F002 inside a platform feature.
Creating global reference tables keeps this feature free of tenant data, which is why the
specification states that no organization-owned table is created and why no tenant-isolation test
is possible here. Defining the default roles as **templates** rather than roles also avoids
creating a second, conflicting concept of "role" that the AccessControl feature would have to
reconcile. The template-to-role materialization belongs with the feature that owns roles.

**Consequence to flag**: The specification assumed reference data would include "a small
demonstration workspace sufficient to exercise the interface". A demonstration workspace is
tenant-bearing and therefore cannot exist before P0-F002. It is therefore delivered in two parts:
the global reference catalog here, and the tenant-bearing demonstration organization with the
AccessControl feature. **This is a deviation from one assumption in the specification and should
be confirmed with `/speckit.clarify`.**

**Alternatives considered**: Creating `Organization` and org-owned `Role` now to get a demo
workspace — rejected, it pulls P0-F002 into this feature. Code-only reference data with no
tables — rejected, it gives the AccessControl feature nothing version-controlled to materialize
from, and FR-017 asks for loadable reference data. Deduplicating by storing the role templates as
a JSON blob — rejected, it cannot be queried or constrained.

---

## R-017 — Coverage thresholds

**Decision**: Jest and Vitest are configured with `80%` line, branch, function, and statement
thresholds for the critical paths of this feature — `apps/api/src/common`, `apps/api/src/platform`,
and the shared package — and a lower documented threshold for non-critical adapter code such as
module registration. Thresholds are enforced inside the test commands so they fail locally too,
not only in CI. A coverage summary is written as a CI artifact.

**Rationale**: Constitution Principle V sets 80% on critical paths, and the specification's
SC-014 repeats it. Enforcing it in the test runner rather than in a separate CI step means a
developer sees the shortfall before pushing. The two-tier threshold prevents the metric from
being gamed by excluding files.

**Alternatives considered**: A single global 80% — rejected, adapter and generated-adjacent code
would dominate the denominator and dilute the signal. A coverage service with per-PR comments —
rejected as an external dependency for a project with no third-party integrations in v1.

---

## R-018 — Reproducible installs

**Decision**: A single committed `package-lock.json` at the workspace root. CI and the Docker
images install with `npm ci`, never `npm install`. Dependency versions are pinned to exact
versions in the manifests, not ranges, for anything the pipeline treats as mandatory.

**Rationale**: FR-049 requires reproducibility, and `npm install` can silently resolve a different
tree than the one that was tested. Exact pins plus a lockfile also make a dependency compromise
obvious in review rather than something discovered at deploy time.

**Alternatives considered**: Per-workspace lockfiles — rejected, npm workspaces use one root
lockfile by design. Automated dependency update bots — deferred; with one developer the update is
a deliberate task, and an automated bump is an unreviewed change to a build-defining file.

---

## R-019 — Hosting: decision deferred, artifacts kept portable

**Decision**: This feature produces portable multi-stage Dockerfiles and a `.dockerignore` for
the service and the web build, and nothing hosting-specific. Railway is the working preference
over Render because it builds the Dockerfile directly and manages PostgreSQL in the same project,
which matches the "one primary developer, no platform-specific operations" constraint; final
selection requires the cost, backup, restore, and data-location comparison the PRD defers to the
deployment and operations work.

**Rationale**: The specification's assumptions place hosting selection outside this feature.
Writing a platform config file now would presume a decision the PRD explicitly defers, and a
presumed decision is expensive to reverse. Dockerfiles are the portable artifact both platforms
consume, so nothing is lost by deferring.

**Alternatives considered**: Committing `railway.json` or `render.yaml` now — rejected, see above.
Deploying to a virtual machine with hand-managed PostgreSQL — rejected, it contradicts the
managed-database constraint.

---

## R-020 — Test layer split

**Decision**: The service uses two Jest projects in one configuration: `unit` (no database, fully
mocked collaborators) and `integration` (Supertest against a booted Nest application and a real
PostgreSQL database, migrations applied to it). The web app uses Vitest with React Testing
Library for component and hook tests, and Playwright for the smoke test. Integration tests are
excluded from the default `npm test` and run under `npm run test:integration`, so the fast loop
stays fast while the database-backed suite is never silently skipped — CI runs it as a separate
mandatory job.

**Rationale**: FR-047 requires integration tests against a real database and FR-011 requires they
are never skipped. Splitting projects in one Jest configuration makes it impossible to run "the
tests" ambiguously: the naming is explicit, and CI's job graph (R-013) makes the database-backed
suite a separate mandatory step. Separation of concerns in the tooling mirrors the separation in
the pipeline without duplicating configuration.

**Alternatives considered**: A second Jest package inside the workspace — rejected, one
configuration with two projects is simpler and keeps coverage unified. Vitest for the service
too — viable and faster, rejected to keep a single, well-understood test runner on the server and
avoid configuring Jest's decorators support twice.

---

## Resolved clarifications

| Item | Resolution |
|---|---|
| Repository layout | npm workspaces; Prisma colocated in `apps/api`; shared package contract-only (R-001) |
| Runtime versions | Node 24 LTS, PostgreSQL 17 (R-002) |
| Transaction mechanism | `AsyncLocalStorage` unit of work over one Prisma client per request (R-003) |
| Decimal representation | Decimal strings in schemas, `Prisma.Decimal` in persistence, never JS numbers (R-004) |
| Health contract | 200 with status document, 503 in the standard error envelope, no version or host detail (R-008) |
| Sessions and CSRF in scope | Deferred to the authentication feature, seams reserved (R-015) |
| Reference data scope | Global permission catalog and role templates; tenant data waits for P0-F002 (R-016) |
| Demo workspace in seed | Split; reference catalog here, tenant workspace with P0-F002 — **flagged deviation** |
| Hosting platform | Deferred to operations; portable Dockerfiles delivered (R-019) |
| E2E blocking status | Advisory in this feature, becomes blocking with the first user-facing feature (R-013) |