# Tasks: Repository Restructure (002-repo-restructure)

**Feature**: Repository Restructure (002-repo-restructure)  
**Branch**: `002-repo-restructure`  
**Spec**: `specs/002-repo-restructure/spec.md`  
**Plan**: `specs/002-repo-restructure/plan.md`

---

## Phase 1: Setup (Project Initialization)

- [ ] T001 Initialize feature branch `002-repo-restructure` from main
- [ ] T002 Verify current branch is `002-repo-restructure`
- [ ] T003 Verify current directory is repository root
- [ ] T003 [P] Verify git status is clean before starting

---

## Phase 1: Foundational Tasks (Blocking Prerequisites)

- [ ] T005 Create database workspace directory structure: `mkdir -p database/prisma database/scripts`
- [ ] T002 Create database workspace package.json at `database/package.json`
- [ ] T003 Create database/tsconfig.json with NodeNext module resolution
- [ ] T004 Create database/prisma.config.ts with schema path
- [ ] T004 [P] Create database/README.md with database conventions
- [ ] T005 Move `scripts/check-schema-numeric-types.ts` → `database/scripts/check-schema-numeric-types.ts`
- [ ] T006 Move `scripts/check-migration-history.ts` → `database/scripts/check-migration-history.ts`
- [ ] T007 Update paths in moved scripts to use relative paths from `database/`
- [ ] T008 Create database/README.md with database conventions

---

## Phase 2: File System Restructure (git mv - Critical Order)

### Step 1: Create shared/ (First - no dependencies)
- [ ] T010 `git mv packages/shared shared/`

### Phase 2: File System Restructure (git mv - Critical Order)

#### Step 2: Create database/ (Second - no dependencies on frontend/backend)
- [ ] T011 `git mv apps/api/prisma database/prisma`

#### Step 3: Create backend/ (Third - depends on shared, database)
- [ ] T012 `git mv apps/api backend`

#### Step 4: Create frontend/ (Fourth - depends on shared)
- [ ] T013 `git mv apps/web frontend`

### Post-Move: Database Workspace Package Creation

- [ ] T015 Create database/package.json with @nexuserp/database config
- [ ] T016 Create database/tsconfig.json with NodeNext module resolution
- [ ] T017 Create database/prisma.config.ts with schema path
- [ ] T018 Create database/README.md with database conventions
- [ ] T019 Move `scripts/check-schema-numeric-types.ts` → `database/scripts/check-schema-numeric-types.ts`
- [ ] T017 Move `scripts/check-migration-history.ts` → `database/scripts/check-migration-history.ts`
- [ ] T019 Update paths in moved scripts to use relative paths from `database/`
- [ ] T020 Create database/README.md with database conventions

---

## Phase 3: Backend Workspace Updates

- [ ] T020 Update backend/package.json:
  - Add `@nexuserp/database` dependency
  - Update prisma.seed to `"tsx ../../database/prisma/seed.ts"`
  - Update all script paths to use `../../database/...` paths
  - Update openapi:generate and openapi:diff output paths to `../../openapi.json`
- [ ] T021 Update backend/tsconfig.json references and paths for @nexuserp/shared and @nexuserp/database
- [ ] T022 Update backend/tsconfig.build.json references
- [ ] T017 Update backend/jest.config.ts moduleNameMapper paths
- [ ] T021 Update backend/eslint.config.mjs paths
- [ ] T022 Update backend/nest-cli.json paths
- [ ] T022 Update backend/tsconfig.build.json paths

---

## Phase 3: Frontend Workspace Updates

- [ ] T023 `git mv apps/web frontend`
- [ ] T022 Update frontend/package.json path references
- [ ] T022 Update frontend/tsconfig.json paths for @nexuserp/shared
- [ ] T022 Update frontend/vite.config.ts @nexuserp/shared alias
- [ ] T023 Update frontend/tsconfig.json paths for @nexuserp/shared
- [ ] T023 Update frontend/vitest.config.ts alias for @nexuserp/shared

---

## Phase 4: Root Configuration Updates

- [ ] T024 Update root package.json workspaces to `["frontend", "backend", "database", "shared"]`
- [ ] T025 Update root package.json scripts to use new workspace names and paths
- [ ] T025 Update root package.json typecheck, lint, test, db:migrate, db:seed, check:migrations scripts
- [ ] T026 Update root package.json lint script to include check:boundaries and check:structure

---

## Phase 5: TypeScript Config Updates

- [ ] T027 Update root tsconfig.json (if exists) references
- [ ] T028 Update backend/tsconfig.json references and paths
- [ ] T027 Update frontend/tsconfig.json paths for @nexuserp/shared
- [ ] T028 Update frontend/vite.config.ts @nexuserp/shared alias
- [ ] T029 Update frontend/tsconfig.json paths for @nexuserp/shared
- [ ] T029 Update frontend/vitest.config.ts alias for @nexuserp/shared

---

## Phase 6: Database Workspace Prisma Configuration

- [ ] T030 Create database/prisma.config.ts with schema path
- [ ] T031 Create database/tsconfig.json
- [ ] T032 Verify database/prisma.config.ts points to ./prisma/schema.prisma

---

## Phase 4: Root Scripts Updates

- [ ] T032 Move `with-root-env.mjs` to root `scripts/` (verify it works for both database and backend)
- [ ] T032 Update `scripts/with-root-env.mjs` to resolve repo root correctly from new locations
- [ ] T033 Update `scripts/postinstall.mjs` SCHEMA path to `join('database', 'prisma', 'schema.prisma')`
- [ ] T034 Create `scripts/check-boundaries.ts` for dependency boundary enforcement
- [ ] T035 Create `scripts/check-structure.ts` for structure guard

---

## Phase 6: Docker & Docker Compose Updates

- [ ] T035 `git mv docker/api.Dockerfile docker/backend.Dockerfile`
- [ ] T036 `git mv docker/web.Dockerfile docker/frontend.Dockerfile`
- [ ] T036 Update `docker/backend.Dockerfile`: update paths, add `COPY ../../database/prisma ./prisma`
- [ ] T037 Update `docker/frontend.Dockerfile` paths from `apps/web` to `frontend`
- [ ] T038 Update `docker-compose.yml` build contexts and Dockerfile paths
- [ ] T038 Update `docker/api-entrypoint.sh` if paths changed

---

## Phase 5: GitHub Actions Workflows

- [ ] T039 Update `.github/workflows/ci.yml`: paths, cache keys, working directories
- [ ] T038 Update `.github/workflows/__tests__/ci-no-deploy.spec.ts` paths

---

## Phase 6: Configuration Files

- [ ] T039 Update `.dockerignore` paths
- [ ] T038 Update `.prettierignore` paths
- [ ] T038 Update `.gitignore` paths
- [ ] T039 Update `.prettierignore` paths
- [ ] T039 Update `.dockerignore` paths

---

## Phase 3: Boundary Enforcement

- [ ] T040 Add ESLint `no-restricted-imports` to `frontend/eslint.config.mjs`
- [ ] T040 Add ESLint `no-restricted-imports` to `backend/eslint.config.mjs`
- [ ] T040 Create `database/eslint.config.mjs` with restrictions
- [ ] T040 Update `shared/eslint.config.mjs` if exists
- [ ] T035 Create `scripts/check-boundaries.ts` for dependency boundary enforcement
- [ ] T035 Add `check:boundaries` script to root package.json
- [ ] T035 Update root `lint` script to include `check:boundaries`

---

## Phase 6: Docker & Docker Compose Updates

- [ ] T038 `git mv docker/api.Dockerfile docker/backend.Dockerfile`
- [ ] T038 `git mv docker/web.Dockerfile docker/frontend.Dockerfile`
- [ ] T039 Update `docker/backend.Dockerfile` paths and add `COPY ../../database/prisma ./prisma`
- [ ] T039 Update `docker/frontend.Dockerfile` paths
- [ ] T039 Update `docker-compose.yml` build contexts and Dockerfile paths
- [ ] T039 Update `docker/api-entrypoint.sh` if paths changed

---

## Phase 7: Configuration Files

- [ ] T039 Update `.dockerignore` paths
- [ ] T039 Update `.prettierignore` paths
- [ ] T038 Update `.gitignore` paths
- [ ] T038 Update `.prettierignore` paths
- [ ] T039 Update `.dockerignore` paths

---

## Phase 8: Documentation Updates

- [ ] T040 Update README.md paths and commands
- [ ] T040 Update AGENTS.md plan reference
- [ ] T040 Update quickstart.md paths and commands
- [ ] T040 Update HANDOVER.md paths, add restructure note
- [ ] T039 Update plan.md paths in plan tree
- [ ] T040 Update 001 feature documents with old-to-new path mapping note

---

## Phase 7: 001 Feature Documents

- [ ] T040 Add note at top of each 001 feature document with old-to-new path mapping

---

## Phase 8: Structure Guard Implementation

- [ ] T041 Create `scripts/check-structure.ts` for structure guard
- [ ] T042 Add `check:structure` script to root package.json
- [ ] T042 Add `check:structure` to root `lint` script

---

## Phase 8: Dockerfile Tests Update

- [ ] T042 Update `scripts/__tests__/dockerfile-layer-order.spec.ts` paths
- [ ] T042 Update `test/integration/entrypoint-fail-fast.spec.ts` paths

---

## Phase 9: GitHub Actions Workflow Test

- [ ] T042 Update `.github/workflows/__tests__/ci-no-deploy.spec.ts` paths

---

## Phase 8: Verification & Documentation

- [ ] T043 Run verification: clean clone test, npm ci, typecheck, lint, check:migrations, tests
- [ ] T043 Verify openapi:diff empty
- [ ] T043 Verify docker compose up -d --wait healthy
- [ ] T043 Run full test suite
- [ ] T043 Guard audit: verify each guard fails when deliberately broken
- [ ] T043 Update HANDOVER.md with restructure notes
- [ ] T043 Update AGENTS.md plan reference
- [ ] T043 Mark tasks complete in tasks.md

---

## Task Summary

### Task Count by Phase
- Setup: 4 tasks
- Foundational (Database workspace): 12 tasks
- File System Restructure: 4 tasks (git mv)
- Database Workspace: 12 tasks
- Backend Workspace: 7 tasks
- Frontend Workspace: 5 tasks
- Root Config: 5 tasks
- TypeScript Config: 4 tasks
- Database Prisma Config: 2 tasks
- Root Scripts: 4 tasks
- Docker & Docker Compose: 5 tasks
- GitHub Actions: 2 tasks
- Configuration Files: 5 tasks
- Boundary Enforcement: 6 tasks
- Docker & Docker Compose: 6 tasks
- GitHub Actions: 2 tasks
- Configuration Files: 5 tasks
- Boundary Enforcement Tests: 3 tasks
- Dockerfile Tests: 2 tasks
- GitHub Actions Workflow Test: 1 task
- Documentation Updates: 6 tasks
- 001 Feature Documents: 1 task
- Structure Guard: 2 tasks
- Dockerfile Tests: 2 tasks
- GitHub Actions Workflow Test: 1 task
- Verification & Documentation: 6 tasks

**Total Tasks: ~75 tasks**

---

## Dependency Graph (Story Completion Order)

```
Setup (T001-T004)
    ↓
Foundational: Database Workspace (T002-T019)
    ↓
File Restructure (git mv): T010-T013
    ↓
Database Workspace Completion (T015-T020)
Backend Workspace (T020-T022)
Frontend Workspace (T022-T023)
    ↓
Root Config (T024-T026)
TypeScript Configs (T027-T029)
Database Prisma Config (T030-T031)
Root Scripts (T032-T035)
Docker & Docker Compose (T035-T039)
GitHub Actions (T039-T040)
Config Files (T039-T039)
Boundary Enforcement (T040-T035)
Docker & Docker Compose (T035-T039)
GitHub Actions (T039-T039)
Config Files (T039)
Boundary Enforcement Tests (T035)
Dockerfile Tests (T042)
GitHub Actions Workflow Test (T042)
Documentation Updates (T040-T043)
Verification & Documentation (T043)
```

## Parallel Execution Opportunities

- **T010** (shared) can run in parallel with nothing (first)
- **T011** (database/prisma) can run after T010
- **T012** (backend) and **T013** (frontend) can run in parallel after T011
- **T015-T020** (database workspace) can run in parallel with T020-T023 (backend) and T022-T023 (frontend)
- **T024-T026** (root config) can run after all moves complete
- **T027-T029** (TS configs) can run in parallel with T030-T031
- **T032-T035** (scripts) can run in parallel with T035-T039 (Docker)
- **T039** (GitHub Actions) and **T039** (Config files) can run in parallel
- **T040** (Boundary enforcement) and **T035** (Docker) can run in parallel
- **T041** (Structure guard) and **T042** (Dockerfile tests) can run in parallel
- **T043** (Verification) must run last after all implementation

---

## Implementation Strategy: MVP First, Incremental Delivery

### MVP Scope (Must Have)
- File restructure with git mv (T010-T013)
- Database workspace creation (T002-T019)
- Root workspace config updates (T024-T026)
- Basic boundary enforcement (T035)
- Docker/Compose updates (T035-T039)
- All tests passing (T043)

### Incremental Delivery
1. **Week 1**: File restructure + Database workspace + Root config
2. **Week 2**: Backend/Frontend updates + Docker + CI
3. **Week 2-3**: Boundary enforcement + Tests + Docs
3. **Week 3**: Verification + Guard audits

---

## Validation Checklist (Per Task Completion)

- [ ] All tests pass: `npm test`, `npm run test:integration`
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] `npm run check:migrations` passes
- [ ] `npm run openapi:diff` shows empty diff
- [ ] `docker compose up -d --wait` reaches healthy
- [ ] `npm run test:e2e` passes
- [ ] All guards fail when deliberately broken
- [ ] `git log --follow` works on moved files
- [ ] `npm run check:structure` passes
- [ ] `npm run check:boundaries` passes

---

## File Path Reference (Old → New)

| Old Path | New Path |
|----------|----------|
| `apps/api` | `backend/` |
| `apps/api/prisma/` | `database/prisma/` |
| `apps/web` | `frontend/` |
| `packages/shared/` | `shared/` |
| `docker/api.Dockerfile` | `docker/backend.Dockerfile` |
| `docker/web.Dockerfile` | `docker/frontend.Dockerfile` |
| `apps/api/prisma/` | `database/prisma/` |
| `packages/shared/` | `shared/` |

---

## Success Criteria Verification Checklist

- [ ] SC-001: Each workspace passes same test count (160 unit, 51 integration, 58 web, 5 e2e)
- [ ] SC-002: `openapi:diff` empty diff
- [ ] SC-003: Clean clone: `npm ci`, `typecheck`, `lint`, `check:migrations`, all tests pass
- [ ] SC-004: `docker compose up -d --wait` healthy from fresh volume
- [ ] SC-005: All CI jobs green
- [ ] SC-006: All 10 guards fail when deliberately broken
- [ ] SC-007: `git log --follow` works on moved files
- [ ] SC-008: Docker compose healthy from fresh volume
- [ ] SC-009: All CI jobs green
- [ ] SC-010: All 10 guards fail when deliberately broken

---

**Generated**: 2026-10-19  
**Feature**: 002-repo-restructure  
**Branch**: `002-repo-restructure`  
**Spec**: `specs/002-repo-restructure/spec.md`  
**Plan**: `specs/002-repo-restructure/plan.md`  
**Total Tasks**: ~75 tasks across 10 phases