# Feature Specification: Inventory end to end — real stock for every organization

**Feature Branch**: `010-inventory-end-to-end`  
**Created**: 2026-11-12  
**Status**: Draft  
**MoSCoW Priority**: P0 (P0-F006 in `docs/PRD.md`; P3 is never implemented in v1 — Principle IX)  
**Input**: User description: "Build Inventory end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F006, Sections 7.4, 8, 9.3, 9.6 and 9.8, the constitution, the existing Inventory screens, and the Contacts and Products features as the pattern (snake_case naming, composite organization keys, version numbers, audit entries, RLS with no policies, migrations immutable)."

## Clarifications

### Session 2026-11-12

- Q: Does the unfiltered stock-balances list include products that have no stock rows at all, and how do the two shapes coexist? → A: The unfiltered list returns balance rows only (products with stock rows). The low-stock filter is product-level and additionally returns every low-stock product that has no balance rows at all, as a single row per product with the default warehouse shown and on hand, reserved and available as 0. It is the same row shape as a real balance row but marked as having no stock yet, and its "Adjust stock" action preselects the product and the default warehouse, so the first movement creates the balance row. The low-stock count and the filter come from the one shared low-stock definition, so the count always equals the number of products the filter returns; a test asserts this with zero-stock products included. When the filter is off, the interface shows a visible hint whenever the low-stock count is above the number of low-stock products already visible ("N products need attention, some have no stock rows yet. Show low stock"). For the filtered list the total counts products, for the unfiltered list it counts balance rows; the interface labels which one it is ("N products" versus "N rows"), so the totals are never confused. Sorting is stable across both shapes (ties broken by SKU, then warehouse). Archived products never appear in either shape.
- Q: Does a real warehouse carry a code, given that the PRD's warehouse model has none but the current screen shows one? → A: No code. A warehouse is identified by its name only, unique case-insensitively per organization (a unique index on organization_id and lower(name)), trimmed, 1 to 100 characters. The Code column and the Code field are removed from the Warehouses screen. Anything that must name a warehouse (movements, documents, selects) shows the name; internal references use the id. Recorded as a follow-up, outside this feature: an optional short code can be added later as a nullable unique column if a pilot business needs warehouse codes on printed documents.
- Q: Do warehouse writes carry a version, so two administrators cannot overwrite each other? → A: Warehouses carry a version (integer, not null, starting at 1). Update, deactivate and reactivate must send the version they read; a stale version returns 409 STALE_VERSION and the interface prompts a reload. The version increments on every successful write, in the same transaction as the change and its audit entry. Setting a warehouse as the default is also a versioned write, and it is atomic: the previous default is cleared and the new one set in one transaction, so exactly one default exists at every moment (the partial unique index enforces it), and both rows' versions increment. A migration backfills version 1 for existing warehouses. Concurrency tests cover it: two simultaneous updates with the same version, so exactly one succeeds and the other gets 409; and a deactivation racing a stock adjustment into the same warehouse, so the outcome is consistent (either the adjustment lands and the deactivation is refused as holding stock, or the deactivation lands and the adjustment is refused as targeting an inactive warehouse; never both).
- Q: A product can be archived while it still holds on-hand stock, and archived products never appear in the balances list — so how does someone write off that leftover stock? → A: Archived products still never appear in the default balances list, the low-stock filter, the low-stock count or any product picker. They remain reachable in two explicit ways: a status filter value "Archived with stock" on the balances tab (it lists only archived products whose total on hand is above zero, labelled Archived on each row), and an "Adjust stock" action on the archived product's own detail page when it holds stock, preselecting the product and warehouse. When the filter is off, show a visible hint whenever archived products still hold stock: "N archived products still hold stock. Show them", so leftover stock is never invisible. On an archived product only DECREASING adjustments are allowed (write-offs; reasons DAMAGE, LOSS, COUNT_CORRECTION or OTHER with a note). An increase is refused 409 PRODUCT_ARCHIVED with the message "Restore the product before adding stock". The existing rules still apply: the result cannot go below the reserved quantity or below zero. Receipts, shipments and any other document line for an archived product stay refused; only adjustments are the exception. The movement history always shows archived products' movements with an Archived label, and a posted write-off is a normal ADJUSTMENT movement that is audited like any other. Tests: an archived product with stock is absent from the default list and present under the archived-with-stock filter; a write-off posts and an increase is refused; the hint count matches the filter; the low-stock count ignores archived products; restoring the product makes it appear normally again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjust stock and see the balance move (Priority: P1)

As Karim, the stock controller, I want to post a signed stock adjustment with a reason so that the balance on hand is corrected and I can explain every quantity change.

**Why this priority**: The adjustment is the only write path the Inventory feature owns; without it there is no real stock to read. It also carries the riskiest guarantees (idempotency, concurrency, append-only history).

**Independent Test**: Post an adjustment of +5.000 on a product in a warehouse, then read the balance back: on hand grew by exactly 5, one movement exists, one audit entry exists, and the movement carries an `ADJ-` document number.

**Acceptance Scenarios**:

1. **Given** a signed quantity, a reason and a warehouse/product, **When** Karim posts the adjustment, **Then** the balance changes by exactly that signed quantity, an immutable movement and an audit entry are written, and the response carries the new balance and the movement's document number.
2. **Given** an adjustment that would drive on hand below zero, **When** it is posted, **Then** it is refused with a conflict and nothing is written.
3. **Given** an adjustment that would drive on hand below the reserved quantity, **When** it is posted, **Then** it is refused with a conflict and nothing is written.
4. **Given** the reason "other" without a note, **When** it is posted, **Then** it is refused with a validation message.
5. **Given** the same request sent twice with the same idempotency key, **When** the second attempt arrives, **Then** the original response is returned and only one movement exists.
6. **Given** the same idempotency key with a different request body, **When** it is posted, **Then** it is refused with a validation conflict and nothing is written.
7. **Given** two adjustments posted at the same moment on the same balance, **When** both complete, **Then** they are serialized, the final balance is correct, and stock never goes negative or below reserved.

---

### User Story 2 - See the organization's real stock balances (Priority: P1)

As Salma, I want to browse the stock balances of my organization — by product and warehouse, with search and filters — so that I know what is on hand, what is reserved and what is available.

**Why this priority**: The balance list is the feature's main read surface and the answer to "how much do we have?".

**Independent Test**: With two warehouses and a few products in stock, open the Stock balances screen: rows show on hand, reserved and available per product and warehouse; searching by SKU narrows the list; the low-stock-only filter shows exactly the products that qualify.

**Acceptance Scenarios**:

1. **Given** stock spread over several warehouses, **When** Salma opens Stock balances, **Then** each row shows the product, warehouse, on hand, reserved and available, and the list reports its total row count.
2. **Given** a search term containing `%` or `_`, **When** Salma searches, **Then** the term is matched literally rather than as a wildcard.
3. **Given** a warehouse filter and a low-stock-only filter, **When** both are set, **Then** only matching rows are returned, and the returned products are exactly the products the low-stock rule selects — including products that have no stock at all but do have a threshold.
4. **Given** a page size above the maximum, **When** Salma asks for it, **Then** the request is capped rather than rejected.
5. **Given** a record belonging to another organization, **When** Salma asks for it, **Then** it is not found.

---

### User Story 3 - Explain every quantity change (Priority: P1)

As Salma, I want the movement history of my organization — who changed what, when and why — so that a stock discrepancy can be traced to its cause.

**Why this priority**: The movement ledger is what makes stock trustworthy; a balance without its history is a number nobody can defend.

**Independent Test**: Post two movements, then open the Movements screen: both appear, newest first, each naming product, warehouse, signed quantity, type, reason, note, source and acting user; filters by product, warehouse, type and date range narrow the list.

**Acceptance Scenarios**:

1. **Given** several movements, **When** Salma opens Movements, **Then** each row shows the date, type, product, warehouse, signed quantity change, reason, source and user, and the list is sortable and pageable.
2. **Given** a product, warehouse, type or date-range filter, **When** Salma sets it, **Then** only matching movements are returned.
3. **Given** a date range whose end precedes its start, **When** Salma submits it, **Then** the request is refused with a validation message.
4. **Given** a posted movement, **When** anyone tries to change or remove it, **Then** the database refuses.

---

### User Story 4 - Manage warehouses (Priority: P2)

As Karim, I want to create, rename, deactivate and reactivate warehouses — with exactly one default per organization — so that stock is held in places that make sense for the business.

**Why this priority**: Warehouses already exist (each organization has one default), so this story extends rather than creates; it is needed before stock can be spread across more than one place.

**Independent Test**: Create a second warehouse, rename it, deactivate it, then reactivate it: each step is reflected, and the organization still has exactly one default warehouse.

**Acceptance Scenarios**:

1. **Given** a new warehouse name, **When** Karim creates it, **Then** the warehouse exists in his organization only.
2. **Given** a name already used in the same organization (in any letter case), **When** Karim creates or renames to it, **Then** the request is refused.
3. **Given** a warehouse holding stock, **When** Karim tries to deactivate it, **Then** the request is refused with a conflict.
4. **Given** the organization's default warehouse, **When** Karim tries to deactivate it, **Then** the request is refused with a conflict.
5. **Given** a deactivated warehouse, **When** Karim reactivates it, **Then** it becomes active again.
6. **Given** an organization with several warehouses, **When** a new default is designated, **Then** exactly one default remains.

---

### User Story 5 - The Inventory screens show my organization's real stock (Priority: P1)

As Salma, I want the Inventory screens to show my organization's real stock instead of sample data, so that what I read matches what the business actually holds.

**Why this priority**: Until the screens read the real service, none of the backend work is visible to a user; this is the half of the feature that lands in the product.

**Independent Test**: Open Stock balances, Movements and Warehouses signed in to an organization with stock: no sample-data banner appears, the data shown is the organization's own, and a posted adjustment immediately appears in the balance and the history.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open the Inventory screens, **Then** the sample-data notice is gone and the content comes from the organization's own records.
2. **Given** the adjust-stock dialog, **When** the user opens it and submits twice, **Then** only one movement is created.
3. **Given** the service refuses a request, **When** the screen shows it, **Then** the refusal appears inline with the identifier the user can quote.
4. **Given** a module that still uses sample data (Purchasing, Sales, Invoicing, Overview), **When** it is used, **Then** it keeps its own private sample stock, never reads or writes the real stock, and says so.

---

### Edge Cases

- A product spread over two warehouses where neither warehouse alone is at the threshold, but the total is → the product is low stock.
- The same product with a reservation that pushes the total down to the threshold → still low stock; reserved counts as unavailable.
- A product with a threshold and no movements at all → zero available, therefore low stock.
- A product with no configured threshold → never low stock, and no status indicator at all.
- An archived product → never low stock, regardless of quantities.
- Stock held only in a deactivated warehouse → excluded from the total, so the product is judged on its active warehouses alone.
- The low-stock count and the low-stock filter must always agree: the count equals the number of products the filter returns, including products that have no stock rows yet.
- A product that has a threshold and no movements appears under the low-stock filter as a single row with no stock yet — the same row shape, with zero quantities and the default warehouse — and its adjust-stock action preselects that product and the default warehouse.
- With the low-stock filter off, the screen states how many products need attention when some of them have no stock rows yet and are therefore not visible.
- An archived product that still holds stock → absent from the default list and from the low-stock count, present under the archived-with-stock filter, and still adjustable: a write-off posts, while an increase is refused with a conflict telling the user to restore the product first.
- An adjustment against a product/warehouse combination that has no balance yet → the balance starts at zero and is created by the movement.
- A balance that exists but whose product or warehouse was archived meanwhile → the balance and its movements remain readable and immutable.
- A quantity of zero → refused; a movement of zero is meaningless.
- A negative signed quantity that would still leave stock ≥ reserved → allowed (it removes stock).
- Two administrators renaming the same warehouse at the same moment → exactly one succeeds; the other is told the record changed and must reload.
- A deactivation racing a stock adjustment into the same warehouse → the outcome is consistent: either the adjustment lands and the deactivation is refused because the warehouse now holds stock, or the deactivation lands and the adjustment is refused because the warehouse is inactive. Never both, never neither.
- A warehouse holding stock in a deactivated warehouse → impossible by construction: deactivation requires zero stock, and an adjustment into a deactivated warehouse is refused.
- A very large quantity (more than 12 digits before the decimal) → refused by the database, not truncated.
- The same idempotency key sent for a different endpoint → treated as a different request (keys are scoped per endpoint).
- An idempotency key older than the retention window → purged; the same key may then be used again.
- A warehouse name differing only by letter case → refused as a duplicate.
- Two administrators activating a different default warehouse at the same moment → exactly one default survives.
- A product archived while it still has reserved stock → refused.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST expose warehouse management for the signed-in organization only: list, create, update, deactivate and reactivate. A warehouse is identified by its **name only** — there is no code. The name MUST be trimmed, 1 to 100 characters long, and unique within the organization, compared case-insensitively. The Code column and the Code field MUST NOT appear on the Warehouses screen; anything that names a warehouse (movement rows, documents, selectors) shows the name, while internal references use the identifier.
- **FR-002**: Exactly one warehouse per organization MUST be the default, enforced by the database rather than by application code. Designating a new default MUST demote the previous one, and that demotion-and-promotion MUST happen in one transaction so exactly one default exists at every moment.
- **FR-002b**: Every warehouse MUST carry a version number (an integer, never null, starting at 1). Update, deactivate and reactivate MUST present the version they read; a stale version MUST be refused with a conflict, and the interface MUST prompt the user to reload. The version increments on every successful write, in the same transaction as the change and its audit entry. Setting a warehouse as the default is a versioned write like any other.
- **FR-003**: Deactivating a warehouse that is the organization's default MUST be refused, and deactivating a warehouse that holds stock (on hand or reserved above zero) MUST be refused. Both refusals are conflicts, and nothing changes.
- **FR-004**: Stock balances MUST be recorded per organization, warehouse and product, holding on-hand and reserved quantities as exact decimals with three decimal places, never negative, with reserved never exceeding on-hand, and a version number. Available quantity is on-hand minus reserved and MUST NOT be stored.
- **FR-005**: A balance that does not exist MUST mean zero on hand and zero reserved. A balance MUST be created when the first movement for that combination is posted.
- **FR-006**: Every stock change MUST create a movement recording the organization, warehouse, product, type, signed quantity (never zero, three decimal places), reason, note, source type, source id, source number, acting user and time.
- **FR-007**: Movements MUST be append-only, enforced by the database itself, and on-hand MUST always equal the sum of the movements for that balance.
- **FR-008**: Posting an adjustment MUST require an idempotency key, a signed quantity, a reason (damage, loss, found, count correction or other — a note is required for "other") and MUST assign a document number from the organization's sequence.
- **FR-009**: Posting an adjustment MUST happen in one transaction that locks the balance row, refuses a result below zero or below reserved (conflict), inserts the movement, updates the balance and writes the audit entry. A posted adjustment MUST NOT be editable or deletable; a mistake is corrected by a compensating adjustment. An adjustment MUST be refused when it targets a deactivated warehouse.
- **FR-010**: The service MUST record idempotency outcomes per organization, endpoint and key, with the request fingerprint, the response status and body, and a 24-hour retention, written in the same transaction as the business change. The same key with the same request MUST return the stored response and create nothing; the same key with a different request MUST be refused with a validation conflict. Expired records MUST be purged by a cleanup.
- **FR-011**: The service MUST expose stock balances and stock movements as readable lists. Balances MUST support search over SKU and product name (treating wildcards in the term literally), a warehouse filter, a low-stock-only filter, sorting, paging with a maximum page size of 100, and a total count.
  - The **unfiltered** list returns balance rows only — products that actually hold stock somewhere.
  - The **low-stock filter** is product-level: it returns every low-stock product, and additionally every low-stock product that has no balance rows at all, as a single row for that product showing the default warehouse with on hand, reserved and available all zero, marked as having no stock yet. Both shapes share one row shape, so a client renders them identically.
  - A dedicated status filter, **archived with stock**, returns only archived products whose total on hand is above zero, each row labelled as archived. This is the only way archived stock appears in the balances list.
  - Archived products appear in neither the default list nor the low-stock filter, and are never counted as low stock.
  - Sorting is stable across both shapes, with ties broken by SKU and then warehouse.
  - The total counts balance rows for the unfiltered list and products for the filtered list; the service reports which total it is, so a client can label it ("N products" versus "N rows") instead of guessing.
  - The low-stock count and the low-stock filter MUST come from the one shared low-stock definition, so the count always equals the number of products the filter returns.
- **FR-012**: The service MUST expose stock movements with product search, warehouse, type and date-range filters, sorting and paging. A range whose end precedes its start MUST be refused. The movement history MUST always show archived products' movements, each labelled as archived.
- **FR-013**: The low-stock rule MUST be stated once — in one place the filter, the low-stock count, the stock-status indicator and the later dashboard all call — and MUST NOT be reimplemented anywhere else.
  - **Scope**: only non-archived products with a configured threshold. An archived product is never low stock.
  - **Quantity**: the sum over active warehouses of (on hand minus reserved). Reserved stock counts as unavailable.
  - **Low when** that total is at or below the threshold; a threshold of zero means low when nothing is available.
  - **A product with no balance rows at all** counts as zero available, so a product with a threshold and no movements IS low stock. The filter and the count are therefore computed at product level with a left join, never by scanning balance rows, so those products are not missed.
  - **Stock status is a product-level classification**: out of stock (total available at or below zero, taking precedence), low stock, in stock, and none at all when the threshold is not configured. The same product-level status appears on each of that product's warehouse rows in the balances list, while each row still shows its own on hand, reserved and available quantities.
- **FR-014**: Archiving a product that still has reserved stock MUST be refused with a conflict. The same usage check MUST govern warehouse deactivation.
- **FR-014b**: On an archived product, only **decreasing** adjustments are allowed — write-offs with reason damage, loss, count correction, or other with a note. An increase MUST be refused with a conflict carrying the message "Restore the product before adding stock". The ordinary rules still apply to a write-off: the result may not fall below the reserved quantity nor below zero. Every other kind of document line for an archived product stays refused — only adjustments are the exception — and a posted write-off is an ordinary adjustment movement, audited like any other.
- **FR-015**: All quantity arithmetic MUST be performed by the database or with exact decimals — never with approximate floating-point arithmetic. Quantities with three decimal places and the classic 0.1 + 0.2 = 0.3 case MUST be exact.
- **FR-016**: Every adjustment and every warehouse change MUST write an audit entry with the values before and after, in the same transaction as the change.
- **FR-017**: Records belonging to another organization MUST be reported as not found. Every endpoint MUST declare the inventory read, write or adjust permission it needs, and refuse without it. Every new table MUST enable row-level security with no policies.
- **FR-018**: The published API contract and the accompanying documentation MUST be regenerated so that the contract-drift check passes.
- **FR-019**: The database invariant verification MUST additionally prove that on-hand equals the sum of movements for every balance, that reserved never exceeds on-hand, and that movements refuse updates, deletes and truncation.
- **FR-020**: The Inventory screens (stock balances, movements, warehouses and the adjust-stock dialog) MUST read and write the real service through the existing service seam; their sample data MUST be deleted, and the sample-data notice MUST no longer appear on them.
  - The balances screen MUST label whether the visible total counts products or rows, and MUST show a visible hint whenever the low-stock count exceeds the number of low-stock products already visible ("N products need attention, some have no stock rows yet. Show low stock"), so a product with no stock yet is never silently invisible.
  - The balances screen MUST offer the archived-with-stock filter, and MUST show a visible hint whenever archived products still hold stock ("N archived products still hold stock. Show them"), so leftover stock of a discontinued product is never invisible.
  - The adjust-stock action on a low-stock row that has no stock rows yet MUST preselect that product and the organization's default warehouse, so the first movement creates the balance row. The archived product's own detail page MUST offer an adjust-stock action while it still holds stock, preselecting that product and a warehouse.
- **FR-021**: The adjust-stock dialog MUST generate its idempotency key when it opens and reuse it on every retry of that same attempt, so a double click creates exactly one movement.
- **FR-022**: A refused request MUST be shown inline with the identifier the user can quote.
- **FR-023**: Modules that still use sample data (purchasing, sales, invoicing, overview) MUST keep their own private sample stock, MUST never read or write the real stock, and MUST keep their sample labelling until their own features land.
- **FR-024**: Migrations MUST be additive and immutable: existing migrations are never edited; new tables, columns, constraints, triggers and policies arrive in new migrations only.

### Key Entities *(include if feature involves data)*

- **Warehouse**: a place where an organization holds stock. Name (unique per organization, case-insensitive), default flag, active/deactivated state, version.
- **Stock balance**: the quantity state of one product in one warehouse of one organization: on-hand, reserved, version. Absent means zero.
- **Stock movement**: an immutable record of one quantity change: type, signed quantity, reason, note, source reference, acting user, time.
- **Stock adjustment**: a request to post a movement with a signed quantity and a reason; the actor's intent, not a stored record of its own beyond the movement it creates.
- **Idempotency record**: the outcome of one posting attempt, keyed by organization, endpoint and key, with the request fingerprint, the response, and an expiry.
- **Low-stock rule**: a product's configured threshold and its computed total available quantity across active warehouses.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every new table carries `organization_id` and is reached only through the organization in the session context; composite organization keys are the norm (as in contacts and products). Records of another organization are reported as not found, never as forbidden. Row-level security is enabled on every new table with no policies, exactly as the constitution requires.
- **II. Server-enforced authority:** Every endpoint declares the permission it needs (inventory read, inventory write or inventory adjust) and the guard refuses without it — including the usage checks that refuse archiving and deactivation. No decision is made in the interface.
- **III. Transactional integrity:** An adjustment is a multi-record operation — lock, movement, balance, audit — and happens in one transaction; a failure of any part leaves no balance change. The idempotency record is written in that same transaction. Movements and audit entries are append-only, enforced at the database level, and cannot be edited or deleted.
- **IV. Exact decimals:** On-hand, reserved and every movement quantity are exact decimals with three decimal places; available is derived, never stored; all arithmetic happens in the database or with exact decimals, and the decimal test vectors (including 0.1 + 0.2 = 0.3) are part of the suite.
- **V. Test-first:** The failing tests come first: tenant isolation and permission tests for every endpoint, the concurrency test for simultaneous adjustments, the duplicate-request tests, the rollback test, the append-only test, and the invariant script.
- **VI. Modular boundaries:** The inventory capability is its own module; it does not write other modules' tables. Cross-module work (the product archive usage hook) is a call from the products capability into the inventory capability, not a write across the boundary. No circular dependency is introduced.
- **VII. Honest boundaries:** No claim of tax compliance, accounting, valuation or costing is made; stock is a quantity, not a value.
- **VIII. Design system and accessible experience:** The screens reuse the existing design-system components, states and tokens (including the sample-data banner's removal and the inline error treatment with the request identifier); the design-system checks and the no-raw-design-values check keep passing.
- **IX. Scope discipline:** P0, because PRD P0-F006 gates purchasing receipts and sales reservations. Reservations, receipts, shipments, transfers, lots, serial numbers, valuation, costing, import and export are explicitly out of scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every inventory endpoint proves its tenant isolation and its permission requirement in an automated suite that runs only against the isolated schema and leaves the public schema's row counts unchanged.
- **SC-002**: Two adjustments posted simultaneously against the same balance produce a correct final balance, with stock never negative and never below the reserved quantity.
- **SC-003**: Posting the same request twice with the same idempotency key creates exactly one movement and returns the same response; the same key with a different body is refused with a validation conflict and creates nothing.
- **SC-004**: A failed audit write or a failed movement insert leaves the balance exactly as it was.
- **SC-005**: A posted movement cannot be updated, deleted or truncated — the database refuses.
- **SC-006**: The database invariant verification passes, including that on-hand equals the sum of movements for every balance.
- **SC-007**: A user signed in to an organization with stock sees that stock on the Inventory screens, with no sample-data notice, and sees a posted adjustment immediately in the balance and in the history.
- **SC-008**: The published contract and the documentation match the running service, and the contract-drift check and every existing guard pass.
- **SC-009**: Every quantity the interface shows matches the stored quantity exactly, including three-decimal quantities and the 0.1 + 0.2 = 0.3 case, in both English and Arabic.
- **SC-010**: The low-stock count and the low-stock filter always agree — a test asserts the equality with zero-stock products included — and a product that needs attention but has no stock rows yet is never invisible to the user.
- **SC-011**: Two administrators writing the same warehouse at once never lose a change — one write succeeds, the other is told to reload — and a deactivation racing an adjustment into the same warehouse always leaves one consistent outcome.
- **SC-012**: Stock left behind by an archived product is never invisible and never unfixable — it is visible through the archived-with-stock filter and the accompanying hint, it can be written off, and adding stock to an archived product is refused until the product is restored.

## Assumptions

- The low-stock rule is the one confirmed during clarification on 2026-11-12 and is captured verbatim in FR-013: scope (non-archived, threshold configured), quantity (sum over active warehouses of on-hand minus reserved), threshold comparison (at or below, zero threshold means low when nothing is available), products with no balance rows count as zero available (therefore low when a threshold exists), and the product-level status ladder (out of stock first, then low stock, in stock, none without a threshold). It must live in one shared implementation that the filter, the count, the status indicator and the later dashboard call.
- Reserved quantities exist in the model and are enforced, but nothing in this feature creates a reservation (sales reservations are out of scope), so reserved stays at zero until that feature lands.
- The idempotency layer and the idempotency table are built as part of this feature because no posting endpoint exists yet and the first one is this one (PRD 9.6, P0-F014 foundation).
- The `warehouses` table is extended by new, additive migrations (active flag, version, name uniqueness and its index), and existing warehouses are backfilled with version 1 — existing migrations are never edited.
- Document numbering for adjustments continues the organization's document sequences with the `ADJ-` prefix, like the other numbered documents.
- The still-sample modules keep their private sample stock; the overview's low-stock figures stay labelled sample until the dashboard feature lands.
- Errors follow the shared envelope (code, message, details, request identifier) with the documented status codes: 400 validation, 403 forbidden, 404 not found, 409 conflict, 422 idempotency conflict.
- Follow-up, outside this feature: an optional short warehouse code may be added later as a nullable unique column if a pilot business needs warehouse codes on printed documents. It is not part of this feature and no interface field is reserved for it.
