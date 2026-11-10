# Implementation Plan: Role-Based Access Control and Audit Log

**Branch**: `006-rbac-audit-log` | **Date**: 2026-11-09 | **Spec**: specs/006-rbac-audit-log/spec.md  
**Input**: Feature specification from `/specs/006-rbac-audit-log/spec.md`

## Summary

Build backend-only RBAC and the audit log: per-organization role catalogues provisioned from the five role templates inside registration and backfilled to pre-existing organizations by a new migration; multi-role memberships whose effective permissions are the union of held roles; member management endpoints (list, create with admin-supplied initial password + forced change flag, roles replace, deactivate/reactivate) under `users.manage`; a roles-and-permissions read plus custom-role CRUD under `roles.manage` with read-only system roles, assigned-role delete refusal, and the no-escalation subset rule; `POST /auth/change-password` with current-password verification, session rotation and forced-change gating; and an append-only, DB-enforced audit log written by one central helper inside the same transaction as every audited action, exposed through an org-scoped `audit.read` listing endpoint.

## Technical Context

**Language/Version**: TypeScript, Node.js 24 LTS  
**Primary Dependencies**: NestJS 11, Prisma 6, @nestjs/swagger, pino, class-validator, class-transformer, zod (shared, strict DTO validation), argon2  
**Storage**: PostgreSQL 17 via Prisma, single database for app data, sessions and the audit log  
**Testing**: Jest (unit + integration against real PostgreSQL), Supertest; guards `check:migrations` (incl. checksum immutability), `check:rls`, `check:schema-numeric-types`, `check:boundaries`, `check:structure`, `check:secrets`, `openapi:diff` contract drift  
**Target Platform**: Linux server, Node.js runtime  
**Project Type**: Web application (backend-only feature; frontend untouched)

**Constitutional constraints carried into every decision**: integration tests run against real PostgreSQL (no SQLite/in-memory substitutes); no Float carries money or quantity (this feature introduces none); no microservices, Redis or Kubernetes in v1; the mandated build order places RBAC and audit before every business module.

## Constitution Check

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | `Role.organization_id` becomes NOT NULL and `roles` uniqueness moves to `(organization_id, key)`; `membership_roles` gains `organization_id` NOT NULL; foreign keys between org-owned tables are composite over `(organization_id, id)`. Tenant scope resolves from the session's verified active membership; cross-org record addressing returns 404. The one deviation — nullable `audit_logs.organization_id` for anonymous auth events — is recorded in Complexity Tracking. Cross-tenant tests for every new endpoint. | PASS (one justified deviation, see Complexity Tracking) |
| II. Server-Enforced Authority | Every new endpoint declares `@RequirePermission('users.manage'|'roles.manage'|'audit.read')`; default-deny `PermissionGuard` (globally registered) fails closed; `effectivePermissions()` seam finally resolves from the database. Forced password-change gating answers 403 `PASSWORD_CHANGE_REQUIRED`; wrong current password 400 `INVALID_CURRENT_PASSWORD` (never 401); non-enumerable member creation answers identically either way. | PASS |
| III. Transactional Integrity | Registration proven to materialize roles/permissions inside its existing single transaction; member creation, roles replace, deactivation/reactivation and every custom-role change run in one transaction; the audit helper writes inside `TransactionService.runInTransaction` so a failed audit insert rolls the action back. No `Idempotency-Key` (out of scope). | PASS |
| IV. Exact Decimals | No monetary or quantity columns introduced; timestamps and counters only. Existing `Decimal` conventions untouched. | PASS (vacuous) |
| V. Test-First | Failing tests written first for: cross-tenant access on every endpoint, missing-permission 403 on every endpoint, last-Administrator rule, session invalidation on deactivation, append-only UPDATE/DELETE/TRUNCATE rejection, audit-rollback coupling, zero organization-less entries in org audit listings, non-enumerable member creation, escalation refusal. Integration against real PostgreSQL; critical paths ≥80% coverage. | PASS |
| VI. Module Boundaries | Work stays in the AccessControl module (roles, permissions, memberships, custom roles) and a new Audit module; the Audit module exposes an explicit `AuditService` interface, consumed from inside callers' transactions; no module reads/writes another module's tables directly; no circular dependencies. | PASS |
| VII. Honest Boundaries | The audit log documents system actions only; no compliance/financial-statement claim. | PASS |
| VIII. Design System & A11y | Backend-only feature; no UI delivered. | PASS (N/A) |
| IX. Scope Discipline | P0 — P0-F003/P0-F012 (PRD §6, contract §9.5, drivers §7.4, §8, §9.4). Invitations, password reset, MFA, SSO, all frontend screens out of scope. Preceding phase (005 auth/sessions/orgs) is merged. US4's custom-role CRUD carries a story-level P2 label inside this P0 feature (the spec ranks stories within the feature; P0-acceptance of P0-F003 needs only the safety rules it makes mandatory). | PASS |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the Phase 4 build order for the modules involved.

## Project Structure

### Documentation (this feature)

```text
specs/006-rbac-audit-log/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── memberships.md   # Member management endpoints (users.manage)
│   ├── roles.md         # Roles list, permission catalogue, custom-role CRUD (roles.manage)
│   ├── audit-logs.md    # Audit listing endpoint (audit.read)
│   └── auth-change-password.md  # POST /auth/change-password (extends docs/api-auth-contract.md)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/src/
├── common/
│   ├── guards/
│   │   └── permission.guard.ts        # effectivePermissions() wired to the DB here
│   ├── guards/password-change.guard.ts # (new) 403 PASSWORD_CHANGE_REQUIRED gate, wired
│   └── dto/error-envelope.dto.ts
├── modules/
│   ├── access-control/
│   │   ├── access-control.module.ts
│   │   ├── access-control.service.ts   # grantDefaultRolesAndPermissions fixed + wired to registration
│   │   ├── access-control.controller.ts # (new) roles/permissions/memberships endpoints
│   │   ├── memberships.service.ts       # (new) member CRUD, roles replace, state transitions, last-admin guard
│   │   ├── roles.service.ts             # (new) custom role CRUD, no-escalation subsets
│   │   └── dto/                         # (new) zod request schemas
│   ├── audit/
│   │   ├── audit.module.ts              # (new)
│   │   ├── audit.service.ts             # (new) central audit helper, same-transaction write
│   │   ├── audit.controller.ts          # (new) GET /audit-logs
│   │   └── dto/                         # (new) listing filters
│   └── auth/
│       ├── auth.controller.ts           # + POST change-password; PASSWORD_CHANGE_REQUIRED exposure
│       ├── auth.service.ts              # + changeOwnPassword, audit wiring, login-failure audit
│       └── guards/session.guard.ts      # deactivation invalidation already enforced here
database/prisma/
├── schema.prisma                        # Role composite uniqueness + NOT NULL org; MembershipRole; AuditLog; User.mustChangePassword
├── migrations/<next>_rbac_audit_log/    # NEW migration only — never an edit of an applied one
└── seed.ts                              # unchanged reference data (permissions, templates)
docs/api-auth-contract.md                # extended with change-password + forced-change gating
```

**Structure Decision**: Same as 005 — everything lives in `backend/src/modules/`; AccessControl gains controllers/services for the six member/role endpoints, a new Audit module owns the append-only log and its listing endpoint, and the auth module extends registration/login/change-password with audit calls. Frontend untouched per feature scope.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

One deviation, justified here before work continues:

| Principle | Deviation | Justification |
|-----------|-----------|---------------|
| I. Tenant Isolation ("every organization-owned table carries a NOT NULL `organization_id`") | `audit_logs.organization_id` is nullable. | The clarified specification mandates it (FR-018; Q3): anonymous sign-in failures have no organization by definition — a known user attaches no organization, an unknown account attaches neither. The tenant guarantee is preserved structurally, not by the column: the listing endpoint's predicate is `organization_id = <active org>`, which can never match a NULL row, and SC-013 proves with seeded anonymous failures that the bare listing, every filter and every page return zero organization-less entries. Making the column NOT NULL would either drop the security event or invent a fake organization for it. |

## Phase 0: Outline & Research

All Technical Context values are concrete (no NEEDS CLARIFICATION). Grounded code facts are consolidated in `research.md`; key ones:

**Decision**: Roles become strictly org-owned — `Role.organizationId` NOT NULL, `Role.key` uniqueness moves to `@@unique([organizationId, key])`, and `Membership.roleKey` (VARCHAR) is superseded by a `membership_roles` join table; a new non-interactive migration provisions the five template roles for every existing organization (handling the 5 stale NULL-org empty roles in the dev database) and removes the now-dead column semantics.  
**Rationale**: FR-001/FR-002 require per-org catalogues without duplicates; the join table is the only honest encoding of multi-role memberships (FR-003).  
**Alternatives considered**: keep global role keys — rejected, it makes template keys impossible to reuse across orgs; polymorphic role refs on membership — rejected, a join table is simpler and type-safe.

**Decision**: reuse the existing migration-immutability guard (`database/scripts/check-migration-history.ts` + `refresh-migration-checksums.ts`, wired into `npm run check:migrations`); it already fails when a committed migration's checksum differs from the file (FR-024).  
**Alternatives considered**: a new guard — rejected, none needed; the mechanism predates this feature and is already proven by the `20261108010540` incident.

**Decision**: audit retention policy is deferred (nothing may delete entries; GB-level retention is a platform concern, recorded as a follow-up).

## Phase 1: Design & Contracts

### 1. Data Model (`data-model.md`)

Entities to be defined:

- **Role** (changed): `organization_id` NOT NULL indexed; unique `(organization_id, key)`; `is_system` marks the five template copies; composite FKs from org-owned children.
- **MembershipRole** (new): join table `membership_id × role_id` (composite PK), composite FK `(organization_id, membership_id)` → memberships and `(organization_id, role_id)` → roles. RLS enabled, no policies.
- **AuditLog** (new): `organization_id` nullable (anonymous auth events only), `user_id` nullable, `action`, `record_type`, `record_id`, `before`/`after` JSONB nullable, `client_address`, `created_at`; append-only enforced by revoking UPDATE/DELETE/TRUNCATE from the application role. RLS enabled, no policies.
- **User** (changed): `must_change_password` boolean NOT NULL default false.
- **Membership** (changed): `role_key` column dropped after the join-table migration backfills equivalents.

See `data-model.md` for field-level detail, validation rules and state transitions.

### 2. API Contracts (`contracts/`)

- `contracts/memberships.md` — `GET /memberships`, `POST /memberships` (non-enumerable creation), `PUT /memberships/:id/roles`, `POST /memberships/:id/deactivate`, `POST /memberships/:id/reactivate` — all `users.manage`.
- `contracts/roles.md` — `GET /roles`, `GET /permissions`, `POST /roles`, `PUT /roles/:id`, `DELETE /roles/:id` — `roles.manage`, read-only system roles, no-escalation subsets.
- `contracts/audit-logs.md` — `GET /audit-logs` with filters and paging — `audit.read`.
- `contracts/auth-change-password.md` — `POST /auth/change-password`; mirrored into `docs/api-auth-contract.md`.
- `openapi.json` regenerated after implementation; `contract-drift.spec.ts` enforces agreement.

### 3. Agent Context

`AGENTS.md` SPECKIT marker updated to point at this plan.
