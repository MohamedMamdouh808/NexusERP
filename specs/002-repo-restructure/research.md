# Research: Repository Restructure

**Feature**: 002-repo-restructure  
**Date**: 2026-10-19  
**Status**: Complete

## Decisions

### 1. Repository Structure Layout
**Decision**: Use `frontend/`, `backend/`, `database/`, `shared/` at repository root.

**Rationale**: 
- Clear separation of concerns: frontend (React), backend (NestJS API), database (Prisma), shared contracts
- Follows the user's explicit requirement for clear ownership boundaries
- Matches industry best practices for monorepo organization

**Alternatives considered**:
- Keep `apps/` and `packages/` but rename: Rejected - doesn't provide clear ownership boundaries
- Keep `apps/` but rename to `frontend/` and `backend/`: Rejected - doesn't solve the database isolation issue

### 2. Prisma Schema Location
**Decision**: Prisma schema lives at `database/prisma/schema.prisma`

**Rationale**: 
- Database owns all database concerns (schema, migrations, seed, checks)
- Backend only uses the generated client, never owns the schema
- Prisma 6 supports `prisma.schema` in package.json or `prisma.config.ts`

**Prisma 6 Configuration**: Use `prisma.config.ts` in the database workspace with `schema` field pointing to `./prisma/schema.prisma`

### 2. Database Workspace Package
**Decision**: Create `@nexuserp/database` workspace package containing:
- Prisma schema (`prisma/schema.prisma`)
- Migrations (`prisma/migrations/`)
- Seed script (`prisma/seed.ts`)
- Schema numeric-type checker (`scripts/check-schema-numeric-types.ts`)
- Migration history guard (`check:migrations`)
- README with database conventions

**Rationale**: Makes database a first-class citizen with its own workspace, tests, and conventions.

### 3. Prisma Configuration
**Decision**: Use `prisma.config.ts` in the database workspace with `schema` field pointing to `./prisma/schema.prisma`

**Rationale**: Prisma 6 recommends `prisma.config.ts` over `package.json#prisma`. The config file is more flexible and type-safe.

### 3. Prisma Generate Location
**Decision**: Prisma generate produces client in `node_modules/.prisma/client` within the database workspace. The backend resolves it via workspace dependency on `@nexuserp/database`.

**Rationale**: 
- The database workspace owns the Prisma client generation
- Backend depends on `@nexuserp/database` and gets the generated client via workspace protocol
- Clean separation: database generates, backend consumes

### 4. Postinstall Hook
**Decision**: Move `with-root-env.mjs` to root `scripts/` and update both database and backend to use it.

**Rationale**: 
- Single source of truth for environment loading
- Both database and backend need to load root `.env`
- Keeps the rule: real env vars win over file, nothing printed

### 5. GitHub Actions Workflows
**Decision**: Update all workflow paths, working directories, and cache keys to reflect new structure.

### 5. ESLint Boundary Rules
**Decision**: Use ESLint's built-in `no-restricted-imports` for import boundary rules.

**Rationale**: 
- No new dependency needed (ESLint already present)
- Can enforce: frontend → only shared; backend → shared + database; database/shared → neither frontend nor backend
- Testable: a test reads each workspace package.json and fails on forbidden dependency

### 6. Git History Preservation
**Decision**: Use `git mv` for all file moves to preserve history.

### 7. Documentation Updates
**Decision**: Update README, AGENTS.md, quickstart.md, HANDOVER.md, plan.md with new paths. The 001 feature documents get a note at the top with old-to-new path mapping.

## Alternatives Considered

### Prisma Config: package.json vs prisma.config.ts
**Chosen**: `prisma.config.ts` (Prisma 6 recommended)
**Rejected**: `package.json#prisma` (deprecated in Prisma 6)

### Database Workspace Location
**Chosen**: `database/` at root
**Rejected**: `packages/database` (would keep `packages/` directory which should be removed)

### Git History
**Decision**: Use `git mv` for all file moves to preserve history.

### Documentation Updates
- README.md: Update all paths and commands
- AGENTS.md: Update paths
- quickstart.md: Update paths
- HANDOVER.md: Update paths and add note about restructure
- plan.md: Update paths in plan tree
- 001 feature documents: Add note at top with old-to-new path mapping

---

## Summary of Key Decisions

| Area | Decision |
|------|----------|
| Repo structure | `frontend/`, `backend/`, `database/`, `shared/` |
| Prisma schema | `database/prisma/schema.prisma` |
| Prisma config | `prisma.config.ts` in database workspace |
| Prisma generate | Runs in database workspace, backend consumes via workspace dep |
| Database package | `@nexuserp/database` with schema, migrations, seed, checks |
| GitHub Actions | Updated paths, working directories, cache keys |
| Import boundaries | ESLint `no-restricted-imports` + package.json validation test |
| Git history | Use `git mv` for all moves |
| Docs | Update all living docs with new paths |

---

## Summary

All clarifications resolved. The repository restructure is well-defined with clear decisions on:
1. New directory structure
2. Prisma configuration and workspace
3. CI/CD updates
4. Import boundary enforcement
5. Documentation updates

All [NEEDS CLARIFICATION] items resolved. Ready to proceed to Phase 1.