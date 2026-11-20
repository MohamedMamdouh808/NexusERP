# Feature Specification: Sales end to end — real sales orders, reservations, and shipments

**Feature Branch**: `012-sales-end-to-end`  
**Created**: 2026-11-14  
**Status**: Draft  
**MoSCoW Priority**: P0 (P0-F008 and P0-F009 in `docs/PRD.md`; P3 is never implemented in v1 — Principle IX)  
**Input**: User description: "Build Sales end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F008 and P0-F009, Sections 7.4, 8, 9.3, 9.6 and 9.8, the constitution, the existing Sales screens, and the Contacts, Products, Inventory and Purchasing features as the pattern (snake_case naming, composite organization keys, version numbers, audit entries, idempotency keys, the module-gate hook, RLS with no policies, migrations immutable). Document numbers SO- and SH- use the same digits and the same sequence allocation as the purchase order numbers.

Backend:
1. Tables per organization: sales_orders (number, customer, shipping warehouse, status DRAFT, CONFIRMED, SHIPPED or CANCELLED, order date, notes, total NUMERIC(14,2), version, created by, timestamps), sales_order_lines (product, quantity NUMERIC(14,3) above zero, unit_price NUMERIC(14,4) not negative, line_total NUMERIC(14,2); one line per product per order), stock_reservations (order line, warehouse, product, quantity, status ACTIVE, CONSUMED or RELEASED), shipments (number, order, shipped by, shipped at) and shipment_lines. Composite organization foreign keys everywhere. The schema supports several shipments per order, but in this feature one shipment ships the whole order. Shipments and their lines are append-only, enforced by database triggers like the audit log.
2. Exact money and quantities, server side: a line total is quantity times unit price rounded half-up to 2 decimals and the order total is the sum of the line totals, never JavaScript floats. Test vectors: 3.333 x 1.2345 = 4.11; 1.000 x 0.0050 = 0.01; 2.500 x 4.5000 = 11.25. JSON carries decimal strings.
3. Endpoints, each declaring a permission (sales.read, sales.write, inventory.ship for shipping): list (search by number or customer name, status filter, sort, page and pageSize with a maximum of 100, a total), get, create, update (DRAFT only; a stale version returns 409 STALE_VERSION), confirm, cancel, ship, and list shipments (search, date range with the end not before the start).
4. Rules: the customer is a non-archived contact with the customer role; the warehouse is active; products are non-archived; at least one line to confirm; unit price defaults from the product's selling price and is editable; a confirmed order can no longer be edited; every status transition is validated by the server (409 INVALID_STATE_TRANSITION).
5. Confirm, in ONE transaction with a required Idempotency-Key header: lock the order and the affected stock balance rows in a fixed order (ascending product id), so concurrent confirmations cannot deadlock; for every line check availability (on hand minus reserved) with a conditional update, never trusting anything the interface showed; ALL OR NOTHING: if any line is short, reserve nothing and return 409 INSUFFICIENT_STOCK with every short product and its available and required quantity; otherwise create the reservations, increase reserved, set the status to CONFIRMED and write the audit entry. Two simultaneous confirmations competing for the last units: exactly one succeeds.
6. Cancel, with an Idempotency-Key: a DRAFT cancels; a CONFIRMED order cancels and releases its active reservations (reserved decreases); a SHIPPED order is refused 409 ORDER_SHIPPED.
7. Ship, with an Idempotency-Key, in ONE transaction: lock the order and the balances; require status CONFIRMED with an active reservation for every line; create the shipment and its lines; post SHIPMENT movements through the Inventory module's service (never by writing its tables), decreasing on hand and reserved by the shipped quantities; mark the reservations CONSUMED; set the status to SHIPPED; write the audit entry. Negative stock is impossible. A failure at any step leaves nothing changed. The same key with the same request returns the stored response; the same key with a different body returns 422.
8. Implement the usage hooks left by earlier features: archiving a customer with a DRAFT or CONFIRMED order, archiving a product on such an order, and deactivating a warehouse that is the shipping warehouse of such an order are refused (409 CONTACT_IN_USE, PRODUCT_IN_USE, WAREHOUSE_IN_USE). Every sales endpoint declares the module-gate hook like Purchasing; no module state is implemented here.
9. Every create, update, confirm, cancel and ship writes an audit entry with before and after values in the same transaction; another organization's records return 404; every new table enables RLS with no policies; the OpenAPI contract and docs are regenerated and the drift check passes.
10. Extend scripts/verify-db-invariants.mjs: reserved in every balance equals the sum of its ACTIVE reservations; reserved never exceeds on hand; an order's total equals the sum of its line totals; a CONFIRMED order has an active reservation for every line; a SHIPPED order has consumed reservations + matching SHIPMENT movements; shipments reject update, delete and truncate.

Interface:
11. The Sales screens (order list, create/edit form with the line items editor, detail page, the Confirm, Ship and Cancel dialogs, and the Shipments tab) use a real API client behind the service seam. Their sample data is deleted and the Sample data banner no longer appears on them. Pickers load real customers, products and warehouses. Beside each line the form shows the real available quantity in the chosen warehouse as advice only; a quantity above it shows a warning but the draft can still be saved. A confirm that fails with INSUFFICIENT_STOCK shows every short product with its available and required quantity. Confirm, Ship and Cancel dialogs generate their idempotency key when they open and reuse it on a retry, so a double click acts once. After a confirm, ship or cancel the real Inventory balances and movements show the change. The "Create Invoice" action stays disabled with the reason "Arrives with Invoicing".
12. Server errors show inline with the request identifier; actions the member lacks permission for are hidden or disabled using permissions from GET /auth/me; the server remains the authority.
13. The still-sample modules (Invoicing, Overview) keep their own private sample data and never read/write real sales or stock data.

Success criteria: tenant-isolation and permission tests for every endpoint; CONCURRENCY tests (two simultaneous confirmations for the last units; a confirm racing a cancel; a ship racing a cancel; an inventory adjustment racing a confirm, where the adjustment may never push on hand below reserved); duplicate-request tests; rollback tests (a failing movement or audit write leaves no shipment, no stock change and no status change); append-only tests for shipments; rounding vectors; usage hooks; invariants script passes; tests run only in the isolated schema and leave public row counts unchanged; contract-drift check and every existing guard pass.

Out of scope: partial shipments and backorders, discounts and taxes, returns and credit notes, customer credit limits, price lists, delivery notes and packing lists, shipping carriers, invoices (the next feature), attachments, import and export."

## Clarifications *(mandatory)*

### Session 2026-11-14

- Q: Which permission guards `GET /shipments` and `GET /shipments/:id` — `sales.read` or `inventory.read`?  
  A: `sales.read` — shipments are sales documents, matching the Purchasing receipts precedent; PRD 9.5 table row updated to `sales.read` with reason "shipments are sales documents, matching the Purchasing receipts rule", and revision-history row v1.1 added.
- Q: Does the user want clarification on `GET /shipments/:id` scope?  
  A: Yes — `GET /shipments/:id` returns a single-shipment detail carrying its lines with product, order line, and quantity; it is in scope under `sales.read`.
- Q: Which permission guards `GET /sales-orders/:id` detail and the order list?  
  A: `sales.read` — consistent with Purchasing (`purchasing.read` for order reads).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create, confirm, and cancel a sales order (Priority: P1)

As Salma, the sales officer, I want to create a sales order for a customer, confirm it when it is ready, and cancel it when the customer backs out, so that the business has a controlled record of what it intends to sell and can count on the stock behind it.

**Why this priority**: The sales order is the document the rest of the feature hangs from. Without a real draft, confirmation, and cancellation path there is nothing to reserve against and nothing to ship.

**Independent Test**: Create a sales order for an active customer, an active warehouse, and one active product; edit it while it is a draft; confirm it; then create another order and cancel it. The confirmed order cannot be edited, and the cancelled order cannot be shipped.

**Acceptance Scenarios**:

1. **Given** an active customer, an active warehouse, and active products, **When** Salma creates a sales order, **Then** it is saved as DRAFT with an `SO-` number from the organization's sequence, the entered lines, and a server-calculated total.
2. **Given** a DRAFT order, **When** Salma edits its customer, warehouse, order date, notes, or lines with the current version, **Then** the changes are saved, the totals are recalculated, and the version increments.
3. **Given** a DRAFT order another user has already changed, **When** Salma saves with the older version, **Then** the save is refused with 409 `STALE_VERSION` and nothing changes.
4. **Given** a DRAFT order with at least one valid line and enough stock, **When** Salma confirms it with the current version, **Then** it becomes CONFIRMED, reservations exist for every line, and it can no longer be edited.
5. **Given** a DRAFT order, **When** Salma cancels it, **Then** it becomes CANCELLED.
6. **Given** a CONFIRMED order, **When** Salma cancels it, **Then** it becomes CANCELLED and its active reservations are released, decreasing reserved stock.
7. **Given** a SHIPPED order, **When** Salma tries to cancel it, **Then** it is refused with 409 `ORDER_SHIPPED` and remains unchanged.
8. **Given** an order with no lines, **When** Salma saves it, **Then** it is saved as DRAFT with a total of 0.00, and it cannot be confirmed until at least one line is added.

---

### User Story 2 - Confirm with all-or-nothing stock reservation (Priority: P1)

As Salma, I want order confirmation to guarantee stock for every line or for none, so that I never promise goods that are unavailable.

**Why this priority**: Confirmation is the write path that turns a sales commitment into reserved stock. It carries the highest integrity risk: overselling the last units, partial reservations across lines, and deadlocks under concurrent confirmation.

**Independent Test**: With one SKU left in stock, create two DRAFT orders each for that SKU from different users and confirm both at the same moment. Exactly one confirms and reserves; the other is refused with 409 `INSUFFICIENT_STOCK` naming the short product with available and required quantities, and nothing is reserved for it.

**Acceptance Scenarios**:

1. **Given** a DRAFT order whose lines all fit available stock, **When** Salma confirms it, **Then** one reservation per line is created, reserved quantities increase, the order becomes CONFIRMED, and the audit entry commits with them.
2. **Given** a DRAFT order where one line is short of stock, **When** Salma confirms it, **Then** nothing is reserved for any line — including the lines that had enough stock — the order stays DRAFT, and the refusal returns 409 `INSUFFICIENT_STOCK` listing every short product with its available and required quantity.
3. **Given** two DRAFT orders competing for the last units of one product, **When** both confirm at the same moment, **Then** exactly one succeeds and the other is refused; reserved never exceeds on-hand.
4. **Given** a confirm racing a cancellation of the same order, **When** both complete, **Then** the outcome is consistent: either the order is CONFIRMED with reservations, or it is CANCELLED with none. Never a cancelled order holding reservations or a confirmed order with missing reservations.
5. **Given** an inventory adjustment racing a confirm of the same product, **When** both complete, **Then** the adjustment never pushes on-hand below the reserved quantity, and the confirm never reserves stock the adjustment already removed.
6. **Given** the same idempotency key and the same request sent twice, **When** the second request arrives, **Then** the stored response is returned and no second reservation, stock change, status change, or audit entry is created.
7. **Given** the same idempotency key with a different request body, **When** it is posted, **Then** it is refused with 422 `IDEMPOTENCY_KEY_REUSED` and nothing changes.
8. **Given** a failure while writing a reservation, a balance update, the status update, or the audit entry, **When** the confirm transaction fails, **Then** no reservation, no reserved-quantity change, no status change, and no audit entry remain.

---

### User Story 3 - Ship a confirmed sales order (Priority: P1)

As Karim, the inventory clerk, I want shipping to deduct stock and consume reservations automatically, so that balances stay correct without manual edits.

**Why this priority**: Shipping is the point where a sales promise becomes a stock movement. It must deduct exactly the reserved quantities, once, and commit or roll back as a single unit — a partial ship leaves the books wrong.

**Independent Test**: Confirm an order, then ship it. One `SH-` shipment exists with its lines, a SHIPMENT movement is posted per line, on-hand and reserved both decrease by the shipped quantities, the reservations are CONSUMED, and the order is SHIPPED. Repeating the ship request with the same key posts nothing new.

**Acceptance Scenarios**:

1. **Given** a CONFIRMED order with an active reservation for every line, **When** Karim ships it, **Then** one shipment with an `SH-` number and its lines is created, a SHIPMENT movement is posted per line through the Inventory service, on-hand and reserved decrease by the shipped quantities, every reservation becomes CONSUMED, and the order becomes SHIPPED — in one transaction.
2. **Given** a DRAFT, CANCELLED, or already SHIPPED order, **When** Karim tries to ship it, **Then** it is refused with 409 `INVALID_STATE_TRANSITION` and nothing changes.
3. **Given** a CONFIRMED order missing an active reservation for any line, **When** Karim tries to ship it, **Then** it is refused and nothing changes.
4. **Given** the same idempotency key and the same request sent twice, **When** the second request arrives, **Then** the stored response is returned and no second shipment, movement, stock change, reservation change, status change, or audit entry is created.
5. **Given** the same idempotency key with a different request body, **When** it is posted, **Then** it is refused with 422 `IDEMPOTENCY_KEY_REUSED` and nothing changes.
6. **Given** a failure while creating the shipment, posting a movement, updating a balance, consuming a reservation, updating the order, or writing the audit entry, **When** the ship transaction fails, **Then** no shipment, no shipment line, no movement, no stock change, no reservation change, no status change, and no audit entry remain.
7. **Given** a ship racing a cancellation of the same order, **When** both complete, **Then** the outcome is consistent: either the order is SHIPPED with its reservations consumed, or it is CANCELLED with its reservations released. Never both.
8. **Given** any sequence of operations, **When** stock is checked afterwards, **Then** on-hand is never negative and reserved never exceeds on-hand.
9. **Given** a posted shipment, **When** anyone tries to update, delete, or truncate it or its lines, **Then** the database rejects the attempt.

---

### User Story 4 - Browse sales orders and shipments (Priority: P1)

As Salma, I want to search, filter, sort, and page through sales orders and shipments, so that I can find an order, see what it is waiting on, and trace what went out.

**Why this priority**: The lists are the working surface for sales. A shipment that cannot be found or an order whose status cannot be read does not help the user.

**Independent Test**: With several orders and shipments in the organization, search by order number and customer name, filter by status, open an order detail, and open the shipments tab with a date range. The total count reflects the whole selection, not the visible page.

**Acceptance Scenarios**:

1. **Given** several sales orders, **When** Salma opens the order list, **Then** each row shows the number, customer, shipping warehouse, status, order date, and total, with the whole-selection count.
2. **Given** a search term, **When** Salma searches, **Then** orders are matched by number or customer name, and wildcard characters in the term are treated literally.
3. **Given** a status filter, **When** Salma applies it, **Then** only orders in that status are returned.
4. **Given** a sort column and direction, **When** Salma sorts, **Then** the list is ordered accordingly with a stable tie-break.
5. **Given** a page size above 100, **When** Salma asks for it, **Then** the page size is capped at 100 rather than rejected.
6. **Given** an order with lines and reservations, **When** Salma opens its detail, **Then** the detail shows the customer, warehouse, order date, notes, status, every line with product, quantity, unit price, and line total, the order total, and the order's shipment history with each shipment's lines.
7. **Given** several shipments, **When** Salma opens the shipments tab, **Then** each row shows the `SH-` number, the linked order number, customer, warehouse, shipped-at timestamp, the shipping user, and the line count, with the whole-selection count.
8. **Given** a shipment search and date range, **When** Salma applies them, **Then** only matching shipments are returned, and a range whose end precedes its start is refused with 400 `VALIDATION_ERROR` naming the date field. The range applies to the shipped-at date.
9. **Given** a record belonging to another organization, **When** Salma requests it by identifier, **Then** it is reported as not found.

---

### User Story 5 - Use the real Sales screens (Priority: P1)

As Salma, I want the Sales screens to use my organization's real customers, products, warehouses, orders, and stock instead of sample data, so that what I see and post is real business data.

**Why this priority**: The backend is invisible until the screens stop using sample data. This story removes the sample banner, deletes the Sales sample data, and connects every sales surface to the real service.

**Independent Test**: Sign in to an organization with real contacts, products, and warehouses; create, confirm, and ship an order; see the real Inventory balance and movements decrease; confirm that no sample-data banner appears anywhere in Sales.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open any Sales screen, **Then** the sample-data banner is absent and the content comes from the organization's real records.
2. **Given** the order form, **When** the user opens the customer picker, **Then** only non-archived contacts with the customer role are offered; the product picker offers only non-archived products; the warehouse picker offers only active warehouses.
3. **Given** a product is chosen on a line, **When** the line is created, **Then** its unit price defaults to the product's selling price and remains editable.
4. **Given** a line with a chosen warehouse, **When** the user enters a quantity, **Then** the real available quantity in that warehouse is shown beside the line as advice only; a quantity above it shows a warning, and the draft can still be saved.
5. **Given** a confirm refused with `INSUFFICIENT_STOCK`, **When** the screen shows the refusal, **Then** every short product is listed with its available and required quantity.
6. **Given** the Confirm, Ship, and Cancel dialogs, **When** a dialog opens, **Then** it generates its idempotency key and reuses that key on every retry of the same attempt, so a double click acts once. After an attempt whose outcome was unknown, reopening reuses the same key; after an attempt that ended in a success or a definite failure, reopening generates a new one.
7. **Given** a confirmed or shipped order, **When** the user opens Inventory, **Then** the real stock balances and movement history show the confirm's reserved increase and the ship's on-hand and reserved decrease.
8. **Given** a server refusal, **When** the screen shows it, **Then** the error appears inline with the request identifier; a stale-version refusal offers a reload; an insufficient-stock refusal lists the short products; a usage refusal names the blocking record; a shipped-order refusal explains the order has shipped.
9. **Given** a user without a sales permission, **When** they view a sales screen, **Then** actions they cannot perform are hidden or disabled using the permissions from `GET /auth/me`, while a direct API call is still refused by the server.
10. **Given** the SHIPPED order detail, **When** the user looks for the next step, **Then** the "Create Invoice" action is disabled with the reason "Arrives with Invoicing".
11. **Given** the still-sample Invoicing and Overview modules, **When** they are used, **Then** they keep their own private sample data and never read or write real sales or stock data.

---

### User Story 6 - Protect records referenced by open orders (Priority: P1)

As Hana, the administrator, I want the system to refuse archiving a customer or product, or deactivating a warehouse, while an open sales order still references it, so that an open order never points at a record that has been retired.

**Why this priority**: The usage guards are part of the feature's integrity contract. Without them, a confirmed order can be left with an archived customer, an archived product, or an inactive shipping warehouse.

**Independent Test**: Create a DRAFT order with a product, customer, and warehouse; try to archive the product, archive the customer, and deactivate the warehouse. Each is refused with the documented conflict and names the blocking order. Cancel the order and repeat: each action succeeds.

**Acceptance Scenarios**:

1. **Given** a customer on a DRAFT or CONFIRMED sales order, **When** a user tries to archive it, **Then** the request is refused with 409 `CONTACT_IN_USE`, names the blocking order, and the customer remains active.
2. **Given** a product on a DRAFT or CONFIRMED sales order, **When** a user tries to archive it, **Then** the request is refused with 409 `PRODUCT_IN_USE`, names the blocking order, and the product remains active.
3. **Given** a warehouse that is the shipping warehouse of a DRAFT or CONFIRMED sales order, **When** a user tries to deactivate it, **Then** the request is refused with 409 `WAREHOUSE_IN_USE`, names the blocking order, and the warehouse remains active.
4. **Given** the same customer, product, or warehouse referenced only by SHIPPED or CANCELLED orders, **When** the user archives or deactivates it, **Then** the action is allowed, subject to the existing stock and default-warehouse rules.

---

### Edge Cases

- A customer archived while a DRAFT or CONFIRMED order names it — refused by the usage guard with 409 `CONTACT_IN_USE`.
- A product archived while a DRAFT or CONFIRMED order names it — refused by the usage guard with 409 `PRODUCT_IN_USE`.
- A warehouse deactivated while it is the shipping warehouse of a DRAFT or CONFIRMED order — refused by the usage guard with 409 `WAREHOUSE_IN_USE`.
- An archived customer, an archived product, or an inactive warehouse on a SHIPPED or CANCELLED order — allowed; closed orders do not block.
- A confirm on an order that is not DRAFT — refused with 409 `INVALID_STATE_TRANSITION`.
- A cancel on an order that is already CANCELLED or SHIPPED — refused; SHIPPED with 409 `ORDER_SHIPPED`.
- A ship on an order that is DRAFT, CANCELLED, or already SHIPPED — refused with 409 `INVALID_STATE_TRANSITION`.
- A ship on a CONFIRMED order missing an active reservation for any line — refused; nothing changes.
- A confirm where one line is short — nothing reserved for any line, 409 `INSUFFICIENT_STOCK` naming every short product with available and required quantity.
- A confirm on an order with zero lines — refused; confirmation needs at least one line.
- A quantity of zero or a negative quantity on an order line — refused.
- A unit price below zero — refused.
- A quantity with more than three decimal places — refused rather than rounded.
- A unit price with more than four decimal places — refused rather than rounded.
- The same product twice on one order — refused; one line per product per order.
- A customer without the customer role, an archived customer, an inactive warehouse, or an archived product on create, update, or confirm — refused; the whole request is refused and nothing is stored.
- A draft saved with zero lines — total 0.00, saveable, but not confirmable.
- A quantity above the available quantity in the chosen warehouse — a warning in the draft, never a save block; the server decides at confirm.
- Two confirmations competing for the last units — exactly one succeeds.
- A confirm racing a cancel, a ship racing a cancel, an adjustment racing a confirm — one consistent outcome, never both, never partial.
- An adjustment that would push on-hand below reserved — impossible; the adjustment is refused.
- A duplicate idempotency key with an identical body — the stored response, one posting.
- A duplicate idempotency key with a different body — 422 `IDEMPOTENCY_KEY_REUSED`, nothing changes.
- A failed movement write or audit write during confirm, cancel, or ship — complete rollback; no shipment, no stock change, no status change.
- A posted shipment, shipment line, movement, or audit entry — cannot be updated, deleted, or truncated.
- An order total that does not equal the sum of its line totals — impossible after any successful write; the invariant check fails the build.
- A reserved quantity above on-hand, or a balance whose reserved does not equal the sum of its active reservations — impossible; the invariant check fails the build.
- A page size above 100 — capped, not rejected.
- A shipment date range with its end before its start — refused with 400 `VALIDATION_ERROR` naming the date field.
- A stale version on update, confirm, or cancel — 409 `STALE_VERSION`, nothing changes.
- A request for another organization's order, reservation, or shipment by identifier — 404 on every endpoint.
- A user without `sales.read` — cannot list or read orders or shipments.
- A user without `sales.write` — cannot create, update, confirm, or cancel an order.
- A user without `inventory.ship` — cannot ship.
- A server error mid-action — an inline error with the request identifier, and no partial state.
- Product price changes after the order line is saved — the order keeps the price copied onto the line; the document does not recalculate.
- The module gate on every sales endpoint — declared like Purchasing; this feature ships no module state, so the gate allows every request until the settings feature enables the check.

## Requirements *(mandatory)*

### Functional Requirements

#### Data, numbering, and exact amounts

- **FR-001**: The system MUST store sales orders, sales order lines, stock reservations, shipments, and shipment lines per organization. Every organization-owned table MUST carry `organization_id`, and every foreign key between organization-owned tables MUST be composite over `(organization_id, id)` so a cross-tenant relation is impossible.
- **FR-002**: A sales order MUST store its `SO-` number, customer, shipping warehouse, status (`DRAFT`, `CONFIRMED`, `SHIPPED`, or `CANCELLED`), order date, notes, total, version, created-by user, and timestamps. The number MUST come from the organization's document sequence as `SO-` followed by six digits — the same digit width and the same first-use sequence allocation as the purchase order numbers — and MUST be unique per organization.
- **FR-002a**: The `SO-` and `SH-` sequences MUST be provisioned on first use inside the transaction that creates the document, under a per-organization advisory lock, so two concurrent first-uses cannot allocate the same number or create two sequence rows. The `document_sequences` table MUST carry a unique constraint on `(organization_id, name)`, and the sales-order and shipment numbers MUST carry a unique index on `(organization_id, number)`. Both MUST arrive in new migrations; existing migrations are never edited.
- **FR-003**: A sales order line MUST store its order, product, quantity, unit price, and line total. The quantity MUST be an exact decimal with three places and greater than zero. The unit price MUST be an exact decimal with four places and not negative. The line total MUST be an exact decimal with two places. One product MUST appear at most once on a sales order; duplicate products on create or update MUST be refused.
- **FR-004**: A stock reservation MUST store its sales order line, warehouse, product, quantity, and status (`ACTIVE`, `CONSUMED`, or `RELEASED`). Confirmation creates one ACTIVE reservation per line; shipment marks it CONSUMED; cancellation marks it RELEASED.
- **FR-005**: A shipment MUST store its `SH-` number, sales order, shipping user, and shipped-at timestamp, and its lines store the order line, product, and quantity. The number MUST come from the organization's document sequence as `SH-` followed by six digits and MUST be unique per organization. The schema MUST support several shipments per order; in this feature one shipment ships the whole order.
- **FR-006**: The server MUST calculate each line total as quantity × unit price, rounded half-up to two decimals, and the order total as the sum of the already-rounded line totals. The server MUST use exact decimal arithmetic, never JavaScript floating-point arithmetic. The rounding test vectors are: `3.333 × 1.2345 = 4.11`, `1.000 × 0.0050 = 0.01`, and `2.500 × 4.5000 = 11.25`.
- **FR-007**: All quantities, prices, line totals, order totals, and reservation quantities MUST travel in JSON as decimal strings. A client MUST NOT receive a JavaScript number for any of them.
- **FR-008**: Shipments and shipment lines MUST be append-only. The database MUST reject UPDATE, DELETE, and TRUNCATE on them, using the same trigger and privilege mechanism as the audit log. A posted shipment is corrected only by a compensating business process outside this feature's scope.

#### Sales-order lifecycle

- **FR-009**: Creating an order MUST save it as DRAFT, assign its `SO-` number from the organization's sequence inside the creating transaction, copy any submitted lines and unit prices, and calculate and store the line totals and order total. A draft MAY contain zero lines and then has a total of 0.00; confirmation still requires at least one line. The unit price defaults from the product's selling price and remains editable.
- **FR-010**: The customer on create, update, or confirm MUST be a non-archived contact with the customer role. The shipping warehouse MUST be active. Every product on a line MUST be non-archived. Any failure MUST refuse the whole request and leave no partial order.
- **FR-011**: Updating an order MUST be allowed only while it is DRAFT. The update MUST present the version the caller read; a stale version MUST return 409 `STALE_VERSION` and change nothing. A successful update MUST replace the editable header values and lines, recalculate all totals, and increment the version in the same transaction as its audit entry.
- **FR-012**: Confirming an order MUST be allowed only from DRAFT. It MUST require at least one line and the current version. A stale version MUST return 409 `STALE_VERSION`. A successful confirm MUST move the order to CONFIRMED, increment the version, and write its audit entry in the same transaction.
- **FR-013**: Confirming MUST happen in one transaction with a required `Idempotency-Key` header. The transaction MUST lock the order and the affected stock-balance rows in a fixed order (ascending product identifier) so concurrent confirmations cannot deadlock. For every line it MUST check availability — on hand minus reserved — with a conditional update, never trusting anything the interface showed. Confirmation is ALL OR NOTHING: if any line is short, nothing is reserved for any line, and the refusal returns 409 `INSUFFICIENT_STOCK` listing every short product with its available and required quantity. Otherwise the transaction creates one reservation per line, increases reserved quantities, sets the status to CONFIRMED, writes the audit entry, and stores the idempotency response.
- **FR-014**: Two simultaneous confirmations competing for the last units of a product MUST NOT both succeed; exactly one may reserve the stock.
- **FR-015**: Cancelling an order MUST be allowed from DRAFT, or from CONFIRMED while the order has no shipment. It MUST carry an `Idempotency-Key` and the current version; a stale version MUST return 409 `STALE_VERSION`. Cancelling a CONFIRMED order MUST release its ACTIVE reservations (reserved decreases; the reservations become RELEASED). Cancelling a SHIPPED order MUST return 409 `ORDER_SHIPPED`. A successful cancel MUST move the order to CANCELLED, increment the version, and write its audit entry in the same transaction as the release.
- **FR-016**: Any other status change MUST be refused with 409 `INVALID_STATE_TRANSITION`. The only permitted transitions are DRAFT → CONFIRMED, DRAFT → CANCELLED, CONFIRMED → CANCELLED, and CONFIRMED → SHIPPED.
- **FR-017**: A confirmed order MUST NOT be editable. A user who needs a change MUST cancel an eligible order and create a new one.

#### Shipments and stock deduction

- **FR-018**: Shipping a sales order MUST require an `Idempotency-Key` header and MUST happen in one transaction. The transaction MUST lock the order and the affected stock-balance rows, require the status CONFIRMED with an active reservation for every line, create the shipment and its lines, post a SHIPMENT stock movement for every shipped line through the Inventory module's service (never by writing the Inventory module's tables), decrease on-hand and reserved quantities by the shipped quantities, mark every reservation CONSUMED, set the status to SHIPPED, write the audit entry, and store the idempotency response — all in the same transaction. Negative stock is impossible. A failure at any step MUST leave nothing changed.
- **FR-018a**: The same key with the same request MUST return the stored response and create nothing. The same key with a different body MUST return 422 `IDEMPOTENCY_KEY_REUSED` and change nothing. A failed transaction MUST store no key record. The key record, request fingerprint, response, and expiry MUST commit in the same transaction as the business change.
- **FR-018b**: The ship response MUST include the shipment number and the resulting order status, and MUST be sufficient for the interface to show a success message naming the shipment.

#### Endpoints and queries

- **FR-019**: The system MUST expose a paginated sales-order list with search by order number or customer name, a status filter, sorting, page, page size capped at 100, and a total for the whole selection. It MUST also expose a single-order detail containing its lines and its shipment history, where each shipment carries its lines with product, shipped quantity, and the fulfilled order line.
- **FR-020**: The system MUST expose a paginated shipments list with search over shipment number, order number, or customer name, a date range on the shipped-at date, sorting, page, page size capped at 100, and a total for the whole selection. A date range whose end precedes its start MUST be refused with 400 `VALIDATION_ERROR` naming the date field. It MUST also expose a single-shipment detail carrying its lines with product, order line, and quantity.
- **FR-021**: Every endpoint MUST declare its required permission: sales-order reads and the shipments list and detail use `sales.read`; create, update, confirm, and cancel use `sales.write`; shipping uses `inventory.ship`. Missing or inactive membership or an absent permission MUST return 403. A disabled module is not enforced by this feature; FR-021a and FR-021b record the shared gate and the deferred requirement. (PRD 9.5 lists `inventory.read` for the shipments read endpoints; this specification resolves it to `sales.read` — shipments are sales documents, matching the Purchasing receipts rule — and the PRD table row is updated with a revision-history row v1.1.)
- **FR-021a**: Every sales endpoint MUST declare the shared Sales module gate — one guard or decorator named for the module — which currently allows every request. The gate MUST be the single place where a later module-disabled check is enabled, so the settings feature can turn it on without touching individual endpoints. The test suite MUST assert that every sales endpoint declares the gate, in the same way the permission test asserts that every endpoint declares its permission.
- **FR-021b**: The module-disabled refusal — 403 `MODULE_DISABLED` on the endpoints of a module an organization has turned off — is a requirement owned by the Organization settings feature (P0-F002), not by this feature. When that feature lands it MUST apply to Sales the rules that Sales requires Inventory and that turning Sales off MUST be refused while any sales order is DRAFT or CONFIRMED. This feature MUST NOT add an `organization_modules` table, a module-toggle endpoint, or any interface for it, and the canonical Sales documentation MUST record the dependency.

#### Usage protection

- **FR-022**: Archiving a customer that appears on any DRAFT or CONFIRMED sales order MUST be refused with 409 `CONTACT_IN_USE`. The refusal MUST name the blocking order so the user can resolve it.
- **FR-023**: Archiving a product that appears on any DRAFT or CONFIRMED sales order MUST be refused with 409 `PRODUCT_IN_USE`. The refusal MUST name the blocking order.
- **FR-024**: Deactivating a warehouse that is the shipping warehouse of any DRAFT or CONFIRMED sales order MUST be refused with 409 `WAREHOUSE_IN_USE`. The refusal MUST name the blocking order. The existing stock and default-warehouse refusals remain in force.
- **FR-025**: The usage checks MUST treat SHIPPED and CANCELLED orders as closed. A customer, product, or warehouse referenced only by closed orders may be archived or deactivated, subject to the existing stock and default-warehouse rules.

#### Audit, security, and isolation

- **FR-026**: Every create, update, confirm, cancel, and ship MUST write an audit entry with before and after values, the acting user, and the affected record, in the same transaction as the business change. A failed audit insert MUST roll the change back.
- **FR-027**: Every query MUST be scoped to the organization resolved from the signed-in session, never from a client-supplied organization identifier. A record of another organization MUST return 404 on every endpoint, including detail, list, update, confirm, cancel, and ship.
- **FR-028**: Every new table MUST enable row-level security with no policies, following the existing tenant-isolation pattern.
- **FR-029**: New migrations MUST be additive and immutable: existing migrations are never edited; all tables, constraints, indexes, triggers, privileges, and RLS changes arrive in new migrations only.

#### Interface

- **FR-030**: The Sales screens (order list, create and edit form with the line items editor, detail page, Confirm, Ship, and Cancel dialogs, and Shipments tab) MUST read and write the real service through the existing service seam. The Sales sample data MUST be deleted and the Sample data banner MUST no longer appear on any Sales screen. Pickers MUST load real customers, products, and warehouses.
- **FR-031**: Beside each line the form MUST show the real available quantity in the chosen warehouse as advice only. A quantity above it MUST show a warning, and the draft MUST still be saveable.
- **FR-032**: A confirm refused with `INSUFFICIENT_STOCK` MUST show every short product with its available and required quantity.
- **FR-033**: The Confirm, Ship, and Cancel dialogs MUST generate their idempotency key when they open and reuse that key on every retry of the same attempt, so a double click acts once. When the attempt ended in a definite answer — a success or a definite failure — closing and reopening the dialog MUST create a new key. When the attempt ended without a definite answer, for example a timeout or a lost connection, reopening MUST reuse the same key, so the retry cannot act twice.
- **FR-034**: After a confirm, ship, or cancel, the real Inventory balances and movements MUST show the effect when those screens refetch. The sales mutation MUST invalidate the affected sales, shipment, stock-balance, low-stock, and movement queries, and the open order's figures MUST refresh with them.
- **FR-035**: The "Create Invoice" action on a shipped order MUST stay disabled with the reason "Arrives with Invoicing".
- **FR-036**: Server refusals MUST appear inline with the request identifier the user can quote. A stale-version refusal MUST offer a reload. An insufficient-stock refusal MUST list the short products. A usage refusal MUST name the blocking record. An order-shipped refusal MUST explain the order has already shipped.
- **FR-037**: Actions the signed-in member lacks permission for MUST be hidden or disabled using the permissions returned by `GET /auth/me`. Hiding an action is a usability measure only; the server MUST remain the authority and MUST reject a direct call.
- **FR-038**: The still-sample Invoicing and Overview modules MUST keep their own private sample data. They MUST NOT read or write real sales, reservation, stock-balance, or stock-movement records.

#### Contract, invariants, and verification

- **FR-039**: The OpenAPI contract and the canonical Sales documentation MUST be regenerated from the implemented endpoints, and the contract-drift check MUST pass. The canonical Sales documentation MUST list the deferred module-disabled refusal of FR-021b and name the Organization settings feature as its owner.
- **FR-040**: The database invariant verification MUST prove: the reserved quantity in every balance equals the sum of its ACTIVE reservations; reserved never exceeds on hand; an order's total equals the sum of its line totals; a CONFIRMED order has an ACTIVE reservation for every line; a SHIPPED order has CONSUMED reservations and matching SHIPMENT movements; shipments and shipment lines reject update, delete, and truncate.
- **FR-041**: The automated tests MUST cover tenant isolation and permissions for every endpoint, the declaration of the shared Sales module gate by every sales endpoint, two simultaneous confirmations for the last units, a confirm racing a cancel, a ship racing a cancel, an inventory adjustment racing a confirm (the adjustment may never push on hand below reserved), duplicate requests, rollback on a failed movement or audit write, append-only shipments, the three rounding vectors, and the usage guards. Critical-path coverage MUST be at least 80%.
- **FR-042**: Integration tests MUST run against a real PostgreSQL instance in the isolated test schema only. The public schema's row counts MUST be unchanged after the suite. Tests MUST NOT use SQLite, in-memory persistence, or mocked database transactions for the critical rules. The contract-drift check and every existing guard MUST pass.

### Key Entities *(include if feature involves data)*

- **Sales order**: the organization's commitment to sell to a customer, with an `SO-` number, customer, shipping warehouse, status (`DRAFT`, `CONFIRMED`, `SHIPPED`, or `CANCELLED`), order date, notes, version, total, creator, and timestamps.
- **Sales order line**: one product on an order, with quantity, unit price (defaulted from the product's selling price and editable), and the rounded line total. One product appears at most once per order.
- **Stock reservation**: the hold placed on stock when an order is confirmed — order line, warehouse, product, quantity, and status (`ACTIVE`, `CONSUMED`, or `RELEASED`).
- **Shipment**: the permanent record that a confirmed order went out, with an `SH-` number, the sales order, the shipping user, the shipped-at timestamp, and its lines. Append-only; corrected only by a compensating process outside this feature's scope.
- **Shipment line**: the quantity of one sales order line shipped in one shipment, with its product.
- **Shipment list row**: a read projection of one shipment for the shipments list, with its number, linked order, customer, warehouse, shipped-at timestamp, shipping user, and line count; it carries no line detail.
- **Stock movement**: the Inventory module's immutable SHIPMENT entry posted for each shipped line. Sales asks the Inventory service to post it; Sales does not write the movement table.
- **Stock balance**: the Inventory module's per-warehouse, per-product on-hand and reserved quantities; confirm increases reserved and ship decreases on-hand and reserved, both through the Inventory service.
- **Idempotency record**: the stored outcome of one confirm, cancel, or ship attempt, scoped by organization, endpoint, and key, with the request fingerprint, response, and expiry.
- **Audit entry**: the before-and-after record of every sales create, update, confirm, cancel, and ship.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every new table (`sales_orders`, `sales_order_lines`, `stock_reservations`, `shipments`, `shipment_lines`) carries `organization_id`, every organization-owned relation uses composite keys `(organization_id, id)`, and every query uses the organization from the session context. Cross-organization records return 404. Every endpoint has a two-organization isolation test. RLS is enabled on every new table with no policies.
- **II. Server-enforced authority:** Each endpoint declares `sales.read`, `sales.write`, or `inventory.ship` and declares the shared Sales module gate; the server validates every status transition, every active/archived reference, every quantity, and every version. Invalid transitions return 409 `INVALID_STATE_TRANSITION`; the interface only hides actions and is never the authority.
- **III. Transactional integrity:** Confirm, cancel, and ship are each one transaction covering order and balance locks, reservation or shipment writes, movement posting through the Inventory service, balance changes, status updates, audit entries, and idempotency records. A failure leaves nothing. Shipments, shipment lines, movements, and audit entries are append-only and protected at the database level. Duplicate posting is impossible even without a key, through status checks, conditional updates, and unique constraints.
- **IV. Exact decimals:** Quantities are `NUMERIC(14,3)`; unit prices are `NUMERIC(14,4)`; line totals, order totals, and reservation quantities are `NUMERIC(14,2)` or finer as documented. Rounding is half-up per line at the point the value is persisted, and the order total sums the already-rounded line totals. All arithmetic is server-side exact decimal; JSON carries strings. The three required vectors are tests.
- **V. Test-first:** The failing tests are written before implementation: tenant isolation and permissions for every endpoint, the module-gate declaration, two simultaneous confirmations for the last units, confirm-versus-cancel and ship-versus-cancel races, adjustment-versus-confirm, duplicate requests, rollback, append-only shipments, rounding vectors, usage guards, and the invariant script. Integration tests use real PostgreSQL in the isolated schema and leave public counts unchanged.
- **VI. Module boundaries:** Sales owns its orders, lines, reservations, shipments, and shipment lines. It calls the Inventory module's service to post SHIPMENT movements and decrease balances; it never writes Inventory tables directly. The Contacts, Products, and Inventory modules answer the usage guards without creating circular dependencies.
- **VII. Honest boundaries:** This feature does not add tax, discounts, partial shipments, backorders, returns, credit notes, credit limits, price lists, delivery notes, carriers, invoices, approvals, attachments, or import/export. No label or document may imply tax compliance or complete accounting.
- **VIII. Design system and accessibility:** The existing Sales screens keep the design-system tokens and components, including the shared line items editor. The feature implements the PRD 7.3 rules: inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs for irreversible shipping, status badges with API names, and server-paginated tables with visible totals. WCAG 2.1 AA keyboard, focus, labeling, and error-message requirements apply.
- **IX. Scope discipline:** This is P0-F008 and P0-F009. The feature is limited to sales orders, confirmation with all-or-nothing reservation, whole-order shipment with stock deduction, the real Sales interface, and the required usage guards. Closing a partly shipped order, partial shipments, backorders, returns, invoices, and everything in the Out-of-scope list arrive in later features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A sales user can create, confirm, and ship a sales order without manually editing Inventory; reserved stock rises at confirm and on-hand and reserved fall at ship, and the real balances and movement history show it.
- **SC-002**: Two simultaneous confirmations for the last units of a product produce exactly one success; reserved never exceeds on hand.
- **SC-003**: A confirm where any line is short is refused in full; 409 `INSUFFICIENT_STOCK` names every short product with its available and required quantity, and zero reservations are created.
- **SC-004**: A request sent twice with the same idempotency key creates exactly one posting; a reused key with a different body returns 422 and changes nothing.
- **SC-005**: A failure in movement posting, reservation writing, or audit writing during confirm, cancel, or ship leaves zero reservations, zero movements, zero shipments, zero stock changes, zero order-status changes, and zero audit entries.
- **SC-006**: All three required rounding vectors produce exactly `4.11`, `0.01`, and `11.25`, and every order total equals the sum of its rounded line totals.
- **SC-007**: 100% of sales endpoints have passing tenant-isolation and permission tests, and 0 cross-organization records are readable or mutable.
- **SC-008**: Every attempt to update, delete, or truncate a shipment, shipment line, posted movement, or audit entry is refused by the database.
- **SC-009**: Archiving a customer or product, or deactivating a warehouse, while a DRAFT or CONFIRMED order references it is refused 100% of the time with the documented conflict and the blocking order named.
- **SC-010**: Release checks prove that every order total equals the sum of its lines, reserved equals the sum of active reservations per balance, every CONFIRMED order has an active reservation for every line, every SHIPPED order has consumed reservations and matching SHIPMENT movements, the published API contract matches the implementation, and the test run leaves unrelated public data unchanged.
- **SC-011**: The Sales screens show zero sample-data banners and read 100% of their sales data from the organization's real service; the "Create Invoice" action is disabled with the reason "Arrives with Invoicing".
- **SC-012**: A double click in the Confirm, Ship, or Cancel dialog acts once; a retry after an unknown outcome reuses the same key and does not post twice.
- **SC-013**: The shipments list returns exactly one row per shipment and a shipment-count total; a date range whose end precedes its start is refused with 400 `VALIDATION_ERROR` naming the date field.
- **SC-014**: Every `SO-` and `SH-` number comes from a sequence created on first use under a per-organization advisory lock; no number is ever allocated twice within an organization, and the database refuses a duplicate number for one organization.
- **SC-015**: Every sales endpoint declares its permission and the shared Sales module gate, proved by an automated test, and this feature ships no module table, no module-toggle endpoint, and no module-toggle interface.

## Assumptions

- The shipments read permission is `sales.read` (see the FR-021 clarification session); PRD 9.5 was updated to match.
- Document numbers `SO-` and `SH-` keep the six-digit width and the same first-use, per-organization advisory-lock allocation as the purchase order numbers; each document type has its own `document_sequences` row.
- Confirm and cancel are versioned writes, like update: a caller presents the version it read and a stale version returns 409 `STALE_VERSION`. Ship does not carry the version; the order lock, the status check, and the per-line active-reservation guard provide its concurrency safety, mirroring the goods-receipt precedent.
- The customer, warehouse, and product rules are enforced on create, update, and confirm, not only at confirm time.
- The ship request names no quantities: one shipment ships the whole order, and each shipment line carries the quantity that was reserved for its order line.
- `shipped_at` is the server time of the ship transaction. The order date defaults to the day the order is created when the user does not supply one.
- The available-quantity advice beside each line is the real available quantity in the chosen warehouse (on hand minus reserved); it warns but never blocks saving a draft.
- Statuses are exactly `DRAFT`, `CONFIRMED`, `SHIPPED`, `CANCELLED`; reservation statuses are exactly `ACTIVE`, `CONSUMED`, `RELEASED`; the movement type posted by shipping is `SHIPMENT`.
- Default page size is 25; maximum page size is 100. List totals count the whole selection, not the visible page. A shipment date range filters on `shipped_at` and includes both its start and end dates.
- Error codes: content-validation failures return 400 `VALIDATION_ERROR` with field details; `INSUFFICIENT_STOCK`, `STALE_VERSION`, `INVALID_STATE_TRANSITION`, `ORDER_SHIPPED`, `CONTACT_IN_USE`, `PRODUCT_IN_USE`, and `WAREHOUSE_IN_USE` return 409; `IDEMPOTENCY_KEY_REUSED` returns 422.
- The existing Sales pages, routes, design-system components, and translation structure are reused; this feature replaces their data source and behavior, not their visual language, and reuses the shared line items editor on the order form.
- The existing Inventory service is the only writer of stock movements and balances. Sales calls it inside the ship transaction; it does not duplicate its arithmetic.
- The still-sample Invoicing and Overview modules keep their own private sample data and never read or write real sales or stock data.
- No feature in this specification claims tax compliance, certified invoicing, or complete accounting.
- This feature is out of scope: partial shipments and backorders, discounts and taxes, returns and credit notes, customer credit limits, price lists, delivery notes and packing lists, shipping carriers, invoices (the next feature), attachments, import and export.
