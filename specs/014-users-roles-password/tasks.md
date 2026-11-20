# Tasks: Users & Roles and Change-Own-Password End to End

**Input**: Design documents from `/specs/014-users-roles-password/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story MUST include its tests, written before the implementation and observed failing. Tests run against a real PostgreSQL instance.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend integration tests: `backend/test/integration/`
- Frontend tests: `frontend/src/features/.../__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Migration and schema preparation for the per-membership name/version.

- [X] T001 Create migration `database/prisma/migrations/20261116000001_membership_name_version/migration.sql` adding `name VARCHAR(100) NULL` and `version INTEGER NOT NULL DEFAULT 1` to `memberships`; backfill `version=1`, `name=NULL`. Append-only (no edits to prior migrations).
- [X] T002 Update `database/prisma/schema.prisma` `Membership` model: add `name String? @db.VarChar(100)` and `version Int @default(1)`.
- [X] T003 Run `npm run db:generate --workspace @nexuserp/database` to regenerate the Prisma client.
- [X] T004 [P] Add `name`/`version` validation helpers to `backend/src/modules/access-control/dto/memberships.dto.ts` (trimmed 1–100 chars, no control chars; version positive int).
- [ ] T005 [P] Add i18n keys for the new screens/labels in `frontend/src/i18n` locale files (en + ar) using write/edit only (no `*` in labels).

**Checkpoint**: Schema and DTO ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend list/filter/sort/page/total + memberCount + name edit + role detail; frontend real client seam.

- [X] T006 Extend `backend/src/modules/access-control/memberships.service.ts` `list()` into `list(organizationId, params)` supporting `search`, `role`, `status`, `sort`, `direction`, `page`, `pageSize`; escape wildcards; return `{ items, total, page, pageSize }`; include `name`, `displayName`, `status`, `passwordChangeRequired`.
- [X] T007 Update `backend/src/modules/access-control/memberships.controller.ts` `GET /memberships` to accept and validate query params (pageSize cap 100 → 400) and pass them to the service.
- [X] T008 Add `PATCH /memberships/:id` (name edit) to controller + `updateName` in service: validate name, check version (409 `VERSION_CONFLICT`), increment version, audit `members.name_changed` (before/after), tenant-scoped (404 cross-org), `users.manage`.
- [X] T009 Add `memberCount` to `backend/src/modules/access-control/roles.service.ts` `listRoles` (correlated count of active memberships) and add `getRole(organizationId, id)` returning detail + memberCount.
- [X] T010 Add `GET /roles/:id` to `backend/src/modules/access-control/roles.controller.ts`.
- [X] T011 [P] Regenerate `backend/openapi.json` and run the drift check.
- [X] T012 [P] Switch `frontend/src/features/administration/use-administration.ts` from `sampleCatalogService` to the real API client for users/roles/permissions (keep organization/modules/audit on sample until their feature ships).
- [ ] T013 [P] Delete sample user/role data and sample service entries for users/roles in `frontend/src/services/sample-catalog-service.ts`; remove the `SampleDataBanner` usage on the Users/Roles/role-detail screens.
- [X] T014 [P] Add real API client methods in `frontend/src/services/` (or extend existing) for memberships list/create/updateRoles/deactivate/reactivate/updateName and roles list/get/create/update/delete + permissions.

**Checkpoint**: Backend + frontend seam ready; user stories can begin.

---

## Phase 3: User Story 1 - Browse and manage members (Priority: P1) 🎯 MVP

**Goal**: Real member list with search, filters, sort, paging, total, status, password-change flag, kebab actions.

**Independent Test**: Sign in as Administrator, open `/users`, search/filter/sort/page and confirm table + total + kebab actions reflect server data.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

- [ ] T015 [P] [US1] Backend integration test `backend/test/integration/users-roles-list.spec.ts`: tenant isolation for list params (search, role, status, sort, page, pageSize) and 400 on pageSize > 100.
- [ ] T016 [P] [US1] Backend integration test: wildcard escaping (`%`, `_`, `\`) treated literally.
- [ ] T017 [P] [US1] Backend integration test: permission default-deny (no `users.manage` → 403).
- [ ] T018 [P] [US1] Frontend test `frontend/src/features/administration/__tests__/users-page.spec.tsx`: list renders from API, search/filter/sort/page, total shown, status as text+colour, password-change flag, kebab menu.

### Implementation for User Story 1

- [ ] T019 [US1] Wire `frontend/src/features/administration/users-page.tsx` Users tab to `useUsers` real data (remove SampleDataBanner on this tab).
- [ ] T020 [US1] Implement status badge rendering as text + colour and password-change-required flag column.
- [ ] T021 [US1] Implement kebab menu entries (Edit roles, Deactivate/Reactivate) gated on permissions from `GET /auth/me`.

**Checkpoint**: US1 independently functional.

---

## Phase 4: User Story 2 - Add a member (Priority: P1)

**Goal**: New User dialog with name, email, password, roles; success toast; password never leaked.

**Independent Test**: Add a member and confirm creation, toast message, and no password in response/UI/audit.

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T022 [P] [US2] Backend integration test `backend/test/integration/users-roles-create.spec.ts`: create member (new + existing account) identical response; name stored on membership; audit `members.created` contains name+email only; password never in response.
- [ ] T023 [P] [US2] Backend integration test: validation (password <12 → 400, no role → 400, duplicate email in org → 409).
- [ ] T024 [P] [US2] Frontend test `frontend/src/features/administration/__tests__/new-user-dialog.spec.tsx`: password field type/autocomplete/minLength, no role blocks submit, success toast exact wording.

### Implementation for User Story 2

- [ ] T025 [US2] Wire New User dialog in `users-page.tsx` to `useCreateUser` (real client); password input `type="password"` `autocomplete="new-password"`.
- [ ] T026 [US2] Show exact success toast: "The member was added. If this person already had an account, they keep their existing password."
- [ ] T027 [US2] Handle server errors inline with request id; map "email in use" to email field.

**Checkpoint**: US2 independently functional.

---

## Phase 5: User Story 3 - Edit a member's roles (Priority: P1)

**Goal**: Edit roles dialog with live permission count + grouped preview; no-escalation visible; last-Administrator protection.

**Independent Test**: Toggle roles, observe count/preview update, save; verify effective permissions change; removing last admin refused inline.

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T028 [P] [US3] Backend integration test `backend/test/integration/users-roles-roles-change.spec.ts`: replace roles (audit before/after), no-escalation → 403 naming permission, last admin → 409 `LAST_ADMINISTRATOR`.
- [ ] T029 [P] [US3] Frontend test `frontend/src/features/administration/__tests__/edit-roles-dialog.spec.tsx`: checkboxes, permission count, grouped preview, disabled permissions note, server 403 inline.

### Implementation for User Story 3

- [ ] T030 [US3] Wire Edit roles dialog to `useUpdateUserRoles`; live permission count + grouped read-only preview.
- [ ] T031 [US3] Disable permissions not held with note "You can only grant permissions you hold" using `GET /auth/me`.
- [ ] T032 [US3] Surface 403 `NOT_ENOUGH_PERMISSIONS` and 409 `LAST_ADMINISTRATOR` inline with request id.

**Checkpoint**: US3 independently functional.

---

## Phase 6: User Story 4 - Deactivate and reactivate a member (Priority: P1)

**Goal**: ConfirmDialog with consequence text; last-admin protection; session invalidation.

**Independent Test**: Deactivate/reactivate a member; confirm consequence dialog; verify access revoked/restored and history kept.

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T033 [P] [US4] Backend integration test `backend/test/integration/users-roles-deactivate.spec.ts`: deactivate/reactivate (audit), session invalidation, last admin → 409, cross-org → 404.
- [ ] T034 [P] [US4] Frontend test `frontend/src/features/administration/__tests__/deactivate-dialog.spec.tsx`: ConfirmDialog consequence text, loading, error inline.

### Implementation for User Story 4

- [ ] T035 [US4] Wire deactivate/reactivate kebab entries to `useDeactivateUser`/`useReactivateUser` with ConfirmDialog (consequence: loses access to this org, history kept, other orgs unaffected).
- [ ] T036 [US4] Surface `LAST_ADMINISTRATOR` refusal inline.

**Checkpoint**: US4 independently functional.

---

## Phase 7: User Story 5 - Browse roles, create, edit, delete custom roles (Priority: P1)

**Goal**: System roles read-only with note; custom roles CRUD; assigned-role delete refused with count; role detail with memberCount.

**Independent Test**: Open `/users/roles`; system roles read-only grouped checklist; create/edit/delete unassigned custom role; delete assigned → refusal with count; role detail shows memberCount.

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T037 [P] [US5] Backend integration test `backend/test/integration/users-roles-roles.spec.ts`: list with memberCount, GET :id, create/edit/delete custom role, delete assigned → 409 with count, system role edit/delete → 403/409, no-escalation, tenant isolation.
- [ ] T038 [P] [US5] Frontend test `frontend/src/features/administration/__tests__/roles-page.spec.tsx`: system role note + read-only checklist, custom CRUD, delete refusal with count, role detail memberCount, disabled permissions note.

### Implementation for User Story 5

- [ ] T039 [US5] Wire Roles tab in `users-page.tsx` to real `useRoles` (remove SampleDataBanner on this tab); add `memberCount` column.
- [ ] T040 [US5] Create `frontend/src/features/administration/role-detail-page.tsx` (or extend) for `/users/roles/:id`: grouped permission checklist, read-only for system roles with note "System roles cannot be edited", edit/delete for custom.
- [ ] T041 [US5] Wire create/edit/delete role mutations to real client; permission checklist disables held-missing permissions with note "You can only grant permissions you hold".
- [ ] T042 [US5] Handle delete refusal naming member count inline.

**Checkpoint**: US5 independently functional.

---

## Phase 8: User Story 6 - Change my own password (Priority: P1)

**Goal**: Finish change-password screen wiring + forced-change redirect + 403 interceptor.

**Independent Test**: Change password (wrong current → 400, no sign-out; correct → toast + session rotation); forced-change redirect end to end.

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T043 [P] [US6] Backend integration test `backend/test/integration/users-roles-change-password.spec.ts`: change password (success rotates session, clears flag, audit), wrong current → 400 `INVALID_CURRENT_PASSWORD` no sign-out, new==current → 400, min 12.
- [ ] T044 [P] [US6] Frontend test `frontend/src/features/auth/__tests__/change-password-forced.spec.tsx`: redirect on mustChangePassword, shell shows only page + Sign out, 403 `PASSWORD_CHANGE_REQUIRED` → redirect, toast on success.
- [ ] T045 [P] [US6] Frontend test: wrong current password shows 400 inline, stays signed in.

### Implementation for User Story 6

- [ ] T046 [US6] Wire `frontend/src/features/auth/change-password-screen.tsx` to `POST /auth/change-password`; validate 12-char + differ-from-current; toast on success.
- [ ] T047 [US6] Ensure wrong-current-password shows 400 inline without sign-out.
- [ ] T048 [US6] Add global 403 `PASSWORD_CHANGE_REQUIRED` interceptor routing to `/account/password`.
- [ ] T049 [US6] Verify `SessionGate` + shell already restrict to change-password page + Sign out when `mustChangePassword` (no change expected; add tests only).

**Checkpoint**: US6 independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validation, redaction, contracts, UX review.

- [ ] T050 [P] Add frontend permission gating: hide/disable `users.manage`/`roles.manage` controls based on `GET /auth/me`; repeat "Access to this page is enforced by the server; hiding a control is not security."
- [ ] T051 [P] Add redaction check: no password/hash/session id in responses, logs, or audit entries for new endpoints (extend redaction guard tests).
- [ ] T052 [P] Run OpenAPI regeneration + drift check; update `docs/api-auth-contract.md` with new params/fields.
- [ ] T053 [P] Tenant-isolation + permission sweep across all new endpoints (every endpoint, cross-org → 404, no permission → 403).
- [ ] T054 [P] Accessibility/UX review (PRD 7.3, WCAG 2.1 AA): keyboard, focus, labels, status as text+colour, disabled checkboxes note.
- [ ] T055 [P] Run quickstart.md validation end to end against the dev stack.
- [ ] T056 Verify critical-path coverage ≥80% in CI report.
- [ ] T057 Update `frontend/src/services/sample-catalog-service.ts` removal of user/role sample data; remove `SampleDataBanner` import where no longer used.

**Checkpoint**: Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories.
- **Phase 3–8 (User Stories)**: Depend on Phase 2. Can proceed in priority order or in parallel.
- **Phase 9 (Polish)**: Depends on all desired stories complete.

### User Story Dependencies

- **US1 (Browse members)**: after Phase 2.
- **US2 (Add member)**: after Phase 2; uses US1 list refresh.
- **US3 (Edit roles)**: after Phase 2; depends on US1 row action.
- **US4 (Deactivate/reactivate)**: after Phase 2.
- **US5 (Roles CRUD)**: after Phase 2.
- **US6 (Change password)**: after Phase 2; largely independent (backend already exists).

### Within Each User Story

- Tests FIRST, observed failing, before implementation.
- Models/services before endpoints/UI.
- Story complete before moving on.

### Parallel Opportunities

- T004, T005 in Phase 1.
- T011–T014 in Phase 2.
- All test tasks within a story marked [P].
- Different user stories can be worked on in parallel by different developers once Phase 2 completes.
- Polish tasks T050–T055 are parallel.

---

## Parallel Example: User Story 1

```bash
# Backend + frontend tests together:
Task: "T015 [US1] tenant isolation for list params"
Task: "T016 [US1] wildcard escaping"
Task: "T017 [US1] permission default-deny"
Task: "T018 [US1] frontend users-page render"

# Implementation:
Task: "T019 [US1] wire Users tab to real data"
Task: "T020 [US1] status badge + password flag"
Task: "T021 [US1] kebab menu gating"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (backend list + frontend seam).
2. Phase 3 (US1 browse members).
3. STOP and validate against dev stack.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → browse members works.
3. US2 → add member works.
4. US3 → edit roles works.
5. US4 → deactivate/reactivate works.
6. US5 → roles management works.
7. US6 → change password + forced redirect works.
8. Polish → contracts, redaction, a11y, coverage.

### Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Verify tests fail before implementing.
- Commit only with explicit user instruction.