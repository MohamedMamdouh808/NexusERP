# Implementation Plan: Authentication, Sessions and First Organization

**Branch**: `005-auth-sessions-org` | **Date**: 2026-11-08 | **Spec**: specs/005-auth-sessions-org/spec.md  
**Input**: Feature specification from `/specs/005-auth-sessions-org/spec.md`

## Summary

Build backend-only authentication and tenant isolation: user registration that atomically creates a user, first organization, Administrator membership, default roles/permissions, warehouse and document sequences; login/logout/current-user/organization-switching with server-side PostgreSQL sessions; Argon2id-hashed passwords; CSRF protection; rate-limited failed logins; and RLS-enabled database tables via migrations.

## Technical Context

**Language/Version**: TypeScript, Node.js 24 LTS  
**Primary Dependencies**: NestJS 11, Prisma 6, @nestjs/swagger, pino, class-validator, class-transformer, zod (shared), argon2  
**Storage**: PostgreSQL 17 via Prisma, single database for app data and sessions  
**Testing**: Jest (unit + integration against real PostgreSQL), Supertest  
**Target Platform**: Linux server, Node.js runtime  
**Project Type**: web-service (NestJS modular monolith API under `/api/v1`)  
**Performance Goals**: p95 API response under 500 ms; login/register under 1 second  
**Constraints**: real-PostgreSQL integration tests; no floating-point money or quantities; no microservices/Redis/Kubernetes in v1; sessions and rate-limit counters live in PostgreSQL; build order: auth and tenant isolation first  
**Scale/Scope**: Single tenant per user session; multi-organization membership supported; default P0 scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Read `.specify/memory/constitution.md` and record a pass/fail result for each principle before continuing. A plan that violates any principle is blocked.

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | User, Membership, Session, LoginAttempt, Warehouse, DocumentSequence tables gain `organization_id` NOT NULL indexed; foreign keys between organization-owned tables are composite over `(organization_id, id)`. Tenant scope enters request context via `extendRequestContext({ organizationId })` after membership verification. A cross-tenant record request returns 404. | PASS |
| II. Server-Enforced Authority | Register, login, health are `@Public()`. Every other new endpoint declares `@RequirePermission(...)`. Default-deny guard already registered globally. State transitions (session expiry, membership deactivation) validated server-side. Auth failures generic. | PASS |
| III. Transactional Integrity | Registration is one transaction spanning user, organization, membership, roles, permissions, warehouse, sequences. Sessions invalidated on logout/password-change/deactivation commit in same transaction as the triggering change. No `Idempotency-Key` on registration (out of scope for v1). | PASS |
| IV. Exact Decimals | No monetary or quantity columns introduced in this feature. Existing `Decimal(14,2)`/`(14,4)`/`(14,3)` conventions apply where relevant; decimals cross API as strings. | PASS (vacuous) |
| V. Test-First | Failing cross-tenant isolation test written first; failing undeclared-endpoint test written first; failing registration-atomicity test written first. Critical-path coverage target 80% on statements, branches, functions, lines. Integration tests against real PostgreSQL. | PASS |
| VI. Modular Boundaries | Auth module and Organizations module created. Each exposes explicit service interface. No module writes another module's tables directly. Platform module owns Prisma client and transaction boundary. | PASS |
| VII. Honest Boundaries | No tax-compliance, e-invoicing, or accounting claim implied. | PASS |
| VIII. Design System & A11y | Backend-only feature; no UI changes. N/A. | PASS (N/A) |
| IX. Scope Discipline | P0. Authentication, session management, organization workspaces, tenant isolation are P0-F001/P0-F002. Preceding phase (platform foundation) exit criteria met (76/114 tasks verified; remaining work is feature development, not platform). | PASS |

Constraints that must appear in Technical Context: real-PostgreSQL integration tests, no floating-point money or quantities, no microservices/Redis/Kubernetes in v1, and the Phase 4 build order for the modules involved.

## Project Structure

### Documentation (this feature)

```text
specs/005-auth-sessions-org/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── config/
│   │   ├── configuration.module.ts
│   │   └── configuration.ts
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── require-permission.decorator.ts
│   │   │   └── public.decorator.ts (new, if split)
│   │   ├── dto/
│   │   │   └── error-envelope.dto.ts
│   │   ├── errors/
│   │   │   └── all-exceptions.filter.ts
│   │   ├── guards/
│   │   │   └── permission.guard.ts
│   │   └── logging/
│   │       ├── logger.ts
│   │       ├── request-context.ts
│   │       └── request-id.middleware.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── register.dto.ts
│   │   │   │   ├── login.dto.ts
│   │   │   │   └── switch-organization.dto.ts
│   │   │   ├── guards/
│   │   │   │   └── session.guard.ts
│   │   │   └── __tests__/
│   │   ├── organizations/
│   │   │   ├── organizations.module.ts
│   │   │   ├── organizations.service.ts
│   │   │   ├── organizations.controller.ts
│   │   │   └── __tests__/
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.service.ts
│   │   │   └── __tests__/
│   │   └── access-control/
│   │       ├── access-control.module.ts
│   │       ├── access-control.service.ts
│   │       └── __tests__/
│   ├── platform/
│   │   ├── health/
│   │   ├── prisma/
│   │   │   └── prisma.service.ts
│   │   └── transaction/
│   │       └── transaction.service.ts
│   └── __tests__/
│       └── app.module.spec.ts
database/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   ├── 20261018100057_init_reference_tables/
│   │   ├── 20261108004024_enable_rls_on_all_tables/
│   │   ├── <next>_auth_organizations_users/
│   │   └── <next>_sessions_rate_limiting/
│   └── seed.ts
scripts/
└── check-secrets.mjs
shared/
└── src/
    ├── errors/index.ts
    ├── permissions/index.ts
    └── schemas/index.ts
```

**Structure Decision**: Option 2 (Web application) — `backend/` contains all API source with modules under `backend/src/modules/`. The existing repo already uses `backend/src/` layout with `common/`, `platform/`, and domain modules added under `modules/`. Frontend is not touched per feature scope.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — all principles PASS. Complexity Tracking table not needed.

## Phase 0: Outline & Research

All Technical Context values are concrete (no NEEDS CLARIFICATION). No research agents dispatched. Proceed directly to Phase 1.

**Decision**: Email uniqueness is system-wide (confirmed in spec clarification session 2026-11-08).  
**Rationale**: Simplest SaaS pattern; aligns with "user identified by email"; prevents ambiguity in session/membership model.  
**Alternatives considered**: Per-organization email uniqueness — rejected because it complicates organization switching and cross-organization membership.

## Phase 1: Design & Contracts

### 1. Data Model (`data-model.md`)

Entities to be defined:

- **User**: `id` (UUID PK), `email` (VARCHAR, unique system-wide, indexed), `password_hash` (VARCHAR), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ). RLS enabled, no policies.
- **Organization**: `id` (UUID PK), `name` (VARCHAR), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ). RLS enabled, no policies.
- **Membership**: `id` (UUID PK), `user_id` (UUID FK → users), `organization_id` (UUID FK → organizations), `role_key` (VARCHAR), `is_active` (Boolean), `created_at` (TIMESTAMPTZ). Composite FK `(organization_id, id)` not needed at membership level since membership itself is the linking table; `organization_id` NOT NULL indexed. RLS enabled, no policies.
- **Role**: `id` (UUID PK), `key` (VARCHAR unique), `name` (VARCHAR), `description` (VARCHAR), `is_system` (Boolean), `organization_id` (UUID nullable — null for system/default roles). RLS enabled, no policies.
- **RolePermission**: `role_id` (UUID FK), `permission_id` (UUID FK), composite PK `(role_id, permission_id)`. RLS enabled, no policies.
- **Permission**: Already exists in `permissions` table (global catalog).
- **Session**: `id` (UUID PK), `token_hash` (VARCHAR unique indexed — opaque session id hashed), `user_id` (UUID FK), `membership_id` (UUID FK), `expires_at` (TIMESTAMPTZ — idle + absolute), `created_at` (TIMESTAMPTZ), `last_used_at` (TIMESTAMPTZ). RLS enabled, no policies.
- **LoginAttempt**: `id` (UUID PK), `email` (VARCHAR indexed), `client_address` (VARCHAR), `succeeded` (Boolean), `created_at` (TIMESTAMPTZ). RLS enabled, no policies.
- **Warehouse**: `id` (UUID PK), `organization_id` (UUID FK, NOT NULL, indexed), `name` (VARCHAR), `is_default` (Boolean), `created_at` (TIMESTAMPTZ). Composite FK `(organization_id, id)`. RLS enabled, no policies.
- **DocumentSequence**: `id` (UUID PK), `organization_id` (UUID FK, NOT NULL, indexed), `name` (VARCHAR), `current_value` (INTEGER), `created_at` (TIMESTAMPTZ). Composite FK `(organization_id, id)`. RLS enabled, no policies.

### 2. Interface Contracts (`contracts/`)

The project exposes REST endpoints under `/api/v1` per constitution Technical Constraints. Contracts documented as OpenAPI (generated from NestJS decorators + Swagger, committed at `backend/openapi.json`):

- `POST /api/v1/auth/register` — body: `{ email, password }`; response: `{ user, organization, membership, session }` wrapped in standard success envelope; errors via standard error envelope.
- `POST /api/v1/auth/login` — body: `{ email, password }`; response: `{ user, membership, session }` + session cookie set; 429 with Retry-After on rate limit.
- `POST /api/v1/auth/logout` — requires session cookie; invalidates session; clears cookie.
- `GET /api/v1/auth/me` — requires session cookie; returns current user, membership, organization, permissions.
- `POST /api/v1/auth/switch-organization` — body: `{ organization_id }`; requires membership; switches active organization; invalidates and re-issues session.
- `GET /api/v1/health` — already exists, `@Public()`.

All state-changing endpoints require `X-CSRF-Token` header matching the per-session CSRF token.

### 3. Agent context update

Update `AGENTS.md` between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers to point to `specs/005-auth-sessions-org/plan.md`.

### 4. Quickstart (`quickstart.md`)

Commands for the feature:
- `npm run db:generate` — regenerate Prisma client
- `npm run db:migrate` — apply new migrations
- `npm run db:seed` — seed default roles/permissions (idempotent)
- `npm run dev:api` — start API (compiled, never tsx)
- `curl -X POST http://localhost:3000/api/v1/auth/register -d '{"email":"...","password":"..."}'` — register
- `curl http://localhost:3000/api/v1/health` — health check

## Re-evaluate Constitution Check post-design

All principles PASS at design time. No violations. Complexity Tracking table not needed.

---

**Next**: `/speckit.tasks` to generate tasks.md from this plan.

## Extension Hooks (after_plan)

**Optional Hook**: git  
Command: `/speckit.git.commit`  
Description: Auto-commit after implementation planning

Prompt: Commit plan changes?  
To execute: `/speckit.git.commit`
