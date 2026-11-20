# Feature Specification: Purchasing end to end — real purchase orders and goods receipts

**Feature Branch**: `main` (feature directory `specs/011-purchasing-end-to-end`)  
**Created**: 2026-11-12  
**Status**: Draft  
**MoSCoW Priority**: P0 (P0-F007 in `docs/PRD.md`; P3 is never implemented in v1 — Principle IX)  
**Input**: User description: "Build Purchasing end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F007, Sections 7.4, 8, 9.3, 9.6 and 9.8, the constitution, the existing Purchasing screens, and the Contacts, Products and Inventory features as the pattern (snake_case naming, composite organization keys, version numbers, audit entries, idempotency keys, RLS with no policies, migrations immutable)."

## Clarifications

### Session 2026-11-12

- Q: Which permission guards the goods-receipts list? → A: `purchasing.read`, matching the shared permission description "View purchase orders and receipts". Posting a receipt still requires `inventory.receive`; purchase-order reads use `purchasing.read` and purchase-order writes use `purchasing.write`.
- Q: Do confirm and cancel carry a version, like update? → A: Yes. Confirm and cancel are versioned state changes: each presents the version the caller read, a stale version returns 409 `STALE_VERSION`, and the version increments with the status change, in the same transaction as the audit entry.
- Q: What does a receipt request contain for lines that receive nothing? → A: The request may name every order line, but only lines with a quantity above zero create receipt lines and movements. An all-zero receipt is refused; a zero quantity is never stored as a receipt line.
- Q: How should a receipt request identify the purchase-order line each quantity belongs to? → A: Every quantity carries both the purchase-order line identifier and the product identifier. The server requires the pair to match the order's line, rejects a line identifier that is not on the order, rejects a product that does not match that line, and rejects duplicate entries for the same line.
- Q: Should a purchase order be saveable as a DRAFT with no lines? → A: Yes. A draft may contain zero lines and then has a total of 0.00; a user can save the header first and add lines later. Confirmation still requires at least one line.

### Session 2026-11-13

- Q: What should each row of the goods-receipts list represent? → A: One row per goods receipt, showing the `GR-` number, the linked order number, supplier, warehouse, received date, receiving user, line count, and a single aggregate received quantity. The server sums the line quantities with exact decimals and returns a decimal string; the aggregate is shown only when every line shares one unit of measure, otherwise the row shows the line count alone. Product search (name or SKU) matches any line but still returns one receipt row, and the whole-selection total counts receipts and is labelled as receipts. The list payload carries no line detail: activating a row opens the order's receipt history, where every line shows product, received quantity, unit of measure, and the order line it fulfils. Receipts offer no edit or delete control and the interface states they are permanent. The date range filters on the received date and an end before the start is refused with 400 `VALIDATION_ERROR` naming the date field.
- Q: How should the purchase-order list show received-of-ordered progress? → A: The server returns a progress summary with each order row, computed with exact decimals and returned as decimal strings, and the interface never recomputes it. When every line of the order shares one unit of measure, the summary carries the received total, the ordered total, and the unit abbreviation ("40 of 100 rolls"); when the units differ, it carries only the line counts ("2 of 5 lines fully received", a line counting as fully received when received equals ordered). The summary is the same for every status: a DRAFT shows no progress (not "0 of 100"), a CANCELLED order shows what was received before cancelling, a RECEIVED order shows complete. An automated check proves the status badge and the progress never contradict each other. The progress column is neither sortable nor filterable, and the order detail always shows the per-line table of ordered, received, and outstanding quantities.
- Q: What happens to FR-031's refusal for a disabled Purchasing module? → A: Module state is not implemented in this feature. The purchasing endpoints are protected by membership and permission only, and the dependency is recorded explicitly: the module-disabled refusal (403 `MODULE_DISABLED`) is a requirement owned by the Organization settings feature, which must apply to Purchasing the rules that Purchasing requires Inventory and that turning Purchasing off is refused while any order is DRAFT, CONFIRMED, or PARTIALLY_RECEIVED. Every purchasing endpoint runs through one shared module-gate hook — a guard or decorator named for the module — that currently allows everything, so the settings feature can enable the check in one place; a test asserts that every purchasing endpoint declares the hook, the way the default-deny test asserts that every endpoint declares a permission. No `organization_modules` table, toggle endpoint, or interface is added, and the interface keeps showing Purchasing as available in the sidebar.
- Q: What quantity defaults does the Receive goods dialog use? → A: Every quantity field starts blank — no per-line prefill and no `0.000` default — and one "Receive all outstanding" action fills every line that still has an outstanding quantity; the user can edit or clear any field before posting, and fully received lines show their field disabled and marked "Fully received". The post action stays disabled until at least one line carries a quantity above zero, and a blank quantity and a zero quantity both mean the line is not received. Before posting, the dialog shows a confirmation summary of the lines and quantities, the resulting order status, and the consequence that the receipt increases stock and cannot be edited or deleted. Quantities are entered and held as decimal strings with at most three decimals and never pass through a floating-point value; an amount above the outstanding quantity shows an inline error naming that outstanding quantity, and the server refuses it too. The idempotency key is generated when the dialog opens and reused on a retry; reopening generates a new key only when the previous attempt ended in a success or a definite failure, so an attempt whose outcome was unknown keeps its key and a double click posts one receipt. After a successful post the dialog closes, a toast names the GR number, and the order's received and outstanding figures refresh.
- Q: How are the `PO-` and `GR-` document sequences provisioned for organizations that already exist? → A: The sequence row is created on first use, inside the transaction that creates the document, under a per-organization advisory lock — the Inventory adjustment pattern — so two concurrent first-uses cannot allocate the same number or create two sequence rows. The `document_sequences` table gains a unique constraint on `(organization_id, name)` in a new migration, and the purchase-order and goods-receipt numbers gain a unique index on `(organization_id, number)`. The numbers keep the six-digit format this specification states, while the contacts and adjustment sequences use five.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create, confirm, and cancel a purchase order (Priority: P1)

As Nour, the purchasing officer, I want to create a purchase order for a supplier, confirm it when it is ready, and cancel it when it is no longer needed, so that the business has a controlled record of what it intends to buy.

**Why this priority**: The purchase order is the document the rest of the feature hangs from. Without a real draft, confirmation, and cancellation path there is nothing to receive against.

**Independent Test**: Create a purchase order for an active supplier, an active warehouse, and one active product; edit it while it is a draft; confirm it; then create another order and cancel it. The confirmed order cannot be edited, and the cancelled order cannot be received.

**Acceptance Scenarios**:

1. **Given** an active supplier, an active warehouse, and active products, **When** Nour creates a purchase order, **Then** it is saved as DRAFT with a `PO-` number from the organization's sequence, the entered lines, and a server-calculated total.
2. **Given** a DRAFT order, **When** Nour edits its supplier, warehouse, dates, notes, or lines with the current version, **Then** the changes are saved, the totals are recalculated, and the version increments.
3. **Given** a DRAFT order another user has already changed, **When** Nour saves with the older version, **Then** the save is refused with 409 `STALE_VERSION` and nothing changes.
4. **Given** a DRAFT order with at least one valid line, **When** Nour confirms it with the current version, **Then** it becomes CONFIRMED and can no longer be edited.
5. **Given** a DRAFT or CONFIRMED order with no receipts, **When** Nour cancels it, **Then** it becomes CANCELLED.
6. **Given** a CONFIRMED order with a receipt, **When** Nour tries to cancel it, **Then** it is refused with 409 `ORDER_HAS_RECEIPTS` and remains unchanged.
7. **Given** a RECEIVED order, **When** Nour tries to cancel or edit it, **Then** the request is refused with 409 `INVALID_STATE_TRANSITION`.
8. **Given** a valid supplier, warehouse, and order date but no lines, **When** Nour saves the order, **Then** it is saved as DRAFT with a total of 0.00, and it cannot be confirmed until at least one line is added.

---

### User Story 2 - Receive goods partially and in full (Priority: P1)

As Karim, the inventory clerk, I want to receive some or all of an order's quantities, so that stock increases once, the order shows what is still outstanding, and every receipt is permanent.

**Why this priority**: Receiving is the write path that turns a purchasing document into real stock. It carries the highest integrity risk: over-receipt, duplicate posting, partial writes, and concurrent receipts.

**Independent Test**: Confirm an order with two lines, receive part of one line, verify the order becomes PARTIALLY_RECEIVED and stock increases by exactly the received quantity, then receive the rest and verify the order becomes RECEIVED. Posting the same request twice creates one receipt.

**Acceptance Scenarios**:

1. **Given** a CONFIRMED order, **When** Karim posts a receipt for positive quantities no greater than each line's outstanding quantity, **Then** one goods receipt with a `GR-` number is created, a RECEIPT movement is posted for each received line, stock increases by the exact quantities, and the line and order statuses update.
2. **Given** a CONFIRMED or PARTIALLY_RECEIVED order, **When** every line ends with received equal to ordered, **Then** the order becomes RECEIVED; otherwise it becomes PARTIALLY_RECEIVED.
3. **Given** a line with an outstanding quantity of 5.000, **When** Karim tries to receive 5.001, **Then** the whole receipt is refused with 400 `OVER_RECEIPT`, naming the outstanding quantity, and nothing changes.
4. **Given** a receipt with every quantity zero or blank, **When** Karim posts it, **Then** it is refused and nothing changes.
5. **Given** an order that is DRAFT, CANCELLED, or RECEIVED, **When** Karim tries to receive against it, **Then** it is refused with 409 `INVALID_STATE_TRANSITION`.
6. **Given** an inactive destination warehouse, **When** Karim tries to receive, **Then** the receipt is refused and nothing changes.
7. **Given** the same idempotency key and the same request sent twice, **When** the second request arrives, **Then** the stored response is returned and no second receipt, movement, stock change, status change, or audit entry is created.
8. **Given** the same idempotency key with a different request body, **When** it is posted, **Then** it is refused with 422 `IDEMPOTENCY_KEY_REUSED` and nothing changes.
9. **Given** two receipts posted at the same moment on the same line, **When** both complete, **Then** the received quantity never exceeds the ordered quantity and the final stock is consistent.
10. **Given** a receipt racing a cancellation of the same order, **When** both complete, **Then** the outcome is consistent: either the receipt lands and the cancel is refused because the order has receipts, or the cancellation lands and the receipt is refused because the order is no longer receivable. Never both.
11. **Given** a failure while writing a movement or the audit entry, **When** the receipt transaction fails, **Then** no receipt, no receipt line, no stock change, and no status change remain.
12. **Given** a receipt that names a purchase-order line from another order, a product that does not match the named line, or the same line twice, **When** it is posted, **Then** the whole receipt is refused and nothing changes.

---

### User Story 3 - Browse purchase orders and goods receipts (Priority: P1)

As Nour, I want to search, filter, sort, and page through purchase orders and goods receipts, so that I can find an order, see what is still due, and trace what has arrived.

**Why this priority**: The lists are the working surface for purchasing. A receipt that cannot be found or an order whose outstanding quantity cannot be read does not help the user.

**Independent Test**: With several orders and receipts in the organization, search by order number and supplier name, filter by status, open an order detail, and open the goods-receipts tab filtered by date. The total count reflects the whole selection, not the visible page.

**Acceptance Scenarios**:

1. **Given** several purchase orders, **When** Nour opens the purchase-order list, **Then** each row shows the number, supplier, destination warehouse, status, order date, the server's progress summary — the aggregate received-of-ordered quantities with the unit abbreviation when every line shares one unit of measure, otherwise "N of M lines fully received" — and the total, with the whole-selection count.
2. **Given** a search term, **When** Nour searches, **Then** orders are matched by number or supplier name, and wildcard characters in the term are treated literally.
3. **Given** a status filter, **When** Nour applies it, **Then** only orders in that status are returned.
4. **Given** a sort column and direction, **When** Nour sorts, **Then** the list is ordered accordingly with a stable tie-break.
5. **Given** a page size above 100, **When** Nour asks for it, **Then** the page size is capped at 100 rather than rejected.
6. **Given** an order with lines and receipts, **When** Nour opens its detail, **Then** the detail always shows the per-line table of supplier, warehouse, dates, notes, every line's ordered, received, outstanding, unit cost, and line total, the order total, and its receipt history, so the list's aggregate is only a summary.
7. **Given** several goods receipts, **When** Nour opens the goods-receipts tab, **Then** each row shows the GR number, the linked order number, supplier, warehouse, received date, receiving user, and line count, plus one aggregate received quantity only when every line shares a unit of measure; otherwise only the line count. The whole-selection count counts receipts and is labelled as receipts.
8. **Given** a goods-receipt search and date range, **When** Nour applies them, **Then** only matching receipts are returned, product search (name or SKU) matches any line while still returning one row per receipt, and a range whose end precedes its start is refused with 400 `VALIDATION_ERROR` naming the date field. The range applies to the received date.
9. **Given** a record belonging to another organization, **When** Nour requests it by identifier, **Then** it is reported as not found.
10. **Given** a goods-receipt row, **When** Nour activates it, **Then** the interface opens the order's receipt history for that receipt, where every line shows its product, received quantity, unit of measure, and the order line it fulfils, and no edit or delete control is offered.
11. **Given** a receipt whose lines have different units of measure, **When** Nour views it, **Then** its list row shows the line count without an aggregate quantity, while its receipt history still shows every line with its own unit.
12. **Given** a seeded set of orders, **When** the automated consistency check runs, **Then** every RECEIVED order has all lines fully received, every PARTIALLY_RECEIVED order has at least one line with received above zero and at least one still outstanding, and every CONFIRMED order has zero received on every line.

---

### User Story 4 - Use the real Purchasing screens (Priority: P1)

As Nour, I want the Purchasing screens to use my organization's real suppliers, products, warehouses, orders, and receipts instead of sample data, so that what I see and post is real business data.

**Why this priority**: The backend is invisible until the screens stop using sample data. This story removes the sample banner, deletes the Purchasing sample data, and connects every purchasing surface to the real service.

**Independent Test**: Sign in to an organization with real contacts, products, and warehouses; create and confirm an order; receive part of it; see the real Inventory balance and movement increase; confirm that no sample-data banner appears anywhere in Purchasing.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open any Purchasing screen, **Then** the sample-data banner is absent and the content comes from the organization's real records.
2. **Given** the purchase-order form, **When** the user opens the supplier picker, **Then** only non-archived contacts with the supplier role are offered.
3. **Given** the purchase-order form, **When** the user opens the product picker, **Then** only non-archived products are offered.
4. **Given** the purchase-order form, **When** the user opens the warehouse picker, **Then** only active warehouses are offered.
5. **Given** a product is chosen on a line, **When** the line is created, **Then** its unit cost defaults to the product's purchase price and remains editable.
6. **Given** the Receive goods dialog, **When** it opens, **Then** it generates an idempotency key and reuses that key on every retry of the same attempt, so a double click posts one receipt. After an attempt whose outcome was unknown, such as a timeout, reopening the dialog reuses the same key; after an attempt that ended in a success or a definite failure, reopening generates a new one.
7. **Given** a posted receipt, **When** the user opens Inventory, **Then** the real stock balance and movement history show the receipt's effect.
8. **Given** a server refusal, **When** the screen shows it, **Then** the error appears inline with the request identifier; a stale-version refusal offers a reload, an over-receipt names the outstanding quantity, and a usage refusal names the blocking order.
9. **Given** a user without a purchasing permission, **When** they view a purchasing screen, **Then** actions they cannot perform are hidden or disabled using the permissions from `GET /auth/me`, while a direct API call is still refused by the server.
10. **Given** the still-sample Sales, Invoicing, and Overview modules, **When** they are used, **Then** they keep their own private sample data and never read or write real purchasing or stock data.
11. **Given** the Receive goods dialog, **When** it opens, **Then** every quantity field is blank, the "Receive all outstanding" action fills only the lines that still have an outstanding quantity, fully received lines are disabled and marked as fully received, and the post action stays disabled until at least one line carries a quantity above zero. Before posting, a confirmation summary names the lines, the quantities, the resulting order status, and the consequence that the receipt increases stock and cannot be edited or deleted.

---

### User Story 5 - Protect records referenced by open orders (Priority: P1)

As Hana, the administrator, I want the system to refuse archiving a product or supplier, or deactivating a warehouse, while an open purchase order still references it, so that an open order never points at a record that has been retired.

**Why this priority**: The usage guards are part of the feature's integrity contract. Without them, a confirmed order can be left with an archived supplier, an archived product, or an inactive destination warehouse.

**Independent Test**: Create a DRAFT order with a product, supplier, and warehouse; try to archive the product, archive the supplier, and deactivate the warehouse. Each is refused with the documented conflict and names the blocking order. Cancel the order and repeat: each action succeeds.

**Acceptance Scenarios**:

1. **Given** a product on a DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order, **When** a user tries to archive it, **Then** the request is refused with 409 `PRODUCT_IN_USE`, names the blocking order, and the product remains active.
2. **Given** a supplier on a DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order, **When** a user tries to archive it, **Then** the request is refused with 409 `CONTACT_IN_USE`, names the blocking order, and the supplier remains active.
3. **Given** a warehouse that is the destination of a DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order, **When** a user tries to deactivate it, **Then** the request is refused with 409 `WAREHOUSE_IN_USE`, names the blocking order, and the warehouse remains active.
4. **Given** the same product, supplier, or warehouse referenced only by RECEIVED or CANCELLED orders, **When** the user archives or deactivates it, **Then** the action is allowed, subject to the existing stock and default-warehouse rules.

---

### Edge Cases

- A receipt for an order whose destination warehouse was deactivated after confirmation → refused; no stock change.
- A product archived while an order is open → refused by the usage guard; an open order never references an archived product.
- A supplier archived while an order is open → refused by the usage guard.
- A warehouse deactivated while an open order names it → refused by the usage guard, in addition to the existing stock check.
- A receipt naming a purchase-order line from another order → refused; nothing changes.
- A receipt naming a product that does not match its purchase-order line → refused; nothing changes.
- A receipt containing the same purchase-order line twice → refused; nothing changes.
- A receipt line quantity with more than three decimal places → refused rather than rounded.
- A unit cost with more than four decimal places → refused rather than rounded.
- A quantity of zero or a negative quantity on an order line → refused.
- A unit cost below zero → refused.
- The same product twice on one order → refused; one line per product per order.
- An expected date before the order date → refused.
- An order with no lines → can be saved as a DRAFT with a total of 0.00, but cannot be confirmed.
- A receipt with no positive line → refused.
- A line already fully received → a further receipt for it is refused as an over-receipt.
- A receipt against a RECEIVED order → refused.
- A cancel of a PARTIALLY_RECEIVED order → refused because it has receipts.
- A cancel of a CONFIRMED order with no receipts → allowed.
- A confirm or cancel racing a receipt → one consistent outcome; never a cancelled order with a receipt or a receipt against a cancelled order.
- Two receipts on the same line at the same moment → serialized; the sum never exceeds ordered.
- A duplicate idempotency key with identical body → one receipt and the original response.
- A duplicate idempotency key with a different body → 422, no change.
- A receipt whose movement write or audit write fails → complete rollback.
- A posted receipt, receipt line, movement, or audit entry → cannot be updated, deleted, or truncated.
- An order total that does not equal the sum of its line totals → impossible after any successful write; the invariant check fails the build.
- A received quantity above ordered or below zero → impossible; the CHECK constraint and invariant check both refuse it.
- A page size above 100 → capped, not rejected.
- A goods-receipt date range with its end before its start → refused with 400 `VALIDATION_ERROR` naming the date field.
- A goods receipt whose lines use different units of measure → its list row shows the line count and no aggregate quantity; its receipt history still shows each line's own unit.
- A goods-receipt list payload → carries no line detail; the lines are read from the order's receipt history.
- An order whose lines use different units of measure → its list row shows "N of M lines fully received" and no aggregate quantity.
- A DRAFT order → its list row shows no progress figure, not "0 of 100".
- A purchasing endpoint called by an organization that would have Purchasing turned off → allowed in this feature; the shared module gate allows every request until the settings feature enables the check.
- A line with no outstanding quantity in the Receive goods dialog → its field is disabled and marked "Fully received"; it is never part of a receipt.
- A quantity above a line's outstanding quantity in the dialog → an inline error naming the outstanding quantity, and the server refuses the whole receipt.
- A receipt attempt whose outcome was unknown, for example a timeout → the dialog keeps its key, so the retry returns the stored answer instead of posting a second receipt.
- Every quantity in the dialog blank or zero → the post action stays disabled and nothing is posted.
- Two organizations creating their first purchase order at the same moment → each allocates from its own sequence, and the numbers stay unique per organization.
- A concurrent first use of one sequence → the advisory lock serializes the allocation, and the unique constraint makes a duplicate sequence row impossible.
- A sequence row that exists already → the allocation increments it; the row is never created a second time.
- A request for another organization's order or receipt by identifier → 404.
- A user without `purchasing.read` → cannot list or read orders or receipts.
- A user without `purchasing.write` → cannot create, update, confirm, or cancel an order.
- A user without `inventory.receive` → cannot post a receipt.
- A stale version on update, confirm, or cancel → 409 `STALE_VERSION`, no change.
- A server error mid-receipt → no receipt, no stock change, no order status change, and an inline error with the request identifier.

## Requirements *(mandatory)*

### Functional Requirements

#### Data, numbering, and exact amounts

- **FR-001**: The system MUST store purchase orders, purchase-order lines, goods receipts, and goods-receipt lines per organization. Every organization-owned table MUST carry `organization_id`, and every foreign key between organization-owned tables MUST be composite over `(organization_id, id)` so a cross-tenant relation is impossible.
- **FR-002**: A purchase order MUST store its `PO-` number, supplier, destination warehouse, status (`DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, or `CANCELLED`), order date, optional expected date, notes, total, version, created-by user, and timestamps. The number MUST come from the organization's document sequence as `PO-` followed by six digits and MUST be unique per organization.
- **FR-002a**: The `PO-` and `GR-` sequences MUST be provisioned on first use inside the transaction that creates the document, under a per-organization advisory lock, so two concurrent first-uses cannot allocate the same number or create two sequence rows. The `document_sequences` table MUST carry a unique constraint on `(organization_id, name)`, and the purchase-order and goods-receipt numbers MUST carry a unique index on `(organization_id, number)`. Both MUST arrive in new migrations; existing migrations are never edited.
- **FR-003**: A purchase-order line MUST store its order, product, ordered quantity, received quantity, unit cost, unit-of-measure abbreviation, and line total. The ordered quantity MUST be an exact decimal with three places and greater than zero. The received quantity MUST be an exact decimal with three places, zero or greater, and never above the ordered quantity. The unit cost MUST be an exact decimal with four places and not negative. The line total MUST be an exact decimal with two places. The unit-of-measure abbreviation MUST be captured from the product when the line is entered, so later changes to the product's unit do not alter the document or its receipt history.
- **FR-004**: One product MUST appear at most once on a purchase order. Duplicate products on create or update MUST be refused.
- **FR-005**: The server MUST calculate each line total as ordered quantity × unit cost, rounded half-up to two decimals, and the order total as the sum of the already-rounded line totals. The server MUST use exact decimal arithmetic, never JavaScript floating-point arithmetic. The rounding test vectors are: `3.333 × 1.2345 = 4.11`, `1.000 × 0.0050 = 0.01`, and `2.500 × 4.5000 = 11.25`.
- **FR-006**: All quantities, costs, line totals, and order totals MUST travel in JSON as decimal strings. A client MUST NOT receive a JavaScript number for any of them.
- **FR-007**: An order's expected date MUST be absent or greater than or equal to its order date. A supplied expected date before the order date MUST be refused.

#### Purchase-order lifecycle

- **FR-008**: Creating an order MUST save it as DRAFT, assign its `PO-` number from the organization's sequence inside the creating transaction, copy any submitted lines and unit costs, capture each line's unit-of-measure abbreviation, and calculate and store the line totals and order total. A draft MAY contain zero lines and then has a total of 0.00; confirmation still requires at least one line.
- **FR-009**: The supplier on create, update, or confirm MUST be a non-archived contact with the supplier role. The destination warehouse MUST be active. Every product on a line MUST be non-archived. Any failure MUST refuse the whole request and leave no partial order.
- **FR-010**: Updating an order MUST be allowed only while it is DRAFT. The update MUST present the version the caller read; a stale version MUST return 409 `STALE_VERSION` and change nothing. A successful update MUST replace the editable header values and lines, recalculate all totals, and increment the version in the same transaction as its audit entry.
- **FR-011**: Confirming an order MUST be allowed only from DRAFT. It MUST require at least one line and the current version. A stale version MUST return 409 `STALE_VERSION`. A successful confirm MUST move the order to CONFIRMED, increment the version, and write its audit entry in the same transaction.
- **FR-012**: Cancelling an order MUST be allowed from DRAFT, or from CONFIRMED only when the order has no receipts. It MUST require the current version. Cancelling an order with any receipt MUST return 409 `ORDER_HAS_RECEIPTS`. A successful cancel MUST move the order to CANCELLED, increment the version, and write its audit entry in the same transaction.
- **FR-013**: Any other status change MUST be refused with 409 `INVALID_STATE_TRANSITION`. The only permitted transitions are DRAFT → CONFIRMED, DRAFT → CANCELLED, CONFIRMED → CANCELLED when there are no receipts, CONFIRMED → PARTIALLY_RECEIVED, CONFIRMED → RECEIVED, and PARTIALLY_RECEIVED → RECEIVED.
- **FR-014**: A confirmed or received order MUST NOT be editable. A user who needs a change MUST cancel an eligible order and create a new one.
- **FR-015**: The system MUST expose a paginated purchase-order list with search by order number or supplier name, a status filter, sorting, page, page size capped at 100, and a total for the whole selection. It MUST also expose a single-order detail containing its lines and its receipt history, where each receipt carries its lines with product, received quantity, unit-of-measure abbreviation, and the fulfilled order line.
- **FR-015a**: Each purchase-order list row MUST carry a progress summary computed by the server with exact decimals and returned as decimal strings; the interface MUST NOT recompute it. When every line of the order shares one unit of measure, the summary MUST carry the received total, the ordered total, and the unit abbreviation. Otherwise it MUST carry the count of fully received lines and the line count, where a line is fully received when its received quantity equals its ordered quantity. The summary MUST reflect the quantities actually received rather than a status-derived placeholder: a DRAFT carries no progress figure, a CANCELLED order carries the progress it reached before cancelling, and a RECEIVED order carries complete progress. The progress MUST be neither sortable nor filterable.
- **FR-016**: The system MUST expose a paginated goods-receipt list with search over receipt number, order number, supplier, or product (name or SKU), a date range on the received date, sorting, page, page size capped at 100, and a total that counts receipts for the whole selection. A product search MUST match any line of a receipt while still returning one row per receipt. A date range whose end precedes its start MUST be refused with 400 `VALIDATION_ERROR` naming the date field.
- **FR-016a**: Each goods-receipt list row MUST represent exactly one receipt and carry its `GR-` number, the linked order's identifier and number, supplier name, warehouse name, received date, receiving user, and line count. It MUST also carry one aggregate received quantity — the exact sum of its line quantities, returned as a decimal string — only when every line shares one unit of measure; otherwise the aggregate MUST be absent and the interface MUST show the line count alone. The list payload MUST NOT carry line detail.

#### Goods receipts and stock

- **FR-017**: A goods receipt MUST store its `GR-` number, purchase order, receiving user, received-at timestamp, and lines. The number MUST come from the organization's document sequence as `GR-` followed by six digits and MUST be unique per organization. The supplier and destination warehouse are read from the purchase order and need not be duplicated on the receipt.
- **FR-018**: A goods-receipt line MUST store its goods receipt, purchase-order line, product, received quantity, and unit cost copied from the order line, and the unit-of-measure abbreviation copied from the order line. The quantity MUST be an exact decimal with three places and greater than zero.
- **FR-018a**: A receipt request MUST identify each quantity by both the purchase-order line identifier and the product identifier. The pair MUST match a line on the order being received. A line identifier from another order, a product that does not match the named line, or a duplicate entry for the same line MUST be refused and MUST leave nothing changed.
- **FR-019**: Goods receipts and goods-receipt lines MUST be append-only. The database MUST reject UPDATE, DELETE, and TRUNCATE on them, using the same trigger and privilege mechanism as the audit log. A posted receipt is corrected only by a compensating business process outside this feature's scope.
- **FR-020**: Posting a receipt MUST happen in one transaction and MUST require an `Idempotency-Key` header. The transaction MUST lock the order, its lines in a fixed order, and the affected stock-balance rows in ascending product identifier order so concurrent receipts cannot deadlock.
- **FR-021**: Posting a receipt MUST be refused when the order is not CONFIRMED or PARTIALLY_RECEIVED, when the destination warehouse is inactive, when the request contains no positive line, or when any quantity exceeds that line's outstanding quantity. An over-receipt MUST return 400 `OVER_RECEIPT` with no tolerance and MUST name the outstanding quantity. An invalid order state MUST return 409 `INVALID_STATE_TRANSITION`.
- **FR-022**: A successful receipt MUST create the goods receipt and its lines, post a RECEIPT stock movement for every received line through the Inventory module's service, increase on-hand stock by the exact quantities, update each line's received quantity, set the order to PARTIALLY_RECEIVED or RECEIVED, write the audit entry, and store the idempotency response — all in the same transaction. The Purchasing module MUST NOT write the Inventory module's tables directly.
- **FR-023**: The idempotency record MUST be scoped by organization, endpoint, and key and MUST store the request fingerprint, response status, response body, and expiry. The same key with the same request MUST return the stored response and create nothing. The same key with a different body MUST return 422 `IDEMPOTENCY_KEY_REUSED` and change nothing. A failed transaction MUST store no key record.
- **FR-024**: A failure at any step of a receipt — validation, receipt insert, receipt-line insert, movement posting, quantity update, status update, audit insert, or idempotency record — MUST roll back every part of the receipt. No receipt, no stock change, and no status change may remain.
- **FR-025**: The receipt response MUST include the goods-receipt number and the resulting purchase-order status, and MUST be sufficient for the interface to show a success message naming the receipt. After a successful post the dialog MUST close, the interface MUST show a success toast naming the receipt, and the open order's received and outstanding figures MUST refresh.

#### Usage protection

- **FR-026**: Archiving a product that appears on any DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order MUST be refused with 409 `PRODUCT_IN_USE`. The refusal MUST name the blocking order so the user can resolve it.
- **FR-027**: Archiving a supplier that appears on any DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order MUST be refused with 409 `CONTACT_IN_USE`. The refusal MUST name the blocking order.
- **FR-028**: Deactivating a warehouse that is the destination of any DRAFT, CONFIRMED, or PARTIALLY_RECEIVED purchase order MUST be refused with 409 `WAREHOUSE_IN_USE`. The refusal MUST name the blocking order. The existing stock and default-warehouse refusals remain in force.
- **FR-029**: The usage checks MUST treat RECEIVED and CANCELLED orders as closed. A product, supplier, or warehouse referenced only by closed orders may be archived or deactivated, subject to the existing stock and default-warehouse rules.

#### Audit, security, and isolation

- **FR-030**: Every create, update, confirm, cancel, and receipt MUST write an audit entry with before and after values, the acting user, and the affected record, in the same transaction as the business change. A failed audit insert MUST roll the change back.
- **FR-031**: Every endpoint MUST declare its required permission: purchase-order reads and the goods-receipts list use `purchasing.read`; create, update, confirm, and cancel use `purchasing.write`; posting a receipt uses `inventory.receive`. Missing or inactive membership or an absent permission MUST return 403. A disabled module is not enforced by this feature; FR-031a and FR-031b record the shared gate and the deferred requirement.
- **FR-031a**: Every purchasing endpoint MUST declare the shared Purchasing module gate — one guard or decorator named for the module — which currently allows every request. The gate MUST be the single place where a later module-disabled check is enabled, so the settings feature can turn it on without touching individual endpoints. The test suite MUST assert that every purchasing endpoint declares the gate, in the same way the permission test asserts that every endpoint declares its permission.
- **FR-031b**: The module-disabled refusal — 403 `MODULE_DISABLED` on the endpoints of a module an organization has turned off — is a requirement owned by the Organization settings feature (P0-F002), not by this feature. When that feature lands it MUST apply to Purchasing the rules that Purchasing requires Inventory and that turning Purchasing off MUST be refused while any purchase order is DRAFT, CONFIRMED, or PARTIALLY_RECEIVED. This feature MUST NOT add an `organization_modules` table, a module-toggle endpoint, or any interface for it, and the canonical Purchasing documentation MUST record the dependency.
- **FR-032**: Every query MUST be scoped to the organization resolved from the signed-in session, never from a client-supplied organization identifier. A record of another organization MUST return 404 on every endpoint, including detail, list, update, confirm, cancel, and receipt.
- **FR-033**: Every new table MUST enable row-level security with no policies, following the existing tenant-isolation pattern. The application role MUST NOT be able to bypass the organization scope by using a client-supplied identifier.
- **FR-034**: New migrations MUST be additive and immutable: existing migrations are never edited; all tables, constraints, indexes, triggers, privileges, and RLS changes arrive in new migrations only.

#### Interface

- **FR-035**: The Purchasing screens (purchase-order list, create and edit form, detail page, Receive goods dialog, and Goods receipts tab) MUST read and write the real service through the existing service seam. The Purchasing sample data MUST be deleted and the Sample data banner MUST no longer appear on any Purchasing screen. The create and edit form MUST allow a draft with zero lines to be saved.
- **FR-035a**: The goods-receipts list MUST display one row per receipt with its number, linked order, supplier, warehouse, received date, receiving user, line count, and the conditional aggregate quantity defined by FR-016a. The whole-selection total MUST be labelled as receipts. Activating a row MUST open that receipt's lines in the order's receipt history. The list and the receipt history MUST offer no edit or delete control for a receipt, and the interface MUST state that posted receipts are permanent.
- **FR-035b**: The purchase-order list's progress column MUST display the server's summary verbatim — the aggregate received-of-ordered quantities with the unit abbreviation when every line shares a unit of measure, otherwise "N of M lines fully received" — and MUST show no progress figure for a DRAFT order. The order detail page MUST always show the per-line table of ordered, received, and outstanding quantities.
- **FR-035c**: The Purchasing entry MUST remain visible and available in the sidebar. The interface MUST NOT simulate a "turned off in Settings" state; that state arrives with the settings feature.
- **FR-036**: The purchase-order form's supplier picker MUST offer only non-archived contacts with the supplier role, its product picker only non-archived products, and its warehouse picker only active warehouses.
- **FR-037**: Choosing a product on a line MUST default the unit cost to that product's purchase price and leave it editable. The line total and order total MUST be displayed from the server's exact decimal rules; the interface MUST NOT invent a different rounding rule.
- **FR-038**: The Receive goods dialog MUST generate its idempotency key when it opens and reuse that key on every retry of the same attempt, so a double click posts exactly one receipt. When the attempt ended in a definite answer — a success or a definite failure — closing and reopening the dialog MUST create a new key. When the attempt ended without a definite answer, for example a timeout or a lost connection, reopening MUST reuse the same key, so the retry cannot create a second receipt.
- **FR-038a**: The Receive goods dialog MUST open with every quantity field blank — no per-line prefill and no `0.000` default — and MUST offer one "Receive all outstanding" action that fills only the lines that still have an outstanding quantity; the user MUST be able to edit or clear any field before posting. A line with no outstanding quantity MUST show its field disabled and marked "Fully received". The post action MUST stay disabled until at least one line carries a quantity above zero; a blank quantity and a zero quantity both mean the line is not received. Before posting, the dialog MUST show a confirmation summary of the lines and quantities, the resulting order status, and the consequence that the receipt increases stock and cannot be edited or deleted. Quantities MUST be entered and held as decimal strings with at most three decimals and MUST NOT pass through a floating-point value. A quantity above the line's outstanding quantity MUST show an inline error naming that outstanding quantity.
- **FR-039**: Server refusals MUST appear inline with the request identifier the user can quote. A stale-version refusal MUST offer a reload. An over-receipt refusal MUST name the outstanding quantity. A usage refusal MUST name the blocking order.
- **FR-040**: Actions the signed-in member lacks permission for MUST be hidden or disabled using the permissions returned by `GET /auth/me`. Hiding an action is a usability measure only; the server MUST remain the authority and MUST reject a direct call.
- **FR-041**: After a receipt, the real Inventory balances and movements MUST show the receipt's effect when those screens refetch. The Purchasing mutation MUST invalidate the affected purchasing, goods-receipt, stock-balance, low-stock, and movement queries, and the open purchase order's received and outstanding figures MUST refresh with them.
- **FR-042**: The still-sample Sales, Invoicing, and Overview modules MUST keep their own private sample data. They MUST NOT read or write real purchasing, goods-receipt, stock-balance, or stock-movement records.

#### Contract, invariants, and verification

- **FR-043**: The OpenAPI contract and the canonical Purchasing documentation MUST be regenerated from the implemented endpoints, and the contract-drift check MUST pass. The canonical Purchasing documentation MUST list the deferred module-disabled refusal of FR-031b and name the Organization settings feature as its owner.
- **FR-044**: The database invariant verification MUST prove that received never exceeds ordered, that an order's total equals the sum of its line totals, and that an order's status agrees with its line quantities: DRAFT, CONFIRMED, and CANCELLED orders have zero received on every line; PARTIALLY_RECEIVED orders have at least one line with a positive received quantity and at least one line still outstanding; RECEIVED orders have received equal to ordered on every line. It MUST also prove that goods receipts and receipt lines reject update, delete, and truncate, and that every receipt line has a matching RECEIPT movement with agreeing totals.
- **FR-045**: The automated tests MUST cover tenant isolation and permissions for every endpoint, the declaration of the shared Purchasing module gate by every purchasing endpoint, simultaneous receipts on the same line, a receipt racing a cancel, duplicate requests, rollback on a failed movement or audit write, append-only receipts, the three rounding vectors, the mixed-unit receipt aggregate, the one-row-per-receipt list with its date-range refusal, the mixed-unit order progress summary, the order status/progress consistency check over a seeded set of orders, and the usage guards. Critical-path coverage MUST be at least 80%.
- **FR-046**: Integration tests MUST run against a real PostgreSQL instance in the isolated test schema only. The public schema's row counts MUST be unchanged after the suite. Tests MUST NOT use SQLite, in-memory persistence, or mocked database transactions for the critical rules.

### Key Entities *(include if feature involves data)*

- **Purchase order**: the organization's commitment to buy from a supplier, with a `PO-` number, destination warehouse, status, dates, notes, version, total, creator, and timestamps.
- **Purchase-order line**: one product on an order, with ordered quantity, received quantity, unit cost, unit-of-measure abbreviation captured when the line was entered, and rounded line total. One product appears at most once per order.
- **Purchase-order progress summary**: the server-computed progress of one order in the list — the received and ordered totals with a unit abbreviation when every line shares a unit of measure, otherwise the count of fully received lines and the line count. The interface never recomputes it.
- **Goods receipt**: a permanent record that goods arrived against an order, with a `GR-` number, receiving user, received-at timestamp, and lines; its warehouse and supplier are read from its order.
- **Goods-receipt line**: the quantity of one purchase-order line received in one receipt, with its product, copied unit cost, and copied unit-of-measure abbreviation.
- **Goods-receipt list row**: a read projection of one receipt for the receipts list, with its number, linked order, supplier, warehouse, received date, receiving user, line count, and an aggregate quantity only when every line shares a unit of measure; it carries no lines.
- **Stock movement**: the Inventory module's immutable RECEIPT entry created for each received line. Purchasing asks the Inventory service to post it; Purchasing does not write the movement table.
- **Stock balance**: the Inventory module's per-warehouse, per-product on-hand and reserved quantities, increased by the receipt through the Inventory service.
- **Idempotency record**: the stored outcome of one receipt attempt, scoped by organization, endpoint, and key, with the request fingerprint, response, and expiry.
- **Audit entry**: the before-and-after record of every purchasing create, update, confirm, cancel, and receipt.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every new table carries `organization_id`, every organization-owned relation uses composite keys `(organization_id, id)`, and every query uses the organization from the session context. Cross-organization records return 404. Every endpoint has a two-organization isolation test. RLS is enabled on every new table with no policies.
- **II. Server-enforced authority:** Each endpoint declares `purchasing.read`, `purchasing.write`, or `inventory.receive`, and declares the shared Purchasing module gate; the server validates every status transition, every active/archived reference, every quantity, and every version. Invalid transitions return 409 `INVALID_STATE_TRANSITION`; the interface only hides actions and is never the authority.
- **III. Transactional integrity:** A receipt is one transaction covering order and line locks, receipt and receipt-line inserts, RECEIPT movements through the Inventory service, balance increases, received-quantity updates, status update, audit entry, and idempotency record. A failure leaves nothing. Receipts, receipt lines, movements, and audit entries are append-only and protected at the database level.
- **IV. Exact decimals:** Ordered, received, and movement quantities are `NUMERIC(14,3)`; unit costs are `NUMERIC(14,4)`; line totals and order totals are `NUMERIC(14,2)`. Rounding is half-up per line and totals sum already-rounded lines. All arithmetic is server-side exact decimal; JSON carries strings. The three required vectors are tests.
- **V. Test-first:** The failing tests are written before implementation: tenant isolation and permissions for every endpoint, concurrent receipts, receipt-versus-cancel race, duplicate request, rollback, append-only receipts, rounding vectors, usage guards, and the invariant script. Integration tests use real PostgreSQL in the isolated schema and leave public counts unchanged.
- **VI. Module boundaries:** Purchasing owns its orders, lines, receipts, and receipt lines. It calls the Inventory module's service to post RECEIPT movements and increase stock; it never writes Inventory tables directly. The Products, Contacts, and Inventory modules expose the usage answers Purchasing needs without creating circular dependencies.
- **VII. Honest boundaries:** This feature does not add tax, discounts, landed costs, supplier invoices, bills, returns, approvals, or valuation. No label or document may imply tax compliance or complete accounting.
- **VIII. Design system and accessibility:** The existing Purchasing screens keep the design-system tokens and components. The feature implements the PRD 7.3 rules: inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs for irreversible receipts, status badges with API names, and server-paginated tables with visible totals. WCAG 2.1 AA keyboard, focus, labeling, and error-message requirements apply.
- **IX. Scope discipline:** This is P0-F007. The feature is limited to purchase orders, partial/full goods receipts, the real Purchasing interface, and the required usage guards. Closing a partly received order short, returns, supplier invoices, taxes, discounts, landed costs, valuation, approvals, attachments, email/printing, and import/export are out of scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A purchasing user can create, confirm, and receive a purchase order without manually editing Inventory, and the received quantity appears in the real stock balance and movement history.
- **SC-002**: Two simultaneous receipts against the same line produce zero over-receipts; the sum of received quantities never exceeds the ordered quantity.
- **SC-003**: A receipt request sent twice with the same idempotency key creates exactly one receipt, one set of receipt lines, one set of stock movements, one stock change, one status change, and one audit entry.
- **SC-004**: A reused idempotency key with a different body returns 422 and changes nothing.
- **SC-005**: A failure in movement posting or audit writing leaves zero receipts, zero receipt lines, zero stock changes, and zero order-status changes.
- **SC-006**: All three required rounding vectors produce exactly `4.11`, `0.01`, and `11.25`, and every order total equals the sum of its rounded line totals.
- **SC-007**: 100% of purchasing endpoints have passing tenant-isolation and permission tests, and 0 cross-organization records are readable or mutable.
- **SC-008**: Every attempt to update, delete, or truncate a goods receipt, receipt line, or related posted movement is refused by the database.
- **SC-009**: Archiving a product or supplier, or deactivating a warehouse, while an open order references it is refused 100% of the time with the documented conflict and the blocking order named.
- **SC-010**: Release checks prove that every order total equals the sum of its lines, every status agrees with its received quantities, posted receipts cannot be changed or removed, the published API contract matches the implementation, and the test run leaves unrelated public data unchanged.
- **SC-011**: The Purchasing screens show zero sample-data banners and read 100% of their purchasing data from the organization's real service.
- **SC-012**: A purchasing user can see, for every order line, ordered, received, and outstanding quantities, and can identify a fully received order from a partially received one without opening the database.
- **SC-013**: The goods-receipts list returns exactly one row per receipt and a receipt-count total; every row shows its line count, and only a receipt whose lines all share a unit of measure shows an aggregate quantity. A mixed-unit receipt's lines remain visible in its receipt history.
- **SC-014**: Across a seeded set of orders, the list's progress figure never contradicts the status badge: every RECEIVED order has all lines fully received, every PARTIALLY_RECEIVED order has at least one line received above zero and at least one still outstanding, and every CONFIRMED order has zero received on every line.
- **SC-015**: Every purchasing endpoint declares the shared Purchasing module gate, proved by an automated test, and this feature ships no module table, no module-toggle endpoint, and no module-toggle interface.
- **SC-016**: A double click in the Receive goods dialog posts exactly one receipt, a retry after an unknown outcome reuses the same key and posts no second receipt, and the post action stays disabled while every quantity is blank or zero.
- **SC-017**: Every `PO-` and `GR-` number comes from a sequence created on first use under a per-organization advisory lock; no number is ever allocated twice, no organization ends up with two sequence rows for the same document, and the database refuses a duplicate number for one organization.

## Assumptions

- The goods-receipts list uses `purchasing.read`, following the shared permission catalog's "View purchase orders and receipts" description and the feature input. This resolves the PRD 9.5 table's `inventory.read` entry for that endpoint in favor of the more specific catalog description; receipt posting remains `inventory.receive`.
- Confirm and cancel are versioned writes, like update. A caller presents the version it read; a stale version returns 409 `STALE_VERSION`. This extends the version pattern used by warehouses and products.
- A receipt request may include every order line, but only positive quantities create receipt lines and movements. A zero quantity is not stored; an all-zero receipt is refused.
- A receipt copies the order line's unit cost and unit-of-measure abbreviation so the receipt history is reproducible. It does not create supplier invoices, bills, or stock valuation.
- The goods-receipts list is receipt-level and carries no lines; it shows an aggregate received quantity only when every line shares a unit of measure. Activating a row opens the receipt's lines in the order's receipt history.
- The purchase-order list's progress column shows the server's progress summary and never a figure the interface derived itself. The column is not sortable or filterable; sorting and filtering stay on the status and the dates.
- This feature does not implement module availability. There is no `organization_modules` table, no module-toggle endpoint, and no interface for one; the module-disabled refusal is owned by the Organization settings feature (FR-031b), and the shared Purchasing module gate lets that feature enable the check in one place.
- Quantities in the Receive goods dialog are entered and held as decimal strings with at most three decimals; the interface never converts them to a floating-point number.
- The `PO-` and `GR-` numbers keep the six-digit format this specification states, while the contacts and adjustment sequences use five digits; changing that width is a separate decision and is out of scope here.
- The existing Purchasing pages, routes, design-system components, and translation structure are reused; this feature replaces their data source and behavior, not their visual language.
- The existing Inventory service is the only writer of stock movements and balances. Purchasing calls it inside the receipt transaction; it does not duplicate its arithmetic.
- Default page size is 25; maximum page size is 100. List totals count the whole selection, not the visible page.
- Statuses and their API names are exactly `DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, and `CANCELLED`.
- The organization uses one currency. Prices are copied onto document lines and never recalculated from later product changes.
- Content-validation failures — confirming with zero lines, an all-zero receipt, a duplicate product line, or an expected date before the order date — return 400 `VALIDATION_ERROR` with field details. Over-receipt returns 400 `OVER_RECEIPT`; state conflicts return 409; idempotency mismatch returns 422.
- A goods-receipt date range filters on the received date and includes both its start and end dates.
- A receipt request does not carry the purchase-order version. The order lock, status check, and per-line outstanding-quantity guard provide its concurrency safety; the version governs header edits and confirm/cancel.
- A usage refusal names at least one blocking open order. When several exist, the response may list them; the interface must show the order or orders named.
- No feature in this specification claims tax compliance, certified invoicing, or complete accounting.
