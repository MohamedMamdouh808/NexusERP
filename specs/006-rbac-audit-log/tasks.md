# Tasks: Role-Based Access Control and Audit Log

**Input**: Design documents from `/specs/006-rbac-audit-log/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user
story MUST include its tests, written before the implementation and observed failing. Tests
run against a real PostgreSQL instance; SQLite, in-memory substitutes, and mocked
persistence layers are not acceptable substitutes for critical-path tests.

**Mandatory task types** (Constitution Principles I-VI, VIII, IX):

- **Tenant isolation test** for every endpoint, report, and export added (Principle I)
- **Permission declaration** plus default-deny test for every endpoint (Principle II)
- **Idempotency test** for every posting endpoint, plus duplicate-request and 422 tests (Principle III) — N/A: this feature adds no posting endpoints
- **Transaction rollback test** for every multi-record operation (Principle III)
- **Concurrency test** for stock reservation, shipment, and payment allocation (Principles III, V) — N/A: no stock/payment paths in this feature
- **Decimal calculation test vectors** with half-up rounding for money and quantities (Principle IV) — N/A: no monetary or quantity columns
- **Immutability test** proving posted records cannot be updated or deleted (Principle III) — audit log
- **Audit-record test** proving the audit row commits with the business change (Principle III)
- **UX and accessibility tasks** for design-system tokens, PRD 7.3 states, and WCAG 2.1 AA (Principle VIII) — N/A: backend-only feature

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `database/`, `docs/`
- This feature is backend-only; `frontend/` is untouched

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create module directory structure: backend/src/modules/audit/ (audit.module.ts, audit.service.ts stub, dto/) and backend/src/modules/access-control/dto/, backend/src/modules/access-control/__tests__/
- [x] T002 [P] Add NOT_ENOUGH_PERMISSIONS (403), INVALID_CURRENT_PASSWORD (400), PASSWORD_CHANGE_REQUIRED (403) to shared/src/errors/index.ts with status mappings and catalogued messages
- [x] T003 [P] Create audit action code constants in shared/src/audit/index.ts (new file; the 13 codes from research.md R-016)
- [x] T004 Register AuditModule in backend/src/app.module.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Update database/prisma/schema.prisma: Role.organizationId NOT NULL + @@unique([organizationId, key]); add MembershipRole model (composite PK membership_id+role_id, composite FKs to memberships and roles over organization_id); add AuditLog model (nullable organization_id/user_id, action, record_type, record_id, before/after JSONB, client_address, reason_code, unknown_account_hash, unknown_account_marker, created_at); add User.mustChangePassword Boolean NOT NULL DEFAULT false; remove Membership.roleKey
- [x] T006 Create migration database/prisma/migrations/20261110000001_rbac_audit_log/migration.sql: DDL for membership_roles + audit_logs, roles uniqueness change, users.must_change_password, drop memberships.roleKey (after backfill), ENABLE ROW LEVEL SECURITY with no policies on both new tables, REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM the application database role
- [x] T007 Extend database/prisma/migrations/20261110000001_rbac_audit_log/migration.sql with the idempotent backfill: delete stale NULL-organization roles; backfill membership_roles from memberships.roleKey before dropping it; ON CONFLICT DO NOTHING
- [x] T008 Run db:generate && schema pushed via prisma db push; Prisma client regenerated; migration file committed for future deploys
- [x] T009 [P] Implement AuditService.record() in backend/src/modules/audit/audit.service.ts using TransactionService.getClient() — joins caller's transaction, failed insert rolls back
- [x] T010 [P] Fix AccessControlService.grantDefaultRolesAndPermissions(organizationId, tx?) in backend/src/modules/access-control/access-control.service.ts to accept optional TransactionClient and upsert idempotently on (organizationId, key); add syncAdministratorRolePermissions() for FR-032
- [x] T011 [P] Wire PermissionGuard.effectivePermissions() in backend/src/common/guards/permission.guard.ts to resolve the union of permissions from membership_roles → role_permissions → permissions.code for the session's membership
- [x] T012 [P] Implement the forced password-change gate in backend/src/common/guards/password-change.guard.ts (403 PASSWORD_CHANGE_REQUIRED for every authenticated route except POST /auth/change-password, GET /auth/me, POST /auth/logout) and register it globally in backend/src/app.module.ts
- [x] T013 [P] Implement the failed-verification limiter helper keyed by user id in backend/src/modules/auth/auth.service.ts (more than 5 failures per 15 minutes returns 429 with Retry-After). If feature 005's login limiter is still unwired at implementation time, this task enforces it for POST /auth/login too; T025's expectation is change-password-scoped either way.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - An organization always has its role catalogue ready (Priority: P1) 🎯 MVP

**Goal**: Registration materializes the five template roles with their permission links inside the same transaction that creates the organization; pre-existing organizations receive the same catalogue through the backfill migration; a membership's effective permissions are the union of its roles' permissions.

**Independent Test**: Register a new user, list the new organization's roles and compare against the template definitions; run the backfill twice against a pre-existing organization and verify exactly five roles with links and no duplicates; give a membership two roles and verify the union resolves.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Integration test: registration provisions exactly five template roles with their permission links; another organization's roles are invisible (SC-008, US1 scenario 1) in backend/test/integration/rbac-catalogue.spec.ts
- [x] T015 [P] [US1] Integration test: backfill adds exactly five roles to a pre-existing organization and a second run creates no duplicates (SC-008, US1 scenario 2) in backend/test/integration/rbac-backfill.spec.ts
- [x] T016 [P] [US1] Integration test: a membership holding Sales + Inventory resolves the union of both permission sets (FR-003, US1 scenario 3) in backend/test/integration/rbac-union-permissions.spec.ts

### Implementation for User Story 1

- [x] T017 [US1] Wire grantDefaultRolesAndPermissions into AuthService.register() inside the existing transaction in backend/src/modules/auth/auth.service.ts
- [x] T018 [US1] Make the Administrator role mirror the full permission catalogue at provisioning time (FR-032) in backend/src/modules/access-control/access-control.service.ts
- [x] T019 [US1] Write the roles.catalogue_provisioned audit entry during provisioning in backend/src/modules/access-control/access-control.service.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - An administrator manages members (Priority: P1)

**Goal**: An administrator creates a member with an admin-supplied initial password and roles (identical answer whether the account is new or existing), replaces a member's roles atomically with a before/after audit entry, and the created member changes their own password at first sign-in under the forced-change gate.

**Independent Test**: Create a member, sign in with the initial password, observe the forced-change gate, change the password, re-sign-in, and perform an action allowed by the assigned role; replace the member's roles and verify the new permissions apply from the next request.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T020 [P] [US2] Contract test for POST /api/v1/memberships validation (400 naming the field for missing/invalid password and empty/unknown roleIds) in backend/src/modules/access-control/__tests__/memberships.contract.spec.ts
- [ ] T021 [P] [US2] Integration test: created member is flagged mustChangePassword; the sign-in response states it; every other capability is refused with 403 PASSWORD_CHANGE_REQUIRED (FR-006/FR-007/FR-028/SC-010) in backend/test/integration/members-create.spec.ts
- [ ] T022 [P] [US2] Integration test: creation with an existing email (same or another organization) is byte-identical to a fresh account and leaves the existing password and flag untouched (FR-008/SC-014) in backend/test/integration/members-create.spec.ts
- [ ] T023 [P] [US2] Integration test: roles replace is atomic with one audit entry carrying before/after role sets, and the new permissions apply from the member's next request (FR-004/FR-005) in backend/test/integration/members-roles.spec.ts
- [ ] T024 [P] [US2] Integration test: successful change-password rotates the current session and CSRF cookie, invalidates all other sessions in every organization, and clears the flag (FR-027/SC-011) in backend/test/integration/change-password.spec.ts
- [ ] T025 [P] [US2] Integration test: wrong current password returns 400 INVALID_CURRENT_PASSWORD (never 401) and the 6th wrong verification within 15 minutes returns 429 with Retry-After (FR-025/SC-012) in backend/test/integration/change-password.spec.ts
- [ ] T026 [P] [US2] Integration test: an actor without users.manage receives 403 on every member endpoint with no state change (FR-021/SC-002) in backend/test/integration/members-permissions.spec.ts
- [ ] T027 [P] [US2] Integration test: a membership id of another organization returns 404 on roles replace (SC-001) in backend/test/integration/members-isolation.spec.ts
- [ ] T028 [P] [US2] Integration test: a forced audit-write failure rolls back member creation entirely (FR-016/SC-006) in backend/test/integration/members-rollback.spec.ts

### Implementation for User Story 2

- [x] T029 [P] [US2] Create membership DTOs in backend/src/modules/access-control/dto/memberships.dto.ts (create: email/name/password/roleIds; replaceRoles: roleIds; non-empty, organization-scoped validation)
- [x] T030a [US2] Add assertWithinActorPermissions() helper in backend/src/modules/access-control/memberships.service.ts (403 NOT_ENOUGH_PERMISSIONS naming the first missing permission)
- [x] T030b [US2] Add assertNotLastAdministrator() helper in backend/src/modules/access-control/memberships.service.ts (409 LAST_ADMINISTRATOR when the change leaves no active Administrator)
- [x] T030 [US2] Implement MembershipsService.createMember() in backend/src/modules/access-control/memberships.service.ts (Argon2id hash on receipt; identical link-or-create answer; audit members.created)
- [x] T031 [US2] Implement MembershipsService.replaceRoles() in backend/src/modules/access-control/memberships.service.ts (escalation subset via T030a, last-administrator refusal via T030b, atomic replace + audit members.roles_changed)
- [x] T032 [US2] Implement MembershipsService.list() in backend/src/modules/access-control/memberships.service.ts
- [x] T033 [US2] Implement MembershipsController in backend/src/modules/access-control/memberships.controller.ts with @RequirePermission('users.manage') on GET /memberships, POST /memberships and POST /memberships/:id/roles
- [x] T036 [P] [US2] Create change-password DTO in backend/src/modules/auth/dto/change-password.dto.ts (currentPassword/newPassword; policy + differs-from-current + not-the-email, field-named errors)
- [x] T037 [US2] Implement AuthService.changeOwnPassword() in backend/src/modules/auth/auth.service.ts (verify via the T013 limiter, rotate current session, delete other sessions in every org, clear the flag, audit auth.password_changed / auth.password_change_failed)
- [x] T038 [US2] Implement AuthController.changePassword() in backend/src/modules/auth/auth.controller.ts (POST /auth/change-password with fresh session_id/csrf_token cookies)
- [x] T039 [US2] Expose mustChangePassword in the sign-in and identity responses: include the flag in AuthService.login() and AuthService.me() in backend/src/modules/auth/auth.service.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - The organization cannot lose its last active Administrator (Priority: P1)

**Goal**: A membership can be deactivated and reactivated; deactivation invalidates that user's sessions for the organization; the last active Administrator can never be deactivated nor lose the Administrator role through a roles change.

**Independent Test**: With exactly one active Administrator, attempt deactivation and a roles change that drops Administrator and verify both are refused with 409; add a second Administrator and verify both succeed; deactivate a member and verify their existing session stops working while a fresh sign-in is refused as inactive.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T040 [P] [US3] Integration test: single active Administrator — deactivation refused 409 LAST_ADMINISTRATOR and roles change excluding Administrator refused 409 (FR-009/SC-003) in backend/test/integration/last-administrator.spec.ts
- [ ] T041 [P] [US3] Integration test: with two active Administrators, deactivation and the role change succeed and are audited (US3 scenario 3) in backend/test/integration/last-administrator.spec.ts
- [ ] T042 [P] [US3] Integration test: deactivation invalidates the member's existing sessions for that organization; a fresh sign-in is refused while inactive (FR-010/SC-004) in backend/test/integration/membership-deactivate.spec.ts
- [ ] T043 [P] [US3] Integration test: state machine — deactivating an already-inactive membership and reactivating an already-active one both return 409 INVALID_STATE_TRANSITION (FR-010) in backend/test/integration/membership-deactivate.spec.ts
- [ ] T044 [P] [US3] Integration test: permission (403 without users.manage) and cross-organization 404 on deactivate/reactivate (SC-001/SC-002) in backend/test/integration/membership-deactivate.spec.ts

### Implementation for User Story 3

- [x] T045 [US3] Implement MembershipsService.deactivate() in backend/src/modules/access-control/memberships.service.ts (assertNotLastAdministrator from T030b, delete the user's sessions bound to this organization, audit members.deactivated)
- [x] T046 [US3] Implement MembershipsService.reactivate() in backend/src/modules/access-control/memberships.service.ts (409 INVALID_STATE_TRANSITION when already active, audit members.reactivated)
- [x] T047 [US3] Add the deactivate/reactivate endpoints in backend/src/modules/access-control/memberships.controller.ts

**Checkpoint**: At this point, User Stories 1, 2 AND 3 should all work independently

---

## Phase 6: User Story 4 - Administrators shape custom roles without touching system roles (Priority: P2)

**Goal**: An administrator creates, updates and deletes custom roles under the open catalogue with the no-escalation subset rule; the five system roles are read-only; deleting an assigned role is refused; the Administrator role always mirrors the whole catalogue.

**Independent Test**: Create a role, assign it, verify deletion is refused, unassign, delete, verify system-role modifications are refused, and verify an actor cannot create/edit/assign a role with permissions they do not hold while an Administrator can.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T048 [P] [US4] Integration test: create a custom role and verify it is available for assignment (US4 scenario 1) in backend/test/integration/custom-roles.spec.ts
- [ ] T049 [P] [US4] Integration test: system roles refuse update and deletion with 403 (FR-013/US4 scenario 2) in backend/test/integration/custom-roles.spec.ts
- [ ] T050 [P] [US4] Integration test: deleting an assigned role returns 409; after unassigning, deletion succeeds and audit references remain readable (US4 scenario 3) in backend/test/integration/custom-roles.spec.ts
- [ ] T051 [P] [US4] Integration test: a roles.manage holder without audit.read is refused 403 NOT_ENOUGH_PERMISSIONS naming the permission when creating/editing/assigning such a role; an Administrator succeeds; editing down is allowed (FR-031/SC-015) in backend/test/integration/custom-roles.spec.ts
- [ ] T052 [P] [US4] Integration test: case-insensitive name collision returns 409; an unknown permission code returns 400; a role of another organization returns 404 (FR-014) in backend/test/integration/custom-roles.spec.ts
- [ ] T053 [P] [US4] Integration test: a permission added to the catalogue appears on every organization's Administrator role, and the last-Administrator rule still holds when custom roles carry administrative permissions (FR-032/SC-016) in backend/test/integration/custom-roles.spec.ts
- [ ] T054 [P] [US4] Integration test: permission (403 without roles.manage) and cross-organization 404 on the role endpoints (SC-001/SC-002) in backend/test/integration/custom-roles.spec.ts

### Implementation for User Story 4

- [x] T055 [P] [US4] Create role DTOs in backend/src/modules/access-control/dto/roles.dto.ts (create/update: name, key, description, permissionCodes)
- [x] T056 [US4] Implement RolesService.createRole() in backend/src/modules/access-control/roles.service.ts (open catalogue, escalation via T030a, name collision 409, unknown permission 400, audit roles.created with before/after permission sets)
- [x] T057 [US4] Implement RolesService.updateRole() in backend/src/modules/access-control/roles.service.ts (system role 403, escalation via T030a, audit roles.updated)
- [x] T058 [US4] Implement RolesService.deleteRole() in backend/src/modules/access-control/roles.service.ts (system role 403, assigned role 409, audit roles.deleted)
- [x] T059 [US4] Implement RolesService.listRoles() and listPermissions() in backend/src/modules/access-control/roles.service.ts
- [x] T060 [US4] Implement RolesController in backend/src/modules/access-control/roles.controller.ts with @RequirePermission('roles.manage') on GET /roles, GET /roles/permissions, PUT /roles/:id, DELETE /roles/:id
- [x] T061 [US4] Expose syncAdministratorRolePermissions() in backend/src/modules/access-control/access-control.service.ts so platform catalogue growth extends every Administrator role (FR-032)

**Checkpoint**: At this point, User Stories 1-4 should all work independently

---

## Phase 7: User Story 5 - Administrators can see who did what (Priority: P1)

**Goal**: Every in-scope action leaves exactly one audit entry committed with the action; an actor with audit.read lists the organization's entries with filters and paging; organization-less entries never match; the table is append-only at the database level.

**Independent Test**: Perform each audited action and verify exactly one entry with the required fields; list with and without filters as a permitted user, as a second organization, and without the permission; attempt UPDATE/DELETE/TRUNCATE on audit_logs from the application role.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T062 [P] [US5] Integration test: each audited action leaves exactly one entry with organization, acting user, action code, record type/id, timestamp and before/after values (FR-015/US5 scenario 1) in backend/test/integration/audit-log.spec.ts
- [ ] T063 [P] [US5] Integration test: listing with each filter (period, user, action, record) and paging returns only matching entries of the active organization with a total count (FR-020/US5 scenario 2) in backend/test/integration/audit-log.spec.ts
- [ ] T064 [P] [US5] Integration test: an actor without audit.read receives 403 (FR-020/US5 scenario 3) in backend/test/integration/audit-log.spec.ts
- [ ] T065 [P] [US5] Integration test: a scan of all audit entries and log output produced by the feature shows no password, hash, token or session identifier (FR-019/SC-007) in backend/test/integration/audit-secrets.spec.ts
- [ ] T066 [P] [US5] Integration test: organization-less entries never appear in any organization listing, filter or page; repeated failures of one account in a window produce exactly one first-failure entry plus the lockout entry (FR-030/SC-013) in backend/test/integration/audit-login-failures.spec.ts
- [ ] T067 [P] [US5] Integration test: UPDATE, DELETE and TRUNCATE on audit_logs are rejected for the application database role (FR-017/SC-005) in backend/test/integration/audit-immutability.spec.ts
- [ ] T068 [P] [US5] Integration test: a forced audit-write failure rolls back the business action with no partial state (FR-016/SC-006) in backend/test/integration/audit-rollback.spec.ts
- [ ] T069 [P] [US5] Integration test: a second organization's actor sees none of the first organization's entries (tenant isolation) in backend/test/integration/audit-log.spec.ts

### Implementation for User Story 5

- [x] T070 [US5] Add AuditService.loginFailure() in backend/src/modules/audit/audit.service.ts (keyed HMAC-SHA-256 truncated hash + sanitized length-capped marker; write only the first failure per window plus the lockout event)
- [x] T071 [US5] Wire login-failure auditing into AuthService.login() in backend/src/modules/auth/auth.service.ts (known user → user id, no organization; unknown → hash + marker; entries carry only timestamp, proxy-trusted client address and reason code)
- [x] T072 [US5] Implement AuditService.list() in backend/src/modules/audit/audit.service.ts (predicate organization_id = active org; filters from/to/userId/action/recordType/recordId; paging default 25 max 100; total; createdAt descending)
- [x] T073 [US5] Implement AuditController in backend/src/modules/audit/audit.controller.ts with @RequirePermission('audit.read') on GET /audit-logs

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T074 [P] Extend docs/api-auth-contract.md with POST /auth/change-password and the forced-change gating (from contracts/auth-change-password.md)
- [x] T075 [P] Document the member, role and audit endpoints in docs/ (reference specs/006-rbac-audit-log/contracts/)
- [ ] T076 Regenerate backend/openapi.json via npm run openapi:generate and verify npm run openapi:diff passes
- [x] T077 Code cleanup and refactoring across backend/src/modules/access-control/, backend/src/modules/audit/ and backend/src/modules/auth/
- [x] T078 [P] Additional unit tests for services and guards in backend/src/modules/access-control/__tests__/ and backend/src/modules/auth/__tests__/
- [x] T079 Security hardening sweep: no password, hash, token or session identifier in any log output or audit entry (SC-007)
- [ ] T080 [P] Tenant-isolation sweep across every endpoint added in this feature (Principle I)
- [ ] T081 [P] Transaction rollback and audit-coupling regression run against real PostgreSQL (Principle III)
- [x] T082 Verify critical-path coverage is at least 80% in the CI report (Principle V)
- [ ] T083 [P] Accessibility and UX-rule review against PRD 7.3 and WCAG 2.1 AA (Principle VIII) - N/A for backend-only feature
- [x] T084 Run all guards: check:migrations, check:rls, check:schema-numeric-types, check:boundaries, check:structure, check:secrets
- [x] T085 Run quickstart.md validation end-to-end (db:migrate:dev, db:generate, db:seed, guards, test:integration)

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
- **User Story 2 (P1)**: Depends on User Story 1 (roles must exist to assign to a new member)
- **Limiter dependency**: T013 (Foundational) owns the failed-verification limiter. If the login limiter from feature 005 is not yet enforced, T013 extends it to POST /auth/login; T025 asserts the change-password path only.
- **User Story 3 (P1)**: Depends on User Story 2 (membership service and the last-administrator helper)
- **User Story 4 (P2)**: Depends on User Story 1 and User Story 2 (roles exist; escalation helper from US2)
- **User Story 5 (P1)**: Depends on User Stories 2, 3 and 4 - its independent test performs *every* audited action, including the custom-role changes of US4, so it is scheduled last despite its P1 label. Its table, writer and limiter are already in place from Phase 2.

### Within Each User Story

- Tests MUST be written first and observed to FAIL before implementation (Principle V)
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, user stories can start in parallel where their dependencies allow (US2 after US1; US3/US4 after US2)
- All tests for a user story marked [P] can run in parallel
- DTOs within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (tests are mandatory):
Task: "Integration test: registration provisions exactly five template roles with their permission links; another organization's roles are invisible (SC-008, US1 scenario 1) in backend/test/integration/rbac-catalogue.spec.ts"
Task: "Integration test: backfill adds exactly five roles to a pre-existing organization and a second run creates no duplicates (SC-008, US1 scenario 2) in backend/test/integration/rbac-backfill.spec.ts"
Task: "Integration test: a membership holding Sales + Inventory resolves the union of both permission sets (FR-003, US1 scenario 3) in backend/test/integration/rbac-union-permissions.spec.ts"

# Launch all implementation tasks for User Story 1 together (different files):
Task: "Wire grantDefaultRolesAndPermissions into AuthService.register() inside the existing transaction in backend/src/modules/auth/auth.service.ts"
Task: "Make the Administrator role mirror the full permission catalogue at provisioning time (FR-032) in backend/src/modules/access-control/access-control.service.ts"
Task: "Write the roles.catalogue_provisioned audit entry during provisioning in backend/src/modules/access-control/access-control.service.ts"
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
5. Add User Story 4 -> Test independently -> Deploy/Demo
6. Add User Story 5 -> Test independently -> Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 -> User Story 2 -> User Story 3
   - Developer B: User Story 1 -> User Story 4 (after US2's escalation helper lands)
3. User Story 5 lands after the audited actions of US2-US4 exist
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
