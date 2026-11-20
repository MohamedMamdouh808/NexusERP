# Tasks: Purchasing end to end — real purchase orders and goods receipts

**Input**: Design documents from `/specs/011-purchasing-end-to-end/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md (decisions D1–D18), data-model.md, contracts/purchasing-api.md, contracts/idempotency.md, quickstart.md

**Branch**: `010-inventory-end-to-end` · **Created**: 2026-11-13

**Tests**: Mandatory for this project (Constitution Principle V). Every user story includes tests written FIRST and observed failing before implementation. The critical-path tests run against the real PostgreSQL instance in the isolated schema only; the public schema's row counts must be unchanged afterwards.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and delivered independently.

- **US1** (P1, MVP): create, confirm and cancel a purchase order
- **US2** (P1): receive goods partially and in full
- **US3** (P1): browse purchase orders and goods receipts
- **US5** (P1): protect records referenced by open orders
- **US4** (P1): the Purchasing screens show real purchasing data

All five stories are P1. US1 is the MVP because nothing can be received without an order. US4 comes last because it consumes every backend surface.

## Phase 1: Setup (shared infrastructure)

**Purpose**: the shared vocabulary and the database foundation every story depends on.

- [X] T001 [P] Add the error code `ORDER_HAS_RECEIPTS` (409) with its status mapping, its default message and its entry in the emittable-code set, in `shared/src/errors/index.ts`; the codes `VALIDATION_ERROR`, `OVER_RECEIPT`, `STALE_VERSION`, `INVALID_STATE_TRANSITION`, `PRODUCT_IN_USE`, `CONTACT_IN_USE`, `WAREHOUSE_IN_USE`, `INACTIVE_WAREHOUSE` and `PRODUCT_ARCHIVED` already exist.
- [X] T002 [P] Add the purchasing audit actions (`purchaseOrdersCreated`, `purchaseOrdersUpdated`, `purchaseOrdersConfirmed`, `purchaseOrdersCancelled`, `goodsReceiptsPosted`) to the shared audit catalogue in `shared/src/audit/index.ts`.
- [X] T003 Extend the Prisma schema with the `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt` and `GoodsReceiptLine` models — snake_case `@map` columns, `organization_id` on every table, composite unique keys `(organization_id, id)`, the `unit_of_measure` abbreviation on both line tables, and the `unique (organization_id, name)` constraint on `document_sequences` — in `database/prisma/schema.prisma` (data-model.md).
- [X] T004 Migration (additive, never editing an existing one) creating `purchase_orders`: the status check over the five API names, the `expected_date >= order_date` check, the `total >= 0` check, the `version` column, the composite foreign keys to `(organization_id, id)` on contacts and warehouses, the unique `(organization_id, number)` and `(organization_id, id)`, the indexes and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_purchasing_orders/migration.sql`.
- [X] T005 Migration creating `purchase_order_lines`: `quantity_ordered > 0`, `0 <= quantity_received <= quantity_ordered`, `unit_cost >= 0`, `line_total = round(quantity_ordered * unit_cost, 2)`, the non-empty `unit_of_measure`, the composite foreign keys to the order and to `(organization_id, id)` on products, the unique `(organization_id, purchase_order_id, product_id)` and `(organization_id, id)` — in `database/prisma/migrations/<timestamp>_purchasing_order_lines/migration.sql`.
- [X] T006 Migration creating `goods_receipts` with its composite foreign key to the order, the unique `(organization_id, number)` and `(organization_id, id)`, the index on `(organization_id, received_at)`, the append-only triggers rejecting UPDATE and DELETE, the revoked `TRUNCATE` privilege and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_goods_receipts/migration.sql`.
- [X] T007 Migration creating `goods_receipt_lines` with the composite foreign keys to the receipt and to `(organization_id, id)` on purchase order lines and products, the copied `unit_cost` and `unit_of_measure`, the unique `(organization_id, goods_receipt_id, purchase_order_line_id)`, the append-only triggers, the revoked `TRUNCATE` and row-level security enabled with no policies — in `database/prisma/migrations/<timestamp>_goods_receipt_lines/migration.sql`.
- [X] T008 Migration adding the unique constraint `document_sequences (organization_id, name)` so two concurrent first-uses cannot create two sequence rows; no sequence row is backfilled, because the rows are created on first use — in `database/prisma/migrations/<timestamp>_document_sequences_unique_name/migration.sql`.
- [X] T009 [P] Implement the shared Purchasing module gate: one guard named for the module that currently allows every request and that reads its own metadata key, so the Organization settings feature can enable the module-disabled check in one place — in `backend/src/common/guards/purchasing-module.guard.ts` (research D15).

**Checkpoint**: the schema, its constraints and its protections exist; the migration history, RLS and naming checks pass.

---

## Phase 2: Foundational (blocking prerequisites for every story)

**Purpose**: the pieces all stories share — the purchasing module skeleton, the usage answers, the number allocation, the Inventory receipt method, the forward-validation locks owned by the other modules, and the interface's client seam.

- [X] T010 Create the purchasing module skeleton with its dependency wiring (transaction service, audit service, idempotency service) and register it in `backend/src/app.module.ts`: `backend/src/modules/purchasing/purchasing.module.ts`, `backend/src/modules/purchasing/purchasing.service.ts`.
- [X] T011 [P] Implement the purchasing usage answers — the oldest open order (DRAFT, CONFIRMED or PARTIALLY_RECEIVED) that names a product, a supplier or a warehouse — in a dependency-light module that reads only purchasing tables: `backend/src/modules/purchasing/purchasing-usage.service.ts`, `backend/src/modules/purchasing/purchasing-usage.module.ts` (research D4; it exists so Inventory and Contacts can ask without a module cycle).
- [X] T012 [P] Implement the document-number allocation for both purchasing numbers: the per-organization advisory lock, the find-or-create of the sequence row, the increment and the six-digit format, inside the caller's transaction — in `backend/src/modules/purchasing/purchasing-number.ts` (research D1 and D16).
- [X] T013 [P] Implement the Inventory service's receipt method: join the ambient transaction, re-check that the warehouse is active, perform the guarded balance increase, insert the `RECEIPT` movement with its source id and number, and return the movement id and the before/after on-hand strings — in `backend/src/modules/inventory/inventory.service.ts` with its unit test in `backend/src/modules/inventory/__tests__/inventory.service.spec.ts` (research D8; Purchasing must never write a movement or a balance itself).
- [X] T014 [P] Add the supplier lock owned by Contacts: a method that takes the transaction client, takes a shared lock on the contact, and refuses an archived contact or one without the supplier role — in `backend/src/modules/contacts/contacts.service.ts` (research D5).
- [X] T015 [P] Add the product lock owned by Products: a method that takes the transaction client, takes shared locks on the products in ascending product id, refuses archived products, and returns each product's summary **including its unit-of-measure abbreviation** — in `backend/src/modules/products/products.service.ts` (research D5 and D14).
- [X] T016 [P] Add the warehouse lock owned by Inventory: a method that takes the transaction client, takes a shared lock on the warehouse and refuses an inactive one — in `backend/src/modules/inventory/inventory.service.ts` (research D5).
- [X] T017 [P] Create the real purchasing API client behind the seam, with the shared request/error mapping, the `Idempotency-Key` header for the receipt and the version-carrying order writes — in `frontend/src/services/purchasing-client.ts` (pattern: `frontend/src/services/inventory-client.ts`).
- [X] T018 [P] Change the interface's purchasing types on the service seam to the real contract — the order row with its progress summary, the receipt row without lines, the order and receipt lines carrying `unitOfMeasure`, the version-carrying inputs — in `frontend/src/services/catalog-service.ts`.

**Checkpoint**: foundation ready — every user story can now begin.

---

## Phase 3: User Story 1 — Create, confirm and cancel a purchase order (Priority: P1) 🎯 MVP

**Goal**: `POST /purchase-orders`, `PUT /purchase-orders/:id`, `POST /purchase-orders/:id/confirm` and `POST /purchase-orders/:id/cancel` create and steer a draft with a `PO-` number, exact totals and versioned writes.

**Independent Test**: create a draft with one line, edit it, confirm it; create another and cancel it; a confirmed order refuses an edit, a stale version is refused with 409, an empty draft saves with a total of 0.00 and cannot be confirmed.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

- [X] T019 [P] [US1] Integration test — creating an order saves a DRAFT with a `PO-` number from the organization's sequence, the entered lines, the captured unit of measure and a server-calculated total; an order with no lines saves with a total of 0.00 — in `backend/test/integration/purchasing-orders.spec.ts`; observe it fail before implementation.
- [X] T020 [P] [US1] Integration test — the rounding vectors `3.333 × 1.2345 = 4.11`, `1.000 × 0.0050 = 0.01` and `2.500 × 4.5000 = 11.25`, and the order total equal to the sum of the rounded line totals — in `backend/test/integration/purchasing-orders.spec.ts`.
- [X] T021 [P] [US1] Integration test — editing a draft with the current version replaces the header and the lines and increments the version; the same edit with the old version is refused with 409 `STALE_VERSION` and changes nothing; a non-draft refuses the edit with 409 `INVALID_STATE_TRANSITION` — in `backend/test/integration/purchasing-orders.spec.ts`.
- [X] T022 [P] [US1] Integration test — confirming a draft with at least one line moves it to CONFIRMED and locks it; a draft with no lines cannot be confirmed; cancelling a DRAFT or a receipt-less CONFIRMED order moves it to CANCELLED; a RECEIVED order refuses both — in `backend/test/integration/purchasing-orders.spec.ts`.
- [X] T023 [P] [US1] Integration test — the content refusals: a duplicate product on one order, an expected date before the order date, a zero or negative quantity, a unit cost below zero, a quantity with more than three decimals, a unit cost with more than four decimals, a supplier that is not a supplier or is archived, an archived product and an inactive warehouse — in `backend/test/integration/purchasing-orders.spec.ts`.
- [X] T024 [P] [US1] Integration test — the audit entries: create, update, confirm and cancel each write one entry with the before and after values in the same transaction, and a failed audit insert rolls the change back — in `backend/test/integration/purchasing-orders.spec.ts`.
- [X] T025 [P] [US1] Integration test — tenant isolation and permissions: another organization's order is not found on every endpoint, reads need `purchasing.read` and writes need `purchasing.write` — in `backend/test/integration/purchasing-orders.spec.ts`.

### Implementation for User Story 1 (depends on T019–T025 failing)

- [X] T026 [US1] Implement the order writes in `backend/src/modules/purchasing/purchasing.service.ts`: create (number allocation, the captured unit of measure, the per-line rounding, the total), update (DRAFT only, the version check), confirm (DRAFT only, at least one line) and cancel (DRAFT, or a receipt-less CONFIRMED) — every write versioned, audited and refused with the documented code.
- [X] T027 [US1] Implement the state machine and the refusal mapping in `backend/src/modules/purchasing/purchasing.service.ts`: 409 `INVALID_STATE_TRANSITION`, 409 `STALE_VERSION`, 409 `ORDER_HAS_RECEIPTS`, 400 `VALIDATION_ERROR` — with the order row fetched under the lock so a stale version is distinguished from an invalid state (research D11).
- [X] T028 [US1] Define the request schemas and DTOs (the order body with its lines, the version-carrying confirm and cancel bodies, the decimal-string rules) in `backend/src/modules/purchasing/dto/create-purchase-order.dto.ts`, `backend/src/modules/purchasing/dto/update-purchase-order.dto.ts`, `backend/src/modules/purchasing/dto/purchase-order-action.dto.ts`.
- [X] T029 [US1] Define the order response DTO (the order, its lines with ordered, received, outstanding, unit cost, unit of measure and line total, the total and the version) in `backend/src/modules/purchasing/dto/purchase-order-response.dto.ts`.
- [X] T030 [US1] Expose `POST /purchase-orders`, `PUT /purchase-orders/:id`, `POST /purchase-orders/:id/confirm` and `POST /purchase-orders/:id/cancel` with their permissions, the module gate and the OpenAPI annotations in `backend/src/modules/purchasing/purchasing.controller.ts`.
- [X] T031 [US1] Re-run the US1 integration tests green (`backend/test/integration/purchasing-orders.spec.ts`).

**Checkpoint**: a purchase order can be created, steered and closed with a full audit trail.

---

## Phase 4: User Story 2 — Receive goods partially and in full (Priority: P1)

**Goal**: `POST /purchase-orders/:id/receipts` posts goods exactly once: it locks the order and its lines, creates the receipt and its lines, posts the RECEIPT movements, raises the stock, updates the received quantities and the status, writes the audit entry and stores the idempotency outcome — all in one transaction.

**Independent Test**: confirm an order with two lines, receive part of one line, verify the order becomes PARTIALLY_RECEIVED and the stock rose by exactly the received quantity, then receive the rest and verify the order becomes RECEIVED; posting the same request twice creates one receipt.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

- [X] T032 [P] [US2] Integration test — a posted receipt creates one goods receipt with a `GR-` number, one receipt line and one `RECEIPT` movement per received line, increases the stock by the exact quantities, updates the line's received quantity and the order's status, and writes one audit entry — in `backend/test/integration/purchasing-receipts.spec.ts`; observe it fail before implementation.
- [X] T033 [P] [US2] Integration test — idempotency: the same key with the same body returns the stored response and creates no second receipt, line, movement, stock change, status change or audit entry; the same key with a different body is refused with 422 `IDEMPOTENCY_KEY_REUSED`; a missing key is refused with 400 `IDEMPOTENCY_KEY_REQUIRED` — in `backend/test/integration/purchasing-receipts.spec.ts`.
- [X] T034 [P] [US2] Integration test — concurrency: two receipts posted at the same moment on the same line never let the received quantity exceed the ordered one, and a receipt racing a cancellation of the same order has one consistent outcome (the receipt lands and the cancel is refused, or the cancel lands and the receipt is refused) — in `backend/test/integration/purchasing-receipts.spec.ts`.
- [X] T035 [P] [US2] Integration test — the refusals: a quantity above the line's outstanding quantity is refused with 400 `OVER_RECEIPT` naming the outstanding quantity, an all-zero receipt is refused, a DRAFT, CANCELLED or RECEIVED order is refused with 409 `INVALID_STATE_TRANSITION`, an inactive destination warehouse is refused, and a line from another order, a mismatched product or a duplicated line refuses the whole receipt — in `backend/test/integration/purchasing-receipts.spec.ts`.
- [X] T036 [P] [US2] Integration test — rollback: a failed movement write or a failed audit write leaves no receipt, no receipt line, no stock change and no status change — in `backend/test/integration/purchasing-receipts.spec.ts`.
- [X] T037 [P] [US2] Integration test — immutability: a posted receipt and a posted receipt line refuse UPDATE, DELETE and TRUNCATE at the database level — in `backend/test/integration/purchasing-receipts.spec.ts`.
- [X] T038 [P] [US2] Integration test — tenant isolation and permissions: another organization's receipt is not found, and the endpoint requires `inventory.receive` — in `backend/test/integration/purchasing-receipts.spec.ts`.

### Implementation for User Story 2 (depends on T032–T038 failing)

- [X] T039 [US2] Implement the receipt posting in `backend/src/modules/purchasing/purchasing.service.ts`: the idempotency claim with endpoint `/purchase-orders/:id/receipts`, the order lock, the line locks in ascending line id, the outstanding-quantity guard, the receipt and receipt-line inserts, the movement calls into `InventoryService.postReceiptMovement` in ascending product id, the received-quantity and status updates, the audit entry and the stored response — all in one transaction (research D2, D3, D8).
- [X] T040 [US2] Implement the line matching: every entry names a purchase-order line **and** its product, the pair must match a line on this order, a line from another order, a mismatched product and a duplicated line are refused, and only positive quantities create rows — in `backend/src/modules/purchasing/purchasing.service.ts` (research D7).
- [X] T041 [US2] Define the receipt request DTO (the lines with `lineId`, `productId` and the decimal-string quantity) and the response DTO (the receipt with its number and date, the order with its number, status and version) in `backend/src/modules/purchasing/dto/receive-goods.dto.ts` and `backend/src/modules/purchasing/dto/goods-receipt-response.dto.ts`.
- [X] T042 [US2] Expose `POST /purchase-orders/:id/receipts` with `@RequirePermission('inventory.receive')`, the required `Idempotency-Key` header, the module gate and the OpenAPI annotations in `backend/src/modules/purchasing/purchasing.controller.ts`.
- [X] T043 [US2] Re-run the US2 integration tests green (`backend/test/integration/purchasing-receipts.spec.ts`).

**Checkpoint**: goods can be received once, exactly once, with stock and history in step.

---

## Phase 5: User Story 3 — Browse purchase orders and goods receipts (Priority: P1)

**Goal**: `GET /purchase-orders`, `GET /purchase-orders/:id` and `GET /goods-receipts` return the organization's documents with the server's progress summary, the receipt-level list row, the order's receipt history and the whole-selection totals.

**Independent Test**: with several orders and receipts, search an order by number and supplier, filter by status, open an order detail with its receipt history, and open the receipts tab filtered by a date range — every total counts the whole selection, and another organization's documents never appear.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

- [X] T044 [P] [US3] Integration test — the orders list returns one row per order with the number, supplier, warehouse, status, order date, total and the server's progress summary: the aggregate received and ordered quantities with the unit abbreviation when every line shares one unit of measure, the fully-received and total line counts when the units differ, and no progress figure for a DRAFT — in `backend/test/integration/purchasing-lists.spec.ts`; observe it fail before implementation.
- [X] T045 [P] [US3] Integration test — the status and the progress never contradict each other over a seeded set of orders: RECEIVED means every line is fully received, PARTIALLY_RECEIVED means at least one line has received above zero and at least one is outstanding, and CONFIRMED means every received quantity is zero — in `backend/test/integration/purchasing-lists.spec.ts`.
- [X] T046 [P] [US3] Integration test — the receipts list returns one row per receipt with its number, linked order, supplier, warehouse, received date, user and line count, plus the aggregate quantity **only** when every line of that receipt shares one unit of measure; the total counts receipts; a product search matches any line but still returns one row per receipt; a date range on the received date with an end before the start is refused with a validation error naming the field — in `backend/test/integration/purchasing-lists.spec.ts`.
- [X] T047 [P] [US3] Integration test — the order detail returns the header, every line's ordered, received, outstanding, unit cost and line total, the order total, and the receipt history with each receipt's lines — in `backend/test/integration/purchasing-lists.spec.ts`.
- [X] T048 [P] [US3] Integration test — the list behaviour: search by order number or supplier, the status filter, the stable sort, the page size capped at 100, the whole-selection total, and literal `%` and `_` in a search term — in `backend/test/integration/purchasing-lists.spec.ts`.
- [X] T049 [P] [US3] Integration test — tenant isolation and permissions for both lists and the detail: another organization's documents are neither listed nor found by id, and every endpoint requires `purchasing.read` — in `backend/test/integration/purchasing-lists.spec.ts`.

### Implementation for User Story 3 (depends on T044–T049 failing)

- [X] T050 [US3] Implement the orders list with the progress summary in one aggregate query per page — the uniform-unit branch, the line-count branch and the DRAFT branch — in `backend/src/modules/purchasing/purchasing.service.ts` (research D13).
- [X] T051 [US3] Implement the receipts list with the receipt-level row in one aggregate query per page — the line count, the conditional aggregate and the product search through the owning Products service's id search — in `backend/src/modules/purchasing/purchasing.service.ts` (research D12).
- [X] T052 [US3] Implement the order detail with the receipt history, each receipt carrying its lines with product, received quantity, unit of measure and the fulfilled order line — in `backend/src/modules/purchasing/purchasing.service.ts`.
- [X] T053 [US3] Define the list query DTOs (search, status, date range, sort, page, page size capped at 100) and the list response DTOs (the order row with its progress summary, the receipt row) in `backend/src/modules/purchasing/dto/list-purchase-orders.dto.ts`, `backend/src/modules/purchasing/dto/list-goods-receipts.dto.ts`, `backend/src/modules/purchasing/dto/purchase-order-row.dto.ts` and `backend/src/modules/purchasing/dto/goods-receipt-row.dto.ts`.
- [X] T054 [US3] Expose `GET /purchase-orders`, `GET /goods-receipts` and `GET /purchase-orders/:id` with `@RequirePermission('purchasing.read')`, the module gate and the OpenAPI annotations in `backend/src/modules/purchasing/purchasing.controller.ts`.
- [X] T055 [US3] Re-run the US3 integration tests green (`backend/test/integration/purchasing-lists.spec.ts`).

**Checkpoint**: every order and receipt can be found, read and traced.

---

## Phase 6: User Story 5 — Protect records referenced by open orders (Priority: P1)

**Goal**: archiving a product or a supplier, or deactivating a warehouse, is refused while an open order still references it, and the refusal names the blocking order.

**Independent Test**: create a DRAFT order with a product, a supplier and a warehouse; try to archive the product, archive the supplier and deactivate the warehouse — each is refused with the documented conflict and names the order; cancel the order and repeat: each action succeeds.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

- [X] T056 [P] [US5] Integration test — archiving a product that appears on a DRAFT, CONFIRMED or PARTIALLY_RECEIVED order is refused with 409 `PRODUCT_IN_USE` naming the blocking order, and the product stays active — in `backend/test/integration/purchasing-usage-guards.spec.ts`; observe it fail before implementation.
- [X] T057 [P] [US5] Integration test — archiving a supplier that appears on an open order is refused with 409 `CONTACT_IN_USE` naming the blocking order, and the supplier stays active — in `backend/test/integration/purchasing-usage-guards.spec.ts`.
- [X] T058 [P] [US5] Integration test — deactivating a warehouse that is the destination of an open order is refused with 409 `WAREHOUSE_IN_USE` naming the blocking order, and the warehouse stays active — in `backend/test/integration/purchasing-usage-guards.spec.ts`.
- [X] T059 [P] [US5] Integration test — a product, supplier or warehouse referenced only by RECEIVED or CANCELLED orders is closed: the archive or the deactivation succeeds, subject to the existing stock and default-warehouse rules — in `backend/test/integration/purchasing-usage-guards.spec.ts`.

### Implementation for User Story 5 (depends on T056–T059 failing)

- [X] T060 [US5] Extend the inventory-backed products usage provider so it reports a product in use when it has reserved stock **or** appears on an open purchase order, keeping the products module asking only through the seam — in `backend/src/modules/inventory/products-usage.provider.ts` and `backend/src/modules/inventory/inventory.module.ts` (research D4).
- [X] T061 [US5] Provide the contacts usage answer from the purchasing module — the supplier is in use while an open order names it — and register it under the existing contacts seam token — in `backend/src/modules/contacts/contacts-usage.provider.ts` and `backend/src/modules/contacts/contacts.module.ts`.
- [X] T062 [US5] Consult the purchasing warehouse answer before a warehouse is deactivated, and refuse with 409 `WAREHOUSE_IN_USE` naming the blocking order — in `backend/src/modules/inventory/inventory.service.ts`.
- [X] T063 [US5] Re-run the US5 integration tests green (`backend/test/integration/purchasing-usage-guards.spec.ts`).

**Checkpoint**: an open order never points at a retired record.

---

## Phase 7: User Story 4 — The Purchasing screens show real purchasing data (Priority: P1)

**Goal**: the six Purchasing screens read and write the real service; the sample data and the banner are gone; the still-sample Sales, Invoicing and Overview modules keep their private data.

**Independent Test**: signed in to an organization with suppliers, products and warehouses, create and confirm an order, receive part of it, see the real Inventory balance and movement increase, and confirm that no sample-data banner appears anywhere in Purchasing.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

- [X] T064 [P] [US4] Frontend test — the purchasing hooks call the real client and never the sample service, and the receipt mutation invalidates the purchasing, goods-receipt, stock-balance, low-stock and movement queries — in `frontend/src/features/purchasing/__tests__/use-purchasing.spec.ts`; observe it fail before implementation.
- [X] T065 [P] [US4] Frontend test — the orders screen renders the server's progress summary verbatim ("40 of 100 rolls", "2 of 5 lines fully received", no figure for a draft) and never computes a figure of its own — in `frontend/src/features/purchasing/__tests__/orders-tab.spec.tsx`.
- [X] T066 [P] [US4] Frontend test — the receipts screen shows one row per receipt with the line count and the conditional aggregate quantity, labels the total as receipts, and refuses an end-before-start date range inline — in `frontend/src/features/purchasing/__tests__/receipts-tab.spec.tsx`.
- [X] T067 [P] [US4] Frontend test — the receive dialog opens with blank quantities, offers "Receive all outstanding", keeps the post disabled while every quantity is blank or zero, shows the confirmation summary before posting, keeps its key after an unknown outcome, and shows a refusal inline with the request identifier — in `frontend/src/features/purchasing/__tests__/receive-goods-dialog.spec.tsx`.
- [X] T068 [P] [US4] Frontend test — the order form offers only non-archived suppliers with the supplier role, only non-archived products and only active warehouses, defaults the unit cost to the product's purchase price, and can save a draft with zero lines — in `frontend/src/features/purchasing/__tests__/order-form.spec.tsx`.
- [X] T069 [P] [US4] Frontend test — no sample-data banner appears on any purchasing screen, the sample purchasing data is gone, and the still-sample modules keep their own private data — in `frontend/src/features/purchasing/__tests__/sample-isolation.spec.tsx` (rewritten) and `frontend/src/features/purchasing/__tests__/purchasing-page.spec.tsx`.

### Implementation for User Story 4 (depends on T064–T069 failing)

- [X] T070 [US4] Point the purchasing hooks at the real client and give them the real shapes: the order row with its progress summary, the receipt row without lines, the version-carrying confirm, cancel and update mutations, and the receipt mutation carrying the idempotency key — in `frontend/src/features/purchasing/use-purchasing.ts`.
- [X] T071 [US4] Update the orders screen to the real contract — the server's progress column, the status filter, the search, the sorting and the whole-selection total — in `frontend/src/features/purchasing/orders-tab.tsx`.
- [X] T072 [US4] Update the receipts screen to the real contract — one row per receipt, the line count, the conditional aggregate, the total labelled as receipts, the received-date range and its inline refusal — in `frontend/src/features/purchasing/receipts-tab.tsx`.
- [X] T073 [US4] Update the order detail to the real contract — the per-line table of ordered, received and outstanding, the receipt history with each line's product, quantity, unit of measure and fulfilled order line, and no edit or delete control for a receipt — in `frontend/src/features/purchasing/order-detail-page.tsx`.
- [X] T074 [US4] Update the order form to the real pickers — the supplier, the product and the warehouse lists from the real services, the purchase-price default for the unit cost, and a draft that can be saved with zero lines — in `frontend/src/features/purchasing/order-form.tsx`.
- [X] T075 [US4] Rewrite the receive dialog against the real endpoint: the blank fields, the "Receive all outstanding" action, the disabled fully-received lines, the post disabled until a positive line, the confirmation summary with the consequence, the idempotency key generated on open and kept after an unknown outcome, and the inline refusal with the request identifier — in `frontend/src/features/purchasing/receive-goods-dialog.tsx`.
- [X] T076 [US4] Delete the sample purchasing data and the banner: the purchasing state and methods from `frontend/src/services/sample-catalog-service.ts`, `SAMPLE_PURCHASE_ORDERS` and `SAMPLE_GOODS_RECEIPTS` from `frontend/src/mocks/sample-data.ts`, the banner from `frontend/src/features/purchasing/purchasing-page.tsx`, and mark purchasing as a real module in `frontend/src/config/real-modules.ts`.
- [X] T077 [P] [US4] Add the new and changed interface strings to both locales — the progress figures, the line count, the receipts total label, "Receive all outstanding", "Fully received", the confirmation summary and its consequence, the date-range refusal — in `frontend/src/i18n/locales/en/purchasing.ts` and `frontend/src/i18n/locales/ar/purchasing.ts`, and drop the `*` from the purchasing labels so the shared components own the required marker.
- [X] T078 [US4] Re-run the US4 frontend tests green (`frontend/src/features/purchasing/__tests__/`) and the whole frontend suite (`frontend/src`).

**Checkpoint**: the Purchasing screens show the organization's real purchasing data and nothing sample.

---

## Phase 8: Polish & cross-cutting concerns

- [X] T079 [P] Extend the invariant script: received never exceeds ordered, every order total equals the sum of its line totals, every status agrees with its line quantities, every receipt line has a matching `RECEIPT` movement with agreeing totals, and the receipts refuse update, delete and truncate — in `scripts/verify-db-invariants.mjs`.
- [X] T080 [P] Add the purchasing endpoints to the OpenAPI document, regenerate the artifact and make the drift check pass — in `backend/src/openapi/openapi-document.ts` and the regenerated `backend/openapi.json`.
- [X] T081 [P] Prove that every purchasing endpoint declares its permission **and** the shared Purchasing module gate — the enumeration test the existing default-deny test does not provide — in `backend/src/modules/purchasing/__tests__/purchasing-endpoint-declarations.spec.ts`.
- [X] T082 [P] Write the canonical purchasing contract document from `specs/011-purchasing-end-to-end/contracts/purchasing-api.md` and `contracts/idempotency.md`, including the deferred module-disabled refusal and its owner (the Organization settings feature), in `docs/api-purchasing-contract.md`, and reference the endpoints from `docs/PRD.md`.
- [X] T083 [P] Run the backend unit suite, the frontend suite, the lint, the type check and the build; nothing new may fail — `npm run test --workspace @nexuserp/api`, `npm run test --workspace @nexuserp/web`, `npm run lint`, `npm run typecheck` and `npm run build` from the repository root.
- [X] T084 [P] Run the full integration suite against the isolated schema only and prove the public schema's row counts are unchanged — `node scripts/with-test-schema-env.mjs npm run test:integration --workspace @nexuserp/api` and `node scripts/snapshot-public-counts.mjs`.
- [X] T085 Run the quickstart validation actually executed — the golden path, the blank-field receive dialog, the double-click-once path, the key kept after an unknown outcome, the list shapes and the isolation check — and record each result honestly in the final report (`specs/011-purchasing-end-to-end/quickstart.md`).
- [X] T086 Before hand-off: no debug artifacts, no skipped tests and no `.only` in `backend/src/` or `frontend/src/`; the working tree holds only this feature's changes plus the earlier uncommitted work; nothing is committed without the owner's instruction.

---

## Dependencies & execution order

- **Setup (Phase 1)**: no dependencies — can start immediately (T001–T009, parallel where the files differ).
- **Foundational (Phase 2)**: depends on Phase 1 (the tables and the columns exist before the code uses them) — blocks all user stories.
- **User Stories**: all depend on Phase 2; US1 → US2 → US3 → US5 → US4 is the build order (nothing can be received without an order; the lists read what the writes produce; the guards read the orders; the screens consume every surface).
- **Polish**: depends on all desired stories being complete.

### User Story dependencies

- **US1 (P1)**: after Foundational — no dependency on other stories.
- **US2 (P1)**: after Foundational and US1 — it receives against an order, but its own test provisions the order it needs and stays independently testable.
- **US3 (P1)**: after Foundational — independent; it reads the documents US1 and US2 write.
- **US5 (P1)**: after Foundational — independent; it refuses changes to records an open order names.
- **US4 (P1)**: after US1–US3 — it consumes every endpoint.

### Within each user story

- Tests first, observed failing, then implementation, then re-run green.
- The migrations (T004–T008) precede the code that depends on them (T010+).
- The number allocation (T012) and the Inventory receipt method (T013) precede the receipt endpoint (T039–T042).
- The usage answers (T011) precede the guards (T060–T062).

### Parallel opportunities

- All Setup tasks marked [P] can run in parallel (T001, T002, T009, and the migrations after T003).
- All Foundational tasks marked [P] can run in parallel (T011–T019).
- All tests for a story can run in parallel (T019–T025, T032–T038, T044–T049, T056–T059, T064–T069).
- The US4 screens (T071, T072, T073, T074) touch different files and can run in parallel; the locale task (T077) is independent of them.
- The Polish tasks marked [P] can run in parallel after the stories.

---

## Parallel example: User Story 2

```bash
# Launch all US2 tests together (tests are mandatory):
Task: "Integration test — a posted receipt creates the receipt, its lines, the movements and the stock change in backend/test/integration/purchasing-receipts.spec.ts"
Task: "Integration test — the same key twice creates one receipt; a different body returns 422 in backend/test/integration/purchasing-receipts.spec.ts"
Task: "Integration test — two simultaneous receipts and a receipt racing a cancel in backend/test/integration/purchasing-receipts.spec.ts"
Task: "Integration test — rollback leaves no receipt and no stock change; receipts are immutable in backend/test/integration/purchasing-receipts.spec.ts"
```

---

## Implementation strategy

### MVP first (User Story 1)

1. Phase 1: Setup — shared codes, schema, migrations, the module gate.
2. Phase 2: Foundational — the module skeleton, the usage answers, the number allocation, the Inventory receipt method, the client seam.
3. Phase 3: US1 — create, confirm and cancel a purchase order.
4. **STOP and VALIDATE**: the order lifecycle is correct, isolated, permissioned and audited.
5. Add US2 (receiving), US3 (the lists), US5 (the usage guards) and US4 (the screens) — each validated on its own.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → demo (a real purchase order can be prepared and closed).
3. US2 → test → demo (goods can be received exactly once, with real stock).
4. US3 → test → demo (orders and receipts can be found and traced).
5. US5 → test → demo (a retired record cannot break an open order).
6. US4 → test → demo (the screens show real purchasing data).

### Parallel team strategy

- Developer A: US1 (order lifecycle) then US2 (receiving).
- Developer B: US3 (lists) then US5 (usage guards).
- Developer C: US4 (the interface) once the endpoints land.
- The migrations, the shared codes and the module skeleton are the shared spine and land first.

---

## Notes

- [P] = different files, no dependency on incomplete tasks.
- [US#] = story traceability, required for story-phase tasks only.
- Tests are mandatory and must be observed failing first (Principle V).
- The still-sample Sales, Invoicing and Overview modules keep their own private sample data and are never wired to the real purchasing or stock tables (spec FR-042).
- Migrations are additive and immutable: new ones only, existing ones never edited.
- No task may write another module's tables; the archive checks travel through the existing usage seams and the stock effect travels through `InventoryService`.
- No commit is implied by any task; commits happen only on explicit owner instruction via the optional git hooks.
