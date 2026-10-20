# Feature Specification: Staging Deployment

**Feature Branch**: `main` (single-branch workflow — no feature branch is created)
**Created**: 2026-10-19
**Status**: Draft
**MoSCoW Priority**: P0 (P3 is never implemented in v1 — Principle IX)
**Input**: User description: "Deploy the existing foundation (health endpoint and application shell) to a staging environment on Supabase (PostgreSQL), Render (backend service) and Vercel (frontend), so every later feature ships through the same path." Requirements: HTTPS-reachable staging with the database on PostgreSQL major version 17; a single browser origin where the frontend keeps calling relative `/api` paths and the frontend host forwards `/api/*` to the backend; deploy only from pushes to `main`, which is not gated by the mandatory checks, with the pipeline still never deploying or publishing anything; migrations run on deploy and fail safely so a failing migration leaves the previous version serving; the managed database's Data API disabled with a documented anonymous-request check; every environment variable listed with where it is set and secrets only in platform secret stores; local development runs the frontend and the backend directly on the developer's machine against a local PostgreSQL 17, with no container runtime anywhere; the platform health check on `/api/v1/health` with unhealthy deploys never taking traffic; and a deployment runbook, a plan and cost table, and an honest backup statement. Out of scope: a production environment, a custom domain, paid plan upgrades, backups beyond what the provider gives, a monitoring vendor, and authentication.

---

## Clarifications

### Session 2026-10-19

- Q: Which database connection address does the service use for application traffic and for
  migrations, given the provider offers both a pooled and a direct address? → A: The session pooler
  for both runtime and migrations; migrations do not use a separate direct connection.
- Q: How are migrations applied on deploy? → A: The hosting platform's pre-deploy command when the
  selected plan supports one; otherwise the platform's start command, which applies migrations
  before the service begins listening and fails the deploy when one fails.
- Q: Is the managed database's automatic data-access interface enabled for staging? → A: Disabled.
- Q: How is the single browser origin realized? → A: A forwarding rule on the frontend host over
  the frontend's own default domain (a platform rewrite), not a custom subdomain pointed at the
  service.
- Q: What backup posture does staging claim? → A: The providers' defaults for staging only, with the
  retention gap recorded as an open product-requirements decision.
- Q: Which service plan does staging run on? → A: The backend host's free instance; cold starts are
  accepted.
- Q: What guarantees that a commit reaching `main` has already passed every mandatory check, given
  that each host deploys on push rather than on check completion? → A: Nothing guarantees it. The
  project works on a single branch, `main`, with direct pushes and no pull requests, so there is no
  branch protection rule to declare required status checks and no merge for a check to block. The
  mandatory checks run on the push, alongside the deploy rather than in front of it, and a commit
  whose checks are failing, still running, or never run reaches staging. The checks gate the phase
  exit and the release, not the deploy. The earlier answer to this question — branch protection
  with required status checks — described a workflow this project does not use and is corrected
  here. See the constitution's "Branch Workflow and What It Means for Deployment".
- Q: What must the deliberately failing migration rehearsal on staging demonstrate, given staging
  runs on a free instance? → A: Restoration, not continuity — the failed deploy is discarded, the
  previous version remains the deployed version and answers the staging address once the attempt
  ends, and any interruption during the attempt is recorded honestly in the runbook rather than
  claimed as zero-downtime.
- Q: What must the anonymous data-surface check assert, so that it cannot pass vacuously? → A: Both
  the refusal and the setting — the anonymous request must be refused with zero rows, and the check
  must also confirm on the project itself that the data surface is disabled.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Live Staging URL Exists (Priority: P1) 🎯 MVP

Mohamed opens the staging address in a browser and gets the working application shell with a live
health panel. The interface is served over HTTPS from the frontend host, the API answers from the
backend host, and the database is a real managed PostgreSQL instance. Every later feature can be
demonstrated on this address without the reviewer installing anything.

**Why this priority**: This is the whole point of the feature. Without a reachable staging address,
every later feature can only be verified on a developer's machine, and the deployment path stays
theoretical until the day it is needed.

**Independent Test**: Open the staging address in a browser and confirm the shell renders and the
health panel reports the database as ok; then request the health path directly through the same
host and confirm a successful response whose database check is ok. Deliverable value: a reviewer
can see the product on a public HTTPS address.

**Acceptance Scenarios**:

1. **Given** staging has been deployed, **When** a browser loads the staging address, **Then** it
   loads over HTTPS with a valid certificate and renders the application shell with no console
   error caused by a blocked or cross-origin request.
2. **Given** the staging address is loaded, **When** the shell requests the health path, **Then**
   the request goes to the same origin as the page and the response reports the application serving
   and the database reachable.
3. **Given** the staging address, **When** the health path is requested at that address, **Then**
   the response is a success and the database check is ok.
4. **Given** the staging database, **When** its running major version is queried, **Then** it is
   PostgreSQL major version 17.

---

### User Story 2 - A Push Ships It (Priority: P1)

Mohamed pushes a change to `main`. Staging updates by itself, whether or not the mandatory checks
have passed by then. He never opens the hosting dashboards, never runs a deploy command, and never
copies a build artifact by hand. The same path carries the next feature, and the one after it.

**Why this priority**: A deploy that needs a human is a deploy that is skipped when a human is
busy. The checks still run and still matter — they are the evidence for the phase exit and the
release — but they cannot hold a gate the single-branch workflow does not provide.

**Independent Test**: Push a trivial change to `main` and, with no manual step, confirm the deployed
version on staging is that commit. Deliverable value: a repeatable release path.

**Acceptance Scenarios**:

1. **Given** a change is pushed to `main`, **When** the push lands, **Then** the
   frontend and backend hosts each deploy the pushed commit without any manual action, and without
   waiting for the checks to finish.
2. **Given** a change whose mandatory checks are failing or incomplete, **When** it is pushed to
   `main`, **Then** it is still deployed to staging — the red check is a defect to fix, not a
   deploy that was prevented.
3. **Given** the repository's automation, **When** any workflow runs, **Then** it neither deploys
   nor publishes anything; the hosting platforms are the only deployers.
4. **Given** a pull request, if one is ever opened, **When** it is opened or updated, **Then** a
   frontend preview may be produced and it never reads, writes, or migrates the staging database.

---

### User Story 3 - A Bad Migration Cannot Take Staging Down (Priority: P1)

A migration is wrong. It reaches staging, fails, and the version that was already serving keeps
serving. The database is left at its last applied state, the failed deploy never takes traffic, and
the failure is visible in the platform's deploy history.

**Why this priority**: A deploy path that can leave the environment half-upgraded, or replace a
working version with a broken one, is worse than no deploy path at all. This is the safety property
that makes the automation legitimate.

**Independent Test**: Deploy a deliberately failing migration to staging, then confirm the address
still serves the previously deployed version and the database records no partially applied
migration. Deliverable value: proof that the pipeline cannot destroy a working environment.

**Acceptance Scenarios**:

1. **Given** staging is serving a healthy version, **When** a deploy applies a migration that fails,
   **Then** the deploy aborts and the previous version continues to answer the staging address.
2. **Given** a migration that fails partway, **When** the database's applied-migration history is
   inspected, **Then** the failed migration is not recorded as applied and no partial change is
   left behind.
3. **Given** a deploy whose new version does not pass the platform health check, **When** the
   deploy ends, **Then** the new version never takes traffic and the previous version keeps serving.
4. **Given** a deploy that already succeeded, **When** it runs again, **Then** it changes no data
   and applies no migration twice.

---

### User Story 4 - Staging Is Reachable Only Through the Product (Priority: P1)

The data lives in a managed database whose broad data-access surface is switched off. The only way
to read or write through the product is the backend API. An anonymous request to the managed
database's own REST surface returns nothing, and that is demonstrated in writing rather than
asserted.

**Why this priority**: A managed platform that exposes every table directly defeats the tenant and
permission rules the product exists to enforce, and it is silent — nothing breaks, so nobody
notices.

**Independent Test**: Send an anonymous request to the managed database's REST surface for a known
table at the staging project and confirm the response contains no data. Deliverable value: a
verified, written security posture for the database.

**Acceptance Scenarios**:

1. **Given** staging is deployed, **When** the managed database's data-access surface is inspected,
   **Then** it is disabled.
2. **Given** the data-access surface is disabled, **When** an anonymous request names a table in the
   staging project, **Then** the response discloses no rows.
3. **Given** the documented check, **When** a reader follows it, **Then** they can reproduce the
   no-data result on their own.

---

### User Story 5 - Configuration Is Legible and Secret-Free (Priority: P1)

Mohamed can answer "what does staging need, and where does it come from?" from the repository
alone. Every variable is listed with the platform that sets it. Every secret lives only in a
platform secret store. A scan of the repository finds no secret. The deploy definitions carry no
secret values, so they can be read by anyone.

**Why this priority**: Configuration debt is what turns a working environment into an unexplainable
one, and a secret committed once is compromised forever. Both must be settled before the deploy
path is used repeatedly.

**Independent Test**: Read the repository and reconstruct a complete staging configuration without
opening a platform dashboard, except to read the secret values themselves; then run the secret scan
and confirm it reports nothing. Deliverable value: staging that can be rebuilt and audited.

**Acceptance Scenarios**:

1. **Given** the repository, **When** the configuration documentation is read, **Then** every
   variable staging consumes is listed with the platform that sets it and what it controls.
2. **Given** the deploy definition files in the repository, **When** they are searched for secret
   values, **Then** none is present — only variable names and non-secret settings.
3. **Given** the repository and its history, **When** the secret scan runs, **Then** it reports no
   finding.
4. **Given** a required variable is missing or invalid on staging, **When** the backend starts,
   **Then** it refuses to serve rather than running half-configured.

---

### User Story 6 - The Documented Way Into Staging (Priority: P2)

Someone who has never deployed this project can create the three projects, set the variables, run
the first deploy, verify it, and roll back, by following one document. The document also states what
the chosen plans cost, what they include, and what backup protection actually exists — no more than
the providers give.

**Why this priority**: The environments are new accounts today and will be reconstructed later by
the same person or another one. The document is also where the honest limits live; without it, the
runbook's silence reads as a guarantee.

**Independent Test**: Follow the runbook on fresh provider accounts and reach a serving staging
address, then perform a rollback. Deliverable value: reproducibility and honest expectations.

**Acceptance Scenarios**:

1. **Given** the runbook, **When** a reader follows it from empty provider accounts, **Then** they
   reach a serving staging address with the database check ok.
2. **Given** a deployed staging, **When** the rollback procedure is followed, **Then** the previous
   version serves again without manual database edits.
3. **Given** the cost table, **When** it is read, **Then** each component names its plan, what that
   plan includes, and its cost, and lists any upgrade as not purchased.
4. **Given** the backup statement, **When** it is read, **Then** it claims nothing beyond what the
   chosen providers actually give, and says so in plain words.

---

### Edge Cases

- **Migration applied but the new version never becomes healthy.** The database is forward at the
  new schema while the platform keeps the previous version serving. The previous version is
  therefore expected to tolerate the newer schema, which is why a migration that must be undone by
  a rollback is limited to additive changes; the documentation states this rather than promising
  that any migration is reversible.
- **A managed database project is suspended or paused after inactivity.** The first health check
  after a pause can fail because the database is not accepting connections. The failure must read
  as a database problem, not as an application problem, and the documentation says what wakes the
  project up.
- **A backend instance is stopped when idle.** Staging runs on the host's free instance, so the
  first request after idling is slow and cold starts are accepted. The health check on deploy still
  governs whether a new version takes traffic; documentation states the cold-start behavior so it is
  not mistaken for an outage.
- **A transaction-mode pooled connection cannot serve migrations.** The provider offers a pooled
  address that does not keep a statement's session, and schema changes need one. Staging therefore
  uses the session-mode pooler for both application traffic and migrations, and the documentation
  names that single address; the transaction-mode pooler is not used.
- **The anonymous no-data check passes for the wrong reason.** A mistyped address, a missing project,
  or an unrelated error all yield an error with no rows. The check therefore confirms on the project
  that the data surface is disabled in addition to observing the refusal, so it cannot pass
  vacuously.
- **Forwarded client address headers arrive from a direct caller.** If proxy trust is wider than the
  actual proxying, a caller can dictate the address the product records. Proxy trust is configured
  for the specific deployment rather than accepted from anywhere, and is off outside staging.
- **The frontend host's forwarding rule also matches a frontend route.** A single-page route that
  begins like an API path must still reach the interface rather than being forwarded.
- **A pull-request preview is built for a change that alters the schema.** The preview must not
  migrate or write to the staging database; the preview is view-only with respect to staging data.
- **A secret is rotated on a platform.** The running service keeps the old value until it restarts.
  The runbook states that a rotation is completed by redeploying or restarting the service.
- **The first deploy happens against an empty database.** It must apply the full migration history
  from nothing and reach healthy, not just apply the newest change.

---

## Requirements *(mandatory)*

### Functional Requirements

**Staging topology and reachability**

- **FR-001**: Staging MUST consist of an interface hosted by the frontend platform, a service hosted
  by the backend platform, and a database hosted by the managed database provider, each reachable
  over HTTPS with a valid certificate.
- **FR-002**: The staging database MUST run PostgreSQL major version 17 — the version pinned for the
  project's database by the platform foundation specification — and a check MUST prove the running
  major version so a migration verified locally cannot fail only because staging differs.
- **FR-003**: Staging MUST be independent of every other environment: its own database, its own
  configuration, and its own secrets, sharing no database, no credential, and no secret with
  development, with test, or with any other environment.
- **FR-004**: Staging MUST be identified as staging in the documentation, and MUST NOT be presented
  as production, so no reader infers a production guarantee from it.

**Single origin and proxy trust**

- **FR-005**: The browser MUST address a single origin — the interface host. The interface MUST call
  the API through relative paths under `/api` and MUST NOT hold the service's hostname in its
  configuration.
- **FR-006**: The interface host MUST forward requests under `/api` to the service, preserving the
  path, the method, the request body, and the headers the service needs, and MUST return the
  service's response to the caller with its status and body intact.
- **FR-007**: The service MUST derive the client's address and protocol from the forwarding proxy's
  headers in staging, and MUST NOT trust those headers outside staging; the trust setting MUST be
  configuration rather than a fixed value compiled into the service.
- **FR-008**: A health request issued by the interface to a relative path MUST succeed end to end
  without a cross-origin request and without a permissive cross-origin rule.

**Deploy path**

- **FR-009**: Each host MUST deploy from the repository through its own Git integration when `main`
  changes, so a push to `main` is the only trigger.
- **FR-010**: A deploy is triggered by the push to `main` and MUST NOT be gated by the mandatory
  checks. There MUST be no branch protection on `main` and no set of required status checks, because
  the project works on a single branch with direct pushes and no pull requests; a commit whose
  checks are failing, still running, or never run is deployed to staging. This is a recorded cost of
  the workflow, stated rather than qualified: the mandatory checks are the evidence for the phase
  exit and for the release-blocking conditions, and they do not hold a gate over deployment. The
  runbook and the README MUST state this plainly and MUST NOT claim that a deploy is gated by CI.
  The pipeline MUST NOT be made to deploy in order to achieve anything.
- **FR-011**: The repository's pipeline MUST still never deploy, publish, restart, or release
  anything in a hosted environment, preserving the foundation's rule that verification is the
  pipeline's terminal action; no workflow step may push or publish a build artefact.
- **FR-012**: Frontend preview deployments MAY be produced if a pull request is ever opened, and a
  preview MUST NOT read, write, or migrate the staging database.
- **FR-013**: The staging deploy definition MUST live in the repository as version-controlled
  configuration.
- **FR-014**: Once a change is on `main`, updating staging MUST require no manual step.

**Migrations on deploy**

- **FR-015**: The service MUST apply pending database migrations as part of bringing a new version
  up, before it reports itself healthy, through a single mechanism: the hosting platform's
  pre-deploy step where the selected plan provides one, and the platform's start command otherwise.
  Both routes MUST apply the same repository migrations, and the health check MUST NOT be answered
  before they have finished.
- **FR-016**: A migration that fails MUST abort the deploy, and the previously deployed version MUST
  be what serves the staging address once the attempt ends. This MUST NOT be presented as a
  zero-downtime guarantee: where replacing the failed attempt interrupts service, the runbook
  records what was actually observed rather than claiming continuity the entry plan does not
  promise.
- **FR-017**: A failed migration MUST leave the database at its last successfully applied state,
  with no partially applied change left behind and no failed migration recorded as applied.
- **FR-018**: A deploy whose new version does not pass the platform health check MUST NOT receive
  traffic and MUST be discarded rather than left partially live.
- **FR-019**: Re-running a deploy that already succeeded MUST change no data and MUST NOT apply a
  migration twice.

**Managed database data-access surface**

- **FR-020**: The managed database's automatic data-access interface MUST be disabled, so no table
  is reachable through the provider's own request surface.
- **FR-021**: The repository MUST document a repeatable check that proves the data surface is off
  rather than merely unanswered: an anonymous request naming a table in the staging project MUST be
  refused with zero rows, and the check MUST also confirm on the project itself that the data
  surface is disabled. A check that could pass because the address was wrong, or because the
  provider returned an unrelated error, does not satisfy this requirement.
- **FR-022**: The documentation MUST state what would become reachable if that interface were
  enabled, so re-enabling it is a deliberate and informed decision.

**Health and traffic**

- **FR-023**: The service MUST declare its health address to the hosting platform at
  `/api/v1/health`, and the platform MUST use it to decide whether a deploy is healthy.
- **FR-024**: The health address MUST retain the behavior established by the platform foundation:
  the application state and the database state reported separately, healthy only when both are
  serving, an unmeasurable check reported as unhealthy rather than healthy, reachable without
  authentication, and disclosing no version, hostname, connection string, or credential.
- **FR-025**: A browser request to the health path through the interface host's public address MUST
  return a success response whose database check reports ok.

**Configuration and secrets**

- **FR-026**: Every environment variable staging consumes MUST be listed with the platform that sets
  it and with what it controls.
- **FR-027**: Secrets MUST exist only in the platforms' secret stores; the repository MUST contain no
  secret value, and no secret value may appear in a deploy definition, a log, or a document.
- **FR-028**: The version-controlled deploy definitions MUST contain no secret values — only
  variable names and non-secret settings.
- **FR-029**: The example environment file MUST list every variable the deployment needs, with safe
  placeholders and an indication of which platform sets it.
- **FR-030**: A secret scan MUST be runnable against the repository and MUST report no finding; it
  MUST also run as part of the mandatory checks.
- **FR-031**: A missing or invalid required variable MUST stop the service at startup rather than
  letting it serve in a half-configured state.

**Runtime and local development**

- **FR-032**: Local development MUST run the frontend and the backend directly on the developer's
  machine with the documented commands, against a locally installed PostgreSQL 17; no container
  runtime MUST be required anywhere in the project.
- **FR-034**: The service MUST bind `0.0.0.0` on the port the platform provides through its
  environment, not on a port fixed in the repository, and the deploy definition MUST NOT declare
  `PORT`.

**Documentation**

- **FR-037**: The repository MUST contain a deployment runbook covering creating the three projects,
  setting every variable, performing the first deploy, rolling back, and verifying the result.
- **FR-038**: The documentation MUST contain a plan and cost table naming each component, the plan
  selected, what that plan includes, and its cost, and MUST mark any upgrade as not purchased.
- **FR-039**: The documentation MUST state the backup posture honestly: what the chosen providers
  actually give for staging, and explicitly what they do not give, with no restoration guarantee the
  providers do not offer. It MUST record the retention gap — the difference between what the
  providers retain and what the product requirements will eventually need — as an open
  product-requirements decision, rather than resolving it here or leaving it unstated.
- **FR-040**: The documentation MUST name what is out of scope — a production environment, a custom
  domain, paid plan upgrades, backups beyond what the providers give, a monitoring vendor, and
  authentication — so no reader infers more than the feature delivers.
- **FR-041**: Rollback MUST be documented and MUST restore the previously deployed version without a
  manual database edit.

**Verification**

- **FR-042**: Every check this feature adds MUST be runnable without deploying anything.
- **FR-043**: The existing suites MUST keep passing, and the full local gate set — type checking,
  linting, unit tests, integration tests, and the build — MUST stay green, with `npm run dev`
  starting the API and the interface together.
- **FR-044**: A deliberately failing migration MUST be exercised against staging and MUST leave the
  previously deployed version serving, as the evidence for FR-016 and FR-017.
- **FR-045**: This feature MUST NOT claim an availability, backup, or recovery target beyond what it
  actually delivers, preserving the foundation's rule that uptime and recovery claims attach only
  when they are real.

### Key Entities

- **Staging environment**: The set of hosted components that serve the product to reviewers — the
  interface, the service, and the database — each with its own address, configuration, and secrets,
  and collectively independent of every other environment.
- **Deploy definition**: The version-controlled description of a hosted component — how it is built,
  how it starts, which variable names it needs, and which health path governs it — carrying no
  secret values.
- **Environment variable**: One configuration input staging consumes, with a name, a purpose, the
  platform that sets it, whether it is secret, and where its value actually lives.
- **Secret**: A configuration value that must not be readable from the repository, stored only in a
  platform secret store and never copied into a document or a build artifact.
- **Migration**: One ordered, version-controlled change to the database schema, with an identity, an
  order, and a record of whether it has been applied — the same entity the foundation defines,
  applied here at deploy time.
- **Health check**: The platform's judgement of whether a newly deployed version may take traffic,
  taken from the service's health address and requiring the application and the database both to be
  serving.
- **Rollback**: The documented operation that returns a hosted component to its previous version
  without a manual database edit, and the statement of what a rollback can and cannot undo.
- **Deployment runbook**: The single document that takes a reader from empty provider accounts to a
  serving staging address, and from a bad deploy back to a good one, including the plan and cost
  table and the backup statement.

---

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** No business table is created or altered by this feature; staging hosts the
  foundation's existing schema and seed. The staging database is the first real environment where the
  isolation suite runs against a database the application serves, so the staging database MUST be
  separate from every developer's data and no real organization's data may be placed in it. The
  feature adds no query path and therefore no new way to read across tenants; the provider's own
  data-access surface is disabled precisely so that the tenant and permission rules cannot be
  bypassed out-of-band.
- **II. Server-enforced authority:** No endpoint is added and no permission changes. The health
  address remains the only unauthenticated endpoint and is declared as such; the deploy path
  introduces no administrative endpoint and no bypass of the guard chain. Proxy trust is treated as
  an authority decision rather than a convenience: the service accepts forwarded client-address
  headers only where an actual proxy sits in front of it, so a caller cannot dictate what the
  product records as its origin.
- **III. Transactional integrity:** The feature adds no posting operation and no `Idempotency-Key`
  endpoint. It applies the foundation's rule that a failed migration leaves the database at its last
  applied state, and it makes that rule operational: migrations run as part of bringing a version
  up, a failure aborts the deploy, and the previously serving version is kept rather than replaced.
  Deploy re-runs MUST be idempotent with respect to the database.
- **IV. Exact decimals:** The feature stores no monetary, price, or quantity value and introduces no
  calculation. Staging runs the same schema and the same database major version as every other
  environment, so the decimal conventions the foundation establishes are exercised unchanged; no
  floating-point value is introduced anywhere in the deployment configuration.
- **V. Test-first:** The fail-safe deploy behavior is written as a failing check before the deploy
  path is relied upon: a failing migration is deliberately produced and observed to leave the
  previous version serving. The anonymous data-surface check is written and observed passing against
  staging rather than described. Configuration validation is covered by a test that starts the
  service with a missing required variable and observes a refusal. The existing coverage threshold
  continues to apply and no suite may be skipped to make the deploy path look green.
- **VI. Module boundaries:** No module is added and no dependency direction changes. The backend
  build is produced by the existing workspaces, the interface is built from the existing frontend
  workspace, and the platform's build uses the repository's existing commands. The feature
  introduces no broker, cache, worker, orchestrator, or additional runtime service, and adds no
  hosting-platform code to the application — deploy configuration lives beside the code as data.
- **VII. Honest boundaries:** The documentation claims nothing beyond what the providers give. It
  states the free-tier behavior that affects a reviewer — paused projects, idle-stopped instances,
  cold starts — the fact that finishing a migration and then failing a health check leaves the
  database ahead of the serving version, and the fact that no availability, recovery, or
  provider-external backup guarantee is made. No surface produced here states that staging is
  production-ready, that data is protected beyond the provider's own retention, or that a rollback
  undoes a schema change.
- **VIII. Design system and accessibility:** No interface is designed or changed. The deployed
  interface is the existing application shell, which already satisfies the design-system and
  accessibility rules the foundation established. The new surface this feature adds is
  documentation, which MUST be plain, structured, and readable without relying on color or on
  formatting alone; the health panel's existing accessible behavior is unchanged.
- **IX. Scope discipline:** Classified P0 as the deployment and operations work the foundation's
  specification explicitly deferred to it and the reliability-and-quality foundation the product
  depends on. A production environment, a custom domain, paid plan upgrades, backups beyond the
  provider's own, a monitoring vendor, and authentication are excluded and remain deferred. Nothing
  from P1, P2, or P3 is included; no business module, report, or interface feature is built here.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A push to `main` updates staging with zero manual actions, verified by comparing the
  version serving on staging with the pushed commit — and the update begins without waiting for the
  mandatory checks, since they do not gate the deploy.
- **SC-002**: Loading the staging address over HTTPS renders the application shell and reports the
  database as reachable, with zero blocked or cross-origin requests caused by the interface's API
  calls.
- **SC-003**: Requesting the health path at the staging address returns a success response whose
  database check is ok, and the staging database reports PostgreSQL major version 17.
- **SC-004**: A deliberately failing migration on staging is discarded, leaves the previously
  deployed version serving the staging address once the attempt ends, and leaves the database with
  no partially applied migration; any interruption observed during the attempt is recorded in the
  runbook as the honest limit of the entry plan.
- **SC-005**: Following the documented check, an anonymous request to the managed database's own
  data surface for a staging table is refused with zero rows, and the project itself reports the
  data surface disabled — so the result cannot come from a mistyped address or an unrelated error.
- **SC-006**: A secret scan of the repository reports zero findings, and the version-controlled deploy
  definitions contain zero secret values.
- **SC-007**: 100% of the variables staging consumes are listed with the platform that sets them, and
  a reader can reconstruct the configuration from the repository alone except for the secret values.
- **SC-008**: Starting the service with a missing or invalid required variable refuses to serve,
  verified by test.
- **SC-009**: `npm run dev` starts the API and the interface together against a local PostgreSQL 17,
  with no container runtime required.
- **SC-012**: Every existing test suite still passes, and every mandatory check is green on the
  branch.
- **SC-013**: Zero workflow steps deploy, publish, or restart anything in a hosted environment,
  verified by inspecting the pipeline definition.
- **SC-014**: A reader starting from empty provider accounts reaches a serving staging address by
  following the runbook alone, and restores the previous version by following the documented
  rollback, without a manual database edit.
- **SC-015**: The documentation states the plan and cost of each component, marks any upgrade as not
  purchased, and claims no backup, availability, or recovery protection beyond what the providers
  give, verified by review.
- **SC-016**: The runbook and the README state plainly that staging deploys are not gated by CI
  checks, and no repository document claims that a deploy is gated by a required status check;
  verified by review.

---

## Assumptions

- The three platforms are choices fixed by the feature rather than open questions: the interface
  platform (Vercel), the service platform (Render), and the managed database provider (Supabase).
  The product requirements document named a platform-as-a-service with managed PostgreSQL and left
  the final selection to comparison; this feature makes the selection and records it. The providers
  themselves are assumed to change only by an explicit, documented decision, since the deploy
  definitions and the runbook name them.
- Paid plan upgrades are out of scope, so staging runs on each provider's entry plan; the backend
  host's free instance is chosen deliberately and its cold starts are accepted. The cost table
  therefore states the entry plan's price and inclusions and lists any upgrade as not purchased
  rather than assuming one. Entry-plan behavior that a reviewer will observe — a database project
  that pauses after inactivity, a service instance that stops when idle, a cold start on the next
  request, and any plan-level limit on deploy history or on a pre-deploy step — is documented as a
  known behavior rather than presented as a defect, because the feature may not buy its way out of
  it. The same posture governs deploy replacement: the requirement is that the previous version is
  what serves after a failed deploy, not that the replacement is interrupt-free (FR-016).
- The single origin is realized by the frontend host's own forwarding rule for `/api` over the
  frontend's default domain, not by a custom subdomain pointed at the service. A custom domain is
  out of scope, so the browser sees exactly one host, and the forwarding rule — rather than a
  hostname choice — is what must hold (FR-005, FR-006, FR-008).
- Migrations are applied by the platform's start command, because the free plan provides no
  pre-deploy step: the start command applies the migrations and only then starts the API, so a
  failed migration fails the start. Where a plan does provide a pre-deploy command, that command
  would invoke the same repository migrations and the start command's migration step would be
  removed instead, so exactly one route is ever configured. This feature does not introduce a
  second migration path, a separate migration job, or a migration tool outside the one the
  repository already uses.
- Local development runs the frontend and the backend directly on the developer's machine against
  a PostgreSQL 17 installed on that machine — not a container and not the staging Supabase project
  — so no container runtime is required anywhere in the project.
- The staging database is reached through the provider's session-mode pooler for both application
  traffic and migrations. The transaction-mode pooler is not used, because it does not guarantee the
  session a schema change needs. One address is therefore configured for both purposes, and the
  documentation names that address and the pooler mode rather than describing two.
- A rollback returns the deployed version to its previous one. It does not reverse a schema change,
  because migrations are forward-only as established by the foundation. A migration that a rollback
  must survive is therefore limited to additive, backward-compatible changes, and the documentation
  states this limit instead of implying that any deploy can be undone cleanly.
- The Supabase Data API (the provider's automatic REST surface over the database) is disabled at the
  project level. Direct database connections from the service are unaffected by that setting, since
  they do not pass through it. Disabling it exposes nothing the service needs.
- "Staging" means one shared, always-on environment used for review and demonstration of every
  feature, not a per-branch environment. Pull-request previews apply only to the interface and are
  view-only with respect to staging data.
- Authentication does not exist yet, so the health address remains the only endpoint and the
  interface remains the application shell with its health panel. Nothing in this feature is gated on
  a user or an organization existing.
- The environment's seed data is development-and-test reference data. Staging is not production, but
  the runbook states which seed content, if any, is loaded into staging and must not be confused
  with real records.
- The provider accounts and the repository's Git integrations are set up once by a human with
  account access, because none of them can be expressed in the repository. That one-time setup is
  what the runbook documents. No branch protection is configured and none is required: the project
  works on a single branch with direct pushes, so the mandatory checks do not gate a deploy
  (FR-010). After that setup the path is automatic (FR-014).
- Adding a secret scan to the mandatory checks is a verification action and does not make the
  pipeline a deployer, so the foundation's rule that the pipeline never deploys (FR-050a) remains
  true.
- This feature does not select a monitoring vendor, does not add alerting, and does not add product
  analytics. It relies on each platform's own logs and deploy history, which exist without a vendor
  contract, and the foundation's rule that no availability target is claimed remains in force.

---

## Notes

This feature is the terminal step the platform foundation deferred to it: the foundation produced a
verified build and stopped at verification, and this feature makes that build run. Its
value is the path rather than the address — once a push to `main` updates staging by itself, every
later feature reaches a reviewer without a deployment ceremony, and the fail-safe migration behavior
means the path cannot quietly destroy the environment it serves.

The most consequential decision in this specification is what it refuses to claim. Staging runs on
entry plans because paid upgrades are out of scope, so the runbook states the resulting behavior
instead of hiding it; migrations are forward-only, so the rollback section states what a rollback
cannot undo; and the backup section states only what the providers actually give. These are honest
boundaries, and the plan and the tasks that follow must carry them into the documents rather than
softening them.

