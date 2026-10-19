# Feature Specification: Repository Restructure

**Feature Branch**: `002-repo-restructure`  
**Created**: 2026-10-19  
**Status**: Draft  
**MoSCoW Priority**: P0  
**Input**: User description: "Restructure the NexusERP repository into three clearly separated parts without changing any behavior: a frontend folder (the React web app), a backend folder (the NestJS API), and a database folder (Prisma schema, migrations, seed data, and database checks). The shared contract package (Zod schemas, error codes, permission names) stays and moves to a top-level shared folder so both sides keep one source of truth."

## User Scenarios & Testing

### User Story 1 - Repository Structure Clarity (Priority: P1)

A developer joining the project can immediately understand the codebase structure: frontend code in `frontend/`, backend API code in `backend/`, database schema and migrations in `database/`, and shared contracts in `shared/`.

**Why this priority**: Clear ownership boundaries prevent architectural drift as the team grows. Each feature team knows exactly where their code belongs.

**Independent Test**: A fresh clone followed by `npm ci`, `npm run typecheck`, `npm run lint`, `npm run check:migrations` and all test suites pass without modification.

**Acceptance Scenarios**:
1. **Given** a fresh clone, **When** running `npm ci && npm run typecheck && npm run lint && npm run check:migrations`, **Then** all commands exit 0
2. **Given** the new structure, **When** running `npm run db:migrate` then `npm run db:seed`, **Then** migrations apply from empty and the seed is idempotent

### User Story 2 - Database Ownership Isolation (Priority: P1)

The database folder owns all database concerns: Prisma schema, migrations, seed data, schema numeric-type checker, and migration-history guard (`check:migrations`). The backend only owns runtime database access code.

**Why this priority**: Prevents schema leakage into backend code. The database becomes a first-class citizen with its own workspace package `@nexuserp/database`.

**Independent Test**: A new developer can run `npm run check:migrations` and `npm run db:migrate` from the repository root without knowing internal backend structure.

**Acceptance Scenarios**:
1. **Given** the new structure, **When** running `npm run db:migrate` from root, **Then** migrations apply successfully
2. **Given** a fresh database, **When** running `npm run db:seed`, **Then** seed data loads correctly
3. **Given** the database package, **When** running `npm run check:migrations`, **Then** it validates migration history

### User Story 3 - Dependency Boundary Enforcement (Priority: P1)

Automated checks enforce dependency boundaries: frontend uses only shared; backend uses only shared and database; database and shared depend on neither frontend nor backend.

**Why this priority**: Prevents architectural drift. A violating import or dependency in package.json fails automated checks.

**Independent Test**: Introduce a violating import (frontend importing from backend) and verify the boundary check fails.

**Acceptance Scenarios**:
1. **Given** a violating import from frontend to backend, **When** running the boundary check, **Then** it fails with a clear error
2. **Given** a violating dependency in package.json, **When** running the boundary check, **Then** it fails

### User Story 4 - Command Compatibility (Priority: P1)

All existing commands work from the repository root without modification: `db:migrate`, `db:seed`, `check:migrations`, `openapi:generate`, `typecheck`, `lint`, `test`, `test:integration`.

**Why this priority**: Zero disruption to developer workflows and CI pipelines.

**Acceptance Scenarios**:
1. **Given** the new structure, **When** running `npm run db:migrate` from root, **Then** migrations apply successfully
2. **Given** the new structure, **When** running `npm run openapi:generate`, **Then** the OpenAPI document is generated and byte-identical to before

### User Story 5 - History Preservation (Priority: P1)

All files move with `git mv` preserving history. Files are edited only to update import paths.

**Why this priority**: Git history is valuable for debugging and accountability. No history loss during restructure.

**Acceptance Scenarios**:
1. **Given** the restructured files, **When** running `git log --follow` on any moved file, **Then** full history is preserved

### User Story 6 - Living Documentation Updates (Priority: P1)

README, AGENTS.md, quickstart.md, HANDOVER.md, and the plan tree are updated with new paths. The 001 feature documents remain as historical record with a note at the top giving old-to-new path mapping.

**Why this priority**: Documentation stays accurate and useful.

**Acceptance Scenarios**:
1. **Given** the new structure, **When** reading README.md, **Then** all commands and paths are correct
2. **Given** the 001 feature documents, **When** reading them, **Then** they have a note at the top with old-to-new path mapping

### User Story 7 - Structure Guard (Priority: P1)

A structure guard fails if `apps/` or `packages/` reappears, or if any tracked file outside `specs/001-platform-foundation` references the old paths.

**Why this priority**: Prevents regression of the old structure.

**Acceptance Scenarios**:
1. **Given** the structure guard, **When** a file under `apps/` is added, **Then** the guard fails
2. **Given** a reference to old `apps/api` path in a tracked file, **When** the guard runs, **Then** it fails

---

## Edge Cases

- What happens when a developer accidentally creates a file under `apps/` or `packages/`? The structure guard catches it in CI.
- What happens when a file outside `specs/001-platform-foundation` references old paths? The structure guard catches it in CI.
- What happens if a file under `database/` tries to import from `backend/`? The dependency boundary check fails.
- What happens if `git mv` fails or is not used? Git history is not preserved - manual verification needed.
- How does the system handle a violating import from `frontend/` to `backend/`? The automated boundary check fails in CI.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST restructure the repository into `frontend/`, `backend/`, `database/`, `shared/` at the root level
- **FR-002**: System MUST create a new workspace package `@nexuserp/database` containing Prisma schema, migrations, seed, and database checks
- **FR-003**: The `backend/` workspace MUST own only runtime database access code (Prisma client usage, repositories, services) and MUST NOT contain Prisma schema, migrations, or seed files
- **FR-004**: The `database/` workspace MUST contain Prisma schema (`schema.prisma`), migrations, seed script, schema numeric-type checker, migration-history guard (`check:migrations`), and a README of database conventions
- **FR-004**: The `shared/` workspace MUST contain the contract package (@nexuserp/shared) with Zod schemas, error codes, and permission names
- **FR-005**: The `frontend/` workspace MUST contain only the React web application
- **FR-006**: The `backend/` workspace MUST contain only the NestJS API and its runtime database access code
- **FR-007**: Package names MUST remain unchanged: `@nexuserp/web`, `@nexuserp/api`, `@nexuserp/shared`, and new `@nexuserp/database`
- **FR-008**: All existing root-level commands (`db:migrate`, `db:seed`, `check:migrations`, `openapi:generate`, `typecheck`, `lint`, `test`, `test:integration`) MUST work from the repository root via root aliases
- **FR-009**: All files MUST be moved using `git mv` to preserve history; files edited only to update import paths
- **FR-010**: All living documentation (README, AGENTS.md, quickstart.md, HANDOVER.md, plan.md) MUST be updated with new paths
- **FR-011**: The 001 feature documents must remain as historical record with a note at the top giving old-to-new path mapping
- **FR-012**: A structure guard MUST fail if `apps/` or `packages/` directories reappear, or if any tracked file outside `specs/001-platform-foundation` references the old paths
- **FR-013**: Dependency boundaries MUST be enforced: frontend → shared only; backend → shared + database; database and shared → neither frontend nor backend
- **FR-014**: The API contract (generated OpenAPI document) MUST remain byte-identical after the move
- **FR-015**: Health response, error format, logging, seed content, migrations, and UI output MUST remain unchanged
- **FR-017**: A structure guard MUST fail if `apps/` or `packages/` directories reappear, or if any tracked file outside `specs/001-platform-foundation` references old paths

### Key Entities

- **Frontend Workspace**: `@nexuserp/web` - React web application in `frontend/`
- **Backend Workspace**: `@nexuserp/api` - NestJS API in `backend/`
- **Database Workspace**: `@nexuserp/database` - Prisma schema, migrations, seed, database checks
- **Shared Workspace**: `@nexuserp/shared` - Zod schemas, error codes, permission names (contracts)

---

## Constitution Compliance

- **I. Tenant isolation**: N/A - No tenant-owned tables created by this restructure. The database conventions established in data-model.md remain unchanged.
- **II. Server-enforced authority**: N/A - No new endpoints or permission changes. Default-deny behavior unchanged.
- **III. Transactional integrity**: N/A - No changes to transaction boundaries or idempotency keys. The transaction boundary convention from data-model.md is preserved.
- **IV. Exact decimals**: N/A - Decimal conventions from data-model.md are preserved. No schema changes.
- **V. Test-first**: The structure guard (FR-012) and dependency boundary checks (FR-013) are testable. Failing tests are written first for the structure guard and dependency boundary checks.
- **VI. Module boundaries**: This feature enforces module boundaries explicitly. Frontend → shared only; Backend → shared + database; Database/Shared → neither frontend nor backend.
- **VII. Honest boundaries**: No tax compliance, e-invoicing, or accounting claims are introduced. The product makes no such claims.
- **VIII. Design system and accessibility**: N/A - No UI changes. The design system tokens remain in shared and are referenced by frontend.
- **IX. Scope discipline**: P0. This is a P0 structural change with no P1/P2/P3 scope creep. The feature enables future P1 work (authentication, tenancy, inventory) by establishing clear boundaries.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Each workspace passes the same number of tests as before the move (160 unit tests, 51 integration tests, 58 web component tests, 5 e2e tests)
- **SC-002**: `openapi:diff` shows an empty diff (byte-identical OpenAPI document)
- **SC-003**: From a clean clone: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run check:migrations`, and every test suite pass
- **SC-004**: Migrations apply from empty and the seed is idempotent from a fresh database
- **SC-005**: Every mandatory CI job is green on the branch
- **SC-006**: Every guard in HANDOVER.md guard audit (numeric-type checker, migration guard, default-deny, redaction, no-raw-design-values, OpenAPI build test, boot smoke test, health no-leak) still fails when deliberately broken after the move
- **SC-007**: `git log --follow` shows preserved history for all moved files
- **SC-006**: `openapi:diff` shows an empty diff (byte-identical OpenAPI document)
- **SC-007**: From a clean clone: `npm ci`, `typecheck`, `lint`, `check:migrations`, and every test suite pass
- **SC-008**: Migrations apply from empty and the seed is idempotent from a fresh database
- **SC-009**: Every mandatory CI job is green on the branch
- **SC-010**: Every guard in HANDOVER.md still fails when deliberately broken after the move

---

## Assumptions

- The current repository structure has `apps/web`, `apps/api` (with `prisma/` inside), and `packages/shared`
- The `design-system/`, `docs/`, `scripts/`, `specs/`, `.github/`, and `.specify/` directories remain at the repository root
- No new features, no dependency upgrades, no renaming of workspace packages, API routes, or database objects
- The `design-system/`, `docs/`, `scripts/`, `specs/`, `.github/`, and `.specify/` directories remain at the repository root
- The existing test suites and CI pipeline are the source of truth for behavior verification
- The existing `package.json` workspaces configuration and turbo/turborepo configuration (if any) will be updated to reflect new paths
- The `scripts/` directory with `postinstall.mjs`, `check-schema-numeric-types.ts`, etc. remains at the repository root

---

## Notes

This restructure is a pure reorganization with zero behavioral changes. The primary value is establishing clear ownership boundaries early, before the codebase grows. The database workspace is the key addition, making the database a first-class citizen with its own workspace, checks, and conventions documented in its own README. The structure guard ensures the new layout is maintained permanently.