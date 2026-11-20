# Tasks: Inventory end to end — real stock for every organization

**Input**: Design documents from `/specs/010-inventory-end-to-end/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md (decisions D1–D11), data-model.md, contracts/inventory-api.md, contracts/idempotency.md, quickstart.md

**Branch**: `010-inventory-end-to-end` · **Created**: 2026-11-12

**Tests**: Mandatory for this project (Constitution Principle V). Every user story includes tests written FIRST and observed failing before implementation. The critical-path tests run against the real PostgreSQL instance in the isolated schema only; the public schema's row counts must be unchanged afterwards.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and delivered independently.

- **US2** (P1, MVP): read the organization's real stock balances
- **US1** (P1): post a stock adjustment and see the balance move
- **US3** (P1): read the immutable movement history
- **US4** (P2): manage warehouses
- **US5** (P1): the Inventory screens show real stock

US5 is P1 but comes last: it consumes every backend surface. Within the P1 group the read precedes the write so the adjustment can be verified through the balance it changed.

## Phase 1: Setup (shared infrastructure)

**Purpose**: the shared vocabulary and the database foundation every story depends on.

- [X] T001 [P] Add the permission definitions `inventory.read`, `inventory.write` and `inventory.adjust` to the shared catalog and to the role templates that grant them, in `shared/src/permissions/index.ts` (the catalog already lists `inventory` as a module); follow the rule that a permission is added only with the endpoint that enforces it.
- [X] T002 Extend the Prisma schema: `is_active` and `version` on `warehouses`, plus the new `StockBalance`, `StockMovement` and `IdempotencyKey` models with snake_case `@map` columns, composite organization keys and `version` columns, in `database/prisma/schema.prisma`.
- [X] T003 Migration (additive, never editing an existing one) extending `warehouses`: `is_active` default true, `version` integer not null default 1 with the existing rows backfilled to 1, the partial unique index making exactly one default per organization, and the unique index on `(organization_id, lower(name))` — in `database/prisma/migrations/<timestamp>_inventory_warehouses/migration.sql`.
- [X] T004 Migration creating `stock_balances` with the check constraints (`on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`), the numeric(14,3) columns, the composite foreign keys to `(organization_id, id)` on warehouses and products, the unique `(organization_id, warehouse_id, product_id)`, the version column and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_inventory_stock_balances/migration.sql`.
- [X] T005 Migration creating `stock_movements` with the type and reason checks, `quantity_delta <> 0`, the composite foreign keys, the source and user columns, the indexes and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_inventory_stock_movements/migration.sql`.
- [X] T006 Migration attaching the append-only triggers (reject UPDATE and DELETE) and revoking the truncate privilege on `stock_movements`, copying the audit-log mechanism — in `database/prisma/migrations/<timestamp>_stock_movements_append_only/migration.sql`.
- [X] T007 Migration creating `idempotency_keys` with the unique `(organization_id, endpoint, key)`, the request hash, response status and body, the expiry and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_idempotency_keys/migration.sql`.
- [X] T008 Migration creating the single low-stock view: non-archived products with a configured threshold, their threshold, their total available over active warehouses (zero when they have no balance rows) and their status (out of stock, low stock, in stock) — in `database/prisma/migrations/<timestamp>_inventory_low_stock_view/migration.sql`.

**Checkpoint**: the schema, its constraints and its protections exist; the migration history check passes.

---

## Phase 2: Foundational (blocking prerequisites for every story)

**Purpose**: the pieces all stories share — the idempotency layer, the module skeleton, the shared low-stock rule, the cross-module usage answer, and the interface's client seam.

- [X] T009 [P] Implement the idempotency service: the canonical request-body fingerprint (SHA-256 over an ordered body), the claim inside the caller's transaction, the replay of a stored response, the 422 on a different body, the 24-hour expiry and the opportunistic delete of an expired row — in `backend/src/platform/idempotency/idempotency.service.ts` and its unit test `backend/src/platform/idempotency/__tests__/idempotency.service.spec.ts` (research D1).
- [X] T010 [P] Add the purge script for expired idempotency records, runnable by hand and in CI, in `scripts/purge-expired-idempotency-keys.mjs` (research D11).
- [X] T011 [P] Add the inventory error codes and their mapping to the shared envelope: `INSUFFICIENT_STOCK`, `INACTIVE_WAREHOUSE`, `PRODUCT_ARCHIVED`, `PRODUCT_IN_USE`, `STALE_VERSION`, `IDEMPOTENCY_KEY_REUSED` — in `shared/src/errors/index.ts` and `backend/src/common/errors/all-exceptions.filter.ts` (follow the existing mapping pattern).
- [X] T012 Create the inventory module skeleton with its dependency wiring (transaction service, audit service, idempotency service) and register it in `backend/src/app.module.ts`: `backend/src/modules/inventory/inventory.module.ts`, `backend/src/modules/inventory/inventory.service.ts`.
- [X] T013 Implement the single low-stock rule accessor that every reader uses — one function that reads the low-stock view and returns the product set, the totals and the status — in `backend/src/modules/inventory/low-stock.rule.ts`, with its unit test in `backend/src/modules/inventory/__tests__/low-stock.rule.spec.ts` (research D3; it must never be reimplemented elsewhere).
- [X] T014 Implement the inventory-backed answer to the products usage seam: a provider that reports a product in use when it has any reserved quantity, exported by the inventory module and injected where the products module asks, in `backend/src/modules/inventory/products-usage.provider.ts` and wired in `backend/src/modules/products/products.module.ts` (research D7; the products module must keep only asking).
- [X] T015 [P] Change the interface's inventory types on the service seam to the real contract — warehouses without a code, with `isActive`/`isDefault`/`version`; balances and movements with exact decimal strings; the adjustment input carrying the signed quantity, reason, note and the expected version — in `frontend/src/services/catalog-service.ts`.
- [X] T016 [P] Create the real inventory API client behind the seam, with the shared request/retry/error mapping and the idempotency-key header, in `frontend/src/services/inventory-client.ts` (pattern: `frontend/src/services/products-client.ts`).

**Checkpoint**: foundation ready — every user story can now begin.

---

## Phase 3: User Story 2 — See the organization's real stock balances (Priority: P1) 🎯 MVP

**Goal**: `GET /inventory/stock-balances` returns the organization's balances with the two shapes, the filters, the stable sort and the labelled total.

**Independent Test**: With two warehouses and stock in one of them, request the list: rows carry on hand, reserved and available; the low-stock filter adds threshold-products that have no rows; the archived-with-stock filter lists archived products holding stock; the total states whether it counts rows or products; another organization's rows never appear.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

- [X] T017 [P] [US2] Integration test — the balances list returns the organization's rows with on hand, reserved and available, and a total that states its kind — in `backend/test/integration/inventory-balances.spec.ts`; observe it fail before implementation.
- [X] T018 [P] [US2] Integration test — the low-stock filter returns low-stock products with no balance rows as single rows with zero quantities, the count equals the filter's result, archived products never appear, and the archived-with-stock filter lists only archived products holding stock — in `backend/test/integration/inventory-balances.spec.ts`.
- [X] T019 [P] [US2] Integration test — search treats `%` and `_` literally, the warehouse filter and the page-size cap behave, and the date/order-independent sorting is stable — in `backend/test/integration/inventory-balances.spec.ts`.
- [X] T020 [P] [US2] Integration test — tenant isolation and permissions: another organization's balances are not listed, the endpoint requires `inventory.read` and refuses without it — in `backend/test/integration/inventory-balances.spec.ts`.

### Implementation for User Story 2 (depends on T017–T020 failing)

- [X] T021 [US2] Implement the balances query in `backend/src/modules/inventory/inventory.service.ts`: the balance rows, the product-level low-stock shape through the view, the archived-with-stock shape, the filters, the stable sort and the total's kind — reading the low-stock rule only through `low-stock.rule.ts`.
- [X] T022 [US2] Define the request DTOs (search, warehouse, low-stock-only, status, sort, page, pageSize capped at 100) and the response DTOs in `backend/src/modules/inventory/dto/list-stock-balances.dto.ts` and `backend/src/modules/inventory/dto/stock-balance-response.dto.ts`.
- [X] T023 [US2] Expose `GET /inventory/stock-balances` with `@RequirePermission('inventory.read')` and the OpenAPI annotations in `backend/src/modules/inventory/inventory.controller.ts`.
- [X] T024 [US2] Re-run the US2 integration tests green (`backend/test/integration/inventory-balances.spec.ts`).

**Checkpoint**: the balances endpoint is correct, isolated and permissioned.

---

## Phase 4: User Story 1 — Adjust stock and see the balance move (Priority: P1)

**Goal**: `POST /inventory/adjustments` posts a signed adjustment exactly once: it locks the balance, refuses an impossible result, writes the movement, updates the balance, writes the audit entry and stores the idempotency outcome — all in one transaction.

**Independent Test**: Post `+5.000` with reason *Found*: the balance grows by exactly 5, one movement with an `ADJ-00001` number exists, one audit entry records the before and after values; the same request again returns the original result with no second movement; a large negative is refused and the balance is unchanged.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

- [X] T025 [P] [US1] Integration test — a posted adjustment changes the balance by exactly the signed quantity, writes one movement with its document number and one audit entry with before/after values — in `backend/test/integration/inventory-adjustments.spec.ts`; observe it fail before implementation.
- [X] T026 [P] [US1] Integration test — the same key twice creates one movement and returns the same response; the same key with a different body is refused with 422 and creates nothing — in `backend/test/integration/inventory-adjustments.spec.ts`.
- [X] T027 [P] [US1] Integration test — two adjustments posted at the same moment on the same balance serialize, the final balance is correct, and stock never goes negative nor below reserved — in `backend/test/integration/inventory-adjustments.spec.ts`.
- [X] T028 [P] [US1] Integration test — a failed audit write or a failed movement insert leaves the balance unchanged (rollback), and a posted movement cannot be updated, deleted or truncated — in `backend/test/integration/inventory-adjustments.spec.ts`.
- [X] T029 [P] [US1] Integration test — refusals: a result below zero or below reserved is a conflict, a deactivated warehouse is refused, an archived product accepts only a decreasing write-off (an increase is refused), and an adjustment with reason *other* needs a note — in `backend/test/integration/inventory-adjustments.spec.ts`.
- [X] T030 [P] [US1] Integration test — tenant isolation and permissions: another organization's balance is not found, and the endpoint requires `inventory.adjust` — in `backend/test/integration/inventory-adjustments.spec.ts`.

### Implementation for User Story 1 (depends on T025–T030 failing)

- [X] T031 [US1] Implement the adjustment write in `backend/src/modules/inventory/inventory.service.ts`: the idempotency claim, the guarded balance upsert (insert-or-update with the zero/reserved guard evaluated by the database), the movement insert, the audit entry and the stored response — all in one transaction, with the document number allocated from the organization's sequence (`ADJ-` prefix, five digits).
- [X] T032 [US1] Define the adjustment request DTO (signed quantity as an exact decimal string, reason, note, warehouse, product) in `backend/src/modules/inventory/dto/create-adjustment.dto.ts`, and the response DTO (movement plus the new balance) in `backend/src/modules/inventory/dto/adjustment-response.dto.ts`.
- [X] T033 [US1] Expose `POST /inventory/adjustments` with `@RequirePermission('inventory.adjust')`, the required `Idempotency-Key` header and the OpenAPI annotations in `backend/src/modules/inventory/inventory.controller.ts`.
- [X] T034 [US1] Re-run the US1 integration tests green (`backend/test/integration/inventory-adjustments.spec.ts`).

**Checkpoint**: stock can be corrected, exactly once, with a full audit trail.

---

## Phase 5: User Story 3 — Explain every quantity change (Priority: P1)

**Goal**: `GET /inventory/stock-movements` returns the organization's ledger with product, warehouse, type and date-range filters, and always shows archived products' movements.

**Independent Test**: Post two movements, request the ledger: both appear with their type, signed quantity, reason, source and acting user; the filters narrow it; a range ending before it starts is refused; a movement of an archived product still appears, labelled.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

- [X] T035 [P] [US3] Integration test — the movements list returns the organization's movements with product, warehouse, type, signed quantity, reason, note, source and user, sortable and pageable — in `backend/test/integration/inventory-movements.spec.ts`; observe it fail before implementation.
- [X] T036 [P] [US3] Integration test — the product, warehouse, type and date-range filters narrow the list, a range whose end precedes its start is refused, archived products' movements always appear and are labelled — in `backend/test/integration/inventory-movements.spec.ts`.
- [X] T037 [P] [US3] Integration test — tenant isolation and permissions for the movements endpoint — in `backend/test/integration/inventory-movements.spec.ts`.

### Implementation for User Story 3 (depends on T035–T037 failing)

- [X] T038 [US3] Implement the movements query with its filters, sorting and paging in `backend/src/modules/inventory/inventory.service.ts`.
- [X] T039 [US3] Define the movements request and response DTOs in `backend/src/modules/inventory/dto/list-stock-movements.dto.ts` and `backend/src/modules/inventory/dto/stock-movement-response.dto.ts`.
- [X] T040 [US3] Expose `GET /inventory/stock-movements` with `@RequirePermission('inventory.read')` and the OpenAPI annotations in `backend/src/modules/inventory/inventory.controller.ts`.
- [X] T041 [US3] Re-run the US3 integration tests green (`backend/test/integration/inventory-movements.spec.ts`).

**Checkpoint**: every quantity change can be traced.

---

## Phase 6: User Story 4 — Manage warehouses (Priority: P2)

**Goal**: warehouses can be listed, created, renamed, deactivated and reactivated, with one default per organization and refusals that protect stock.

**Independent Test**: Create a second warehouse, rename it, deactivate it, reactivate it; a duplicate name (any case) is refused; the default cannot be deactivated; a warehouse holding stock cannot be deactivated; two administrators writing at once never lose a change.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

- [X] T042 [P] [US4] Integration test — create, rename, deactivate and reactivate a warehouse; a duplicate name in any letter case is refused; the organization keeps exactly one default — in `backend/test/integration/inventory-warehouses.spec.ts`; observe it fail before implementation.
- [X] T043 [P] [US4] Integration test — deactivating the default warehouse and deactivating one holding stock are both refused; two simultaneous updates with the same version let exactly one succeed and refuse the other with a stale-version conflict — in `backend/test/integration/inventory-warehouses.spec.ts`.
- [X] T044 [P] [US4] Integration test — tenant isolation and permissions for every warehouse endpoint (`inventory.read` on the list, `inventory.write` on the writes) — in `backend/test/integration/inventory-warehouses.spec.ts`.

### Implementation for User Story 4 (depends on T042–T044 failing)

- [X] T045 [US4] Implement the warehouse writes in `backend/src/modules/inventory/inventory.service.ts`: the trimmed, 1–100 character name with case-insensitive uniqueness, the versioned update, the atomic default demotion-and-promotion, and the deactivate/reactivate refusals.
- [X] T046 [US4] Define the warehouse request and response DTOs (name, isDefault, version, isActive) in `backend/src/modules/inventory/dto/warehouse.dto.ts`.
- [X] T047 [US4] Expose `GET/POST /warehouses`, `PUT /warehouses/:id`, `POST /warehouses/:id/deactivate` and `POST /warehouses/:id/reactivate` with their permissions and OpenAPI annotations in `backend/src/modules/inventory/inventory.controller.ts`.
- [X] T048 [US4] Re-run the US4 integration tests green (`backend/test/integration/inventory-warehouses.spec.ts`).

**Checkpoint**: warehouses are manageable and safe to change.

---

## Phase 7: User Story 5 — The Inventory screens show my organization's real stock (Priority: P1)

**Goal**: the four Inventory screens read and write the real service; the sample data and its banner are gone; the still-sample modules keep their private sample stock.

**Independent Test**: signed in to an organization with stock, the Stock balances, Movements and Warehouses screens show that organization's data with no sample banner; a posted adjustment appears at once in the balance and in the history; the still-sample modules are unaffected.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

- [X] T049 [P] [US5] Frontend test — the inventory data hooks call the real client and no longer the sample service, in `frontend/src/features/inventory/__tests__/use-inventory.spec.ts`; observe it fail before implementation.
- [X] T050 [P] [US5] Frontend test — the balances screen renders both row shapes, labels the total, shows the "products need attention" hint and the "archived products still hold stock" hint, and offers the archived-with-stock filter, in `frontend/src/features/inventory/__tests__/balances-tab.spec.tsx`.
- [X] T051 [P] [US5] Frontend test — the adjust dialog generates its idempotency key when it opens, reuses it on a retry, and shows a refusal inline with the request identifier, in `frontend/src/features/inventory/__tests__/adjust-stock-dialog.spec.tsx`.
- [X] T052 [P] [US5] Frontend test — the Warehouses screen has no Code column or field, and the still-sample modules keep their own sample stock, in `frontend/src/features/inventory/__tests__/warehouses-tab.spec.tsx` and `frontend/src/features/purchasing/__tests__/sample-isolation.spec.tsx`.

### Implementation for User Story 5 (depends on T049–T052 failing)

- [X] T053 [US5] Point the inventory data hooks at the real client and give them the real response shapes in `frontend/src/features/inventory/use-inventory.ts`; delete the inventory sample data from `frontend/src/services/sample-catalog-service.ts` and keep only the private sample stock the still-sample modules use.
- [X] T054 [US5] Update the balances screen to the real contract — both row shapes, the labelled total, the two hints, the archived-with-stock filter, the product-level status, and the adjust action that preselects the product and the default warehouse — in `frontend/src/features/inventory/balances-tab.tsx`.
- [X] T055 [US5] Update the movements screen to the real contract — filters, sorting, paging and the archived label — in `frontend/src/features/inventory/movements-tab.tsx`.
- [X] T056 [US5] Update the warehouses screen to the real contract — name only (no Code column or field), the default flag, the active state, the version conflict prompting a reload, and the stock and default refusals — in `frontend/src/features/inventory/warehouses-tab.tsx`.
- [X] T057 [US5] Rewrite the adjust-stock dialog against the real endpoint: the idempotency key generated on open and reused on retry, the reason list, the note required for *other*, the inline refusal with the request identifier, and the archived-product write-off path — in `frontend/src/features/inventory/balances-tab.tsx` (the dialog lives with the balances screen) and `frontend/src/features/inventory/use-inventory.ts`.
- [X] T058 [US5] Remove the sample-data banner from the Inventory screens and add the adjust-stock entry point for an archived product that still holds stock, in `frontend/src/features/inventory/inventory-page.tsx` and `frontend/src/features/products/product-detail-page.tsx`.
- [X] T059 [P] [US5] Add the new and changed interface strings to both locales — the archived labels, the two hints, the reason names, the status names, the conflicts — in `frontend/src/i18n/locales/en/inventory.ts` and `frontend/src/i18n/locales/ar/inventory.ts`, and register them in `frontend/src/i18n/locales/en/index.ts` and `frontend/src/i18n/locales/ar/index.ts`.
- [X] T060 [US5] Re-run the US5 frontend tests green (`frontend/src/features/inventory/__tests__/`) and the whole frontend suite (`frontend/src`).

**Checkpoint**: the Inventory screens show the organization's real stock and nothing sample.

---

## Phase 8: Polish & cross-cutting concerns

- [X] T061 [P] Extend the invariant script: on hand equals the sum of movements for every balance, reserved never exceeds on hand, and `stock_movements` refuses update, delete and truncate — in `scripts/verify-db-invariants.mjs`.
- [X] T062 [P] Regenerate the OpenAPI document with the inventory endpoints and make the drift check pass — in `backend/src/openapi/openapi-document.ts`, `backend/src/openapi/generate-openapi.ts`, and the regenerated artifact.
- [X] T063 [P] Write the canonical inventory contract document (`docs/api-inventory-contract.md`) from `specs/010-inventory-end-to-end/contracts/inventory-api.md` and `contracts/idempotency.md`, and reference the endpoints from `docs/PRD.md`.
- [X] T064 [P] Run the backend unit suite, the frontend suite, the lint, the type check and the build; nothing new may fail — in `backend/` and `frontend/`.
- [ ] T065 [P] Run the full integration suite against the isolated schema only and prove the public schema's row counts are unchanged — `node scripts/with-test-schema-env.mjs npm run test:integration --workspace @nexuserp/api` and `node scripts/snapshot-public-counts.mjs`.
- [ ] T066 Run the quickstart validation actually executed — the golden path, the double-click-once path, the four refusals, the low-stock visibility, the warehouse management and the isolation check — and record each result honestly in the final report (`specs/010-inventory-end-to-end/quickstart.md`).
- [ ] T067 Before hand-off: no debug artifacts, no skipped tests, no `.only`; the working tree holds only this feature's changes plus the earlier i18n workstream's; nothing is committed without the owner's instruction.

---

## Dependencies & execution order

- **Setup (Phase 1)**: no dependencies — can start immediately (T001–T008 parallel where the files differ).
- **Foundational (Phase 2)**: depends on Phase 1 (the tables and the columns exist before the code uses them) — blocks all user stories.
- **User Stories**: all depend on Phase 2; US2 → US1 → US3 → US4 → US5 is the build order (the read precedes the write so the write can be verified through it; US5 consumes every surface).
- **Polish**: depends on all desired stories being complete.

### User Story dependencies

- **US2 (P1)**: after Foundational — no dependency on other stories.
- **US1 (P1)**: after Foundational — independent of US2 (its own test asserts the balance through the database), but US2 makes the result visible in the product.
- **US3 (P1)**: after Foundational — independent; it reads the movements the adjustment writes.
- **US4 (P2)**: after Foundational — independent; the deactivation refusal reads the balances US1/US2 maintain.
- **US5 (P1)**: after US1–US4 — it consumes every endpoint.

### Within each user story

- Tests first, observed failing, then implementation, then re-run green.
- The migration (T003–T008) precedes the code that depends on it (T012+).
- The idempotency layer (T009) precedes the adjustment endpoint (T031–T033).

### Parallel opportunities

- All Setup tasks marked [P] can run in parallel (T001, T002, and the migrations after T002).
- All Foundational tasks marked [P] can run in parallel (T009, T010, T011, T015, T016).
- All tests for a story can run in parallel (T017–T020, T025–T030, T035–T037, T042–T044, T049–T052).
- The US5 screens (T054, T055, T056) touch different files and can run in parallel; the locale task (T059) is independent of them.
- The Polish tasks marked [P] can run in parallel after the stories.

---

## Parallel example: User Story 1

```bash
# Launch all US1 tests together (tests are mandatory):
Task: "Integration test — a posted adjustment changes the balance, writes one movement and one audit entry in backend/test/integration/inventory-adjustments.spec.ts"
Task: "Integration test — the same key twice creates one movement; a different body returns 422 in backend/test/integration/inventory-adjustments.spec.ts"
Task: "Integration test — two simultaneous adjustments serialize correctly in backend/test/integration/inventory-adjustments.spec.ts"
Task: "Integration test — rollback leaves no balance change; movements are immutable in backend/test/integration/inventory-adjustments.spec.ts"
```

---

## Implementation strategy

### MVP first (User Story 2)

1. Phase 1: Setup — permissions, schema, migrations.
2. Phase 2: Foundational — module skeleton, the single low-stock rule, the client seam.
3. Phase 3: US2 — the real balances read (the user's first question answered: "what do we actually hold?").
4. **STOP and VALIDATE**: the balances endpoint is correct, isolated and permissioned.
5. Add US1 (the correction path), then US3 (the history), then US4 (warehouses), then US5 (the screens) — each validated on its own.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. US2 → test → demo (real balances readable).
3. US1 → test → demo (stock correctable exactly once).
4. US3 → test → demo (every change explainable).
5. US4 → test → demo (warehouses manageable).
6. US5 → test → demo (the screens show real stock).

### Parallel team strategy

- Developer A: US2 (balances read) then US1 (adjustments write).
- Developer B: US3 (movements read) then US4 (warehouses).
- Developer C: US5 (the interface) once the endpoints land.
- The migrations, the permissions and the idempotency layer are the shared spine and land first.

---

## Notes

- [P] = different files, no dependency on incomplete tasks.
- [US#] = story traceability, required for story-phase tasks only.
- Tests are mandatory and must be observed failing first (Principle V).
- The still-sample modules (purchasing, sales, invoicing, overview) keep their private sample stock and are never wired to the real tables (spec FR-023).
- Migrations are additive and immutable: new ones only, existing ones never edited.
- No task may write another module's tables; the products archive check travels through the existing usage seam.
- No commit is implied by any task; commits happen only on explicit owner instruction via the optional git hooks.
