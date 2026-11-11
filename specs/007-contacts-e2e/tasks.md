# Tasks: Contacts End to End

**Input**: Design documents from `specs/007-contacts-e2e/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/contacts-api.md`, `quickstart.md`)  
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/  

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story includes its tests, written before the implementation and observed failing against a real PostgreSQL instance (`nexuserp_test` schema).

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (`[US1]`, `[US2]`, `[US3]`, `[US4]`, `[US5]`)
- Every task includes exact file paths

---

## Phase 1: Setup (Shared Types & Contracts)

**Purpose**: Establish the shared types, audit action constants, error codes, and sequence keys needed across backend and frontend.

- [x] T001 [P] Add contact audit actions (`contacts.created`, `contacts.updated`, `contacts.archived`, `contacts.restored`) to `shared/src/constants/audit-actions.ts`
- [x] T002 [P] Export contact DTO and query contracts, error codes (`CONTACT_IN_USE`, `STALE_VERSION`), and contact role enum in `shared/src/`
- [x] T003 Build shared workspace package to distribute types to backend and frontend via `npm run build` in `shared/`

---

## Phase 2: Foundational (Database Migration & Invariants)

**Purpose**: Core database schema, constraints, RLS, and invariant checks that MUST be in place before any endpoint or UI can interact with real contact records.

- [x] T004 Add `Contact` model with composite unique keys `(organization_id, id)` and `(organization_id, code)` to `database/prisma/schema.prisma`
- [x] T005 Create migration `20261110000010_create_contacts_table` with case-insensitive unique email index, RLS enabled (deny-all default), check constraints, and service_role grants in `database/prisma/migrations/20261110000010_create_contacts_table/migration.sql`
- [x] T006 Apply migration to development database and run `prisma generate` to update client types in `database/`
- [x] T007 [P] Update `scripts/verify-db-invariants.mjs` to include the `contacts` table in RLS enforcement and composite organization key checks

---

## Phase 3: User Story 1 - Create and View Customers and Suppliers (Priority: P1)

**Goal**: Implement contact creation with auto-generated code sequence (`CUST-` / `SUPP-`), transactional audit logging, and single contact retrieval.

**Independent Test**: Submitting a contact creation request stores the record with assigned sequence code, records audit entries, and allows immediate retrieval by ID within the same tenant while rejecting cross-tenant reads with 404.

- [x] T008 [P] [US1] Create integration test harness and failing tests for contact creation, code auto-generation, and ID retrieval in `backend/test/integration/contacts.spec.ts`
- [x] T009 [P] [US1] Create `CreateContactDto` and `ContactResponseDto` with validation rules in `backend/src/modules/contacts/dto/`
- [x] T010 [US1] Implement `ContactsService.create` with atomic document sequence allocation, composite organization key binding, and audit logging in `backend/src/modules/contacts/contacts.service.ts`
- [x] T011 [US1] Implement `ContactsService.findById` scoped strictly to `organizationId` in `backend/src/modules/contacts/contacts.service.ts`
- [x] T012 [US1] Implement `ContactsController` with `@RequirePermissions('contacts.write')` on `POST /api/v1/contacts` and `@RequirePermissions('contacts.read')` on `GET /api/v1/contacts/:id` in `backend/src/modules/contacts/contacts.controller.ts`
- [x] T013 [US1] Register `ContactsModule` in `backend/src/modules/contacts/contacts.module.ts` and import into `backend/src/app.module.ts`
- [x] T014 [US1] Verify T008 integration tests pass against live `nexuserp_test` PostgreSQL schema

---

## Phase 4: User Story 2 - Filtered Search and Server-Side Pagination (Priority: P2)

**Goal**: Implement server-side contact listing with search (name, email, phone, code), wildcard escaping, role/status filtering, and pagination.

**Independent Test**: Populating multiple contacts and querying `GET /api/v1/contacts` with search strings containing `%` or `_`, role filters (`customer`/`supplier`), and pagination parameters returns exact matching subsets and total counts.

- [x] T015 [P] [US2] Add failing integration tests for list search with escaped wildcards, role/status filtering, and pagination limits in `backend/test/integration/contacts.spec.ts`
- [x] T016 [P] [US2] Create `ListContactsDto` with search, filter, and pagination validation schemas in `backend/src/modules/contacts/dto/list-contacts.dto.ts`
- [x] T017 [US2] Implement `ContactsService.list` with safe SQL wildcard escaping, tenant scoping, and total count in `backend/src/modules/contacts/contacts.service.ts`
- [x] T018 [US2] Expose `GET /api/v1/contacts` in `backend/src/modules/contacts/contacts.controller.ts` protected by `@RequirePermissions('contacts.read')`
- [x] T019 [US2] Verify T015 list and search integration tests pass

---

## Phase 5: User Story 3 - Contact Modification and Concurrency Protection (Priority: P3)

**Goal**: Implement contact updates with optimistic concurrency locking (`version` check) and duplicate email conflict rejection.

**Independent Test**: Updating with current version succeeds, increments version, and writes audit entry; updating with stale version fails with 409 `STALE_VERSION`; updating to an existing email in the same tenant fails with 409 `DUPLICATE_RECORD`.

- [x] T020 [P] [US3] Add failing integration tests for optimistic locking (409 on stale version) and duplicate email detection in `backend/test/integration/contacts.spec.ts`
- [x] T021 [P] [US3] Create `UpdateContactDto` with version number and contact attributes in `backend/src/modules/contacts/dto/update-contact.dto.ts`
- [x] T022 [US3] Implement `ContactsService.update` with optimistic locking and transactional audit logging in `backend/src/modules/contacts/contacts.service.ts`
- [x] T023 [US3] Expose `PUT /api/v1/contacts/:id` in `backend/src/modules/contacts/contacts.controller.ts` protected by `@RequirePermissions('contacts.write')`
- [x] T024 [US3] Verify T020 update and concurrency integration tests pass

---

## Phase 6: User Story 4 - Archive, Restore, and Safe Deletion Prevention (Priority: P4)

**Goal**: Implement soft-archival and restoration with usage hook protection, ensuring hard deletion is impossible.

**Independent Test**: Archiving an unreferenced contact succeeds and records audit log; archiving a contact reported as "in use" by the usage hook fails with 409 `CONTACT_IN_USE`; restoring returns the contact to active state.

- [x] T025 [P] [US4] Add failing integration tests for archive (with in-use refusal stub) and restore round-trip in `backend/test/integration/contacts.spec.ts`
- [x] T026 [P] [US4] Implement `ContactsUsageHook` interface and default non-blocking provider in `backend/src/modules/contacts/contacts-usage.hook.ts`
- [x] T027 [US4] Implement `ContactsService.archive` (invoking usage hook) and `ContactsService.restore` with audit logging in `backend/src/modules/contacts/contacts.service.ts`
- [x] T028 [US4] Expose `POST /api/v1/contacts/:id/archive` and `POST /api/v1/contacts/:id/restore` in `backend/src/modules/contacts/contacts.controller.ts` protected by `@RequirePermissions('contacts.write')`
- [x] T029 [US4] Verify T025 archive and restore integration tests pass

---

## Phase 7: User Story 5 - Frontend Real-Data Integration & Permission Gating (Priority: P5)

**Goal**: Wire Contacts frontend screens to the real backend API, render discrete address fields and dual role checkboxes, show server errors inline, handle permission gating, and eliminate mock data banners.

**Independent Test**: Load `/contacts`, verify real data loads and "Sample data" banner is gone; create, edit, archive, and filter contacts through the UI; verify other sample modules continue functioning with isolated sample data.

- [x] T030 [P] [US5] Move sample contacts used by other modules into local mocks (`frontend/src/mocks/sample-contacts.ts`) and update imports in Sales, Purchasing, and Invoicing sample services
- [x] T031 [P] [US5] Remove contact mock methods and sample contacts from `frontend/src/services/catalog-service.ts` and `frontend/src/services/sample-catalog-service.ts`
- [x] T032 [US5] Implement real HTTP API client `frontend/src/services/contacts-client.ts` using `requestJson`
- [x] T033 [US5] Update `frontend/src/features/contacts/use-contacts.ts` to call `contacts-client.ts` with React Query invalidation
- [x] T034 [US5] Update `frontend/src/features/contacts/contacts-page.tsx` to remove `SampleDataBanner`, hook up server-side sorting/filtering/paging, and gate actions by `contacts.write`
- [x] T035 [US5] Update `frontend/src/features/contacts/contact-new-page.tsx` with dual role checkboxes (`is_customer`, `is_supplier`), discrete address inputs, and inline server error handling
- [x] T036 [US5] Update `frontend/src/features/contacts/contact-edit-page.tsx` with dual role checkboxes, discrete address inputs, optimistic version pass-through, and reload prompt on 409 conflict
- [x] T037 [US5] Update `frontend/src/features/contacts/contact-detail-page.tsx` to display assigned code, dual roles, formatted address, and handle archive/restore dialogs with permission gating
- [x] T038 [US5] Add unit tests for frontend contacts client and form validation in `frontend/src/features/contacts/__tests__/`

---

## Phase 8: Polish, Invariants & Quality Gates

**Purpose**: Verify all system invariants, regenerate OpenAPI documentation, verify zero drift, and ensure all repository guards pass.

- [x] T039 Regenerate OpenAPI specification via `npm run openapi:generate` in `backend/` and verify no contract drift via `npm run openapi:diff`
- [x] T040 Run `scripts/verify-db-invariants.mjs` against `nexuserp_test` and `public` schemas to prove RLS, foreign keys, and triggers remain intact (`npm run verify:invariants:test` and `npm run verify:invariants`)
- [x] T041 Run full verification guard suite: `npm run check:guards` (`check:migrations`, `check:rls`, `check:naming`, `check:boundaries`, `check:structure`, `check:secrets`)
- [ ] T042 Run full integration suite `npm run test:integration` and frontend tests `npm run test` in `frontend/`

---

## Dependencies & Completion Order

```
Phase 1 (Shared Types)
       │
       ▼
Phase 2 (Database Migration & Invariants)
       │
       ▼
Phase 3 (User Story 1: Create & View Core - MVP)
       │
       ├─────────────────────────┐
       ▼                         ▼
Phase 4 (US 2: Search & Filter)  Phase 5 (US 3: Update & Concurrency)
       │                         │
       └────────────┬────────────┘
                    ▼
Phase 6 (US 4: Archive & Restore with Usage Hook)
                    │
                    ▼
Phase 7 (US 5: Frontend Integration & Permission Gating)
                    │
                    ▼
Phase 8 (Polish, Invariants & Guards)
```

## Parallel Execution Opportunities

- **Phase 1**: T001 and T002 can be developed simultaneously.
- **Phase 3**: T008 (test suite) and T009 (DTO definitions) can be created in parallel.
- **Phase 4 & Phase 5**: Once Phase 3 is completed, User Story 2 (Search & List) and User Story 3 (Update & Concurrency) can proceed independently in parallel.
- **Phase 7**: T030 (mock extraction for other modules) and T032 (contacts HTTP client) can proceed in parallel.
