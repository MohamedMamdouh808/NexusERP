<!--
SYNC IMPACT REPORT
Generated: 2026-10-18

Version change: (template, unversioned) -> 1.0.0
Bump rationale: Initial ratification. The constitution file existed only as the
unfilled Spec Kit template, so this is the first adopted version. No prior
principles were removed or redefined; the whole governance baseline is new.

Modified principles: none (first adoption).

Added sections:
  - Core Principles I. Tenant Isolation Is Mandatory
  - Core Principles II. Server-Enforced Authority, Default Deny
  - Core Principles III. Transactional Integrity and Immutable Posted Records
  - Core Principles IV. Exact Decimal Arithmetic
  - Core Principles V. Test-First for Critical Rules
  - Core Principles VI. Modular Monolith with Explicit Boundaries
  - Core Principles VII. Honest Product Boundaries
  - Core Principles VIII. Design System and Accessible Experience
  - Core Principles IX. Scope Discipline (P0 -> P1, Never P3)
  - Technical Constraints and Non-Functional Requirements
  - Development Workflow and Quality Gates
  - Governance

Removed sections: none (template placeholders resolved).

Templates requiring updates:
  - .specify/templates/plan-template.md   -> updated (Constitution Check gate made explicit)
  - .specify/templates/spec-template.md   -> updated (MoSCoW priority + constitution declaration)
  - .specify/templates/tasks-template.md  -> updated (tests are now mandatory, not optional)
  - .specify/templates/checklist-template.md -> no change required (generic quality checklist)
  - .specify/templates/constitution-template.md -> no change (kept as the untouched template)
  - .opencode/command/speckit.constitution.md -> no change (agent-agnostic already)
  - .opencode/command/speckit.plan.md        -> no change (loads constitution dynamically)
  - .opencode/command/speckit.analyze.md     -> no change (generic principle extraction)
  - .opencode/command/speckit.tasks.md       -> no change (delegates to tasks-template.md)
  - .opencode/command/speckit.implement.md   -> no change
  - .opencode/command/speckit.clarify.md     -> no change
  - AGENTS.md                                 -> no change (SPECKIT block is generic)
  - docs/PRD.md                               -> no change (constitution derives from the PRD)

Runtime guidance docs:
  - docs/quickstart.md and README.md do not exist yet; they MUST be written to
    restate Principles I, II, III, and IX when Phase 1 scaffolding is created.

Follow-up TODOs (deferred, not blocking):
  - Engineering Lead identity is still marked TBD in PRD Section 15. The named approver must be
    recorded before Gate 2 (2026-10-30) so the amendment procedure has an owner.
  - docs/quickstart.md and README.md must be authored during Phase 1.
  - Error-monitoring vendor is marked TBD in PRD Section 9.10; Principle VIII and the
    observability constraints hold regardless of vendor.

Source of truth: docs/PRD.md v1.0 (2026-10-17) and design-system/nexuserp/MASTER.md.
-->

# NexusERP Constitution

## Core Principles

### I. Tenant Isolation Is Mandatory

Every organization-owned table carries a NOT NULL `organization_id` column, and every
foreign key between organization-owned tables is composite over `(organization_id, id)`, so
a cross-tenant relation is rejected by PostgreSQL rather than by application code.

- Tenant scope MUST be resolved from the server-side session together with a verified,
  active membership. A client-supplied organization identifier MUST be ignored, even when
  it names an organization the user legitimately belongs to.
- Every repository query MUST require the resolved tenant context. A query that cannot
  supply it MUST fail rather than fall back to an unscoped read.
- A request for a record owned by another organization MUST return HTTP 404, whether or
  not that record exists. It MUST NOT return 403, a record count, or any other signal
  that confirms existence.
- Every API endpoint, report, and export MUST have an automated tenant-isolation test that
  provisions two organizations and proves that a member of one cannot read, mutate, or
  enumerate the other's records.
- An endpoint, report, or export merges only when its isolation test exists and passes in
  CI.

Rationale: a single cross-tenant read is a release-blocking defect (PRD R-003 and
Section 14.1). Isolation enforced by the schema and proven by a passing test suite
survives a 16-week schedule with one developer; isolation enforced only by reviewer
vigilance does not.

### II. Server-Enforced Authority, Default Deny

All business rules, permission checks, and state transitions are enforced on the server.
The client is untrusted; hiding a control in the interface is a usability measure and
never a security measure.

- Every endpoint MUST declare its required permission in a decorator. An endpoint without a
  declared permission MUST fail the test suite.
- Authorization is default deny. An absent permission, absent role, inactive membership,
  disabled module, or unresolvable tenant context returns HTTP 403.
- Every state transition MUST be validated server-side against the documented state
  machine. An invalid transition returns HTTP 409 `INVALID_STATE_TRANSITION`.
- Module availability MUST be enforced server-side: endpoints of a disabled module return
  HTTP 403 `MODULE_DISABLED`.
- Every input MUST be validated server-side against an explicit schema, and every query
  MUST be parameterized.
- Authentication failures MUST be generic so that account existence cannot be inferred.

Rationale: the primary users are non-technical staff on shared machines, and a single
bypassed check exposes another organization's commercial data. Default deny means an
unforgotten guard fails closed instead of open.

### III. Transactional Integrity and Immutable Posted Records

Any operation that touches more than one record MUST execute inside a single PostgreSQL
transaction. A partially committed operation is never an acceptable outcome.

- Stock postings, invoice issuance, and payment recording with allocation MUST require an
  `Idempotency-Key` header. The key, the request hash, and the response commit in the same
  transaction as the business change.
- A repeated key with an identical request returns the stored response and performs no
  second posting. A repeated key with a different request body returns HTTP 422
  `IDEMPOTENCY_KEY_REUSED`.
- Idempotency alone is insufficient. Database state guards — status checks, CHECK
  constraints, conditional `UPDATE ... WHERE` statements, and unique constraints — MUST
  make duplicate posting impossible even when no key is supplied.
- Concurrent stock mutations MUST serialize through row locks or conditional updates, and
  balance rows MUST always be acquired in ascending product ID order to prevent deadlock.
- Posted stock movements, shipments, issued invoices, payments, payment allocations, and
  audit logs are immutable. The application database role MUST NOT hold UPDATE or DELETE
  privilege on those tables.
- A posted record is corrected only by a compensating record that carries a reason:
  compensating stock adjustment, invoice void, or payment reversal. In-place edits and
  deletions of posted records are prohibited.
- The audit record for an action MUST commit in the same transaction as the business
  change. A failed audit insert MUST roll the business change back.

Rationale: duplicated receipts, oversold stock, and over-allocated payments are the
failures that destroy trust in an ERP. They are prevented by transaction boundaries,
idempotency, database constraints, and immutability together — never by one of them alone.

### IV. Exact Decimal Arithmetic

Money and quantities use exact decimals. Floating-point arithmetic is prohibited for
monetary values and for quantities everywhere: database columns, application types, API
contracts, fixtures, and tests.

- Monetary columns MUST use `NUMERIC(14,2)`.
- Unit price and unit cost columns MUST use `NUMERIC(14,4)`.
- Quantity columns MUST use `NUMERIC(14,3)`.
- JSON MUST transport decimals as strings. Application types MUST use a decimal-safe
  representation; IEEE 754 doubles MUST NOT carry a monetary or quantity value.
- Line total = quantity x unit price, rounded half-up to 2 decimals. Rounding MUST be
  applied per line at the point the value is persisted.
- Document total = the sum of the already-rounded line totals, never a re-rounded product
  of unrounded intermediate sums.
- Price changes MUST NOT alter existing documents: prices are copied onto document lines
  at creation.

Rationale: 0.1 plus 0.2 must equal 0.30 on an invoice a customer will dispute. Rounding
rules that differ between the server, the report, and the printed document are
indefensible in an invoicing product.

### V. Test-First for Critical Rules

Critical business rules are specified as failing automated tests before the implementation
that satisfies them is written.

- The following rules MUST be covered by tests written first and observed failing:
  tenant isolation, permission enforcement, concurrent reservations, duplicate posting,
  transaction rollback, payment allocation, invoice calculation, and immutability of
  posted records.
- Integration tests MUST run against a real PostgreSQL instance. SQLite, in-memory
  substitutes, and mocked persistence layers are not acceptable for these rules.
- Critical business-logic paths MUST reach at least 80% coverage, reported by CI.
- CI MUST gate merges on lint, type check, unit tests, PostgreSQL integration tests,
  migration validation, and build verification.
- A change that touches a posting path MUST add or update its concurrency and rollback
  tests in the same change.
- A failing mandatory check blocks merge and blocks deployment.

Rationale: correctness claims in an ERP are only worth what their test suite proves. The
defects that matter — races, duplicate posts, partial writes — do not appear in unit
tests with a faked database, so the real database is mandatory.

### VI. Modular Monolith with Explicit Boundaries

The system is a single deployable NestJS application with one module per domain: Auth,
Organizations, Users, AccessControl, Contacts, Products, Inventory, Purchasing, Sales,
Invoicing, Reporting, Audit, and Platform.

- Each module exposes explicit service interfaces. A module MUST NOT read or write another
  module's tables directly, regardless of convenience.
- A cross-module workflow, such as confirming a sales order and reserving stock, MUST call
  the owning module's service inside one database transaction.
- Circular module dependencies are prohibited. Shared behavior is introduced through an
  explicitly owned Platform interface or an orchestrating service.
- v1 excludes microservices, message brokers, Kubernetes, and Redis. Sessions, idempotency
  records, and rate-limit counters live in PostgreSQL.
- A new infrastructure dependency requires a measured requirement, a recorded decision, and
  an amendment to this constitution.

Rationale: module boundaries are what keep a monolith maintainable by one developer.
Unchecked cross-module table access turns a modular monolith back into a ball of mud and
makes the tenant and transaction guarantees impossible to verify.

### VII. Honest Product Boundaries

NexusERP makes no tax-compliance, e-invoicing, certified-invoicing, or
complete-accounting claim. No feature, label, document, export, or piece of
marketing copy may imply one.

- Every invoice MUST be labeled "Operational invoice — not a tax invoice" in the interface,
  in printable output, in exported documents, and in documentation.
- No tax fields exist in v1. Introducing one is a P3 item that requires a legal assessment
  of the target jurisdiction and an amendment to this constitution.
- Product documentation, the README, and onboarding material MUST state that NexusERP is
  not an accounting system and provides no general ledger, chart of accounts, or financial
  statements.
- Limitation statements MUST be visible wherever an invoice is created, viewed, printed, or
  exported.

Rationale: users routinely assume an "ERP invoice" is a tax document. A false compliance
claim is a legal and commercial liability that no feature benefit can offset (PRD R-006).

### VIII. Design System and Accessible Experience

The user interface MUST be built from the persisted design system at
`design-system/nexuserp/MASTER.md` (the UI UX Pro Max output for this project), and MUST
satisfy the UX rules in PRD Section 7.3 and WCAG 2.1 AA.

- Colors, typography, spacing, and component styles MUST come from the design system
  tokens. A page-level file at `design-system/pages/[page].md`, when present, overrides the
  master file; otherwise the master file governs strictly.
- Every feature MUST implement the PRD Section 7.3 rules: validation on blur and submit
  using the same Zod schema as the API contract with server-authoritative errors, skeleton
  loading states, disabled submit buttons with a spinner while in flight, inline field
  errors, a dismissible error banner carrying the `requestId`, a success toast naming the
  affected record, confirmation dialogs for destructive and irreversible actions,
  explanatory empty states, status badges matching API status names, and server-side
  paginated tables with a visible total count.
- Core workflows MUST meet WCAG 2.1 AA: labeled form fields, sufficient color contrast,
  visible focus, complete keyboard operation, and accessible error messages.
- Accessibility and UX-rule conformance are review criteria, not polish. A change that
  regresses them does not merge.

Rationale: the personas are low-to-medium technical users working fast under time
pressure. A consistent, accessible interface is a correctness feature: mis-clicked or
misread states become bad business records.

### IX. Scope Discipline (P0 First, P1 Conditional, P3 Never)

- P0 features are delivered first. P1 work starts only after the preceding phase's exit
  criteria are met and the P0 test suite is green.
- P2 is post-v1. P3 is never implemented in v1, under any schedule pressure.
- P1 scope is cut before tenant isolation, permission enforcement, transaction integrity,
  or test coverage is reduced. Scope is reduced rather than correctness.
- Every requirement MUST be classified P0, P1, P2, or P3 in its specification before
  implementation begins, and the classification MUST be recorded.
- Moving an item across the P0 or P1 boundary requires an amendment to this constitution.

Rationale: ERP breadth is the primary schedule risk (PRD R-001 and R-004). The 16-week
plan is only achievable because P1 is conditional and P3 is refused.

## Technical Constraints and Non-Functional Requirements

- **Stack:** Node.js LTS, NestJS, and TypeScript on the backend with Prisma over
  PostgreSQL; React 18+, Vite, Tailwind CSS, TanStack Query, and React Hook Form with Zod
  on the frontend. Jest and Supertest for backend tests; Vitest, React Testing Library, and
  Playwright for frontend tests.
- **System of record:** PostgreSQL holds all business state. Development, test, and
  production databases are separate.
- **Data integrity:** CHECK constraints enforce `on_hand >= 0`, `reserved >= 0`,
  `reserved <= on_hand`, and non-negative amounts. Unique constraints cover
  `(organization_id, lower(sku))`, `(organization_id, lower(email))`,
  `(organization_id, number)`, and `(organization_id, idempotency_key, endpoint)`.
- **API:** REST under `/api/v1`, OpenAPI generated from code, error envelope
  `{ code, message, details, requestId }`, server-side pagination with default page size 25
  and maximum 100.
- **Security:** Argon2id password hashing; server-side sessions in PostgreSQL behind an
  opaque HttpOnly, Secure, SameSite=Lax cookie; CSRF token on every state-changing
  request; rate limiting on login, registration, password, and invitation endpoints;
  explicit CORS allowlist; security headers and a Content Security Policy; HTTPS in
  production; no stack traces, secrets, or session tokens in responses, logs, or audit
  details.
- **Performance:** p95 API response under 500 ms excluding reports, imports, and exports;
  pages usable within 2 seconds at p95; reports within 5 seconds on the agreed pilot
  dataset; indexes on `organization_id` plus filtered columns; every collection paginated
  on the server.
- **Observability:** structured JSON logs with request ID, organization ID, user ID,
  route, status, and latency; error monitoring on unhandled exceptions; metrics for API
  latency, error rate, failed or rolled-back critical operations, idempotent replays,
  authentication failures, and reconciliation failures; an alert when the error rate
  exceeds 1% over 5 minutes or when a stock reconciliation check fails.
- **Availability and recovery:** 99.9% monthly availability target, daily backups with
  30-day retention, RPO 24 hours, RTO 4 hours, and a documented restore test before
  public launch.
- **Privacy by design:** collect only data needed for operations; product analytics
  receive aggregate events only, never invoice contents, payment details, passwords, or
  tokens; personal and commercial data access is restricted by permission.

## Development Workflow and Quality Gates

- **Build order:** authentication and tenant isolation, then RBAC and audit, then contacts
  and products, then idempotency and numbering, then inventory, purchasing, sales,
  shipments, invoices, payments, and finally reports. Each stage depends only on the ones
  before it.
- **Every change ships with its tests.** A failing mandatory CI check blocks merge and
  deployment.
- **Migrations** are version-controlled with Prisma and validated in CI. Manual corrective
  SQL against production is prohibited.
- **Review** verifies, per principle, that the change is tenant-scoped, permission-declared,
  transactional where it posts, decimal-exact, tested, boundary-respecting, honestly
  labeled, accessible, and in-scope.
- **Phase exit** requires all of: the phase's P0 acceptance criteria met, the phase's
  critical tests green, at least 80% coverage on critical paths, and a recorded approval at
  the matching gate — Gate 1 requirements, Gate 2 architecture, Gate 3 beta, Gate 4
  release.
- **Manual verification** on the supported browsers (Chrome 100+, Safari 15+,
  Firefox 100+, Edge) at desktop and tablet sizes before each phase exit.
- **Release-blocking conditions** in PRD Section 14 are absolute. Public launch waits until
  every one of them is cleared.
- **Branches** follow `NNN-feature-name`. Every pull request references its spec and plan
  and states how it complies with this constitution.

## Governance

This constitution is the project's authority on method. It supersedes conflicting
conventions in templates, task breakdowns, and habit. When a plan, specification, or task
list conflicts with a principle, the artifact is amended — never the principle. A feature
that violates a principle does not merge by arguing that the principle is inconvenient.

- **Amendment procedure:** propose a pull request against
  `.specify/memory/constitution.md` stating the change, the rationale, the affected
  principles, and the migration plan for existing code, templates, and documents. Approval
  requires the Product Owner and the Engineering Lead. Amendment is a deliberate,
  documented act, never an in-passing edit.
- **Versioning policy:** semantic versioning on the constitution itself. MAJOR when a
  principle is removed or redefined incompatibly. MINOR when a principle or section is
  added or materially expanded. PATCH for clarifications, wording, and typo fixes.
- **Compliance review:** at every approval gate, and at least monthly during development,
  the team verifies the delivered work against each principle and records the result.
  Violations are either fixed or justified in writing in the plan's Complexity Tracking
  table before work continues. They are never silently ignored, and no violation is
  resolved by redefining the principle inside a feature branch.
- **Enforcement:** `/speckit.analyze` treats a constitution violation as CRITICAL and
  resolves it by changing the spec, plan, or tasks. Adding, weakening, or removing a
  principle requires `/speckit.constitution` as a separate, explicit step.
- **Guidance files:** `docs/PRD.md` defines product scope and `design-system/nexuserp/MASTER.md`
  defines the interface system. Where either conflicts with this constitution, this
  constitution prevails and the conflicting file is corrected.

**Version**: 1.0.0 | **Ratified**: 2026-10-18 | **Last Amended**: 2026-10-18