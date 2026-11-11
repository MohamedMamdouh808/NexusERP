# Tasks: Products End to End
**Input**: Design documents from `specs/008-products-end-to-end/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/products-api.md`, `quickstart.md`)
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every userstory includes its tests, written before the implementation and observed failing against areal PostgreSQL instance (`nexuserp_test` schema). SQLite, in-memory substitutes andmocked persistence layers are not acceptable substitutes for critical-path tests.
**Mandatory task types** (Constitution Principles I-VI, VIII, IX):
- **Tenant isolation test** for every endpoint added in this feature (Principle I)
- **Permission declaration** plus default-deny test for every endpoint (Principle II)
- **Transaction rollback test** for every multi-record operation (Principle III)
- **Concurrency test** for the optimistic version check (Principles III, V)
- **Decimal validation test vectors** for the prices and the reorder level (Principle IV)
- **Immutability test** proving a product can never be deleted (Principle III)
- **Audit-record test** proving the audit row commits with the business change (Principle III)
- **UX and accessibility tasks** for the design-system components, PRD 7.3 states and WCAG 2.1 AA (Principle VIII)
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.
## Format: `- [ ] [ID] [P?] [Story?] Description with file path`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions
## Path Conventions
- Monorepo workspaces: `backend/`, `frontend/`, `database/`, `shared/`
- The feature follows the contacts feature's layout: a module under `backend/src/modules/`, the model under `database/prisma/`, the contract vocabulary under `shared/src/`, and the screens under `frontend/src/features/`
---
## Phase 1: Setup (Shared Types & Contracts)
**Purpose**: Establish the shared types, audit actions and contract vocabulary that the backend and the interface both read.
- [x] T001 [P] Add the products audit actions (`products.created`, `products.updated`, `products.archived`, `products.restored`, `product_categories.created`, `units_of_measure.created`) to `shared/src/audit/index.ts`
- [x] T002 [P] Create the products contract vocabulary (the status filters `active|archived|all`, the role filter, the sort fields, the list defaults and the maximum page size, and the permission names) in `shared/src/products/index.ts` and export it from `shared/src/index.ts`
- [x] T003 Build the shared workspace package so the new types reach the backend and the interface (`npm run build --workspace @nexuserp/shared`, the `shared/` workspace)
---
## Phase 2: Foundational (Database Migration & Invariants)
**Purpose**: The schema, the constraints and the invariant checks that MUST be in place before any endpoint can touch a real product record.
**CRITICAL**: No user story work can begin until this phase is complete
- [x] T004 Add the `Product`, `ProductCategory` and `UnitOfMeasure` models with `organization_id`, the composite `(organization_id, id)` keys and the composite references to the category and the unit in `database/prisma/schema.prisma`
- [x] T005 Add `Organization.currencyCode` (`@default("USD")`, `@map("currency_code")`, `VARCHAR(3)`) to `database/prisma/schema.prisma`
- [x] T006 Create the migration `database/prisma/migrations/20261110000013_products_catalog_and_currency/migration.sql` with the three tables, the non-negative checks, the composite foreign keys, the case-insensitive unique indexes over `(organization_id, LOWER(sku))` / `(organization_id, LOWER(name))`, the search indexes, row-level security enabled with no policies, the service-role grants, the `currency_code` column with its `USD` default and the idempotent backfill of the default units of measure
- [x] T007 Apply the migration to the development database and regenerate the Prisma client (`npm run db:generate`, the `database/prisma/schema.prisma` model and the `database/prisma/migrations/20261110000013_products_catalog_and_currency/migration.sql` migration)
- [x] T008 [P] Extend `scripts/verify-db-invariants.mjs` so the products tables are covered by the row-level-security check and the anonymous-readable check, and the organization's currency is never empty
- [x] T009 [P] Expose the organization's currency read-only on the identity and current-organization answers in `backend/src/modules/auth/auth.service.ts` (the products module never writes the organizations table)
- [x] T010 [P] Confirm the RLS check covers the catalogue tables: `database/scripts/check-rls.ts` enumerates the tables the migrations create, and the new migration enables RLS on all three (no code change was needed)
**Checkpoint**: Foundation ready - user story implementation can now begin
---
## Phase 3: User Story 1 - Create and View a Product (Priority: P1) 🎯 MVP
**Goal**: A product can be created with its SKU, name, category, unit and prices, and read back - with the SKU unique per organization, the prices exact, and an audit entry written with the change.
**Independent Test**: Submit the New Product form with valid attributes, receive HTTP 201 with version 1, confirm the product is listed for that organization only, and open its detail screen.
## Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️
- [x] T011 [P] [US1] Failing integration test for product creation, the auto-assigned fields and the audit entry in `backend/test/integration/products.spec.ts`
- [x] T012 [P] [US1] Failing integration test for the case-insensitive SKU uniqueness (409 `DUPLICATE_RECORD` naming the existing product) in `backend/test/integration/products.spec.ts`
- [x] T013 [P] [US1] Failing integration test for the price rules (more than four decimals, a negative price, a price sent as a number) and the non-negative threshold in `backend/test/integration/products.spec.ts`
- [x] T014 [P] [US1] Failing integration test for the tenant isolation and the permission refusal of the create and read endpoints in `backend/test/integration/products.spec.ts`
## Implementation for User Story 1
- [x] T015 [P] [US1] Create `CreateProductDto` (sku, name, categoryId, unitId, purchasePrice, sellingPrice, lowStockThreshold) with the decimal-string and non-negative rules in `backend/src/modules/products/dto/create-product.dto.ts`
- [x] T016 [P] [US1] Create `ContactResponseDto`-shaped `ProductResponseDto` carrying the prices as decimal strings in `backend/src/modules/products/dto/product-response.dto.ts`
- [x] T017 [US1] Implement `ProductsService.create` with the trimmed SKU, the duplicate check that names the conflicting product, the audit entry in the same transaction and the version at 1 in `backend/src/modules/products/products.service.ts`
- [x] T018 [US1] Implement `ProductsService.findById` scoped to the organization in `backend/src/modules/products/products.service.ts`
- [x] T019 [US1] Implement the create and read endpoints with `@RequirePermission('products.write')` and `@RequirePermission('products.read')` in `backend/src/modules/products/products.controller.ts`
- [x] T020 [US1] Register `ProductsModule` and its service in `backend/src/modules/products/products.module.ts` and import it in `backend/src/app.module.ts`
**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently
---
## Phase 4: User Story 2 - Find Products in a Large Catalog (Priority: P2)
**Goal**: The catalogue can be searched by SKU and name, filtered by category and status, sorted and paged - all on the server, with the total count.
**Independent Test**: Populate products with varied SKUs, names, categories and statuses, then request the list with a search term (including `%` and `_`), a category filter, a status filter, a sort column and a page size, and verify the returned subset, the total and the page metadata.
## Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️
- [x] T021 [P] [US2] Failing integration test for the search over the SKU and the name with the wildcard characters escaped in `backend/test/integration/products.spec.ts`
- [x] T022 [P] [US2] Failing integration test for the category filter, the status filter and the default status (active when none is asked for) in `backend/test/integration/products.spec.ts`
- [x] T023 [P] [US2] Failing integration test for the sorting, the paging and the maximum page size in `backend/test/integration/products.spec.ts`
- [x] T024 [P] [US2] Failing integration test for the tenant isolation of the list endpoint in `backend/test/integration/products.spec.ts`
## Implementation for User Story 2
- [x] T025 [P] [US2] Create `ListProductsDto` with the search, category, status, page, pageSize and sort validation in `backend/src/modules/products/dto/list-products.dto.ts`
- [x] T026 [US2] Implement `ProductsService.list` with the escaped wildcards, the tenant scoping, the filters and the total count in `backend/src/modules/products/products.service.ts`
- [x] T027 [US2] Expose `GET /api/v1/products` protected by `@RequirePermission('products.read')` in `backend/src/modules/products/products.controller.ts`
**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently
---
## Phase 5: User Story 3 - Correct a Product Without Losing Someone Else's Work (Priority: P3)
**Goal**: A product can be corrected, the change increments the version, and a change prepared against a version that has moved on is refused.
**Independent Test**: Read a product, change it with the version that was read, see the version increase; then save again with the version that was read before and be refused.
## Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️
- [x] T028 [P] [US3] Failing integration test for the update, the version increment and the audit entry carrying the values before and after in `backend/test/integration/products.spec.ts`
- [x] T029 [P] [US3] Failing integration test for the stale version (409 `STALE_VERSION`, nothing written) in `backend/test/integration/products.spec.ts`
- [x] T030 [P] [US3] Failing integration test for the duplicate SKU on update (409 `DUPLICATE_RECORD` naming the other product) in `backend/test/integration/products.spec.ts`
- [x] T031 [P] [US3] Failing integration test for the tenant isolation and the permission refusal of the update endpoint in `backend/test/integration/products.spec.ts`
## Implementation for User Story 3
- [x] T032 [P] [US3] Create `UpdateContactDto`-shaped `UpdateProductDto` carrying the version and the same field rules as the creation in `backend/src/modules/products/dto/update-product.dto.ts`
- [x] T033 [US3] Implement `ProductsService.update` with the version check, the duplicate SKU check and the audit entry in the same transaction in `backend/src/modules/products/products.service.ts`
- [x] T034 [US3] Expose `PUT /api/v1/products/:id` protected by `@RequirePermission('products.write')` in `backend/src/modules/products/products.controller.ts`
**Checkpoint**: At this point, User Stories 1, 2 AND 3 should all work independently
---
## Phase 6: User Story 4 - Retire a Product Without Deleting It (Priority: P4)
**Goal**: A product can be archived and restored, never deleted, and an archive is refused while the product is in use.
**Independent Test**: Archive a product, see it leave the active list while remaining readable, restore it, and see it return; then make the usage check report it in use and be refused.
## Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️
- [x] T035 [P] [US4] Failing integration test for the archive, the restore and the round-trip with the audit entries in `backend/test/integration/products.spec.ts`
- [x] T036 [P] [US4] Failing integration test for the in-use refusal (409 `PRODUCT_IN_USE`, the product stays active) proven with a stubbed usage check in `backend/test/integration/products.spec.ts`
- [x] T037 [P] [US4] Failing integration test for the reserved SKU (an archived product's SKU cannot be taken) and for the proof that no product is ever deleted in `backend/test/integration/products.spec.ts`
- [x] T038 [P] [US4] Failing integration test for the tenant isolation and the permission refusal of the archive and restore endpoints in `backend/test/integration/products.spec.ts`
## Implementation for User Story 4
- [x] T039 [P] [US4] Create the `ProductsUsageHook` interface and the default provider that reports nothing in use in `backend/src/modules/products/products-usage.hook.ts`
- [x] T040 [US4] Implement `ProductsService.archive` and `ProductsService.restore` with the usage check, the audit entries and no delete path in `backend/src/modules/products/products.service.ts`
- [x] T041 [US4] Expose `POST /api/v1/products/:id/archive` and `POST /api/v1/products/:id/restore` protected by `@RequirePermission('products.write')` in `backend/src/modules/products/products.controller.ts`
**Checkpoint**: At this point, User Stories 1 through 4 should all work independently
---
## Phase 7: User Story 5 - Manage Categories and Units of Measure (Priority: P5)
**Goal**: Categories and units of measure are maintained per organization, unique without regard to capitalisation, and every organization starts with a usable default set.
**Independent Test**: List the categories and units an organization starts with, create a new category and a new unit, and see them offered in the product form.
## Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️
- [x] T042 [P] [US5] Failing integration test for listing and creating categories and units, including the case-insensitive uniqueness (409 naming the existing one) in `backend/test/integration/products.spec.ts`
- [x] T043 [P] [US5] Failing integration test for the default units of measure a new organization receives and the audit entries for a category and a unit creation in `backend/test/integration/products.spec.ts`
- [x] T044 [P] [US5] Failing integration test for the tenant isolation and the permission refusal of the category and unit endpoints in `backend/test/integration/products.spec.ts`
## Implementation for User Story 5
- [x] T045 [P] [US5] Create `CreateCategoryDto` and `CreateUnitDto` in `backend/src/modules/products/dto/create-category.dto.ts` and `backend/src/modules/products/dto/create-unit.dto.ts`
- [x] T046 [US5] Implement `ProductsService.listCategories`, `createCategory`, `listUnits` and `createUnit` with the case-insensitive uniqueness and the audit entries in `backend/src/modules/products/products.service.ts`
- [x] T047 [US5] Expose the four category and unit endpoints with `products.read` on the lists and `products.write` on the creations in `backend/src/modules/products/products.controller.ts`
- [x] T048 [US5] Create the default units of measure (unit, pair, roll, box) in the transaction that creates an organization in `backend/src/modules/auth/auth.service.ts`
**Checkpoint**: At this point, all five backend stories should work independently
---
## Phase 8: User Story 6 - Work in the Real Product Screens (Priority: P6)
**Goal**: The product screens read the real service, show the organization's products with no sample data, and offer only the actions the signed-in member may perform.
**Independent Test**: Open the product list, detail, new and edit screens against the running service and confirm the data is the organization's own, the sample-data banner is gone, and the write actions are absent for a member without the write permission.
## Tests for User Story 6 (MANDATORY - write first, observe failure) ⚠️
- [x] T049 [P] [US6] Failing unit test for the products client (the query it builds, the decimal strings it sends, the failure envelope it hands back) in `frontend/src/features/products/__tests__/products-client.spec.ts`
- [x] T050 [P] [US6] Failing unit test for the product form rules (a required field, a price with too many decimals, a negative price, a price sent as a number, the advisory duplicate-name notice) in `frontend/src/features/products/__tests__/product-form.spec.tsx`
- [x] T051 [P] [US6] Failing unit test for the permission gating (no write control without `products.write`) and for the archived badge in `frontend/src/features/products/__tests__/products-page.spec.tsx`
## Implementation for User Story 6
- [x] T052 [P] [US6] Create the real products client (the list, the single product, the create, the update, the archive, the restore, the categories and the units) in `frontend/src/services/products-client.ts`
- [x] T053 [P] [US6] Create the React Query hooks with the invalidation after every change in `frontend/src/features/products/use-products.ts`
- [x] T054 [US6] Update `frontend/src/features/products/products-page.tsx`: the server-side search, filters, sorting and paging, the visible status filter, the SKU beside the name, the archived badge, the empty state with "Show archived", and no `SampleDataBanner`
- [x] T055 [US6] Update `frontend/src/features/products/product-new-page.tsx`: the discrete address-free fields, the prices and the reorder level as decimal strings labelled "Reorder level (low-stock threshold)", the inline server errors with the reference identifier, the advisory duplicate-name notice, the inline category and unit creation, and the action hidden without `products.write`
- [x] T056 [US6] Update `frontend/src/features/products/product-edit-page.tsx`: the version pass-through, the stale-version reload prompt, the inline server errors and the action hidden without `products.write`
- [x] T057 [US6] Update `frontend/src/features/products/product-detail-page.tsx`: the SKU, the prices beside the organization's currency, no stock figure (the "Stock arrives with Inventory" note), and the archive and restore dialogs gated by `products.write`
- [x] T058 [US6] Delete the sample products and the sample service methods they used in `frontend/src/services/catalog-service.ts`, `frontend/src/services/sample-catalog-service.ts` and `frontend/src/mocks/sample-data.ts`
- [x] T059 [US6] Show the product references as plain text in the still-sample modules and keep them from calling the real products API in `frontend/src/features/sales/order-form.tsx`, `frontend/src/features/purchasing/order-form.tsx` and the invoicing screens
- [x] T060 [US6] Confirm the navigation entry and its permission: `frontend/src/components/shell/navigation.ts` already declares the products destination with `products.read` (no code change was needed)
**Checkpoint**: At this point, all six stories should work independently, and the product screens read only real data
---
## Phase 9: Polish & Cross-Cutting Concerns
**Purpose**: Improvements that affect multiple user stories
- [x] T061 [P] Regenerate the published contract and prove there is no drift (`npm run openapi:generate` and `npm run openapi:diff` in `backend/`)
- [x] T062 [P] Extend `scripts/verify-db-invariants.mjs` for the products tables and run it against both the isolated and the shared schema (`npm run verify:invariants:test` and `npm run verify:invariants`)
- [x] T063 [P] Prove the new migration passes the naming guard (`npm run check:naming`, the `database/scripts/check-naming-convention.ts` guard) and that the whole guard suite passes (`npm run check:guards`, the `scripts/` guards)
- [x] T064 [P] Tenant-isolation sweep across every products endpoint, report and export added in this feature (Principle I) in `backend/test/integration/products.spec.ts`
- [x] T065 [P] Concurrency and rollback regression run against real PostgreSQL (Principle III) in `backend/test/integration/products.spec.ts`
- [x] T066 [P] Accessibility and UX-rule review against PRD 7.3 and WCAG 2.1 AA in `frontend/src/features/products/products-page.tsx`, `frontend/src/features/products/product-new-page.tsx`, `frontend/src/features/products/product-edit-page.tsx` and `frontend/src/features/products/product-detail-page.tsx` (Principle VIII)
- [x] T067 Document the products endpoints and the organization's currency in `docs/api-auth-contract.md` and the products contract in `specs/008-products-end-to-end/contracts/products-api.md`
- [ ] T068 Run the full integration suite against the isolated schema and the full interface suite (`backend/test/integration/` and `frontend/src/features/products/__tests__/`), and prove the shared schema's row counts are unchanged with `scripts/snapshot-public-counts.mjs` (Task 0) - SKIPPED BY PRODUCT OWNER 2026-11-11: the isolated test schema is rebuilt from scratch on every suite invocation, and the hosted pooler's 15-session cap made the full sweep impractical. What WAS proven: the interface suite is 292/292 green; the products backend suite is 29/29 green standalone; in the partial capped runs audit-coverage 3 passed, audit-log 7 passed, auth 9 passed (one retry, then pass), boot-smoke 1 passed, change-password 4 passed; the remaining 14 suites were never run to completion. The public schema's row counts were identical before and after every run (users 6, organizations 6, audit_logs 40, contacts 1, products 0). A full 24-suite green run was NOT performed and is NOT claimed.
- [x] T069 Run `quickstart.md` validation end to end - walked in a browser 2026-11-11 against the isolated nexuserp_test schema via :3001/:5174: register, empty catalogue, inline category creation, create product (SKU-1001), duplicate-SKU refusal (sku-1001), advisory same-name notice with the save allowed (SKU-1002), price validation (five decimals / negative), edit with version increment (2 then 3), two-window stale-version refusal, archive/restore (version 4 then 5), literal percent-sign search, status+category filters, Sales-role member (products.read only) with no create/edit/archive/restore and kebab "View".
---
## Dependencies & Execution Order
## Phase Dependencies
- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion  - User stories can then proceed in parallel (if staffed)  - Or sequentially in priority order (P1 → P6)
- **Polish (Final Phase)**: Depends on all desired user stories being complete
## User Story Dependencies
- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Needs the usage hook (T039) and the product records from US1
- **User Story 5 (P5)**: Can start after Foundational (Phase 2) - Needs the categories and units for US1's create form, but is independently testable
- **User Story 6 (P6)**: Can start after Foundational (Phase 2) for the client and the hooks; the screens need US1-US5's endpoints
## Within Each User Story
- Tests MUST be written first and observed to FAIL before implementation (Principle V)
- DTOs before services, services before endpoints
- Core implementation before integration
- Story complete before moving to next priority
## Parallel Opportunities
- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- DTOs within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
---
## Parallel Example: User Story 1
```bash
# Launch all tests for User Story 1 together (tests are mandatory):
Task: "Failing integration test for product creation, the auto-assigned fields and the audit entry in backend/test/integration/products.spec.ts"
Task: "Failing integration test for the case-insensitive SKU uniqueness (409 DUPLICATE_RECORD naming the existing product) in backend/test/integration/products.spec.ts"
Task: "Failing integration test for the price rules (more than four decimals, a negative price, a price sent as a number) and the non-negative threshold in backend/test/integration/products.spec.ts"
Task: "Failing integration test for the tenant isolation and the permission refusal of the create and read endpoints in backend/test/integration/products.spec.ts"
# Launch all DTOs for User Story 1 together:
Task: "Create CreateProductDto (sku, name, categoryId, unitId, purchasePrice, sellingPrice, lowStockThreshold) with the decimal-string and non-negative rules in backend/src/modules/products/dto/create-product.dto.ts"
Task: "Create ContactResponseDto-shaped ProductResponseDto carrying the prices as decimal strings in backend/src/modules/products/dto/product-response.dto.ts"
```
---
## Implementation Strategy
## MVP First (User Story 1 Only)
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready
## Incremental Delivery
1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Add User Story 6 → Test independently → Deploy/Demo
8. Each story adds value without breaking previous stories
## Parallel Team Strategy
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
