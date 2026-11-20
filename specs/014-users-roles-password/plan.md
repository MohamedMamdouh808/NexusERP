# Implementation Plan: Users & Roles and Change-Own-Password End to End

**Branch**: `main` (feature directory: `specs/014-users-roles-password`) | **Date**: 2026-11-15 | **Spec**: `specs/014-users-roles-password/spec.md`
**Input**: Feature specification from `specs/014-users-roles-password/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the Users & Roles screens end to end (P0-F003) and the change-own-password flow: replace the sample data behind `/users`, `/users/roles`, and `/users/roles/:id` with a real API client, and finish the already-started change-password screen. Backend additions are deliberately minimal: extend the memberships list endpoint with search (name, email), role filter, status filter, sort, page/pageSize with a visible total (max 100), and a `passwordChangeRequired` flag; add a nullable per-membership `name` and a `version` (new migration); add `memberCount` to the roles list and detail; add a `GET /roles/:id` detail and a `PATCH /memberships/:id` for name edits. No new tables. Everything else (memberships, roles, permissions, audit, session rotation, module gate, no-escalation, last-Administrator rule) already exists.

## Technical Context

**Language/Version**: Node.js LTS (NestJS) backend, TypeScript; React 18+, Vite frontend
**Primary Dependencies**: NestJS, Prisma over PostgreSQL, TanStack Query, React Hook Form, Zod, argon2
**Storage**: PostgreSQL (dev on :3000 against the `public` schema, test schema `nexuserp_test` isolated, production separate)
**Testing**: Jest + Supertest (backend integration, real PostgreSQL), Vitest + React Testing Library (frontend)
**Target Platform**: Linux server (managed PostgreSQL 17), web browsers Chrome 100+/Safari 15+/Firefox 100+/Edge
**Project Type**: Web service (modular monolith)
**Performance Goals**: p95 API response under 500 ms excluding reports; pages usable within 2 seconds at p95; member search returns in under 5 seconds for organizations of up to 10,000 members
**Constraints**: Real-PostgreSQL integration tests only (no SQLite/in-memory/mocked persistence for critical rules); no floating-point money or quantities; no microservices/Redis/Kubernetes in v1; tests run only in the isolated schema with `connection_limit=5`, public row counts unchanged, suite-grouped (pooler caps at 15 session connections); nothing committed without explicit instruction; `pageSize` capped at 100 server-side; wildcards in search escaped
**Scale/Scope**: P0 feature (P0-F003); one developer; depends on the already-delivered RBAC and audit feature and the auth contract

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | Pass: `memberships`, `roles`, `role_permissions` already carry `organization_id`; `memberships.name` and `version` are added to an existing tenant-scoped table; tenant scope enters via session/membership context; cross-org reads return 404; RLS stays enabled with no policies; two-organization isolation test per new list parameter |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | Pass: list/create/edit/deactivate/reactivate members require `users.manage`; roles CRUD requires `roles.manage`; permission checkboxes gated by `GET /auth/me` held set on the client but enforced server-side via the existing no-escalation subset rule; last-Administrator rule enforced server-side; hidden controls are convenience only |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | Pass: member creation (user + membership + roles + audit) and role replacement run in one transaction with audit; name edit runs in one transaction with before/after audit and version increment; password change rotates the session atomically; no new posted/immutable records; idempotency only where the contract already requires it |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | N/A: no money or quantities in this feature |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | Pass: failing tests first for the new list parameters, wildcard escaping, tenant isolation, permission gating, forced password change end to end, name display/edit; critical-path coverage ≥80% |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | Pass: `access-control` owns memberships and roles; `auth` owns users and sessions; web calls them through the API client; no cross-module table writes; `name` is read only from `memberships` |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | Pass: identity and access control only; no tax, accounting, or compliance claim |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | Pass: existing design-system tokens and components (ConfirmDialog, KebabMenu, DataTable, Dialog, Badge); PRD 7.3 rules (inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs); status shown as text and colour; password field uses `autocomplete="new-password"`; WCAG 2.1 AA keyboard/focus/labeling |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | Pass: P0 (P0-F003); RBAC and audit (preceding phase) is implemented and tested; invitations by email, password reset by email, MFA, SSO, editing system roles, and Organization settings screen are out of scope |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the Phase 4 build order for the modules involved.

## Project Structure

### Documentation (this feature)

```text
specs/014-users-roles-password/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/modules/access-control/
│   ├── memberships.controller.ts   # extended: list query params, PATCH name
│   ├── memberships.service.ts      # extended: search/filter/sort/page/total/name/version
│   ├── roles.controller.ts         # extended: GET :id
│   └── roles.service.ts            # extended: memberCount, detail
├── src/modules/auth/
│   └── (no change: change-password already exists)
└── test/integration/
    └── users-roles-*.spec.ts       # new suites

frontend/
├── src/features/administration/
│   ├── users-page.tsx              # switch to real API client; delete sample data/banner
│   ├── role-detail-page.tsx        # new (or extend)
│   └── use-administration.ts       # real client behind the seam
├── src/features/auth/
│   └── change-password-screen.tsx  # already started; finish wiring
└── src/services/
    └── (real API client; sample-catalog-service users/roles removed)

database/prisma/
├── schema.prisma                   # memberships: name (nullable), version
└── migrations/                     # one new migration
```

**Structure Decision**: Web application (Option 2). Backend changes are confined to the `access-control` module (memberships + roles) plus one Prisma migration; the `auth` module already provides change-password and session rotation. Frontend changes live in `features/administration` (Users/Roles) and `features/auth` (change password), reusing the existing design-system components.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All principles pass.