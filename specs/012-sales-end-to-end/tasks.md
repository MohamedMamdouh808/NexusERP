# Tasks: Sales end to end — real sales orders, reservations, and shipments

**Input**: Design documents from `/specs/012-sales-end-to-end/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md (decisions D1–D10), data-model.md, contracts/sales-api.md, quickstart.md

**Branch**: `012-sales-end-to-end` · **Created**: 2026-11-14

**Tests**: Mandatory for this project (Constitution Principle V). Every user story includes tests written FIRST and observed failing before implementation. The critical-path tests run against the real PostgreSQL instance in the isolated schema only; the public schema's row counts must be unchanged afterwards.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and delivered independently.

- **US1** (P1, MVP): create, confirm and cancel a sales order
- **US2** (P1): all-or-nothing stock reservation on confirm
- **US3** (P1): ship a confirmed sales order
- **US4** (P1): browse sales orders and shipments
- **US5** (P1): the Sales screens show real sales data
- **US6** (P1): protect records referenced by open orders

All six stories are P1. US1 is the MVP because nothing can be reserved or shipped without an order. US2 and US3 build on US1's confirm path. US4 consumes every backend surface. US5 consumes every backend surface through the UI. US6 is the integrity contract (usage guards) and comes last.

## Phase 1: Setup (shared infrastructure)

**Purpose**: the shared vocabulary and the database foundation every story depends on.

- [X] T001 [P] Add the sales error codes `INSUFFICIENT_STOCK` (409) and `ORDER_SHIPPED` (409) with their status mappings, default messages and entries in the emittable-code set, in `shared/src/errors/index.ts`; the codes `VALIDATION_ERROR`, `STALE_VERSION`, `INVALID_STATE_TRANSITION`, `CONTACT_IN_USE`, `PRODUCT_IN_USE`, `WAREHOUSE_IN_USE`, `PRODUCT_ARCHIVED`, `INACTIVE_WAREHOUSE` and `IDEMPOTENCY_KEY_REUSED` already exist.
- [X] T002 [P] Add the sales audit actions (`salesOrdersCreated`, `salesOrdersUpdated`, `salesOrdersConfirmed`, `salesOrdersCancelled`, `shipmentsPosted`) to the shared audit catalogue in `shared/src/audit/index.ts`.
- [X] T003 Extend the Prisma schema with the `SalesOrder`, `SalesOrderLine`, `StockReservation`, `Shipment` and `ShipmentLine` models — snake_case `@map` columns, `organization_id` on every table, composite unique keys `(organization_id, id)`, `quantity`/`unit_price`/`line_total` precisions per data-model.md — in `database/prisma/schema.prisma`.
- [X] T004 Migration (additive, never editing an existing one) creating `sales_orders`: the status check over the four API names, the `total >= 0` check, the `version` column, composite foreign keys to `(organization_id, id)` on contacts and warehouses, the unique `(organization_id, number)` and `(organization_id, id)`, indexes and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_sales_orders/migration.sql`.
- [X] T005 Migration creating `sales_order_lines`: `quantity > 0`, `unit_price >= 0`, `line_total >= 0`, composite foreign keys to the order and to `(organization_id, id)` on products, the unique `(organization_id, sales_order_id, product_id)` and `(organization_id, id)` — in `database/prisma/migrations/<timestamp>_sales_order_lines/migration.sql`.
- [X] T006 Migration creating `stock_reservations`: composite foreign keys to the order line, `(organization_id, id)` on warehouses and products, `quantity > 0`, status check in `ACTIVE`, `CONSUMED`, `RELEASED`, indexes — in `database/prisma/migrations/<timestamp>_stock_reservations/migration.sql`.
- [X] T007 Migration creating `shipments`: composite foreign key to the order, the unique `(organization_id, number)` and `(organization_id, id)`, the index on `(organization_id, shipped_at)`, append-only triggers rejecting UPDATE and DELETE, revoked `TRUNCATE` privilege and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_shipments/migration.sql`.
- [X] T008 Migration creating `shipment_lines`: composite foreign keys to the shipment and to `(organization_id, id)` on sales order lines and products, `quantity > 0`, the unique `(organization_id, shipment_id, sales_order_line_id)`, append-only triggers, revoked `TRUNCATE`, row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_shipment_lines/migration.sql`.
- [X] T009 [P] Implement the shared Sales module gate: one guard named for the module that currently allows every request and reads its own metadata key, so the Organization settings feature can enable the module-disabled check in one place — in `backend/src/common/guards/sales-module.guard.ts` (research D10).

**Checkpoint**: the schema, its constraints and its protections exist; the migration history, RLS and naming checks pass. (Note: the `document_sequences ("organizationId", name)` unique constraint already exists from the Purchasing feature; sales order and shipment sequence rows are created on first use, no new constraint migration needed.)

---

## Phase 2: Foundational (blocking prerequisites for every story)

**Purpose**: the pieces all stories share — the sales module skeleton, the usage answers, the number allocation, the Inventory shipment method, the forward-validation locks owned by the other modules, and the interface's client seam.

- [ ] T010 Create the sales module skeleton with its dependency wiring (transaction service, audit service, idempotency service) and register it in `backend/src/app.module.ts`: `backend/src/modules/sales/sales.module.ts`, `backend/src/modules/sales/sales.service.ts`.
- [ ] T011 [P] Implement the document-number allocation for both sales numbers: the per-organization advisory lock, the find-or-create of the sequence row, the increment and the six-digit format, inside the caller's transaction — in `backend/src/modules/sales/sales-number.ts` (research D2).
- [ ] T012 [P] Implement the Inventory service's shipment method: join the ambient transaction, re-check that the warehouse is active, perform the guarded balance decrease (on_hand and reserved), insert the `SHIPMENT` movement with `quantity_delta = -quantity`, source id and source number, and return the movement id and before/after on-hand strings — in `backend/src/modules/inventory/inventory.service.ts` with its unit test in `backend/src/modules/inventory/__tests__/inventory.service.spec.ts` (research D5; Sales must never write a movement or a balance itself).
- [X] T013 [P] Add the customer lock owned by Contacts: a method that takes the transaction client, takes a shared lock on the contact, and refuses an archived contact or one without the customer role — in `backend/src/modules/contacts/contacts.service.ts` (research D6).
- [X] T014 [P] Add the product lock owned by Products: a method that takes the transaction client, takes shared locks on the products in ascending product id, refuses archived products, and returns each product's summary **including its selling price** — in `backend/src/modules/products/products.service.ts` (research D6).
- [X] T015 [P] Add the warehouse lock owned by Inventory: a method that takes the transaction client, takes a shared lock on the warehouse and refuses an inactive one — in `backend/src/modules/inventory/inventory.service.ts` (research D6).
- [X] T016 [P] Create the real Sales API client behind the seam, with the shared request/error mapping, the `Idempotency-Key` header for confirm/cancel/ship and the version-carrying order writes — in `frontend/src/services/sales-client.ts` (pattern: `frontend/src/services/purchasing-client.ts`).
- [X] T017 [P] Change the interface's sales types on the service seam to the real contract — the order row, the shipment row without lines, the order and shipment lines carrying decimal-string prices and quantities, the version-carrying inputs — in `frontend/src/services/catalog-service.ts`.
- [X] T018 [P] Delete the Sales sample data and remove the SampleDataBanner from the Sales screens: delete `frontend/src/mocks/sample-products.ts` usage in sales, remove `SampleDataBanner moduleKey="sales"` from `frontend/src/features/sales/sales-page.tsx`, and point `frontend/src/features/sales/use-sales.ts` at the real Sales client instead of `sampleCatalogService`.

**Checkpoint**: foundation ready — every user story can now begin.

---

## Phase 3: User Story 1 — Create, confirm and cancel a sales order (Priority: P1) 🎯 MVP

**Goal**: `POST /sales-orders`, `PUT /sales-orders/:id`, `POST /sales-orders/:id/confirm` and `POST /sales-orders/:id/cancel` create and steer a draft with an `SO-` number, exact totals and versioned writes.

**Independent Test**: create a draft with one line, edit it, confirm it; create another and cancel it; a confirmed order refuses an edit, a stale version is refused with 409, an empty draft saves with a total of 0.00 and cannot be confirmed.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US1] Integration test — creating an order saves a DRAFT with an `SO-` number from the organization's sequence, the entered lines, the copied unit price and a server-calculated total; an order with no lines saves with a total of 0.00 — in `backend/test/integration/sales-orders.spec.ts`; observe it fail before implementation.
- [X] T020 [P] [US1] Integration test — the rounding vectors `3.333 × 1.2345 = 4.11`, `1.000 × 0.0050 = 0.01` and `2.500 × 4.5000 = 11.25`, and the order total equal to the sum of the rounded line totals — in `backend/test/integration/sales-orders.spec.ts`.
- [X] T021 [P] [US1] Integration test — editing a draft with the current version replaces the header and the lines and increments the version; the same edit with the old version is refused with 409 `STALE_VERSION` and changes nothing; a non-draft refuses the edit with 409 `INVALID_STATE_TRANSITION` — in `backend/test/integration/sales-orders.spec.ts`.
- [X] T022 [P] [US1] Integration test — confirming a draft with at least one line moves it to CONFIRMED and locks it; a draft with no lines cannot be confirmed; cancelling a DRAFT or a shipment-less CONFIRMED order moves it to CANCELLED; a SHIPPED order refuses both — in `backend/test/integration/sales-orders.spec.ts`.
- [X] T023 [P] [US1] Integration test — the content refusals: a duplicate product on one order, a zero or negative quantity, a unit price below zero, a quantity with more than three decimals, a unit price with more than four decimals, a customer that is not a customer or is archived, an archived product and an inactive warehouse — in `backend/test/integration/sales-orders.spec.ts`.
- [X] T024 [P] [US1] Integration test — the audit entries: create, update, confirm and cancel each write one entry with the before and after values in the same transaction, and a failed audit insert rolls the change back — in `backend/test/integration/sales-orders.spec.ts`.
- [X] T025 [P] [US1] Integration test — tenant isolation and permissions: another organization's order is not found on every endpoint, reads need `sales.read` and writes need `sales.write` — in `backend/test/integration/sales-orders.spec.ts`.

### Implementation for User Story 1 (depends on T019–T025 failing)

- [X] T026 [US1] Implement the order writes in `backend/src/modules/sales/sales.service.ts`: create (number allocation, the copied unit price defaulted from selling price, the per-line rounding, the total), update (DRAFT only, the version check), confirm (DRAFT only, at least one line) and cancel (DRAFT, or a shipment-less CONFIRMED) — every write versioned, audited and refused with the documented code.
- [X] T027 [US1] Implement the state machine and the refusal mapping in `backend/src/modules/sales/sales.service.ts`: 409 `INVALID_STATE_TRANSITION`, 409 `STALE_VERSION`, 409 `ORDER_SHIPPED`, 400 `VALIDATION_ERROR` — with the order row fetched under the lock so a stale version is distinguished from an invalid state (research D3).
- [X] T028 [US1] Define the request schemas and DTOs (the order body with its lines, the version-carrying confirm and cancel bodies, the decimal-string rules) in `backend/src/modules/sales/dto/create-sales-order.dto.ts`, `backend/src/modules/sales/dto/update-sales-order.dto.ts`, `backend/src/modules/sales/dto/sales-order-action.dto.ts`.
- [X] T029 [US1] Define the order response DTO (the order, its lines with quantity, unit price and line total, the total and the version) in `backend/src/modules/sales/dto/sales-order-response.dto.ts`.
- [X] T030 [US1] Expose `POST /sales-orders`, `PUT /sales-orders/:id`, `POST /sales-orders/:id/confirm` and `POST /sales-orders/:id/cancel` with their permissions, the module gate and the OpenAPI annotations in `backend/src/modules/sales/sales.controller.ts`.
- [X] T031 [US1] Re-run the US1 integration tests green (`backend/test/integration/sales-orders.spec.ts`).

**Checkpoint**: a sales order can be created, steered and closed with a full audit trail.

---

## Phase 4: User Story 2 — All-or-nothing stock reservation on confirm (Priority: P1)

**Goal**: Confirm reserves stock for every line or for none — locks balances in ascending product id, checks `on_hand - reserved` conditionally, and on any shortfall reserves nothing and returns 409 `INSUFFICIENT_STOCK` listing every short product.

**Independent Test**: with one SKU left in stock, create two DRAFT orders each for that SKU and confirm both at the same moment — exactly one confirms and reserves; the other is refused with 409 `INSUFFICIENT_STOCK` naming available and required quantities, and nothing is reserved for it; a confirm racing a cancellation has one consistent outcome.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T032 [P] [US2] Integration test — confirming a draft with enough stock for every line creates one ACTIVE reservation per line, increases reserved quantities and moves the order to CONFIRMED in one transaction — in `backend/test/integration/sales-confirm.spec.ts`; observe it fail before implementation.
- [ ] T033 [P] [US2] Integration test — confirming a draft where one line is short reserves nothing for any line (including lines with enough stock), leaves the order DRAFT, and returns 409 `INSUFFICIENT_STOCK` listing every short product with its available and required quantity — in `backend/test/integration/sales-confirm.spec.ts`.
- [ ] T034 [P] [US2] Integration test — concurrency: two simultaneous confirmations for the last units of one product let exactly one succeed; reserved never exceeds on-hand — in `backend/test/integration/sales-confirm.spec.ts`.
- [ ] T035 [P] [US2] Integration test — a confirm racing a cancellation of the same order has one consistent outcome: either CONFIRMED with reservations or CANCELLED with none; never a cancelled order holding reservations — in `backend/test/integration/sales-confirm.spec.ts`.
- [ ] T036 [P] [US2] Integration test — idempotency: the same confirm key with the same body returns the stored response and creates no second reservation, stock change, status change or audit entry; the same key with a different body is refused with 422 `IDEMPOTENCY_KEY_REUSED`; a missing key is refused with 400 `IDEMPOTENCY_KEY_REQUIRED` — in `backend/test/integration/sales-confirm.spec.ts`.
- [ ] T037 [P] [US2] Integration test — rollback: a failed reservation insert, balance update or audit write leaves no reservation, no reserved-quantity change, no status change and no audit entry — in `backend/test/integration/sales-confirm.spec.ts`.
- [ ] T038 [P] [US2] Integration test — tenant isolation and permissions: another organization's order confirm is not found, and the endpoint requires `sales.write` — in `backend/test/integration/sales-confirm.spec.ts`.

### Implementation for User Story 2 (depends on T032–T038 failing)

- [ ] T039 [US2] Extend the confirm write in `backend/src/modules/sales/sales.service.ts`: lock the order and the affected stock-balance rows in ascending product id order; check `on_hand - reserved` per line with a conditional update; all-or-nothing — on any shortfall return 409 `INSUFFICIENT_STOCK` listing every short product with available and required quantity; otherwise create one ACTIVE reservation per line, increase reserved, set CONFIRMED, write the audit entry and store the idempotency response — all in one transaction (research D2, D4, D8).
- [ ] T040 [US2] Re-run the US2 integration tests green (`backend/test/integration/sales-confirm.spec.ts`).

**Checkpoint**: confirmation reserves stock for every line or for none, exactly once under concurrency.

---

## Phase 5: User Story 3 — Ship a confirmed sales order (Priority: P1)

**Goal**: `POST /sales-orders/:id/shipments` posts a shipment exactly once: locks the order and balances, requires CONFIRMED with an active reservation for every line, creates the shipment and its lines, posts SHIPMENT movements through the Inventory service, decreases on-hand and reserved, marks reservations CONSUMED, sets SHIPPED, writes the audit entry and stores the idempotency outcome — all in one transaction.

**Independent Test**: confirm an order, then ship it — one `SH-` shipment with its lines exists, a SHIPMENT movement is posted per line, on-hand and reserved both decrease by the shipped quantities, every reservation is CONSUMED, the order is SHIPPED; repeating the ship request with the same key posts nothing new; on-hand never goes negative.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T041 [P] [US3] Integration test — shipping a CONFIRMED order with an active reservation for every line creates one shipment with an `SH-` number and its lines, posts one `SHIPMENT` movement per line through the Inventory service, decreases on-hand and reserved by the shipped quantities, marks every reservation CONSUMED and sets SHIPPED — in `backend/test/integration/sales-shipments.spec.ts`; observe it fail before implementation.
- [ ] T042 [P] [US3] Integration test — shipping a DRAFT, CANCELLED or already SHIPPED order is refused with 409 `INVALID_STATE_TRANSITION`; shipping a CONFIRMED order missing an active reservation for any line is refused; on-hand never goes negative and reserved never exceeds on-hand — in `backend/test/integration/sales-shipments.spec.ts`.
- [ ] T043 [P] [US3] Integration test — idempotency: the same ship key with the same body returns the stored response and creates no second shipment, line, movement, stock change, reservation change, status change or audit entry; the same key with a different body is refused with 422 `IDEMPOTENCY_KEY_REUSED`; a missing key is refused with 400 `IDEMPOTENCY_KEY_REQUIRED` — in `backend/test/integration/sales-shipments.spec.ts`.
- [ ] T044 [P] [US3] Integration test — a ship racing a cancellation of the same order has one consistent outcome: either SHIPPED with reservations consumed or CANCELLED with reservations released; never both — in `backend/test/integration/sales-shipments.spec.ts`.
- [ ] T045 [P] [US3] Integration test — rollback: a failed movement, balance update, reservation consumption or audit write leaves no shipment, no shipment line, no movement, no stock change, no reservation change, no status change and no audit entry — in `backend/test/integration/sales-shipments.spec.ts`.
- [ ] T046 [P] [US3] Integration test — immutability: a posted shipment and a posted shipment line refuse UPDATE, DELETE and TRUNCATE at the database level — in `backend/test/integration/sales-shipments.spec.ts`.
- [ ] T047 [P] [US3] Integration test — tenant isolation and permissions: another organization's shipment is not found, and the endpoint requires `inventory.ship` — in `backend/test/integration/sales-shipments.spec.ts`.

### Implementation for User Story 3 (depends on T041–T047 failing)

- [ ] T048 [US3] Implement the shipment posting in `backend/src/modules/sales/sales.service.ts`: the idempotency claim with endpoint `/sales-orders/:id/shipments`; require CONFIRMED with an active reservation for every line; create the shipment and its lines; post SHIPMENT movements through `InventoryService.postShipmentMovement`; decrease on-hand and reserved; mark reservations CONSUMED; set SHIPPED; write the audit entry; store the response — all in one transaction (research D4, D5, D8).
- [ ] T049 [US3] Define the shipment request DTO (empty body, whole order) and the response DTO (shipment with its number and date, the order with its number, status and version) in `backend/src/modules/sales/dto/ship-sales-order.dto.ts` and `backend/src/modules/sales/dto/shipment-response.dto.ts`.
- [ ] T050 [US3] Expose `POST /sales-orders/:id/shipments` with `@RequirePermission('inventory.ship')`, the required `Idempotency-Key` header, the module gate and the OpenAPI annotations in `backend/src/modules/sales/sales.controller.ts`.
- [ ] T051 [US3] Re-run the US3 integration tests green (`backend/test/integration/sales-shipments.spec.ts`).

**Checkpoint**: shipping deducts stock exactly once, consumes reservations and marks the order SHIPPED.

---

## Phase 6: User Story 4 — Browse sales orders and shipments (Priority: P1)

**Goal**: `GET /sales-orders`, `GET /sales-orders/:id`, `GET /shipments` and `GET /shipments/:id` return the organization's documents with search, status filter, sort, pagination capped at 100, whole-selection totals and a single-shipment detail carrying its lines.

**Independent Test**: with several orders and shipments, search an order by number and customer, filter by status, open an order detail with its shipment history, open the shipments tab filtered by a date range — every total counts the whole selection, and another organization's documents never appear.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T052 [P] [US4] Integration test — the order list returns server-paginated rows with number, customer, warehouse, status, order date and total, searchable by number or customer name, filterable by status, sortable and capped at pageSize 100, with a whole-selection total — in `backend/test/integration/sales-browse.spec.ts`; observe it fail before implementation.
- [ ] T053 [P] [US4] Integration test — the order detail returns its lines with product, quantity, unit price and line total, the total and its shipment history with each shipment's lines — in `backend/test/integration/sales-browse.spec.ts`.
- [ ] T054 [P] [US4] Integration test — the shipments list returns one row per shipment with number, order, customer, warehouse, shipped-at, user and line count, searchable by number/order/customer, filterable by a shipped-at date range (end before start refused with 400 `VALIDATION_ERROR`), paginated with a whole-selection total — in `backend/test/integration/sales-browse.spec.ts`.
- [ ] T055 [P] [US4] Integration test — the shipment detail returns its lines with product, order line and quantity; another organization's order or shipment is not found on every endpoint — in `backend/test/integration/sales-browse.spec.ts`.
- [ ] T056 [P] [US4] Integration test — tenant isolation and permissions: reads require `sales.read`, another organization's record returns 404 — in `backend/test/integration/sales-browse.spec.ts`.

### Implementation for User Story 4 (depends on T052–T056 failing)

- [ ] T057 [US4] Implement the paginated order list and detail, and the paginated shipments list and detail, in `backend/src/modules/sales/sales.service.ts` — every query scoped to the session tenant, server-computed totals, decimal strings, stable tie-break — in `backend/src/modules/sales/sales.service.ts`.
- [ ] T058 [US4] Expose `GET /sales-orders`, `GET /sales-orders/:id`, `GET /shipments` and `GET /shipments/:id` with `@RequirePermission('sales.read')`, the module gate and the OpenAPI annotations in `backend/src/modules/sales/sales.controller.ts` (research D1).
- [ ] T059 [US4] Re-run the US4 integration tests green (`backend/test/integration/sales-browse.spec.ts`).

**Checkpoint**: sales orders and shipments are browsable with server pagination and whole-selection totals.

---

## Phase 7: User Story 5 — The Sales screens show real sales data (Priority: P1)

**Goal**: the order list, create/edit form with the shared line items editor, detail page, Confirm/Ship/Cancel dialogs and Shipments tab read and write the real service; sample data deleted; pickers load real customers, products and warehouses; available-quantity advice beside each line; insufficient-stock refusal lists short products; idempotency keys generated on dialog open and reused on retry; "Create Invoice" disabled with "Arrives with Invoicing".

**Independent Test**: sign in to an organization with real contacts, products and warehouses; create, confirm and ship an order; see the real Inventory balance and movements decrease; confirm no sample-data banner appears anywhere in Sales.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T060 [P] [US5] Component test — no SampleDataBanner renders on any Sales screen and all Sales data comes from the real API client — in `frontend/src/features/sales/__tests__/sales-page.spec.tsx`; observe it fail before implementation.
- [ ] T061 [P] [US5] Component test — the customer picker offers only non-archived contacts with the customer role, the product picker only non-archived products, and the warehouse picker only active warehouses — in `frontend/src/features/sales/__tests__/order-form.spec.tsx`.
- [ ] T062 [P] [US5] Component test — choosing a product defaults the unit price to the product's selling price and leaves it editable; beside each line the real available quantity in the chosen warehouse is shown as advice only, and a quantity above it shows a warning without blocking draft save — in `frontend/src/features/sales/__tests__/order-form.spec.tsx`.
- [ ] T063 [P] [US5] Component test — a confirm refused with `INSUFFICIENT_STOCK` shows every short product with its available and required quantity — in `frontend/src/features/sales/__tests__/order-form.spec.tsx`.
- [ ] T064 [P] [US5] Component test — the Confirm/Ship/Cancel dialogs generate an idempotency key on open and reuse it on retry (double click acts once); after a definite success/failure a new key is generated; after an unknown outcome the same key is reused — in `frontend/src/features/sales/__tests__/order-form.spec.tsx`.
- [ ] T065 [P] [US5] Component test — the "Create Invoice" action on a shipped order is disabled with the reason "Arrives with Invoicing"; actions the member lacks are hidden/disabled using `GET /auth/me` permissions — in `frontend/src/features/sales/__tests__/sales-page.spec.tsx`.

### Implementation for User Story 5 (depends on T060–T065 failing)

- [ ] T066 [US5] Wire the order list to the real Sales client (search, status filter, sort, page) and delete its sample data — in `frontend/src/features/sales/orders-tab.tsx`.
- [ ] T067 [US5] Wire the create/edit form to the real Sales client with the shared line items editor, real pickers, available-quantity advice and insufficient-stock display — in `frontend/src/features/sales/order-form.tsx`, `frontend/src/features/sales/order-new-page.tsx`, `frontend/src/features/sales/order-edit-page.tsx`.
- [ ] T068 [US5] Wire the order detail to show lines and shipment history — in `frontend/src/features/sales/order-detail-page.tsx`.
- [ ] T069 [US5] Wire the Confirm/Ship/Cancel dialogs with idempotency-key generation and reuse — in `frontend/src/features/sales/order-detail-page.tsx`.
- [ ] T070 [US5] Wire the Shipments tab to the real client with search, date range and pagination — in `frontend/src/features/sales/shipments-tab.tsx`.
- [ ] T071 [US5] Disable "Create Invoice" with reason "Arrives with Invoicing" on shipped orders; hide/disable actions by `GET /auth/me` permissions — in `frontend/src/features/sales/order-detail-page.tsx` and `frontend/src/features/sales/sales-page.tsx`.
- [ ] T072 [US5] Re-run the US5 component tests green (`frontend/src/features/sales/__tests__/sales-page.spec.tsx`, `frontend/src/features/sales/__tests__/order-form.spec.tsx`).

**Checkpoint**: every Sales screen reads real data, shows no sample banner, and respects permissions.

---

## Phase 8: User Story 6 — Protect records referenced by open orders (Priority: P1)

**Goal**: archiving a customer or product, or deactivating a warehouse, referenced by a DRAFT or CONFIRMED sales order is refused with 409 `CONTACT_IN_USE`/`PRODUCT_IN_USE`/`WAREHOUSE_IN_USE` naming the blocking order; SHIPPED and CANCELLED orders are closed and do not block.

**Independent Test**: create a DRAFT order with a product, customer and warehouse; archive the product, archive the customer and deactivate the warehouse — each is refused with the documented conflict naming the blocking order; cancel the order and repeat — each action succeeds.

### Tests for User Story 6 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T073 [P] [US6] Integration test — archiving a customer on a DRAFT or CONFIRMED sales order is refused with 409 `CONTACT_IN_USE` naming the blocking order; the customer remains active — in `backend/test/integration/sales-usage.spec.ts`; observe it fail before implementation.
- [ ] T074 [P] [US6] Integration test — archiving a product on a DRAFT or CONFIRMED sales order is refused with 409 `PRODUCT_IN_USE` naming the blocking order; the product remains active — in `backend/test/integration/sales-usage.spec.ts`.
- [ ] T075 [P] [US6] Integration test — deactivating the shipping warehouse of a DRAFT or CONFIRMED sales order is refused with 409 `WAREHOUSE_IN_USE` naming the blocking order; the warehouse remains active — in `backend/test/integration/sales-usage.spec.ts`.
- [ ] T076 [P] [US6] Integration test — a customer, product or warehouse referenced only by SHIPPED or CANCELLED orders may be archived or deactivated (subject to existing stock/default rules) — in `backend/test/integration/sales-usage.spec.ts`.

### Implementation for User Story 6 (depends on T073–T076 failing)

- [ ] T077 [US6] Add the sales-usage answer to Contacts: refusing `contacts/archive` when an open (DRAFT/CONFIRMED) sales order names the customer, returning 409 `CONTACT_IN_USE` with the blocking order — in `backend/src/modules/contacts/contacts.service.ts` (research D6).
- [ ] T078 [US6] Add the sales-usage answer to Products: refusing `products/archive` when an open sales order names the product, returning 409 `PRODUCT_IN_USE` with the blocking order — in `backend/src/modules/products/products.service.ts` (research D6).
- [ ] T079 [US6] Add the sales-usage answer to Inventory/warehouses: refusing `warehouses/deactivate` when an open sales order names it as shipping warehouse, returning 409 `WAREHOUSE_IN_USE` with the blocking order — in `backend/src/modules/inventory/inventory.service.ts` (research D6).
- [ ] T080 [US6] Re-run the US6 integration tests green (`backend/test/integration/sales-usage.spec.ts`).

**Checkpoint**: open orders protect the customers, products and warehouses they reference.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: improvements and verifications that affect multiple user stories.

- [ ] T081 [P] Regenerate the OpenAPI contract from the implemented sales endpoints and run the contract-drift check (`npm run openapi:diff --workspace @nexuserp/api`) — canonical contract also recorded in `specs/012-sales-end-to-end/contracts/sales-api.md`.
- [ ] T082 [P] Extend `scripts/verify-db-invariants.mjs` with the sales invariants: reserved per balance equals the sum of its ACTIVE reservations; reserved never exceeds on-hand; an order's total equals the sum of its line totals; a CONFIRMED order has an ACTIVE reservation for every line; a SHIPPED order has CONSUMED reservations and matching SHIPMENT movements; shipments and shipment lines reject UPDATE, DELETE and TRUNCATE — run it green against both schemas.
- [ ] T083 [P] Run quickstart.md validation end-to-end: dev API on :3000, frontend on :5173, health check via the proxy, create/confirm/ship an order, watch real Inventory balances and movements change.
- [ ] T084 [P] Accessibility and UX-rule review of the Sales screens against PRD 7.3 and WCAG 2.1 AA (labeled fields, focus, keyboard, inline errors, request-identifier errors, named toasts, status badges).
- [ ] T085 [P] Tenant-isolation sweep across every sales endpoint added in this feature (Principle I).
- [ ] T086 [P] Concurrency, rollback and idempotency regression run against real PostgreSQL (Principle III).
- [ ] T087 Verify critical-path coverage is at least 80% in the CI report (Principle V).
- [ ] T088 Code cleanup and refactoring across the sales module and the Sales screens.

**Checkpoint**: every guard passes and the feature is release-ready.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–8)**: All depend on Foundational phase completion.
  - US1 has no dependencies on other stories.
  - US2 builds on US1's confirm path (reservation logic).
  - US3 builds on US1's confirm and US2's reservations (ship requires CONFIRMED with active reservations).
  - US4 builds on US1–US3 (lists orders and shipments).
  - US5 builds on US1–US4 (UI consumes every backend surface).
  - US6 builds on US1–US3 (usage guards reference open orders).
- **Polish (Phase 9)**: Depends on all user stories being complete.

### User Story Completion Order (recommended)

1. **US1** (create, confirm, cancel) — MVP, nothing can be reserved or shipped without an order.
2. **US2** (all-or-nothing reservation) — extends US1's confirm with stock reservation.
3. **US3** (ship) — requires confirmed orders with active reservations.
4. **US4** (browse) — reads orders and shipments.
5. **US5** (real screens) — consumes every backend surface through the UI.
6. **US6** (protect records) — usage guards reference open orders.

Within each user story: tests first (write and observe failure), then models/services, then endpoints, then integration; story complete before moving to the next priority.

### Parallel Opportunities

- All Setup tasks marked [P] in Phase 1 can run in parallel.
- All Foundational tasks marked [P] in Phase 2 can run in parallel (within Phase 2).
- Once Foundational completes, all user stories can start in parallel (if staffed).
- All tests for a user story marked [P] can run in parallel.
- Models within a story marked [P] can run in parallel.
- Different user stories can be worked on in parallel by different team members.

### Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (tests are mandatory):
Task: "Integration test — creating an order saves a DRAFT ... in backend/test/integration/sales-orders.spec.ts"
Task: "Integration test — the rounding vectors ... in backend/test/integration/sales-orders.spec.ts"
Task: "Integration test — editing a draft ... in backend/test/integration/sales-orders.spec.ts"

# Launch all models/DTOs for User Story 1 together:
Task: "Implement the order writes in backend/src/modules/sales/sales.service.ts"
Task: "Define the request schemas and DTOs ... in backend/src/modules/sales/dto/*.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: test User Story 1 independently.
5. Deploy/demo if ready.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready.
2. Add User Story 1 → test independently → deploy/demo (MVP!).
3. Add User Story 2 → test independently → deploy/demo.
4. Add User Story 3 → test independently → deploy/demo.
5. Add User Story 4 → test independently → deploy/demo.
6. Add User Story 5 → test independently → deploy/demo.
7. Add User Story 6 → test independently → deploy/demo.
8. Each story adds value without breaking previous stories.

### Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to a specific user story for traceability (US1–US6).
- Each user story should be independently completable and testable.
- Verify tests fail before implementing.
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.












