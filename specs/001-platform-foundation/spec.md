# Feature Specification: Platform Foundation

**Feature Branch**: `001-platform-foundation`
**Created**: 2026-10-18
**Status**: Draft
**MoSCoW Priority**: P0 (P3 is never implemented in v1 — Principle IX)
**Input**: User description: "Set up the NexusERP foundation: a NestJS backend and React frontend in one repository, Docker development environment with PostgreSQL, Prisma migrations and seed data, GitHub Actions CI (lint, type check, unit and integration tests against PostgreSQL, build, Docker build, migration validation), a standard API error format ({code, message, details, requestId}), health endpoint GET /api/v1/health, OpenAPI generation, and structured JSON logging with request IDs. See docs/PRD.md Sections 7.0, 8, 9.2, 9.9."

---

## Clarifications

### Session 2026-10-18

- Q: What the web app shows before authentication exists → A: App shell plus a health status panel only; sidebar and top bar render clearly labelled placeholders for organization and user until authentication ships.
- Q: Scope of the production deployment stage in the pipeline → A: Pipeline stops at verification; images are built and proven buildable, and the deploy stage and hosting configuration belong to the operations feature.
- Q: Rate limiting in this feature → A: Ship only the 429 error shape and `Retry-After` handling in the web client; the limiting mechanism itself arrives with authentication, where the PRD's real targets live.
- Q: Product analytics and error monitoring in this feature → A: Neither. This feature produces the log records and error context that both services consume; the integrations themselves arrive later, once the vendor and a real user workflow exist.
- Q: Availability and recovery expectations for the foundation → A: No availability SLO here. The feature guarantees only the health endpoint's correctness and its own fast-fail startup; uptime, backup, and recovery targets attach when a hosted environment exists.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Working Local Environment (Priority: P1) 🎯 MVP

Mohamed, the product owner and sole developer for the first phase, clones the repository on a
new machine and starts the whole stack — interface, service, and database — with one documented
command. The database is created, the schema is brought up to date, and reference data is
already present, so he can immediately exercise a real end-to-end path instead of setting up
tooling by hand.

**Why this priority**: Every later feature is built and verified against this environment. If
a developer cannot get a real database running quickly, everything downstream is built on
guesswork, and the tenant-isolation and transaction guarantees cannot be tested at all.

**Independent Test**: Start from a clean checkout with no local database and no installed
database server, run the documented startup command, then confirm the service answers a health
request and reference data is queryable. Deliverable value: a working, reproducible
development environment.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with no local database, **When** the developer runs the documented
   startup command, **Then** the database, service, and interface all start and the service
   reports itself healthy.
2. **Given** the environment is already running, **When** the developer runs the startup command
   again, **Then** existing data is preserved and no duplicate reference data is created.
3. **Given** a fresh database with no data, **When** reference data is loaded, **Then** the
   default role templates and the permission catalog exist and can be queried.
4. **Given** a developer who has never seen the project, **When** they follow the written setup
   instructions, **Then** they reach a running environment without asking for help.

---

### User Story 2 - Understand Every API Response and Failure (Priority: P2)

A developer integrating against the API, and an engineer diagnosing a production problem, both
need every response to speak the same language. Validation failures, conflicts, missing records,
and unexpected crashes arrive in one predictable shape, and each response and log line carries a
single identifier that ties the user's report to the exact server activity that produced it.

**Why this priority**: Inconsistent errors force every client to special-case every endpoint and
make support questions unanswerable. The error envelope and request identifiers are what make the
whole later product debuggable and safe to build on.

**Independent Test**: Trigger a validation failure, a not-found, a conflict, and an unexpected
failure against a running environment, then confirm each response carries the same fields and a
usable identifier that also appears in the server logs. Deliverable value: predictable, traceable
API behavior.

**Acceptance Scenarios**:

1. **Given** any failing request, **When** the response is received, **Then** it contains a
   machine-readable code, a human-readable message, a details collection, and a request
   identifier, and nothing else is added to the shape.
2. **Given** a request that supplies its own identifier, **When** the response returns, **Then**
   the same identifier appears in the response and in every log entry for that request.
3. **Given** a request that supplies no identifier, **When** it is processed, **Then** the system
   generates one, uses it throughout that request, and returns it.
4. **Given** an unexpected internal failure, **When** the response is returned, **Then** the
   message contains no stack trace, file path, or internal detail, and the details needed to
   investigate are available from the identifier alone.
5. **Given** an operator checking system status, **When** the health address is requested,
   **Then** the response reports the state of the application and of its database connection, and
   reports unhealthy when the database is unreachable.

---

### User Story 3 - Ship Only Changes That Pass Every Check (Priority: P3)

Every change proposed to the repository is verified automatically before it can be merged. A
developer learns within minutes that a change breaks a rule, a type, a unit test, an integration
test, a build, or the database schema. A change that would alter the database in an unreviewable
way is refused rather than applied silently, and a change that cannot produce a working image is
never merged.

**Why this priority**: With one developer and a 16-week schedule, a broken merge is discovered
late or not at all. Automated verification is the only control that keeps quality constant while
the product moves fast, and it is a release-blocking condition in the PRD.

**Independent Test**: Open a change that deliberately breaks each check in turn and confirm the
pipeline refuses it with a clear message, then confirm a clean change passes end to end.
Deliverable value: a merge gate nobody can bypass.

**Acceptance Scenarios**:

1. **Given** a change that fails a rule check, a type check, or a unit test, **When** the
   pipeline runs, **Then** it fails and the change cannot be merged.
2. **Given** a change touching behavior that depends on the database, **When** the pipeline runs
   integration tests, **Then** those tests execute against a real database instance rather than a
   substitute, and the pipeline fails if they do not.
3. **Given** a change that adds or alters a database migration, **When** the pipeline validates
   migrations, **Then** it verifies the migration history is valid and consistent, and it fails
   when a migration cannot be applied from empty or cannot be applied in sequence.
4. **Given** a change that alters the published API contract unintentionally, **When** the
   contract is regenerated, **Then** the difference is surfaced for review.
5. **Given** a clean change, **When** the pipeline runs, **Then** every mandatory check passes,
   including producing a deployable image.

---

### User Story 4 - Develop Interface and Service as One Project (Priority: P4)

The web interface and the service that serves it live in one repository, are versioned together,
and are developed together against a single documented contract. The interface is built from the
persisted design system, so the first screen already looks and behaves like the product, and the
API contract is generated from the running service so documentation cannot drift from reality.

**Why this priority**: A split repository doubles the coordination cost for a one-person team and
encourages contract drift. Generating the contract from the service removes the possibility of
publishing documentation that the service does not actually honour.

**Independent Test**: Start both parts from one checkout, confirm the interface loads from the
service, and confirm the generated contract accurately describes the service's current endpoints.
Deliverable value: a single coherent, documented project.

**Acceptance Scenarios**:

1. **Given** a single checkout, **When** the developer runs the environment, **Then** the web
   interface is served and talks to the service, with no second repository to clone.
2. **Given** the environment running with no user or organization, **When** the developer opens the
   web app, **Then** the application shell renders with sidebar, top bar, and content area, the
   organization switcher and user menu state plainly that none is available, and the content area
   shows the live health status of the service.
3. **Given** a developer starting interface work, **When** they build the first business screen,
   **Then** the persisted design system's tokens and components are already available and the
   screen follows the project's interface rules, including the loading, error, success, and
   confirmation behaviors.
4. **Given** a developer or partner integrating with the API, **When** they look up the contract,
   **Then** it is available in a human-readable form and is generated from the running service
   rather than maintained by hand.
5. **Given** a change to an endpoint, **When** the contract is generated, **Then** the published
   description reflects the change automatically.

---

### Edge Cases

- The database is not yet accepting connections when the service starts — the service waits and
  retries rather than crashing, and reports unhealthy until the connection succeeds.
- The database becomes unreachable while the service is running — the health address reports
  unhealthy, and the failure is recorded with the identifier of the health check or request that
  observed it.
- A migration fails partway through — the change is refused, the database is left at its last
  fully applied migration, and the failure explains which migration failed.
- A migration is applied twice, or migrations are applied out of order — the process is safe to
  repeat and detects the conflict instead of corrupting the schema.
- Reference data is loaded into a database that already has some of it — loading is repeatable and
  creates no duplicate permissions, role templates, or role-to-permission grants.
- An unexpected internal failure occurs in a code path with no error handling — the client still
  receives the standard error shape and a usable identifier, and no internal detail leaks.
- A client supplies an identifier that is extremely long, malformed, or contains characters that
  would corrupt a log line — the value is sanitized or replaced, and the log stays parseable.
- Two people push changes at the same time — the pipeline validates each change independently and
  the second is verified against the updated state.
- A change removes or renames an environment variable the service needs — the service fails fast
  at startup with a clear message instead of starting in a broken state.
- The machine has a port already in use — startup fails with a message naming the port rather than
  an unexplained crash.
- A log line would contain a password, session token, or secret — the sensitive value is redacted
  before the line is written.
- Two people run the startup command at the same time — the second run does not corrupt or duplicate
  anything.
- A scheduled or automated run has no interactive user — the same startup path works without any
  prompts or manual confirmation.
- The web app loads before any user or organization exists — the shell renders with placeholders
  that state this plainly, and no control appears to perform a business action it cannot perform.
- The health panel loads while the service is unreachable — the shell still renders, and the panel
  shows the failure with a retry action rather than an empty or blank area.
- A change is merged to the default branch — nothing is deployed and no hosted environment is
  restarted; the pipeline's terminal action is producing a verified image.

---

## Requirements *(mandatory)*

### Functional Requirements

**Repository and project structure**

- **FR-001**: The system MUST keep the web interface and the service in a single repository with
  one version history, so that a change spanning both is committed and reviewed together.
- **FR-002**: The two parts MUST be independently runnable and buildable from that single
  repository, without a second repository or a manual copy step.
- **FR-003**: The repository MUST provide a documented directory layout so a contributor can locate
  the interface, the service, the database schema, the automated checks, and the image build
  definitions without guesswork.
- **FR-004**: Credentials, keys, and environment-specific values MUST NOT be committed to the
  repository; the project MUST provide a documented example of every value the service needs.

**Local development environment**

- **FR-005**: The project MUST provide one documented command that starts the database, the service,
  and the interface together, from a clean checkout with no preinstalled database.
- **FR-006**: The development environment MUST use a real database server pinned to the same major
  version as production, started from a reproducible definition that is version controlled. The
  major version is fixed by this feature so that a migration passing in development and CI cannot
  fail only because the database version differs in production.
- **FR-007**: The startup process MUST wait for the database to accept connections before the
  service begins serving requests, and MUST report progress rather than fail silently.
- **FR-008**: The startup process MUST be safe to run repeatedly against an existing environment,
  preserving existing data and creating no duplicates.
- **FR-009**: A port conflict or a missing required configuration value MUST fail startup with a
  message naming the cause.
- **FR-010**: The project MUST document how to run the service, the interface, the database checks,
  and the full automated check suite locally.

**Database schema and migrations**

- **FR-011**: Every database change MUST be expressed as a version-controlled, ordered migration;
  ad-hoc manual schema changes are not an acceptable way to alter the schema.
- **FR-012**: The system MUST be able to bring an empty database up to the current schema with one
  command.
- **FR-013**: Applying migrations MUST be repeatable: running them again when already applied MUST
  succeed without altering data and without error.
- **FR-014**: The system MUST record which migrations have been applied, and MUST refuse to proceed
  when the applied history is missing, out of order, or inconsistent with the repository.
- **FR-015**: A migration that fails MUST leave the database at its last fully applied migration,
  and the failure MUST name the migration that failed.
- **FR-016**: The schema and its supporting documentation MUST be **documented and ready for**
  later features to add organization scoping, exact decimal columns, and append-only records
  without rewriting existing tables. This is verified by review of the recorded conventions
  against the requirements of those features, not by a runtime test — this feature creates no
  organization-owned table and no monetary column to test against.

**Reference data**

- **FR-017**: The project MUST provide a documented, repeatable way to load reference data,
  including the default role and permission set the product depends on.
- **FR-018**: Loading reference data MUST be idempotent: repeated loads MUST NOT create duplicate
  roles, permissions, or other reference records.
- **FR-019**: Loading reference data MUST be the documented way to obtain the baseline permission
  catalog and default role templates in development and test environments. A tenant-bearing
  demonstration workspace is explicitly not produced by this feature; it arrives with the
  organization feature, because it depends on data that does not exist yet.

**Web interface**

- **FR-019a**: The web app MUST consist of exactly two things in this feature: the application
  shell, and one health status panel that displays the response from the health endpoint. No
  business screen, and no sign-in screen, is delivered here.
- **FR-019b**: The application shell MUST render its persistent sidebar, top bar, and content area
  on first load, with the organization switcher and user menu showing clearly labelled
  placeholders that state no organization or user is available yet. A placeholder MUST read as
  unavailable rather than as a working control that silently does nothing.
- **FR-019c**: The shell MUST NOT present any control that implies a business action. Navigation
  entries for modules whose features do not exist MUST be absent rather than present and
  non-functional.
- **FR-019d**: Every shell component MUST be built from the persisted design system's tokens and
  components, and MUST contain no color, font, or spacing value that is not defined by that design
  system. A repeatable automated check MUST fail the build if a raw color or font value appears in
  web app code.
- **FR-020**: Reference data MUST be safe to load into an environment that already contains
  partially-created reference records.

**API error format**

- **FR-021**: Every failing response MUST use a single shape containing exactly a machine-readable
  code, a human-readable message, a details collection, and a request identifier.
- **FR-022**: The same shape MUST be used for every failure class the product defines, including
  validation failures, unauthenticated requests, forbidden requests, missing records, conflicts,
  rate limiting, and unexpected internal failures. The contract MUST document every code the
  product defines, including codes no current endpoint emits, so a client generated from the
  contract handles a failure it has never seen.
- **FR-022a**: This feature MUST ship the rate-limit failure shape and the client's handling of the
  `Retry-After` response header, and MUST NOT ship a rate-limiting mechanism. No route delivered
  by this feature is rate limited, and the product MUST make no claim that any is. The mechanism
  arrives with authentication, where the endpoints the product actually targets for limiting exist.
- **FR-022b**: A client that receives a 429 response MUST be able to render it from the standard
  shape alone, without the client having been written against a rate-limiting implementation.
- **FR-023**: The details collection MUST be empty rather than omitted when there are no field-level
  details.
- **FR-024**: Field-level validation failures MUST identify which fields failed so a form can show
  an error under each one.
- **FR-025**: Each documented failure class MUST have a stable machine-readable code that clients
  may branch on; codes MUST NOT change meaning once published.
- **FR-026**: An unexpected internal failure response MUST NOT contain a stack trace, file path,
  query, or other internal detail.
- **FR-027**: The error format MUST be described in the published API contract so clients can
  generate against it.

**Request identifiers**

- **FR-028**: Every request MUST carry a single request identifier that appears in the response and
  in every log entry produced while handling that request.
- **FR-029**: If a client supplies an identifier, the system MUST use it; otherwise the system MUST
  generate one.
- **FR-030**: A supplied identifier MUST be sanitized so it cannot corrupt a log entry or inject
  content, and an unusable value MUST be replaced rather than rejected.
- **FR-031**: User-visible failure messages MUST include the request identifier so a user can quote
  it in a support request.

**Health endpoint**

- **FR-032**: The system MUST expose a health address at `GET /api/v1/health`.
- **FR-033**: The health response MUST report the state of the application and of its database
  connection separately, so a failure can be attributed to the right component.
- **FR-034**: The health address MUST report healthy only when the application is serving and the
  database is reachable; otherwise it MUST report unhealthy.
- **FR-034a**: The health address MUST fail closed. An unknown or unmeasured check result MUST be
  reported as unhealthy rather than healthy, so a check that cannot run can never be mistaken for
  a check that passed.
- **FR-034b**: This feature MUST NOT claim, document, or enforce an availability, backup, or
  recovery target. Uptime, backup, and recovery commitments attach to the hosted environment and
  belong to the operations feature.
- **FR-035**: The health address MUST be reachable without authentication so that infrastructure can
  use it, and MUST NOT disclose internal versions, hostnames, connection strings, or credentials.

**Structured logging**

- **FR-036**: The service MUST write structured log records that can be parsed as single units,
  rather than free-form lines.
- **FR-037**: Each request log record MUST include the request identifier, the route, the response
  status, and the time taken.
- **FR-038**: Where a request is associated with a signed-in user and an organization, the log
  record MUST include those identifiers.
- **FR-039**: Log records MUST NOT contain passwords, session tokens, secrets, or personal data
  beyond what is needed to diagnose a problem.
- **FR-040**: Production log output MUST NOT contain stack traces or internal details for handled
  failures; unexpected failures MUST be recorded with their identifier so they can be found.

**API contract**

- **FR-041**: The system MUST generate the API contract from the running service, so the published
  description cannot drift from the implemented behavior.
- **FR-042**: The contract MUST be available in a human-readable form during development and
  produced as an artifact on every build.
- **FR-043**: Every endpoint MUST declare its request and response shapes, its error codes, and any
  identifier or header it requires, so a client can be written from the contract alone.
- **FR-044**: A change that alters the published contract unintentionally MUST be visible for review
  before merge.

**Automated verification pipeline**

- **FR-045**: Every proposed change MUST run an automated pipeline that performs rule checking, type
  checking, unit tests, integration tests against a real database, and a build of both parts.
- **FR-046**: The pipeline MUST block the merge when any mandatory check fails, and the failure
  message MUST name the check that failed.
- **FR-047**: Integration tests MUST run against a real database instance that is created and torn
  down by the pipeline, never against a substitute.
- **FR-048**: The pipeline MUST validate that the migration history applies cleanly from an empty
  database and that the schema matches the repository's expectations.
- **FR-049**: The pipeline MUST verify dependencies can be installed reproducibly from the
  committed lock definitions.
- **FR-050**: The pipeline MUST verify that a deployable image can be produced for the service, and
  that the interface can be built into static assets.
- **FR-050a**: The pipeline MUST NOT deploy. Merging any change MUST NOT push, publish, or restart
  anything in a hosted environment. Verification is the terminal action of this pipeline.
- **FR-050b**: The images the pipeline produces MUST be portable and host-agnostic, so the hosting
  platform can be chosen later without rebuilding or restructuring them.
- **FR-051**: A change MUST NOT be merged while the pipeline is failing or has not completed.
- **FR-052**: The project MUST document what each mandatory check covers and how to reproduce a
  failure locally.

**Documentation**

- **FR-053**: The project MUST document the environment setup, the project layout, the available
  commands, the error codes, and the health address.
- **FR-054**: Documentation MUST state that the product makes no tax-compliance, e-invoicing, or
  complete-accounting claim.
- **FR-055**: The service MUST emit structured log records and unhandled-exception reports in a
  form an external monitoring or analytics service can consume, without depending on any such
  service. Integration with a specific monitoring or analytics vendor is out of scope; what this
  feature owes is that nothing about the log format must change when one is added.
- **FR-055a**: This feature MUST make no outbound request to any analytics, monitoring, or other
  third-party service. A request handled entirely within this feature MUST complete without
  network egress to a third party, including on the failure path.

### Key Entities

- **Migration**: One ordered, version-controlled change to the database schema, with an identity,
  an order, and a record of whether it has been applied to a given database.
- **Reference record**: Baseline data the product requires to function, such as a default role or a
  permission, loadable repeatably into any environment.
- **Request identifier**: A single value attached to one inbound request and reused in its response
  and in every log record produced while handling it.
- **Error response**: The single failure shape returned to a client, containing a code, a message,
  details, and the request identifier.
- **Health report**: The result of a liveness and readiness check, reporting the application state
  and the database connection state separately.
- **Log record**: One structured entry describing an event, carrying the request identifier and,
  where known, the user, organization, route, status, and elapsed time.
- **API contract**: The generated description of the service's endpoints, request and response
  shapes, and error codes, produced from the running service.

---

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** No business tables are created by this feature; the health endpoint and
  error handling are organization-agnostic and read no organization data. The foundation provides
  the tenant context plumbing and the composite-key and `organization_id` conventions that later
  modules MUST use, and it establishes the rule that a repository query without a resolved tenant
  context fails rather than reading unscoped. No isolation test is possible for this feature
  because it exposes no organization-owned data; the first isolation tests arrive with the first
  organization-owned tables, and the pipeline already runs the suite that will carry them.
- **II. Server-enforced authority:** The health endpoint is the only unauthenticated endpoint and is
  declared as such explicitly rather than by omission; every other route added later must carry a
  declared permission and the foundation's guard chain defaults to deny, so an undeclared route
  fails closed. Validation of all inputs happens server-side against explicit schemas.
- **III. Transactional integrity:** No posting operation is introduced, so no endpoint requires an
  `Idempotency-Key` yet. The foundation MUST establish the single-transaction boundary mechanism,
  the append-only privilege model, and the audit-write-inside-the-transaction pattern that later
  posting endpoints depend on. Multi-step startup and migration paths MUST be atomic or fully
  reversible, and a failed migration MUST leave the database at its last applied state.
- **IV. Exact decimals:** The schema conventions this feature establishes MUST declare the decimal
  precisions the product uses — money to two places, unit prices to four, quantities to three — so
  later tables inherit them. No floating-point storage or calculation is introduced, and the
  database's decimal type is configured and validated as the default for numeric business values.
- **V. Test-first:** Tests for the error format, request identifiers, health states, log records,
  migration validity, and idempotent reference-data loading are written first and observed
  failing. Integration tests run against a real database instance provisioned by the pipeline. The
  pipeline reports critical-path coverage and blocks below the 80% threshold.
- **VI. Module boundaries:** The foundation is its own platform module owning configuration,
  health checks, the error envelope, request identifiers, logging, and the database connection.
  It owns no business tables and exposes no cross-module table access, so no circular dependency is
  introduced. No microservice, message broker, cache server, or orchestrator is introduced, and no
  background worker is added without a requirement for one. No third-party analytics or monitoring
  service is contacted at runtime, so the dependency the product will eventually add arrives as
  configuration rather than as a runtime coupling.
- **VII. Honest boundaries:** No feature, label, or document produced here implies tax compliance,
  certified invoicing, or complete accounting. The generated contract and the documentation carry
  no such claim, and the documentation states the limitation explicitly.
- **VIII. Design system and accessibility:** The interface shell is built from the persisted design
  system tokens and components, follows the application shell pattern, targets light mode at
  desktop and tablet sizes, and implements the PRD Section 7.3 loading skeleton, error panel with
  retry, and empty-state rules — the rules that apply to the one screen this feature delivers. The
  success-toast, confirmation-dialog, and status-badge rules have no screen to attach to yet and are
  exercised by the components themselves. Keyboard operability, visible focus, labeled fields, and
  sufficient contrast are met. No new color, font, or spacing value is introduced outside the
  design system, and an automated check enforces that.
- **IX. Scope discipline:** Classified P0 as the reliability and quality foundation the product
  depends on. P1 items (dashboard, enhanced reports, invitations, partial shipments, import and
  export, usability polish) are explicitly excluded and remain deferred until the preceding
  phase's exit criteria are met. Nothing from P2 or P3 is included.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer starting from a clean checkout reaches a running interface, service, and
  database in under 15 minutes without installing a database server locally and without asking for
  help.
- **SC-002**: Starting an already-running environment a second time preserves all existing data and
  produces no duplicate reference records.
- **SC-003**: 100% of failure responses across every endpoint return the same shape containing
  exactly a code, a message, details, and a request identifier.
- **SC-004**: 100% of responses, successful and failing, carry a request identifier that also appears
  in that request's log records, verified by automated test.
- **SC-005**: 100% of unhandled internal failures return a message free of stack traces, file paths,
  and internal details, verified by automated test.
- **SC-006**: The health address distinguishes application state from database state, reports
  unhealthy whenever the database is unreachable, and leaks no internal version, hostname, or
  credential.
- **SC-007**: 100% of log records parse as single structured units, and an automated test proves
  that no password, token, or secret appears in log output.
- **SC-008**: The published API contract is generated from the running service, and an automated
  check fails when the contract changes unintentionally.
- **SC-009**: 100% of proposed changes run the full mandatory check set, and no change is merged
  while any mandatory check is failing or incomplete.
- **SC-010**: Every mandatory check failure message names the check that failed, so a developer can
  act on it without reading pipeline internals.
- **SC-011**: Integration tests execute against a real database instance for every pipeline run, and
  the pipeline fails if the integration suite is skipped or runs without a real database.
- **SC-012**: Migrations apply cleanly from an empty database on every pipeline run, and a pipeline
  run against a database that has already applied them succeeds without altering data.
- **SC-013**: The service produces a deployable image and the interface produces static assets on
  every pipeline run.
- **SC-014**: Critical business-logic paths, including the error format, request identifier handling,
  health states, and migration validity, reach at least 80% coverage, reported by the pipeline.
- **SC-015**: The setup, layout, commands, error codes, and health address are documented well enough
  that a new contributor answers setup questions from the documentation alone.
- **SC-016**: Zero product surfaces produced by this feature imply tax compliance, e-invoicing
  compliance, or complete accounting, verified by review.
- **SC-017**: Opening the web app with no user and no organization shows a rendered application
  shell plus a live health status panel, and shows zero controls that appear to perform a business
  action, verified by automated test.
- **SC-018**: Zero raw color or font values appear in web app code, verified by an automated check
  that fails the pipeline when one does.
- **SC-019**: Zero pipeline stages push, publish, or restart anything in a hosted environment,
  verified by inspecting the pipeline definition. A merge produces a verified image and nothing
  else.
- **SC-020**: The image built by the pipeline runs on a hosting platform that was not known when
  the image was written, verified by running it from a clean environment with only documented
  configuration.
- **SC-021**: The 429 response shape and `Retry-After` handling are exercised by an automated test
  against a simulated rate-limit response, while zero routes delivered by this feature are rate
  limited and no documentation claims otherwise.
- **SC-022**: Handling a request and an unhandled failure produce zero outbound calls to any
  third-party service, verified by an automated test that fails the pipeline if such a call is made.
- **SC-023**: Every unhandled exception produces a log record carrying the request identifier and
  the exception type, and the record's fields are a documented, stable set that a monitoring
  service can consume without a format change.
- **SC-024**: The health address reports healthy when the database is reachable and unhealthy when
  it is not, verified by an automated test against a real database that is stopped mid-run, and it
  reports an unmeasured check as unhealthy rather than healthy.
- **SC-025**: Zero documentation produced by this feature states an availability, backup, or
  recovery target for the product, verified by review.

---

## Assumptions

- The technology stack is fixed by the product requirements document rather than chosen by this
  feature: the service is NestJS on Node.js LTS with TypeScript, the interface is React with
  TypeScript and Vite, the database is PostgreSQL accessed through Prisma with version-controlled
  migrations, the development environment is containerized with Docker, and the pipeline is GitHub
  Actions. These are constraints, not design decisions of this feature.
- Reference data means baseline data the product requires to function: the global permission
  catalog and the default role templates, each defined once in the shared package and loaded
  repeatably into any environment. It does not mean business records, and it creates no
  organization, user, stock, invoice, or payment data.
- The health address is intentionally public so infrastructure can use it, and it is the only
  unauthenticated endpoint introduced here. It exposes service status only.
- Authentication, sessions, organizations, memberships, and role management are separate features;
  this feature provides the shell, guards, and error handling they plug into, and does not implement
  them. Because no user or organization exists yet, the web app delivers the application shell plus
  a single health status panel, with the organization switcher and user menu rendered as clearly
  labelled unavailable placeholders rather than working controls. No sign-in screen is delivered,
  because a sign-in screen that submits nowhere is a screen the authentication feature must delete.
- Business modules, their tables, their permissions, and their endpoints are out of scope. This
  feature creates no organization-owned business table and therefore has no tenant-isolation test
  of its own; it establishes the mechanism and the pipeline that will carry those tests.
- All business endpoints introduced later live under the same versioned API prefix used by the
  health address, and inherit the error format and request identifier behavior defined here.
- Reference data is for development and test environments only and is never loaded into production.
- Backups, restoration testing, alerting, hosting selection, and the deploy stage of the pipeline
  belong to the deployment and operations feature. This feature delivers a verified, portable image
  and the documentation needed to run it, and stops there: it never deploys and never configures a
  hosting platform.
- Rate limiting is not implemented here. This feature delivers the failure shape and the client's
  handling of it so a client generated from the contract is correct before any limiter exists; the
  mechanism and its endpoint targets arrive with authentication.
- Product analytics and error monitoring are not wired here, though both are product dependencies.
  This feature produces the log records and unhandled-exception reports they consume and keeps the
  request path free of third-party calls, so adding either one later is configuration rather than
  a format change. Analytics additionally has no user-facing workflow to report until a
  user-facing feature exists.
- This feature carries no availability, backup, or recovery target. What it guarantees is the health
  address behaving correctly — reporting the application and database states separately and failing
  closed when a check cannot run — and that an invalid configuration stops startup immediately
  rather than yielding a half-working service. Note this is distinct from an unreachable database
  at startup, which the service waits out and retries rather than crashing on. Uptime and recovery
  commitments attach to the hosted environment and belong to the operations feature.
- The existing persisted design system governs every visual decision in the interface shell; this
  feature introduces no new visual tokens.