# Phase 1 — Data Model: Staging Deployment

## No database objects are created, altered, or dropped

This feature introduces **no table, no column, no index, no constraint, no enum, and no
migration**. The schema that the platform foundation defined is deployed unchanged to staging;
running it in a new environment is the point of the feature, and changing it is not.

That statement is deliberate rather than incidental, because the feature's own requirements
depend on it:

- Constitution Principle I requires every organization-owned table to carry `organization_id`
  with composite foreign keys. This feature creates no such table, so it adds no table that
  could be missing them, and the tenant-scoping convention recorded in the foundation's
  [data-model.md](../001-platform-foundation/data-model.md) continues to govern every table
  that a later feature adds.
- Constitution Principle IV pins monetary and quantity precisions. This feature writes no
  value of either kind, and it introduces no numeric literal into any configuration file.
- FR-015 requires staging to apply the *same repository migrations* every other environment
  applies. A migration added here would be a schema change disguised as a deployment change.

The provider's own data surface over these tables is switched **off** (FR-020), which is what
keeps the schema's tenant and permission guarantees from being bypassed by a request that never
reaches the application. Nothing about that setting alters the schema; it closes a door to it.

## The entities this feature does model

The specification defines eight key entities. None of them is a database row; each is a piece of
deployment configuration, and each is listed here with the fields that make it checkable. They
are modelled because the feature's tests and its runbook both need a named shape to assert
against and to document.

### 1. Staging environment

The set of hosted components that serve the product to a reviewer.

| Field | Meaning | Where it lives | Verified by |
|---|---|---|---|
| interface | The application shell, built and served by Vercel | Vercel project, Root Directory = the frontend workspace | US1 / SC-002 |
| service | The NestJS service, built and run by Render from the repository's own commands | Render Blueprint (`render.yaml`) | US1 / SC-003 |
| database | Managed PostgreSQL 17, reached through the session-mode pooler | Supabase project | FR-002 / SC-003 |
| independence | Its own database, configuration, and secrets; nothing shared with development, test, or any other environment | Human setup, documented in the runbook | FR-003 |
| identity | Identified as **staging**, never presented as production | `docs/staging-deployment.md` | FR-004 |

### 2. Deploy definition

The version-controlled description of a hosted component. Two instances exist, one per host.

| Field | Render (service) | Vercel (interface) |
|---|---|---|
| file | `render.yaml` at the repository root | `vercel.json` in the Root Directory (the frontend workspace) |
| how it is built | `runtime: node` — the repository's own build command, run from the repository root | `installCommand` then `buildCommand`, from the repository root, building the `shared` workspace before the frontend workspace |
| how it starts | the repository's own start command, after the start command applies migrations | static assets; no process |
| variable **names** it needs | declared under `envVars` | none — the interface reads no hostname (FR-005) |
| variable **values** it carries | only non-secret values; secrets use `sync: false` or `generateValue: true` | none that are secret |
| health path | `healthCheckPath: /api/v1/health` | not applicable; the host has no health probe |
| deploy trigger | `autoDeployTrigger: commit` — the deploy is **not** gated by checks (FR-010) | Git integration on push to `main` |
| secret content | **zero** | **zero** |

The last row is the invariant the unit specifications enforce (FR-028): a deploy definition may
name a secret, and may declare how the secret's value is obtained, but must never contain one.

### 3. Environment variable

One configuration input staging consumes.

| Field | Meaning | Source |
|---|---|---|
| name | The variable's exact key | the service's validated environment schema and `.env.example` |
| purpose | What it controls | `contracts/environment-variables.md` |
| set by | The one platform that supplies it | `contracts/environment-variables.md` |
| secret? | Whether its value must never be readable from the repository | `contracts/environment-variables.md` |
| value location | Where the value actually lives | the platform's environment or secret store |
| required at startup? | Whether its absence stops the service (FR-031) | the schema: required, or defaulted |

The complete instance set is the table in
[contracts/environment-variables.md](contracts/environment-variables.md). The rule that makes
it a model rather than a list is FR-029's: every variable the deployment needs appears in
`.env.example`, with a safe placeholder and the platform that sets it, so a reader can
reconstruct the configuration from the repository alone except for the secret values
themselves.

### 4. Secret

A configuration value that must not be readable from the repository.

| Field | Meaning |
|---|---|
| name | The variable it belongs to |
| mode | `sync: false` (a human supplies it once, in the platform's dashboard) or `generateValue: true` (the platform invents it) |
| store | The platform's secret store — the only place the value exists |
| never appears in | the repository, a deploy definition, a document, a log, or a build artefact |
| rotation | Completing a rotation requires a redeploy or restart, because a running service keeps the value it started with |

Two instances use `generateValue: true` (`SESSION_SECRET`, `CSRF_SECRET`) and one uses
`sync: false` (the database connection string, which embeds a credential and cannot be
invented by the platform). See [research.md R-011](research.md).

### 5. Migration

One ordered, version-controlled change to the schema — the same entity the foundation defines,
applied here at deploy time rather than by hand.

| Field | Meaning |
|---|---|
| identity | Its directory name and order, under the database workspace's `prisma/migrations` |
| applied? | Recorded in the database's own migration history table |
| route | **exactly one**: the Render start command applies it before the service listens |
| on failure | The start command exits non-zero, the deploy is discarded, and the previously deployed version keeps serving |
| re-run | A migration already applied is not applied again; a deploy re-run changes no data |
| reversibility | **Forward-only.** A rollback returns the deployed version, not the schema |

The route is single by requirement (FR-015) and by design ([research.md R-002](research.md)):
configuring a pre-deploy command *and* a migration step in the start command would give the
schema two paths, which is the divergence the requirement forbids.

### 6. Health check

The platform's judgement of whether a newly deployed version may take traffic.

| Field | Meaning |
|---|---|
| path | `/api/v1/health` — declared by the deploy definition and asserted equal to the route the service serves |
| requires | the application serving **and** the database reachable; either failing means unhealthy |
| unreachable check | reported as unhealthy, never as healthy (FR-024) |
| authentication | none; the endpoint is declared public explicitly |
| discloses | nothing — no version, hostname, connection string, or credential |
| effect | a version that fails it receives no traffic and is discarded rather than left partly live (FR-018) |

### 7. Rollback

The documented operation that returns a hosted component to its previous version.

| Field | Meaning |
|---|---|
| restores | the previously deployed version |
| mechanism | the platform's own deploy history; no manual database edit (FR-041) |
| cannot undo | a schema change — migrations are forward-only, so a rollback that must survive one
is limited to additive, backward-compatible changes |
| what it does **not** promise | continuity. The requirement is **restoration**, not zero
downtime, and the runbook records what was actually observed during the failing-migration
rehearsal rather than claiming an interruption-free replacement (FR-016) |

### 8. Deployment runbook

The single document that takes a reader from empty provider accounts to a serving staging
address, and from a bad deploy back to a good one.

| Section | Required content | Requirement |
|---|---|---|
| Create the projects | The three projects and their plans | FR-037 |
| Configure | Every variable, the platform that sets it, and what it controls | FR-026, FR-029 |
| First deploy | Including that it applies the full migration history from an empty database | FR-037, edge case |
| Verify | Health at the staging address; the database major version; the data-surface check | FR-002, FR-021, FR-025 |
| Roll back | The procedure, and what a rollback cannot undo | FR-041 |
| Not gated | The statement that staging deploys are **not** gated by CI checks: no branch protection, no required status checks, no pull request, direct pushes to `main` — carrying the observed behaviour rather than the assertion | FR-010, SC-016 |
| Plan and cost | Each component, its plan, what the plan includes, its cost, and any upgrade marked **not purchased** | FR-038 |
| Backup | Only what the providers actually give, explicitly what they do not, and the retention gap recorded as an open product-requirements decision | FR-039 |
| Out of scope | A production environment, a custom domain, paid upgrades, backups beyond the providers', a monitoring vendor, and authentication | FR-040 |
| Entry-plan behaviour | Paused database project, idle-stopped instance, cold start, and any plan-level limit on deploy history, and the fact that the free plan provides no pre-deploy step (so migrations run in the start command), stated as observed behaviour | FR-045, Constitution Principle VII |

## Relationships

| From | To | Cardinality | Meaning |
|---|---|---|---|
| Staging environment | Deploy definition | 1 : 0..2 | The interface and the service each have one; the database has none, because it is a managed project rather than a built component |
| Deploy definition | Environment variable | 1 : 0..n | The service's definition names the variables it consumes; the interface's names none |
| Environment variable | Secret | 0..1 : 0..1 | A variable is either secret or not; a secret belongs to exactly one variable |
| Service | Migration | 1 : 0..n | One route applies an ordered set |
| Service | Health check | 1 : 1 | The definition declares exactly one path |
| Staging environment | Rollback | 1 : 1 | The environment has one documented return-to-previous operation |

## What this model deliberately leaves out

- **No tenant-owned entity.** There is no `organization_id` to scope, because there is no new
  table. The first tenant-owned table arrives with the organization feature, and the pipeline
  this feature finishes is the one that will carry its isolation test.
- **No posting entity, no idempotency record.** This feature performs no posting and adds no
  `Idempotency-Key` endpoint, so there is nothing here for Constitution Principle III to guard
  beyond the migration route's "applied exactly once" property.
- **No decimal-bearing field.** There is no monetary or quantity value anywhere in this model,
  which is the Constitution Principle IV statement restated as a fact about the artefact.
- **No monitoring, alerting, or analytics entity.** None is selected by this feature; each
  platform's own logs and deploy history are what exists, without a vendor contract.
