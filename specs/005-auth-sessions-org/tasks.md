# Tasks: Authentication, Sessions and First Organization

**Input**: Design documents from `/specs/005-auth-sessions-org/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user
story MUST include its tests, written before the implementation and observed failing. Tests
run against a real PostgreSQL instance; SQLite, in-memory substitutes, and mocked
persistence layers are not acceptable substitutes for critical-path tests.

**Mandatory task types** (Constitution Principles I-VI, VIII, IX):

- **Tenant isolation test** for every endpoint, report, and export added (Principle I)
- **Permission declaration** plus default-deny test for every endpoint (Principle II)
- **Idempotency test** for every posting endpoint, plus duplicate-request and 422 tests (Principle III)
- **Transaction rollback test** for every multi-record operation (Principle III)
- **Concurrency test** for stock reservation, shipment, and payment allocation (Principles III, V)
- **Decimal calculation test vectors** with half-up rounding for money and quantities (Principle IV)
- **Immutability test** proving posted records cannot be updated or deleted (Principle III)
- **Audit-record test** proving the audit row commits with the business change (Principle III)
- **UX and accessibility tasks** for design-system tokens, PRD 7.3 states, and WCAG 2.1 AA (Principle VIII)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Paths shown below assume web app - adjust based on plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create module directory structure under backend/src/modules/auth/, backend/src/modules/organizations/, backend/src/modules/users/, backend/src/modules/access-control/
- [x] T002 [P] Add argon2 dependency to backend/package.json for password hashing
- [x] T003 [P] Configure NestJS module registration in backend/src/app.module.ts for auth, organizations, users, access-control modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add User, Organization, Membership, Role, RolePermission, Session, LoginAttempt, Warehouse, DocumentSequence entities to database/prisma/schema.prisma with organization_id NOT NULL indexed on all org-owned tables and RLS-compatible structure
- [x] T005 Create migration database/prisma/migrations/<next>_auth_organizations_users/ with CREATE TABLE statements for all new entities and ALTER TABLE ENABLE ROW LEVEL SECURITY with no policies
- [x] T006 Create migration database/prisma/migrations/<next>_sessions_rate_limiting/ with Session and LoginAttempt tables, ENABLE ROW LEVEL SECURITY with no policies
- [x] T007 Update database/prisma/seed.ts to upsert default warehouse and document sequences per organization during registration seed
- [x] T008 [P] Implement AuthModule in backend/src/modules/auth/auth.module.ts with controllers, services, guards
- [x] T009 [P] Implement OrganizationsModule in backend/src/modules/organizations/organizations.module.ts with controllers, services
- [x] T010 [P] Implement UsersModule in backend/src/modules/users/users.module.ts with controllers, services
- [x] T011 [P] Implement AccessControlModule in backend/src/modules/access-control/access-control.module.ts with service for role/permission resolution
- [x] T012 [P] Implement default-deny permission guard integration in backend/src/common/guards/permission.guard.ts (already registered globally; verify no endpoint bypasses)
- [x] T013 Configure error handling and logging infrastructure (request ID, organization ID, user ID, latency) - already exists in backend/src/common/logging/ and backend/src/common/errors/

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create an account and a first organization (Priority: P1)

**Goal**: A new user registers with email and password. The system creates the user account, their first organization, an Administrator membership linking them to it, the default roles and permissions, a default warehouse, and document sequences — all as one indivisible operation. The user is then logged in and holds the Administrator role on their organization.

**Independent Test**: Can be fully tested by submitting a registration request and verifying that exactly one user, one organization, one Administrator membership, the full set of default roles/permissions, one warehouse, and document sequences exist — and that nothing exists if any part of the creation fails.

### Tests for User Story 1 (MANDATORY - write first, observe failure)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Contract test for POST /api/v1/auth/register in backend/src/modules/auth/__tests__/register.contract.spec.ts
- [x] T015 [P] [US1] Integration test for full registration flow in backend/src/modules/auth/__tests__/register.integration.spec.ts
- [x] T016 [P] [US1] Tenant isolation test proving registered user cannot access another organization's data in backend/src/modules/auth/__tests__/register.tenant-isolation.spec.ts
- [x] T017 [P] [US1] Transaction rollback test forcing failure mid-registration in backend/src/modules/auth/__tests__/register.rollback.spec.ts
- [x] T018 [P] [US1] Generic error test proving registration does not reveal whether email exists in backend/src/modules/auth/__tests__/register.generic-error.spec.ts

### Implementation for User Story 1

- [x] T019 [P] [US1] Create RegisterDTO in backend/src/modules/auth/dto/register.dto.ts with Zod validation (email format, password min 12 chars)
- [x] T020 [P] [US1] Create User entity service method in backend/src/modules/users/users.service.ts for createUser transaction
- [x] T021 [P] [US1] Create Organization entity service method in backend/src/modules/organizations/organizations.service.ts for createOrganization transaction
- [x] T022 [P] [US1] Create Membership entity service method in backend/src/modules/organizations/organizations.service.ts for createAdministratorMembership transaction
- [x] T023 [P] [US1] Create Role and RolePermission seeding in backend/src/modules/access-control/access-control.service.ts using shared PERMISSION_CATALOG and ROLE_TEMPLATES
- [x] T024 [P] [US1] Create Warehouse entity service method for default warehouse creation
- [x] T025 [P] [US1] Create DocumentSequence entity service method for default sequence creation
- [x] T026 [US1] Implement AuthService.register() in backend/src/modules/auth/auth.service.ts orchestrating user, organization, membership, roles, warehouse, sequences in one Prisma transaction
- [x] T027 [US1] Implement AuthController.register() in backend/src/modules/auth/auth.controller.ts with @Post('register'), @Public(), @RequirePermission none
- [x] T028 [US1] Implement session creation on registration in backend/src/modules/auth/auth.service.ts creating Session record with 30-min idle / 12-hour absolute expiry
- [x] T029 [US1] Implement CSRF token generation per session in backend/src/modules/auth/auth.service.ts
- [x] T030 [US1] Add Argon2id password hashing in backend/src/modules/users/users.service.ts with minimum length 12 validation
- [x] T031 [US1] Add request ID and logging to registration in backend/src/modules/auth/auth.controller.ts via RequestIdMiddleware (already global)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Sign in and sign out (Priority: P1)

**Goal**: A registered user signs in with email and password. The system creates a server-side session and issues an opaque session cookie. The user can later sign out, which invalidates the session. The user can also query their current identity.

**Independent Test**: Can be fully tested by signing in, verifying the session cookie is set and the user is recognized, then signing out and verifying the session is invalidated and the cookie cleared.

### Tests for User Story 2 (MANDATORY - write first, observe failure)

- [x] T032 [P] [US2] Contract test for POST /api/v1/auth/login in backend/src/modules/auth/__tests__/login.contract.spec.ts
- [x] T033 [P] [US2] Contract test for POST /api/v1/auth/logout in backend/src/modules/auth/__tests__/logout.contract.spec.ts
- [x] T034 [P] [US2] Contract test for GET /api/v1/auth/me in backend/src/modules/auth/__tests__/me.contract.spec.ts
- [x] T035 [P] [US2] Integration test for login with correct credentials in backend/src/modules/auth/__tests__/login.integration.spec.ts
- [x] T036 [P] [US2] Integration test for login with incorrect credentials returning generic error in backend/src/modules/auth/__tests__/login.generic-error.spec.ts
- [x] T037 [P] [US2] Integration test for logout invalidating session and clearing cookie in backend/src/modules/auth/__tests__/logout.integration.spec.ts
- [x] T038 [P] [US2] Integration test for GET /auth/me returning user identity and organization membership in backend/src/modules/auth/__tests__/me.integration.spec.ts
- [x] T039 [P] [US2] Rate limiting test: 6 failed logins for same email within 15 minutes returns 429 with Retry-After in backend/src/modules/auth/__tests__/login.rate-limit.spec.ts
- [x] T040 [P] [US2] Session expiry test: idle timeout 30 minutes and absolute lifetime 12 hours invalidate session in backend/src/modules/auth/__tests__/session.expiry.spec.ts
- [x] T041 [P] [US2] Session invalidation on membership deactivation test in backend/src/modules/auth/__tests__/session.invalidation.spec.ts

### Implementation for User Story 2

- [x] T042 [P] [US2] Create LoginDTO in backend/src/modules/auth/dto/login.dto.ts with Zod validation
- [x] T043 [P] [US2] Create SwitchOrganizationDTO in backend/src/modules/auth/dto/switch-organization.dto.ts with Zod validation
- [x] T044 [US2] Implement AuthService.login() in backend/src/modules/auth/auth.service.ts verifying Argon2id password, creating session, issuing opaque session cookie (HttpOnly, Secure, SameSite=Lax)
- [x] T045 [US2] Implement AuthService.logout() in backend/src/modules/auth/auth.service.ts invalidating session and clearing cookie
- [x] T046 [US2] Implement AuthService.me() in backend/src/modules/auth/auth.service.ts returning current user, membership, organization, permissions from session context
- [x] T047 [US2] Implement AuthController.login() in backend/src/modules/auth/auth.controller.ts with @Post('login'), @Public(), CSRF exempt, rate limiting applied
- [x] T048 [US2] Implement AuthController.logout() in backend/src/modules/auth/auth.controller.ts with @Post('logout'), session required, CSRF token validated
- [x] T049 [US2] Implement AuthController.me() in backend/src/modules/auth/auth.controller.ts with @Get('me'), session required
- [x] T050 [US2] Implement rate limiting backed by PostgreSQL LoginAttempt counters (>5 failures per email per 15 minutes returns 429 with Retry-After) in backend/src/modules/auth/auth.service.ts
- [x] T051 [US2] Implement session guard in backend/src/modules/auth/guards/session.guard.ts validating session cookie, idle/absolute expiry, membership active
- [x] T052 [US2] Implement CSRF token validation on state-changing requests in backend/src/modules/auth/auth.service.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Switch organization (Priority: P2)

**Goal**: A user who is a member of multiple organizations can switch their active organization context. Tenant scope for all subsequent requests resolves from the session and the verified membership of the newly active organization.

**Independent Test**: Can be fully tested by creating two organizations, adding the user as a member of both, switching between them, and verifying that tenant-scoped data changes accordingly.

### Tests for User Story 3 (MANDATORY - write first, observe failure)

- [x] T053 [P] [US3] Contract test for POST /api/v1/auth/switch-organization in backend/src/modules/auth/__tests__/switch-organization.contract.spec.ts
- [x] T054 [P] [US3] Integration test for switching between two organizations in backend/src/modules/auth/__tests__/switch-organization.integration.spec.ts
- [x] T055 [P] [US3] Tenant isolation test proving switched organization scopes all subsequent requests in backend/src/modules/auth/__tests__/switch-organization.tenant-isolation.spec.ts
- [x] T056 [P] [US3] Integration test proving switch refused when user is not a member of target organization in backend/src/modules/auth/__tests__/switch-organization.non-member.spec.ts

### Implementation for User Story 3

- [x] T057 [US3] Implement AuthService.switchOrganization() in backend/src/modules/auth/auth.service.ts verifying membership, switching active organization in session context, re-issuing session
- [x] T058 [US3] Implement AuthController.switchOrganization() in backend/src/modules/auth/auth.controller.ts with @Post('switch-organization'), session required, CSRF token validated
- [x] T059 [US3] Implement tenant scope resolution from session + verified membership in backend/src/common/logging/request-context.ts via extendRequestContext({ organizationId })
- [x] T060 [US3] Implement 404 for cross-tenant record requests in backend/src/modules/organizations/organizations.service.ts and backend/src/modules/users/users.service.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T061 [P] Documentation updates in docs/ for authentication and session API
- [x] T062 Code cleanup and refactoring across auth, organizations, users, access-control modules
- [x] T063 Performance optimization across all auth endpoints (p95 under 500 ms)
- [x] T064 [P] Additional unit tests in backend/src/modules/auth/__tests__/ and backend/src/modules/organizations/__tests__/
- [x] T065 Security hardening: verify no password or session token appears in any log output
- [x] T066 [P] Tenant-isolation sweep across every endpoint added in this feature (Principle I)
- [x] T067 [P] Concurrency, rollback, and idempotency regression run against real PostgreSQL (Principle III)
- [x] T068 Verify critical-path coverage is at least 80% in the CI report (Principle V)
- [x] T069 [P] Accessibility and UX-rule review against PRD 7.3 and WCAG 2.1 AA (Principle VIII) - N/A for backend-only feature
- [x] T070 Run quickstart.md validation (db:generate, db:migrate, db:seed, dev:api, health check)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 -> P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Depends on User Story 1 (session infrastructure created during registration)
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Depends on User Story 1 (organizations and memberships created during registration)

### Within Each User Story

- Tests MUST be written first and observed to FAIL before implementation (Principle V)
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---


## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (tests are mandatory):
Task: "Contract test for POST /api/v1/auth/register in backend/src/modules/auth/__tests__/register.contract.spec.ts"
Task: "Integration test for full registration flow in backend/src/modules/auth/__tests__/register.integration.spec.ts"
Task: "Tenant isolation test proving registered user cannot access another organization's data in backend/src/modules/auth/__tests__/register.tenant-isolation.spec.ts"
Task: "Transaction rollback test forcing failure mid-registration in backend/src/modules/auth/__tests__/register.rollback.spec.ts"
Task: "Generic error test proving registration does not reveal whether email exists in backend/src/modules/auth/__tests__/register.generic-error.spec.ts"

# Launch all models/services for User Story 1 together:
Task: "Create User entity service method in backend/src/modules/users/users.service.ts for createUser transaction"
Task: "Create Organization entity service method in backend/src/modules/organizations/organizations.service.ts for createOrganization transaction"
Task: "Create Membership entity service method in backend/src/modules/organizations/organizations.service.ts for createAdministratorMembership transaction"
Task: "Create Role and RolePermission seeding in backend/src/modules/access-control/access-control.service.ts using shared PERMISSION_CATALOG and ROLE_TEMPLATES"
Task: "Create Warehouse entity service method for default warehouse creation"
Task: "Create DocumentSequence entity service method for default sequence creation"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> Deploy/Demo (MVP!)
3. Add User Story 2 -> Test independently -> Deploy/Demo
4. Add User Story 3 -> Test independently -> Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
