# Feature Specification: Products End to End

**Feature Directory**: `specs/008-products-end-to-end`
**Feature Branch**: `008-products-end-to-end`
**Created**: 2026-11-11
**Status**: Ready for Planning
**MoSCoW Priority**: P0 (P0-F005 Product Catalog)
**Input**: User description: "Build Products end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F005, Sections 7.4 and 9, the constitution, the existing Products screens, and the Contacts feature as the pattern to follow (naming convention snake_case, composite organization keys, version numbers, audit entries, RLS with no policies)."

## Clarifications

### Session 2026-11-11
- Q: How is the low-stock threshold stored? → A: One optional threshold per product, on the product record as a nullable decimal with three places and a non-negative check; null means stock is not tracked against a threshold; the API carries it as a decimal string; no computed low-stock flag is ever stored; what the threshold is compared against is the Inventory feature's decision, and a per-warehouse override table is a recorded follow-up; the interface uses one term, "Reorder level (low-stock threshold)", matching the Inventory and Overview screens.
- Q: What currency are the prices in? → A: One currency per organization; products carry no currency column; the organization's currency becomes a stored setting (`currency_code`, ISO 4217, three uppercase letters, not null, default USD for existing and new organizations) added by a new migration and exposed read-only on the identity and current-organization answers so the interface can show it beside the prices; the interface formats the decimal strings with that code and performs no conversion and no arithmetic on money; changing the currency is out of scope and arrives with the Organization settings feature, which owns the rule that the currency locks once any order or invoice exists; the Organization settings screen and registration choosing a currency are recorded as follow-ups.
- Q: Which products does the list show by default? → A: The list starts on active products, and the status filter offers Active, Archived and All; the server applies the default when no status parameter is sent and the interface shows the current filter visibly, so the default is never hidden; an archived product carries an Archived badge wherever it appears and stays reachable by its direct link and by search under the Archived or All filter; when a search matches nothing under Active but matches archived products, the empty state says so and offers "Show archived"; the product pickers used by documents never offer archived products.
- Q: Does creating a product create stock rows? → A: No stock rows and no stock tables in this feature; the Inventory feature creates the balance row lazily on the first movement for a product and a warehouse, so nothing here may assume a balance row exists and a later reader treats a missing balance as zero on hand and zero reserved; the dependency is made explicit in two places, the archive usage hook that Purchasing, Sales and Inventory implement is the single extension point through which Inventory refuses archiving a product that has reserved stock or open documents, and the product detail screen shows no stock figure at all (a clearly labelled "Stock arrives with Inventory" note is acceptable); no stock columns are added to the products table.
- Q: Is the product name unique within the organization? → A: Only the SKU is unique (case-insensitively, per organization) and two products may share a name; to protect users from accidental duplicates the create form shows a non-blocking notice when another product in the organization has the same name (case-insensitively), naming that product's SKU and linking to it, and the user may still save; the notice is advisory only and the API never rejects a duplicate name; product lists show the SKU next to the name everywhere so same-named products stay distinguishable, and pickers match on both SKU and name.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and View a Product (Priority: P1)

As an authorized user (holding `products.write`), I want to record a product with its
SKU, name, category, unit of measure and prices, and immediately inspect it, so
that purchasing, stock, sales and invoices all refer to the same product data.

**Why this priority**: The catalog is the shared reference every downstream
transaction names. Until a product can be created and read back, no purchase
order, stock movement or invoice can point at a real item.

**Independent Test**: Submit the New Product form with valid attributes, receive
the saved product with its assigned version and an active status, confirm it is
listed for the organization only, and open its detail screen.

**Acceptance Scenarios**:

1. **Given** a user holding `products.write`, **When** they save a product with
   SKU "SKU-1001", name "Blue T-Shirt", a category, the unit "piece", purchase
   price "4.5000" and selling price "9.9900", **Then** the product is saved for
   the organization with version 1, is not archived, an audit entry recording the
   created values is written in the same transaction, and the interface shows a
   confirmation naming the product.
2. **Given** a user holding `products.write`, **When** they save a product with a
   low-stock threshold, **Then** the threshold is stored with three decimal
   places and is offered wherever stock is later reported.
3. **Given** a user holding `products.read`, **When** they open a product, **Then**
   every stored value is shown exactly as it was saved, including the prices,
   which are displayed as the decimal values that were recorded.
4. **Given** a member of another organization, **When** they request a product
   belonging to this one by its identifier, **Then** the answer is "not found" -
   the record's existence is not disclosed.

---

### User Story 2 - Find Products in a Large Catalog (Priority: P2)

As a user holding `products.read`, I want to search by SKU or name, filter by
category and by status, sort the results and page through them, so that I can
find a product quickly as the catalog grows.

**Why this priority**: A catalog that cannot be searched becomes unusable once
it holds hundreds of products; the filter and paging must happen where the data
lives, not in the browser.

**Independent Test**: Populate products with varied SKUs, names, categories and
statuses, then issue list requests with a search term (including wildcard
characters), a category filter, a status filter, a sort column and a page size,
and verify the returned subset, the total count and the page metadata.

**Acceptance Scenarios**:

1. **Given** products whose names and SKUs contain punctuation and wildcard
   characters, **When** a user searches for a term containing those characters,
   **Then** the characters are treated as literal text, and only the matching
   products of that organization are returned.
2. **Given** a category filter and a status filter, **When** the list is
   requested, **Then** only the products matching both are returned, together
   with the total number of matching products, the current page and the page
   size.
3. **Given** more results than one page holds, **When** the user asks for the
   next page, **Then** the next set is returned, and the page size can never
   exceed 100.

---

### User Story 3 - Correct a Product Without Losing Someone Else's Work (Priority: P3)

As an operations manager (holding `products.write`), I want to correct a
product's details, and I want to be told when someone else changed the same
product while I was editing, so that my change never silently overwrites theirs.

**Why this priority**: Prices and names are edited from several places in an
ERP; a silent overwrite loses data that the business cannot reconstruct.

**Independent Test**: Read a product, change it with the version that was read,
and see the version increase and the new values; then try to save again with
the version that was read before, and be refused.

**Acceptance Scenarios**:

1. **Given** a product at version 3, **When** the user saves a change carrying
   version 3, **Then** the change is applied, the version becomes 4, and an
   audit entry records the values before and after.
2. **Given** a product whose version has moved on since the user opened it,
   **When** the user saves their change, **Then** the save is refused, nothing
   is changed, and the interface offers to reload the current version.
3. **Given** a product that already uses the SKU the user is entering, **When**
   they save, **Then** the save is refused and the conflicting product is named,
   with the SKU field marked.
4. **Given** a price with more decimal places than the system stores, a negative
   price, or a price sent as a number rather than a decimal string, **When** the
   user saves, **Then** the save is refused and the offending field is marked.

---

### User Story 4 - Retire a Product Without Deleting It (Priority: P4)

As a user holding `products.write`, I want to archive a product that is no longer
sold, and restore it if it comes back, so that the history of documents that
refer to it stays intact.

**Why this priority**: A product named by a posted document must never vanish;
archival is the only way out, and the refusal to archive a product that is still
in use protects the business from breaking its own documents.

**Independent Test**: Archive a product, see it disappear from the active list
while remaining readable, restore it, and see it return; then, with the usage
check reporting the product as in use, try to archive it and be refused.

**Acceptance Scenarios**:

1. **Given** a product that is not in use, **When** the user archives it, **Then**
   it leaves the active list, remains readable by identifier, an audit entry
   records the change, and the interface confirms it.
2. **Given** an archived product, **When** the user restores it, **Then** it
   returns to the active list with an audit entry recording the change.
3. **Given** a product that open documents or reserved stock still reference,
   **When** the user archives it, **Then** the archive is refused and the
   product stays active.
4. **Given** an archived product, **When** a new product is created with the same
   SKU, **Then** the save is refused: the SKU stays reserved by the archived
   product.

---

### User Story 5 - Manage Categories and Units of Measure (Priority: P5)

As a user holding `products.write`, I want to maintain the categories and units
of measure my organization trades in, so that products are classified and priced
consistently, and every organization starts with a usable set.

**Why this priority**: Categories and units are the vocabulary every product is
described in; without them the catalog has to accept free text that nothing can
be filtered by.

**Independent Test**: List the categories and units an organization starts with,
create a new category and a new unit, and see them offered in the product form.

**Acceptance Scenarios**:

1. **Given** a newly created organization, **When** its owner lists the units of
   measure, **Then** a usable default set (for example unit, pair, roll, box) is
   present without anyone entering it.
2. **Given** an organization that already existed before this feature, **When**
   its units of measure are listed, **Then** the same default set is present.
3. **Given** a user holding `products.write`, **When** they create a category or
   a unit of measure, **Then** it is saved for the organization, an audit entry
   records it, and it is immediately offered in the product form.
4. **Given** a category or unit name that already exists in the organization,
   **When** the user creates it again with different capitalisation, **Then** the
   creation is refused and the existing one is named.

---

### User Story 6 - Work in the Real Product Screens (Priority: P6)

As any member of the organization, I want the product screens to show our real
products - with no sample data anywhere - and to offer me only the actions my
permissions allow, so that what I see is our business and not a demonstration.

**Why this priority**: The screens exist and are used every day; leaving them
on demonstration data while the service is real would show the organization the
wrong numbers and invite decisions on them.

**Independent Test**: Open the product list, detail, new and edit screens
against the running service and confirm the data is the organization's own, the
sample-data banner is gone, and the write actions are absent for a member
without the write permission.

**Acceptance Scenarios**:

1. **Given** a member without `products.write`, **When** they open the product
   list, **Then** no create, edit or archive control is offered, and the list
   still loads the products they may read.
2. **Given** a member with `products.write`, **When** the service refuses a save,
   **Then** the reason appears against the offending field with the reference
   identifier of the failed request.
3. **Given** the screens of other modules that still use demonstration data,
   **When** they name a product, **Then** the product appears as plain text
   rather than a link to a record that does not exist, and those modules never
   call the real product service.

### Edge Cases

- The organization has no products yet: the list shows an empty state that
  explains what the list holds and offers the create action.
- A search term contains `%`, `_` or a backslash: the characters are matched
  literally, never as wildcards.
- The page size is above the maximum, or the page number is below one: the
  request is refused, or the value is brought within range, and the answer names
  the allowed range.
- A price is sent with more decimal places than the system stores, is negative,
  or is sent as a number rather than a decimal string: the request is refused and
  the field is named.
- A product is archived and then a new product is created with the same SKU:
  the SKU stays reserved.
- A product is archived while another member has it open for editing: the
  member's save is refused with a reload prompt rather than applied to the
  archived record.
- The product being archived is the last one of its category: the category
  itself is kept; only products are retired.
- A member without the write permission calls a write endpoint directly: the
  request is refused; hiding the control in the interface is not the protection.
- A search matches only archived products: the list is empty, the empty state
  says that archived products match and offers to show them, and the active
  products are not silently included.
- A product is saved without a low-stock threshold: the threshold is absent
  rather than zero, the screens show it as unset, and nothing in the product
  screens claims the product is low on stock.
- Another product in the organization already has the name being entered: the
  form shows a notice naming that product's SKU and linking to it, the save is
  still allowed, and the service accepts the product.
- The service is unreachable while a form is open: the entered values stay in
  the form and the failure is shown with its reference identifier.

## Requirements *(mandatory)*

### Functional Requirements

**Catalog records**

- **FR-001**: The system MUST keep products per organization; a product belongs
  to exactly one organization and is never visible to another.
- **FR-002**: A product MUST carry a SKU, a name, a category, a unit of measure,
  a purchase price, a selling price, an optional low-stock threshold, an
  archived flag, a version, and creation and update timestamps.
- **FR-003**: The SKU MUST be trimmed, MUST NOT be empty, and MUST be unique
  within the organization, compared without regard to capitalisation.
- **FR-004**: A duplicate SKU MUST be refused with the duplicate-record
  outcome, and the answer MUST name the product that already holds the SKU.
- **FR-005**: An archived product MUST keep its SKU reserved; creating a
  product with an archived product's SKU MUST be refused.
- **FR-006**: Prices MUST be exact decimal values, stored with four decimal
  places, and MUST NOT be negative; the low-stock threshold MUST be an optional
  exact decimal value with three decimal places, MUST NOT be negative, and MUST
  be absent rather than zero when no threshold applies - an absent threshold
  means stock is not tracked against one.
- **FR-007**: Prices and thresholds MUST cross the interface as decimal
  strings; a value sent as a number MUST be refused.
- **FR-008**: The system MUST NOT store a computed low-stock flag. Whether stock
  is low is a question about stock, which changes without the product changing;
  a stored answer to it would be wrong the moment the stock moved.
- **FR-009**: The organization MUST carry its currency as a stored setting: an
  ISO 4217 code of exactly three uppercase letters, never empty, with USD as the
  value for organizations that exist when this feature arrives and for
  organizations created afterwards.
- **FR-010**: A product MUST NOT carry a currency of its own. The prices on a
  product are in the organization's currency.
- **FR-011**: The organization's currency MUST be readable, read-only, on the
  signed-in identity and on the current organization, so that the interface can
  show it beside the prices.
- **FR-012**: Changing the organization's currency MUST NOT be part of this
  feature. The rule that the currency may no longer change once an order or an
  invoice exists belongs to the feature that owns those documents.
- **FR-013**: The status filter MUST offer Active, Archived and All.
- **FR-014**: When no status is asked for, the list MUST answer with the active
  products of the organization, and the interface MUST show which filter is in
  force, so that the default is visible rather than implied.
- **FR-015**: An archived product MUST carry an archived badge wherever it
  appears, and MUST stay reachable by its direct link and by a search under the
  archived or all filter.
- **FR-016**: When a search matches nothing among the active products but does
  match archived ones, the empty state MUST say so and MUST offer to show the
  archived products.
- **FR-017**: A list used to choose a product for a document MUST offer only
  active products.
- **FR-018**: This feature MUST create no stock rows and no stock tables, and a
  product MUST carry no stock columns. The balance for a product and a
  warehouse is created by the Inventory feature on the first movement, so
  nothing here may assume a balance row exists; a later reader treats a missing
  balance as zero on hand and zero reserved.
- **FR-019**: The product detail screen MUST show no stock figure. A clearly
  labelled note that stock arrives with the Inventory feature is acceptable.
- **FR-020**: Only the SKU MUST be unique within the organization. Two
  products MAY share a name, and the service MUST NOT refuse a product for
  having a name another product already has.
- **FR-021**: The create form MUST show a non-blocking notice when another
  product in the organization already has the same name, compared without
  regard to capitalisation. The notice MUST name that product's SKU and link to
  it, and the user MUST still be able to save.
- **FR-022**: Wherever a product is listed, its SKU MUST be shown next to its
  name, so that two products with the same name stay distinguishable.
- **FR-023**: A picker that chooses a product MUST match on both the SKU and
  the name.
- **FR-024**: Every product, category and unit of measure MUST be created,
  updated, archived and restored with a version that increases on every accepted
  change.
- **FR-025**: A change prepared against a version that is no longer current MUST
  be refused with the stale-version outcome, and nothing MUST be written.
- **FR-026**: A product MUST never be deleted; archiving is the only way to
  retire one, and an archived product MUST remain readable.
- **FR-027**: Categories MUST be unique within the organization, compared
  without regard to capitalisation.
- **FR-028**: Units of measure MUST carry a name and an abbreviation and MUST be
  unique within the organization, compared without regard to capitalisation.
- **FR-029**: A newly created organization MUST receive the default units of
  measure in the same transaction that creates it; a unit of measure and its
  abbreviation are the only things that transaction adds.
- **FR-030**: Organizations that existed before this feature MUST receive the
  same default units of measure through a migration.

**Endpoints**

- **FR-031**: Listing products MUST require the product read permission and
  MUST return the products of the caller's organization only.
- **FR-032**: Listing products MUST support a search term matched against SKU and
  name, a category filter, a status filter, a sort column and direction, a page
  number and a page size, and MUST return the matching products, the total
  number of matches, the current page and the page size.
- **FR-033**: The page size MUST NOT exceed 100.
- **FR-034**: Search terms MUST be treated literally; the characters that would
  otherwise act as wildcards MUST be escaped.
- **FR-035**: Creating a product MUST require the product write permission.
- **FR-036**: Reading one product MUST require the product read permission and
  MUST answer "not found" for a product of another organization.
- **FR-037**: Updating a product MUST require the product write permission, MUST
  carry the version the caller read, and MUST refuse a stale version.
- **FR-038**: Archiving and restoring a product MUST require the product write
  permission.
- **FR-039**: Archiving a product MUST consult the usage check; when the product
  is reported as in use, the archive MUST be refused with the product-in-use
  outcome and the product MUST stay active.
- **FR-040**: The usage check MUST be the single extension point through which
  the purchasing, sales and inventory features refuse archiving a product that
  has reserved stock or open documents. The product feature owns no knowledge of
  those documents.
- **FR-041**: The usage check MUST report, for now, that no product is in use,
  and the refusal MUST be provable by a test that makes the check report a
  product in use.
- **FR-042**: Listing and creating categories and units of measure MUST require
  the product read and write permissions respectively.
- **FR-043**: Every create, update, archive, restore and category or unit
  creation MUST write an audit entry recording the values before and after, in
  the same transaction as the change itself.
- **FR-044**: A change that fails MUST leave no audit entry and no other trace
  of itself.

**Interface**

- **FR-045**: The product screens MUST read the real service; the sample
  products and the sample service they used MUST be removed.
- **FR-046**: The product screens MUST NOT show the sample-data banner.
- **FR-047**: The product list MUST offer server-side search, filters, sorting
  and paging, and MUST show the total number of matching products.
- **FR-048**: The product forms MUST show the service's refusal against the
  offending field, with the reference identifier of the failed request.
- **FR-049**: A refusal because the record changed underneath the user MUST
  offer to reload the current version.
- **FR-050**: The category and unit of measure choices MUST load from the
  service and MUST offer to create a missing one without leaving the form.
- **FR-051**: Prices MUST be shown as the decimal values that were recorded,
  without any arithmetic performed on them in the browser.
- **FR-052**: The interface MUST use one term for the low-stock threshold, "Reorder
  level (low-stock threshold)", so that the product screens, the Inventory
  screens and the Overview screens name the same thing the same way.
- **FR-053**: Actions the signed-in member does not hold the permission for MUST
  be hidden or disabled, using the permissions the service sends with the
  identity; the service remains the authority in every case.
- **FR-054**: Modules that still use demonstration data MUST keep their own
  demonstration product list, MUST show product references as plain text, and
  MUST NOT call the real product service.
- **FR-055**: The product screens MUST follow the shared rules for loading
  states, empty states, error banners with a reference identifier, and
  confirmation messages naming the record.

**Guards and contracts**

- **FR-056**: New tables and columns MUST be named in the snake_case
  convention, and the naming guard MUST fail a migration that breaks it.
- **FR-057**: Every new table MUST have row-level security enabled with no
  policies, and the database invariant check MUST cover every new table.
- **FR-058**: The integration tests MUST run only in the isolated test schema,
  and the row counts of the shared schema MUST be unchanged by a run.
- **FR-059**: The published contract MUST be regenerated from the source and
  MUST show no drift.

### Key Entities

- **Product**: an item the organization sells or buys. Belongs to one
  organization; carries SKU, name, category, unit of measure, purchase price,
  selling price, an optional low-stock threshold (absent when stock is not
  tracked against one), archived flag, version and timestamps.
- **Product Category**: a classification of products, unique within the
  organization without regard to capitalisation.
- **Unit of Measure**: a way of counting a product (name and abbreviation),
  unique within the organization without regard to capitalisation. Every new
  organization starts with a default set.
- **Organization**: the tenant that owns products, categories and units. Carries
  the currency its prices are in.
- **Membership**: the link between a person and an organization; the
  permissions it holds decide what the person may do with products.
- **Audit Entry**: the immutable record of every change to a product, category
  or unit, carrying the values before and after.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** The product, product category and unit of measure
  tables carry `organization_id`, and the keys that address a record are
  composite over `(organization_id, id)`, so a record of one organization can
  never be addressed through another. Row-level security is enabled with no
  policies. A test asserts that another organization's product, category and
  unit are answered as "not found".
- **II. Server-enforced authority:** Every product endpoint declares either the
  product read or the product write permission; the permission guard denies by
  default and the state transitions (archived, restored, version checked) are
  validated on the server. A test asserts the refusal for a member without the
  write permission.
- **III. Transactional integrity:** Creating an organization and its default
  units of measure is one transaction, as is every product change together with
  its audit entry. A forced failure of the audit write rolls the business
  change back with it.
- **IV. Exact decimals:** Purchase and selling prices are stored with four
  decimal places and the threshold with three, with non-negative checks, and
  they cross the interface as decimal strings; no value is ever held as a
  floating-point number.
- **V. Test-first:** The integration tests for creation, search, concurrency,
  archival, the usage refusal, categories and units are written first and
  observed failing against the real database.
- **VI. Module boundaries:** A self-contained products module owns its tables
  and is called by other modules; the usage check is a seam that the future
  purchasing, sales and inventory modules implement, so no cycle is created now.
  The one change outside the module is the organization's currency, which the
  identity feature exposes read-only on its own answers.
- **VII. Honest boundaries:** Prices are recorded as entered; nothing in this
  feature claims tax compliance, certified invoicing or complete accounting.
- **VIII. Design system and accessibility:** The shared components are used
  (table, input, select, card, badge, button, dialog), forms validate on blur
  and on submit with errors under the offending field, and every control is
  reachable and operable by keyboard.
- **IX. Scope discipline:** P0-F005 is a must-have for v1; the authentication,
  authorization and contact foundations it depends on are in place, and the
  inventory, purchasing and sales features that will consume products remain
  their own features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member with the write permission creates a complete product in
  under 60 seconds, including the confirmation that names the saved product.
- **SC-002**: A catalog of 10,000 products answers a filtered, sorted, paged
  list request in under one second at the 95th percentile.
- **SC-003**: Every attempt to save a SKU that already exists in the
  organization is refused, and the refusal names the product that holds it.
- **SC-004**: No product is ever removed: over the full test suite, every
  retirement of a product leaves it readable.
- **SC-005**: Every accepted change to a product, category or unit is visible
  in the audit trail, with the values before and after, within two seconds of
  the action succeeding.
- **SC-006**: A member without the write permission finds no create, edit or
  archive control on any product screen.
- **SC-007**: Every price shown in the interface equals the value recorded,
  with no rounding difference, across every product in the verification set.
- **SC-008**: A full test run leaves the shared schema's row counts unchanged,
  and the naming, invariant and contract-drift guards all pass.

## Assumptions

- The existing authentication, session and authorization foundations are reused
  as they are; no new sign-in flow is introduced.
- The product write permission implies the product read permission, as it does
  for the contact permissions.
- Name, SKU, category, unit of measure, purchase price and selling price are
  required; the low-stock threshold is optional. A price of zero is allowed; a
  negative price is not.
- The default units of measure are: unit (unit), pair (pair), roll (roll) and
  box (box). Their names and abbreviations are the organization's own, so they
  can be renamed later.
- The archived flag keeps a product out of the active list and out of the
  choices offered for new documents, but the record stays readable and keeps
  its SKU reserved.
- What the low-stock threshold is compared against - the available quantity of
  each warehouse balance, or the product's total - is the Inventory feature's
  decision, not this feature's. This feature stores the threshold and nothing
  derived from it.
- A per-warehouse override of the threshold is a recorded follow-up for the
  Inventory feature. It is deliberately not decided here.
- The organization's currency is a stored setting added by this feature, but
  changing it is not: the currency select on the Organization settings screen,
  locked once documents exist, is a recorded follow-up for that feature, as is
  registration offering a choice of currency.
- The interface shows the organization's currency beside the prices and performs
  no conversion and no arithmetic on money; the stored decimal strings are what
  is displayed.
- Only the SKU is unique within the organization; a name may repeat. A product
  list shows the SKU beside the name, and the create form warns - without
  blocking - when a same-named product already exists.
- The usage check reports that no product is in use until the purchasing,
  sales and inventory features implement it; the refusal path is proven by a
  test that makes the check report a product in use.
- The other modules that still show demonstration data keep their own
  demonstration product lists; only the product screens themselves move to the
  real service in this feature.
- The product screens are the only place the real product service is called
  from the interface in this feature.
- Variants, barcodes, images, price lists, import and export, and inventory
  stock are outside this feature.
- The inventory feature creates a stock balance row lazily on the first
  movement for a product and a warehouse. Until then there is no balance, and a
  reader that looks for one treats its absence as zero on hand and zero
  reserved. The product feature does not create it and does not show it.
- The archive usage check is the single extension point through which the
  purchasing, sales and inventory features will refuse archiving a product
  that has reserved stock or open documents.
