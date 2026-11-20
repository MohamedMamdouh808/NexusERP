# Tasks: Organization Settings and Module Controls End to End

**Input**: Design documents from `specs/018-org-settings-modules/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/organizations.md`, `contracts/ui.md`, `quickstart.md`

**Tests**: Test tasks are MANDATORY for this project (Constitution Principle V). Every user story includes its tests, written and observed failing before implementation. Backend tests run against real PostgreSQL in the isolated `nexuserp_test` schema with the same API-role grants as `public`; no mocked persistence substitutes for critical-path tests.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps to the user story in `spec.md` (US1–US6)
- Every task names the exact file or command it touches

## Path Conventions

- Backend: `backend/src/`, `backend/test/`
- Frontend: `frontend/src/`, `frontend/scripts/`
- Shared contracts: `shared/src/`
- Database: `database/prisma/`
- Repository scripts: `scripts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared vocabulary and baselines all stories consume.

- [x] T001 Confirm `.specify/feature.json` selects `specs/018-org-settings-modules`, confirm `AGENTS.md` points at `specs/018-org-settings-modules/plan.md`, and record baseline public row counts by running `node scripts/snapshot-public-counts.mjs` (keep the output in working notes, never in the repository) (FR-048)
- [x] T002 [P] Add `CURRENCY_LOCKED`, `MODULE_DEPENDENCY` and `MODULE_IN_USE` to `ERROR_CODES`, `EMITTABLE_ERROR_CODES`, `ERROR_CODE_STATUS` (409 for all three) and `DEFAULT_ERROR_MESSAGES` in `shared/src/errors/index.ts` with user-safe messages (FR-009, FR-015, FR-016)
- [x] T003 [P] Add `organizations.updated` and `organizations.module_toggled` to `AUDIT_ACTIONS` in `shared/src/audit/index.ts`, then add their labels to `frontend/src/features/overview/activity-labels.ts` and the en/ar dashboard locales (`frontend/src/i18n/locales/en/dashboard.ts`, `frontend/src/i18n/locales/ar/dashboard.ts`) so the activity-label coverage test stays green (FR-007, FR-018)
- [x] T004 [P] Create `shared/src/modules/index.ts` with `MODULE_KEYS`, `SWITCHABLE_MODULE_KEYS` (`inventory`, `purchasing`, `sales`, `invoicing`, `reports`), `ALWAYS_ON_MODULE_KEYS` (`contacts`, `products`, `settings`, `audit`), `MODULE_DEPENDENCIES` (`sales→inventory`, `purchasing→inventory`, `invoicing→sales`), the reverse `MODULE_DEPENDENTS` helper and the `ModuleKey` type; export it from `shared/src/index.ts` (FR-013, FR-014)
- [x] T005 [P] Create `shared/src/currencies/index.ts` with `SUPPORTED_CURRENCIES` (`USD`, `EUR`, `GBP`, `EGP`, `SAR`, `AED`, `KWD`, `QAR`, `JOD`), `DEFAULT_CURRENCY = 'USD'` and the `CurrencyCode` type; export it from `shared/src/index.ts` (FR-004, FR-025)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared module enforcement and the session payload every story reads.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

### Tests for the Foundation (write first, observe failure)

- [x] T006 [P] Add a failing integration test in `backend/test/integration/auth-session.spec.ts` that registers an account and asserts `GET /api/v1/auth/me` returns `organization.currencyCode`, `organization.defaultPaymentTermsDays` and `organization.enabledModules` containing all five switchable keys; extend it with a two-org case proving each session carries only its own organization's values (FR-001, FR-027)
- [x] T007 [P] Add a failing frontend test in `frontend/src/services/__tests__/auth-session.spec.ts` that stubs `GET /auth/me` with `enabledModules: ['sales']` and asserts `bootstrapSession()` hydrates `useSession().organization.enabledModules` and `defaultPaymentTermsDays`; assert `frontend/src/test/session.ts` exports seeded defaults for the new fields (FR-027)
- [x] T008 [P] Add a failing unit test in `backend/src/common/guards/__tests__/module-guard.spec.ts` proving default deny when no module is declared, 403 `MODULE_DISABLED` with the module key in `details` when the row is disabled, allow when enabled, and one module-state query for two guarded reads inside the same request context (FR-020)

### Implementation

- [x] T009 Add `version Int @default(1)` and the `organizationModules OrganizationModule[]` relation to `model Organization`, and add `model OrganizationModule` with composite `@@id([organizationId, moduleKey])`, `@@map("organization_modules")`, snake_case column maps, `enabled`, `version`, `createdAt`, `updatedAt`, FK to `organizations(id)` and an `@@index([organizationId])` in `database/prisma/schema.prisma` (FR-012, FR-013)
- [x] T010 Create `database/prisma/migrations/20261119000001_organization_settings_modules/migration.sql` containing: (a) `organizations.version`; (b) `organization_modules` with a five-key `CHECK` constraint; (c) `ENABLE ROW LEVEL SECURITY` and a `DO` block asserting zero policies; (d) a backfill block fenced by `-- BACKFILL:organization_modules start/end` that inserts all five switchable modules enabled for every organization with `ON CONFLICT DO NOTHING`; (e) a schema-pinned `BEFORE UPDATE OF currency_code` trigger `organizations_currency_lock` that raises when any `sales_orders`, `purchase_orders` or `invoices` row exists for the organization in any status (FR-009, FR-010, FR-012, FR-026, FR-029)
- [x] T011 Run `npm run db:generate` and `npm run db:migrate`, then `npm run check:rls` and `npm run check:migrations`; confirm the migration applies cleanly and the generated Prisma client exposes `organizationModule` (FR-029)
- [x] T012 Add an internal per-request module-state cache to `backend/src/common/logging/request-context.ts` and implement `ModuleStateService` in `backend/src/modules/organizations/module-state.service.ts` with `getEnabledModules(organizationId)`, `getStates(organizationId)` and one database read per request; export the service from `backend/src/modules/organizations/organizations.module.ts` (FR-020)
- [x] T013 Implement the shared `ModuleGuard` and `@RequireModule(key)` decorator in `backend/src/common/guards/module.guard.ts` and `backend/src/common/guards/require-module.decorator.ts`; keep `PurchasingModule`, `SalesModule`, `InvoicingModule` and their metadata keys as thin aliases so existing controllers compile, make each existing guard delegate to the shared guard with its fixed key (FR-020, FR-021)
- [x] T014 Apply `@UseGuards(SessionGuard, ModuleGuard)` and `@RequireModule('inventory')` to every handler in `backend/src/modules/inventory/inventory.controller.ts`, and the same with `'reports'` in `backend/src/modules/reports/reports.controller.ts`; import `OrganizationsModule` into each controller's module so `ModuleStateService` resolves (FR-021)
- [x] T015 Extend `GET /auth/me` in `backend/src/modules/auth/auth.service.ts` to load the organization's module rows and return `organization.enabledModules` (enabled switchable keys, stable order) alongside the existing currency and payment terms; no new response fields outside `organization` (FR-027)
- [x] T016 Add `enabledModules: readonly string[]` to `SessionOrganization` in `frontend/src/services/auth-session.ts`, map it in `loadSignedInSession()`, and extend `frontend/src/test/session.ts` (all five enabled by default, overridable) and `frontend/src/features/overview/__tests__/dashboard-fixtures.ts` so existing tests keep compiling (FR-027)
- [x] T017 Implement `backend/src/modules/organizations/organization-lock.service.ts` with `lockOrganization(tx, organizationId)` (`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`), `assertModuleEnabled(tx, organizationId, key)` (fail closed on a missing row), `assertCurrencyMutable(tx, organizationId)` and `getEnabledModuleKeys(tx, organizationId)` (FR-010, FR-018)
- [x] T018 Acquire the organization row lock and assert the owning module is enabled at the start of every document-creation transaction: `backend/src/modules/purchasing/purchasing.service.ts` (create PO), `backend/src/modules/sales/sales.service.ts` (create SO and confirm/reserve), `backend/src/modules/invoicing/invoicing.service.ts` (create invoice) and `backend/src/modules/sales/sales.service.ts` (confirm — creates active reservations) (FR-011, FR-018, FR-020)

**Checkpoint**: Schema, backfill, shared guard, session payload and creation locks are in place; user stories can proceed.

---

## Phase 3: User Story 1 — Configure organization identity and defaults (Priority: P1) 🎯 MVP

**Goal**: Authoritative organization settings with permission enforcement, validation, optimistic locking, same-transaction audit and a currency lock.

**Independent Test**: Sign in as an administrator, read and change the name and payment terms, save, and confirm the top bar updates immediately with a success toast and an audit entry containing before/after values; a stale version offers a reload prompt; a currency change is refused after any document exists.

### Tests for User Story 1 (MANDATORY — write first, observe failure) ⚠️

- [x] T019 [P] [US1] Add `backend/test/integration/organization-settings.spec.ts` covering: GET returns name, currency, terms, version, `currencyLocked` and five modules to any active member; PUT requires `settings.manage` (403 for a member without it); every controller route declares `@Authenticated()` or `@RequirePermission('settings.manage')`; name boundaries (trim, 1, 100, blank, 101); currency boundaries (the nine codes, lowercase, wrong length); terms (0, 365, -1, 365.5); stale version 409 `STALE_VERSION` with no write; audit `organizations.updated` with before/after; an `AuditService.record` failure for that action rolls the settings change back; updating terms does not change an existing invoice's due date; and a two-organization case shows each admin only their own organization (FR-001–FR-008, FR-029)
- [x] T020 [P] [US1] Add `backend/test/integration/organization-currency-lock.spec.ts` covering: a currency change is refused with 409 `CURRENCY_LOCKED` once a sales order, purchase order or invoice exists in each status including cancelled and voided (fresh organization per case); the database trigger rejects a direct `UPDATE organizations SET currency_code` after a document exists; and `Promise.all` of a currency change plus the first document creation yields exactly one 2xx with DB state matching the winner (FR-009–FR-011)
- [x] T021 [P] [US1] Add `frontend/src/features/administration/__tests__/organization-settings-page.spec.tsx` covering: General card renders real values; inline validation for name/currency/terms; save spinner and disabled submit while pending; inline form error with `requestId`; `STALE_VERSION` shows the reload prompt; success toast and top-bar name update after `/auth/me` refresh; currency select read-only with "Locked once orders or invoices exist"; a member without `settings.manage` sees disabled controls and the statement "Access to this page is enforced by the server; hiding a control is not security." (FR-032–FR-035, FR-039)

### Implementation for User Story 1

- [x] T022 [US1] Create `backend/src/modules/organizations/dto/organization-settings.dto.ts` with Zod schemas for the settings update (trimmed name 1–100, `SUPPORTED_CURRENCIES`, integer terms 0–365, version >= 1) following the `ZodValidationPipe` pattern in `backend/src/modules/auth/dto/register.dto.ts` (FR-003–FR-006)
- [x] T023 [US1] Extend `backend/src/modules/organizations/organizations.service.ts` with `getCurrentSettings(organizationId)` and `updateSettings(organizationId, userId, input)`: read under `lockOrganization`, compare `version` (409 `STALE_VERSION`), check currency mutability (409 `CURRENCY_LOCKED`), conditionally update `(id, version)` incrementing version, and call `AuditService.record` with `organizations.updated` plus before/after inside the same `TransactionService.runInTransaction` (FR-001–FR-007, FR-009, FR-010)
- [x] T024 [US1] Create `backend/src/modules/organizations/organizations.controller.ts` with `GET /organizations/current` (`@Authenticated()`) and `PUT /organizations/current` (`@RequirePermission('settings.manage')`), both using `requireOrganizationId()`, `ZodValidationPipe` and the settings service; register the controller in `backend/src/modules/organizations/organizations.module.ts` and import `AuditModule` there (`TransactionService` is global via `PlatformModule`) (FR-001, FR-002, FR-029)
- [x] T025 [US1] Add `getOrganizationSettings` and `updateOrganizationSettings` to a new `frontend/src/services/organization-client.ts` using `requestJson`, mapping the shared error code, `details` and `requestId` into a typed failure the page can branch on (FR-034)
- [x] T026 [US1] Create `frontend/src/features/administration/use-organization-settings.ts` with `useOrganizationSettings()` and `useUpdateOrganizationSettings()`; on success invalidate `['organization']`, refresh the session in place with `bootstrapSession(true)`, and invalidate dashboard queries (FR-027, FR-035)
- [x] T027 [US1] Rewrite `frontend/src/features/administration/organization-page.tsx` into the two-card layout with a new `frontend/src/features/administration/general-card.tsx` (react-hook-form + shared Zod rules, spinner, inline errors, stale reload prompt, success toast, currency locked reason, version display, disabled controls plus the server-enforcement statement) and mount a read-only `frontend/src/features/administration/modules-card.tsx` placeholder fed by the settings response (FR-031–FR-035, FR-039)
- [x] T028 [US1] Add settings-page class styles to `frontend/src/styles/app.css` using existing tokens only (no raw colours, no new dependencies) and add all new copy to `frontend/src/i18n/locales/en/administration.ts` and `frontend/src/i18n/locales/ar/administration.ts` (FR-031–FR-035, FR-039)
- [x] T029 [US1] Remove the sample `useOrganization`, `useModules`, `useUpdateOrganization` and `useToggleModule` hooks plus their now-unused imports from `frontend/src/features/administration/use-administration.ts`, leaving the member, role and audit hooks untouched (FR-045)

**Checkpoint**: Settings work end to end; the Modules card is visible but read-only.

---

## Phase 4: User Story 2 — Control module availability safely (Priority: P1)

**Goal**: Per-organization module rows, dependency-aware toggles, open-document refusals with counts, audited stale-safe writes, and server-wide `MODULE_DISABLED` enforcement.

**Independent Test**: Turn off a module with no open documents or dependents, confirm every one of its endpoints returns 403 `MODULE_DISABLED` while its data survives, re-enable it and confirm access returns; then exercise each dependency and in-use refusal and confirm the named module and counts.

### Tests for User Story 2 (MANDATORY — write first, observe failure) ⚠️

- [x] T030 [P] [US2] Add `backend/test/integration/organization-modules.spec.ts` covering: any member can list modules; toggle requires `settings.manage`; dependency refusals in both directions with the responsible module named (sales→inventory, purchasing→inventory, invoicing→sales); `MODULE_IN_USE` counts per status (PO DRAFT/CONFIRMED/PARTIALLY_RECEIVED, SO DRAFT/CONFIRMED, invoice DRAFT/ISSUED/PARTIALLY_PAID, ACTIVE reservation) and exclusion of closed statuses; stale toggle 409 `STALE_VERSION`; audit `organizations.module_toggled` with before/after and rollback when the audit write fails; unknown or always-on key → 404; toggling never deletes data and re-enabling restores reads (FR-012–FR-019, FR-023, FR-029)
- [x] T031 [P] [US2] Add `backend/test/integration/organization-module-races.spec.ts` covering `Promise.all` races between a toggle-off and creation of the first document in each module (PO, SO, invoice, stock reservation): exactly one 2xx, the module state and document rows agree afterwards, and no state exists with the module disabled plus an open document created through the race (FR-018)
- [x] T032 [P] [US2] Add `backend/test/integration/module-guard-coverage.spec.ts` that reflects over every controller route of Inventory, Purchasing, Sales, Invoicing and Reports, asserts each handler declares its permission/authenticated marker and `@RequireModule`, then disables each module and calls every route with a placeholder UUID and no body, asserting 403 `MODULE_DISABLED` before validation; enabled modules never return `MODULE_DISABLED`, and a disabled Reports or Inventory module does not block Settings, Contacts or Products (FR-020–FR-022)
- [x] T033 [P] [US2] Add `frontend/src/features/administration/__tests__/modules-card.spec.tsx` covering: five switchable rows with switches, four always-on rows locked; ConfirmDialog before turning off; inline `MODULE_DEPENDENCY` naming the module; inline `MODULE_IN_USE` showing each count; stale reload prompt; success toast and session refresh; a member without `settings.manage` sees disabled switches with an explanation (FR-036–FR-039)

### Implementation for User Story 2

- [x] T034 [US2] Create `backend/src/modules/organizations/organization-modules.service.ts` with `listModules(organizationId)` (switchable rows plus implicit always-on entries), `toggleModule(organizationId, userId, key, input)` running under `lockOrganization`: version match, dependency checks from the shared map in both directions, in-use counts per FR-017, conditional version increment, and `AuditService.record` `organizations.module_toggled` in the same transaction; build `details` entries `{ module, requires? / requiredBy? }` and `{ module, document, count }` (FR-012–FR-019)
- [x] T035 [US2] Add `backend/src/modules/organizations/dto/toggle-module.dto.ts` (`enabled` boolean, `version` >= 1) and extend `backend/src/modules/organizations/organizations.controller.ts` with `GET /organizations/current/modules` (`@Authenticated()`) and `PUT /organizations/current/modules/:key` (`@RequirePermission('settings.manage')`, 404 for unknown/always-on keys) (FR-019, FR-029)
- [x] T036 [US2] Extend `frontend/src/services/organization-client.ts` with `getOrganizationModules` and `toggleOrganizationModule`, mapping `MODULE_DEPENDENCY`/`MODULE_IN_USE` `details` into typed structures (FR-037)
- [x] T037 [US2] Create `frontend/src/features/administration/use-organization-modules.ts` with list and toggle hooks; on success invalidate module/session/dashboard queries and refresh the session in place with `bootstrapSession(true)` (FR-027)
- [x] T038 [US2] Replace the read-only `frontend/src/features/administration/modules-card.tsx` with the functional card: table of switches, always-on locked rows, ConfirmDialog consequence text, inline dependency/in-use reasons and counts, stale reload prompt, permission-disabled explanation (FR-036–FR-039)
- [x] T039 [US2] Add modules-card styles to `frontend/src/styles/app.css` (tokens only) and new copy to the en/ar `administration` locale files (FR-036–FR-039)

**Checkpoint**: Module controls are authoritative end to end; US3 can drive the shell from the same session state.

---

## Phase 5: User Story 3 — The interface follows the enabled modules (Priority: P1)

**Goal**: Navigation, routing, Overview and Reports derive module availability from the session without modifying the static navigation list.

**Independent Test**: With a module disabled in the session, its sidebar entry reads "Turned off in Settings", its route redirects to Organization settings, its Overview widgets/quick actions are absent, and Reports hides its sections; re-enabling restores everything.

### Tests for User Story 3 (MANDATORY — write first, observe failure) ⚠️

- [x] T040 [P] [US3] Add `frontend/src/components/shell/__tests__/module-availability.spec.tsx` covering: a disabled module's sidebar entry is unavailable with `shell.sidebar.turnedOff`; enabled entries unchanged; direct requests to `/inventory`, `/purchasing`, `/sales`, `/invoicing` and `/reports` redirect to `/settings/organization` with the notice; the static `NAVIGATION` export and `frontend/src/components/shell/__tests__/navigation-master-file.spec.ts` remain unchanged and pass (FR-040–FR-042)
- [x] T041 [P] [US3] Add `frontend/src/features/overview/__tests__/dashboard-modules.spec.tsx` covering: disabled sales/purchasing/invoicing/inventory hide their KPI cards, chart segments, quick actions and dependent data requests while module-neutral widgets still render and load (FR-041)
- [x] T042 [P] [US3] Add `frontend/src/features/reports/__tests__/reports-modules.spec.tsx` covering: each section whose source module is disabled is hidden, module-neutral sections remain visible, and unaffected sections are unchanged (FR-041)

### Implementation for User Story 3

- [x] T043 [US3] Create `frontend/src/components/shell/module-availability.ts` with a path-prefix → module-key map for `/inventory`, `/purchasing`, `/sales`, `/invoicing`, `/reports` and helpers `isModuleEnabled(session, key)` / `moduleForPath(pathname)`; this is the only runtime mapping and it does not edit `navigation.ts` (FR-040, FR-042)
- [x] T044 [US3] Update `frontend/src/components/shell/sidebar.tsx` to read `useSession()` instead of `sampleCatalogService.listModules()`, render a disabled entry as unavailable with "Turned off in Settings", and leave `NAVIGATION` untouched (FR-040, FR-042)
- [x] T045 [US3] Update `frontend/src/components/shell/app-shell.tsx` to remove the sample modules query, derive `enabledModules` from the session, extend the redirect gate to `/reports`, and keep the existing notice state (FR-040)
- [x] T046 [US3] Update `frontend/src/features/overview/use-dashboard.ts` and `frontend/src/features/overview/dashboard-page.tsx` to hide module-dependent KPIs, chart series and quick actions and to skip their queries when the module is disabled (FR-041)
- [x] T047 [US3] Add a section → source-module registry (in `frontend/src/features/reports/reports-section-modules.ts`) and update `frontend/src/features/reports/reports-page.tsx` and the stock report pages to hide sections whose module is disabled while keeping module-neutral sections visible (FR-041)
- [x] T048 [US3] Add any new shell/overview/reports copy to `frontend/src/i18n/locales/en/` and `.../ar/` (parity enforced) and styles to `frontend/src/styles/app.css` using tokens only (FR-040, FR-041)

**Checkpoint**: The interface never offers a screen the server would refuse.

---

## Phase 6: User Story 4 — Register with the right organization identity and currency (Priority: P1)

**Goal**: Registration accepts optional name/currency, creates all module rows atomically, and the migration backfill is proven.

**Independent Test**: Register with no optional fields and confirm an email-derived name, USD and five enabled module rows; register with a valid name/currency and confirm both are stored; invalid optional values are refused without disclosing account existence; a pre-feature organization is backfilled.

### Tests for User Story 4 (MANDATORY — write first, observe failure) ⚠️

- [x] T049 [P] [US4] Add `backend/test/integration/registration-organization.spec.ts` covering: no optional fields → existing email-derived name, USD, five enabled rows; trimmed name 1–100 and each supported currency are stored; invalid name (blank/whitespace-only/101) and currency are refused; response shape and duplicate-account responses reveal nothing; and a backfill case that creates an organization row with no module rows, executes the migration's marked `-- BACKFILL:organization_modules` block read from `database/prisma/migrations/20261119000001_organization_settings_modules/migration.sql`, and asserts five enabled rows (FR-024–FR-026)
- [x] T050 [P] [US4] Extend `frontend/src/features/auth/__tests__/register-page.spec.tsx` with the optional organization-name field (trim, 1–100) and a currency selector defaulting to USD listing only the nine supported codes, including client validation and submitted payload (FR-043)

### Implementation for User Story 4

- [x] T051 [US4] Update `backend/src/modules/auth/dto/register.dto.ts`: `organizationName` optional, trimmed, 1–100 (replacing 2–128); add optional `currencyCode` from `SUPPORTED_CURRENCIES`, default `DEFAULT_CURRENCY`, schema remains `.strict()` (FR-025)
- [x] T052 [US4] Update `backend/src/modules/auth/auth.service.ts` `register()` to accept the currency, create the organization with the supplied name/currency/defaults, and `tx.organizationModule.createMany` for all five switchable modules enabled in the same transaction; update `backend/src/modules/auth/auth.controller.ts` to pass the DTO fields (FR-024, FR-025)
- [x] T053 [US4] Update `frontend/src/features/auth/register-page.tsx` (form state, validation, payload) and `frontend/src/services/auth-session.ts` `registerAndSignIn()` to accept and forward the optional currency; keep failure copy non-disclosing (FR-025, FR-043)
- [x] T054 [US4] Add the new registration copy and currency labels to the en/ar `auth` locale files and matching styles in `frontend/src/styles/app.css` using tokens only (FR-043)

**Checkpoint**: New and existing organizations always have complete module rows.

---

## Phase 7: User Story 5 — Trust that the interface shows real data (Priority: P1)

**Goal**: Delete every production sample-data path, keep gallery fixtures, and add a guard that fails on a sample/mock import.

**Independent Test**: No production file imports the sample service, banner or module configuration list; the gallery still renders its dev fixtures; a deliberately injected sample import makes the new guard fail; removing it makes the guard pass.

### Tests for User Story 5 (MANDATORY — write first, observe failure) ⚠️

- [x] T055 [P] [US5] Create `frontend/scripts/check-no-sample-imports.ts` exporting a pure `findViolations(files)` matcher for `sample-catalog-service`, `sample-data-banner`, `real-modules`, `sampleCatalogService`, `SampleDataBanner` and `src/mocks/` imports, with allowlists limited to `frontend/src/dev/gallery/**`, `frontend/src/test/**` and `**/__tests__/**`; add `frontend/scripts/__tests__/no-sample-imports.spec.ts` with passing real-tree cases and a failing fixture modeled on `frontend/scripts/__tests__/no-raw-design-values.spec.ts` (FR-045, FR-047)
- [x] T056 [P] [US5] Add a failing test in `frontend/src/dev/gallery/__tests__/gallery-fixtures.spec.ts` proving the gallery renders from its own `frontend/src/dev/gallery/fixtures.ts` after the sample service is gone (FR-046)

### Implementation for User Story 5

- [x] T057 [US5] Delete `frontend/src/services/sample-catalog-service.ts`, `frontend/src/components/ui/sample-data-banner.tsx`, `frontend/src/config/real-modules.ts` and their obsolete specs (`frontend/src/services/__tests__/catalog-service.spec.ts`, `frontend/src/components/ui/__tests__/sample-data-banner.spec.tsx`, `frontend/src/features/purchasing/__tests__/sample-isolation.spec.tsx`) (FR-045)
- [x] T058 [US5] Rewire the audit hooks in `frontend/src/features/administration/use-administration.ts` and `frontend/src/features/administration/audit-log-page.tsx` to `frontend/src/services/audit-client.ts` (`listAuditEntries`, mapping `AuditQuery` to `ListAuditEntriesParams`), and rewire `frontend/src/components/ui/document-trail.tsx` to the same client (FR-045)
- [x] T059 [US5] Rewire `frontend/src/components/ui/command-palette.tsx` to the real `frontend/src/services/sales-client.ts` list function and any other real clients it needs (FR-045)
- [x] T060 [US5] Replace the gallery's `sampleCatalogService` usage in `frontend/src/dev/gallery/gallery-route.tsx` with local fixtures in `frontend/src/dev/gallery/fixtures.ts` (failure/slow/empty toggles and sample record) (FR-046)
- [x] T061 [US5] Remove `SampleDataBanner` usages from `frontend/src/features/administration/audit-log-page.tsx`, `frontend/src/features/administration/organization-page.tsx` (if still present) and `frontend/src/components/ui/index.ts`; update `frontend/src/features/invoicing/__tests__/invoicing-page.spec.tsx` and `frontend/src/components/shell/__tests__/every-control.spec.tsx` to stop importing or counting the sample service (FR-045)
- [x] T062 [US5] Add `"check:no-sample-imports": "tsx scripts/check-no-sample-imports.ts"` to `frontend/package.json` and place it in the `build` chain before `tsc -b`; add a root `check:no-sample-imports` script and include it in `npm run check:guards`; then demonstrate the guard failing on a temporary production import, revert it, and confirm the clean tree passes (FR-047)

**Checkpoint**: Zero sample paths remain in production; the gallery and guard both work.

---

## Phase 8: User Story 6 — One currency across the product (Priority: P2)

**Goal**: Every figure uses the session organization currency, and session-derived values refresh in place after saves and toggles.

**Independent Test**: With an EUR organization, prices, totals and reports display EUR from the session with no hard-coded default; after a settings save or module toggle, the current tab updates currency/terms/modules without re-login or reload.

### Tests for User Story 6 (MANDATORY — write first, observe failure) ⚠️

- [x] T063 [P] [US6] Add `frontend/src/features/__tests__/currency-consistency.spec.tsx` that seeds an EUR session and renders the settings General card, Overview, Reports and an invoicing screen, asserting every formatted figure uses EUR from `useOrganizationCurrency()`; include a static assertion that production files outside the signed-out fallback do not contain a hard-coded `'USD'` currency default (FR-044)
- [x] T064 [P] [US6] Add `frontend/src/features/administration/__tests__/session-refresh.spec.tsx` proving that a successful settings save and a successful module toggle each refetch `/auth/me`, update the top bar/currency/module state in place, and never call `window.location.reload` or require re-login (FR-027)

### Implementation for User Story 6

- [x] T065 [US6] Replace remaining hard-coded currency defaults and sample codes in production files (at minimum the General card defaults and any `'USD'` fallbacks outside `frontend/src/lib/i18n-format.ts`) with `useOrganizationCurrency()`/`SUPPORTED_CURRENCIES`, keeping the signed-out fallback in one place only (FR-044)
- [x] T066 [US6] Ensure the save/toggle success paths in `frontend/src/features/administration/use-organization-settings.ts` and `use-organization-modules.ts` call the shared in-place session refresh and invalidate only the affected queries, so navigation, Overview and Reports re-render without a manual reload (FR-027)

**Checkpoint**: One currency source and immediate, in-place adaptation.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Invariants, contract, documentation and the full gate run.

- [x] T067 Extend `scripts/verify-db-invariants.mjs` after check 23 with: every organization has a row for all five switchable modules; no enabled module has a disabled requirement; and the `organizations_currency_lock` trigger/function exists and references the three document tables; update the header's invariant list and run both `npm run verify:invariants:test` and `npm run verify:invariants` (FR-028)
- [x] T068 Regenerate the contract: `npm run build --workspace @nexuserp/api`, `npm run openapi:generate`, commit the updated `backend/openapi.json`, and run `npm run openapi:diff` to prove zero drift (FR-030)
- [x] T069 Update `docs/api-rbac-contract.md` and any `README.md` endpoint list with `/organizations/current`, the module endpoints, the `/auth/me` additions and the module-guard rules; note the nine supported currencies and the currency-lock semantics (FR-030)
- [x] T070 [P] Review the two cards, switches, dialog, toast, inline errors and redirect notices against PRD 7.3 and WCAG 2.1 AA: labelled controls, keyboard operation, visible focus, non-colour-only refusals, and the server-enforcement statement (FR-039, Constitution VIII)
- [x] T071 [P] Run `specs/018-org-settings-modules/quickstart.md` end to end, including the manual administrator checks against a live API (`:3000`) and web app (`:5173`) (SC-002, SC-004, SC-005, SC-010)
- [x] T072 Run the full gate set and record results: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run verify:invariants:test`, `npm run verify:invariants`, `npm run openapi:diff`, `npm run build`, `npm run check:guards`, plus the CSS-class guard; compare `node scripts/snapshot-public-counts.mjs` before/after and confirm public row counts are unchanged (FR-048, SC-011, SC-012)
- [x] T073 Clean up code made dead by the removals: delete `frontend/src/components/__tests__/no-direct-sample-imports.spec.ts` (superseded by the repository-wide guard), remove unused sample-only types/comments from `frontend/src/services/catalog-service.ts`, and confirm no production file still mentions the sample service or sample banner (FR-045, FR-047)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks every user story.
- **US1 (Phase 3)**: depends on Foundational; delivers the settings MVP.
- **US2 (Phase 4)**: depends on Foundational; integrates with the US1 settings page but its backend is independent.
- **US3 (Phase 5)**: depends on Foundational (session module payload); its tests use seeded sessions, so it can run in parallel with US2.
- **US4 (Phase 6)**: depends on Foundational schema/migration only; can run in parallel with US1–US3.
- **US5 (Phase 7)**: depends on US1, US2 and US3 having removed the sample consumers they own (`organization-page`, `sidebar`, `app-shell`); the audit/command-palette rewiring is independent.
- **US6 (Phase 8)**: depends on US1 and US2 success paths; verifies the shared session behavior.
- **Polish (Phase 9)**: depends on all desired stories.

### Within Each Story

- Tests first; observe them failing before implementation.
- Validation/DTOs → service → controller → client/hooks → page → styles/copy.
- A story is complete only when its independent test passes and no earlier story regressed.

### Parallel Opportunities

- Setup: T002/T003/T004/T005 are different files.
- Foundational tests: T006/T007/T008.
- US1 tests: T019/T020/T021; US2 tests: T030/T031/T032/T033; US3 tests: T040/T041/T042; US4 tests: T049/T050; US5 tests: T055/T056; US6 tests: T066/T067.
- Backend and frontend work within a story can proceed in parallel once the DTO/service contract is fixed.
- US3, US4 and US5 can be staffed in parallel after Foundational, respecting US5's consumer-removal dependency on US1–US3.

---

## Parallel Example: User Story 2

```text
Task: "Add backend/test/integration/organization-modules.spec.ts ..."
Task: "Add backend/test/integration/organization-module-races.spec.ts ..."
Task: "Add backend/test/integration/module-guard-coverage.spec.ts ..."
Task: "Add frontend/src/features/administration/__tests__/modules-card.spec.tsx ..."
```

## Parallel Example: User Story 1

```text
Task: "Add backend/test/integration/organization-settings.spec.ts ..."
Task: "Add backend/test/integration/organization-currency-lock.spec.ts ..."
Task: "Add frontend/src/features/administration/__tests__/organization-settings-page.spec.tsx ..."
```

---

## Implementation Strategy

### MVP First (Setup + Foundation + US1)

1. Complete Setup and Foundational phases.
2. Complete US1 and validate the settings page and API independently.
3. Stop and demo: authoritative name, currency, terms, version, audit and currency lock.

### Incremental Delivery

1. Setup + Foundational → shared guard, schema and session ready.
2. US1 → settings MVP.
3. US2 → module controls and disabled-module enforcement.
4. US3 → interface adaptation.
5. US4 → registration/backfill completeness.
6. US5 → sample paths removed and guarded.
7. US6 → currency consistency and in-place refresh.
8. Polish → invariants, contract and full gates.

---

## Requirement Coverage Map

| Requirement | Tasks |
|-------------|-------|
| FR-001–FR-008 (settings, validation, version, audit, due dates) | T019, T022–T027 |
| FR-009–FR-011 (currency lock, trigger, race) | T010, T017–T020, T023 |
| FR-012–FR-019 (module rows, dependencies, in-use, toggle, audit, version) | T009, T010, T030, T031, T034, T035 |
| FR-020–FR-023 (shared guard, Inventory/Reports, declaration test, no deletion) | T008, T012–T014, T018, T030, T032, T038 |
| FR-024–FR-026 (registration rows/options, backfill) | T010, T049, T051–T053 |
| FR-027 (session payload and in-place refresh) | T006, T007, T015, T016, T026, T037, T066 |
| FR-028 (invariants) | T067 |
| FR-029 (permissions, 404, RLS, immutable migrations) | T010, T011, T019, T024, T030, T032, T035 |
| FR-030 (contract and docs) | T068, T069 |
| FR-031–FR-035 (page, General card, locked currency, save UX, top bar) | T021, T027, T028, T065 |
| FR-036–FR-039 (Modules card, reasons/counts, dialog, disabled controls) | T033, T038, T039, T070 |
| FR-040–FR-042 (shell, Overview/Reports, static navigation) | T040–T048 |
| FR-043–FR-044 (registration form, one currency) | T050, T053, T054, T063, T065 |
| FR-045–FR-047 (sample removal, gallery, guard) | T029, T055–T062, T073 |
| FR-048 (isolated schema, public counts) | T001, T072 |

---

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- Backend integration tests always use the isolated schema; never point a test at `public`.
- No new dependencies and no raw colour values; every new class uses existing design tokens.
- Migrations are immutable once merged; the new migration is created once in T010.
- Commit only when explicitly instructed.
