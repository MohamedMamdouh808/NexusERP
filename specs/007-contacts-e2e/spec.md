# Feature Specification: Contacts End to End

**Feature Directory**: `specs/007-contacts-e2e`  
**Created**: 2026-11-10  
**Status**: Ready for Planning  
**MoSCoW Priority**: P0 (P0-F004 Customer and Supplier Management)  
**Input**: User description: "Build Contacts end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F004, Sections 7.4 and 9, the constitution, and the existing Contacts screens."

## Clarifications

### Session 2026-11-10
- Q: How should the Contact Role selection be presented in the UI form? → A: Separate `is_customer` and `is_supplier` boolean checkboxes (a single contact can be both simultaneously).
- Q: How should the Address fields be rendered in the New/Edit Contact forms? → A: Structured discrete inputs (Line 1, Line 2, City, Region, Postal code, Country) matching the backend schema and PRD Section 7.4.
- Q: How should the contact 'code' field be handled? → A: Auto-generate code server-side (e.g. CUST-00001 / SUPP-00001) using document sequences.
- Q: How should the auto-generated contact code sequence be formatted? → A: Prefix based on primary role: `CUST-00001` if customer (or customer+supplier), `SUPP-00001` if supplier only.
- Q: For role and status filtering/defaults on creation: at least one of is_customer or is_supplier must be true. How should the form handle this validation? → A: Default to customer/active in state, with live server error display if user clears both flags.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and View Customers and Suppliers (Priority: P1)

As an authorized user (holding `contacts.write`), I want to record new customers and suppliers with their name, role flags (`is_customer` and `is_supplier` checkboxes), email, phone, and physical address, and immediately inspect their details, so that my organization has accurate party records for purchasing, sales, and invoicing workflows.

**Why this priority**: Without the ability to create and view contacts on the real server, no operational transaction (orders, receipts, invoices) can be initiated or linked to real commercial partners.

**Independent Test**: Can be fully tested by submitting the New Contact form with valid attributes, receiving an HTTP 201 response with an auto-assigned code (e.g., `CUST-00001` or `SUPP-00001`), verifying persistence in the active tenant, and viewing the detailed record on the Contact Detail page.

**Acceptance Scenarios**:

1. **Given** an authenticated user with `contacts.write` permission, **When** they submit a contact with name "Acme Corp", `is_customer: true`, `is_supplier: false`, email "billing@acme.com", phone "+123456789", and structured address fields, **Then** the contact is saved with an auto-generated code (`CUST-00001`), initial `version: 1`, `is_archived: false`, an audit entry is recorded in the same transaction, and the client navigates to the contact detail screen.
2. **Given** an authenticated user with `contacts.write` permission, **When** they submit a contact with `is_supplier: true` and `is_customer: false`, **Then** the server assigns a code prefixed with `SUPP-` (e.g., `SUPP-00001`).
3. **Given** an authenticated user with `contacts.read` permission, **When** they view the contact by ID, **Then** all saved contact attributes, assigned code, and timestamps are displayed accurately without any "Sample data" banner.

---

### User Story 2 - Filtered Search and Server-Side Pagination (Priority: P2)

As a sales or purchasing specialist (holding `contacts.read`), I want to search and filter our directory of contacts by keyword, role (Customer vs. Supplier), and archival status, with paginated results, so that I can quickly retrieve specific partner records even as our business grows to thousands of contacts.

**Why this priority**: Commercial teams need fast, responsive access to contacts. Client-side filtering breaks down as data grows; server-side search with SQL-injection and wildcard protection ensures scalability and safety.

**Independent Test**: Can be independently tested by populating multiple contacts with varying names, emails, phones, and status flags, issuing GET requests with queries (`q`/`search`, `role`, `status`, `page`, `pageSize`), and verifying the returned subset matches the criteria with exact total counts.

**Acceptance Scenarios**:

1. **Given** a directory containing multiple contacts, **When** searching with a partial query matching code, name, email, or phone (including special punctuation or wildcard characters like `%` or `_`), **Then** wildcards are escaped, and only matching records within the user's organization are returned.
2. **Given** a search query with `role=customer` and `status=active`, **When** the page size is set to 25, **Then** only active customer contacts are returned along with the total count, current page, and page size (capped at maximum 100).

---

### User Story 3 - Contact Modification and Concurrency Protection (Priority: P3)

As an operations manager (holding `contacts.write`), I want to update contact details while ensuring my changes do not silently overwrite updates made concurrently by another user.

**Why this priority**: Concurrent edits in an ERP can lead to lost contact details or conflicting address changes; optimistic concurrency control (`version` check) prevents silent data loss.

**Independent Test**: Can be tested by fetching a contact at version `v`, attempting an update passing version `v - 1` (or outdated version), verifying the 409 `STALE_VERSION` refusal, and verifying a correct update advances the version to `v + 1` with a before/after audit entry.

**Acceptance Scenarios**:

1. **Given** an existing contact at version 1, **When** an authorized user updates the phone number passing version 1, **Then** the record updates, version increments to 2, and an audit entry records the field changes.
2. **Given** an existing contact at version 2, **When** another user attempts an update providing version 1, **Then** the request is rejected with HTTP 409 `STALE_VERSION`, no data is modified, and the frontend prompts the user to reload the latest data.

---

### User Story 4 - Archive, Restore, and Safe Deletion Prevention (Priority: P4)

As an administrator (holding `contacts.write`), I want to archive contacts that are no longer active and restore them when needed, while preventing accidental archival of contacts with active commercial obligations.

**Why this priority**: Contacts must maintain historical reference integrity for audits and past invoices. Hard deletion is forbidden; soft archival preserves history while cleaning up active selection menus.

**Independent Test**: Can be tested by archiving an unused contact, verifying `is_archived: true`, attempting to archive a contact flagged as "in use" by the usage hook (verifying 409 `CONTACT_IN_USE` refusal), and restoring an archived contact.

**Acceptance Scenarios**:

1. **Given** an active contact not currently referenced by open documents, **When** an authorized user triggers archive, **Then** `is_archived` becomes `true`, an audit record is stored, and the contact is excluded from active selectors.
2. **Given** a contact referenced by active orders or unpaid invoices, **When** an archival request is made, **Then** the server usage hook returns in-use and the API rejects the request with HTTP 409 `CONTACT_IN_USE`.
3. **Given** an archived contact, **When** an authorized user triggers restore, **Then** `is_archived` becomes `false`, an audit record is stored, and the contact reappears in active listings.

---

### User Story 5 - Frontend Real-Data Integration & Permission Gating (Priority: P5)

As an interface user, I want the Contacts screens to communicate exclusively with the real backend API, displaying honest server feedback and disabling unauthorized actions, while leaving other unmigrated modules unaffected.

**Why this priority**: Users must experience reliable, production-grade interactions on Contacts without mock data leaks, while ensuring prototype modules continue functioning with isolated sample data.

**Independent Test**: Can be tested by logging in as users with varying permissions (`contacts.read` only vs. `contacts.write`), confirming action buttons (New, Edit, Archive) are disabled/hidden appropriately, validating that mock banners are removed from Contacts screens, and verifying other modules (Products, Sales, Invoicing) retain their sample data and mock banners.

**Acceptance Scenarios**:

1. **Given** a user viewing the Contacts list or detail screens, **When** the page loads, **Then** data is loaded from the live backend API and no "Sample data" banner is displayed.
2. **Given** a user with `contacts.read` but lacking `contacts.write`, **When** visiting Contacts, **Then** creation and edit buttons are disabled or hidden, and any direct modification request receives HTTP 403 Forbidden with a clear permission error banner.

---

### Edge Cases

- **What happens when an email already exists in the same organization?** The server rejects the creation or update with HTTP 409 `DUPLICATE_RECORD` and specifies the existing contact's name. Email uniqueness is case-insensitive (`LOWER(email)`).
- **What happens when an email already exists in a *different* organization?** The creation succeeds; email uniqueness is strictly scoped to `organization_id`.
- **What happens when neither `is_customer` nor `is_supplier` is set to true?** The server and client reject the request with HTTP 400 `VALIDATION_ERROR` requiring at least one role flag.
- **What happens when updating a contact belonging to another organization?** The server responds with HTTP 404 `NOT_FOUND` (tenant isolation; never revealing existence across tenants).
- **What happens when a search query contains `%`, `_`, or `\`?** Special characters are escaped so they match literal characters rather than acting as SQL wildcards.
- **What happens if an audit log write fails during contact mutation?** The entire transaction rolls back; no contact changes are saved without their corresponding audit entry.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist contacts in a dedicated `contacts` table partitioned by tenant with composite organization keys (`organization_id`, `id`).
- **FR-002**: System MUST enforce that every contact has a non-empty name, at least one role flag (`is_customer` or `is_supplier`), and optional email, phone, and structured address attributes (line 1, line 2, city, region, postal code, country).
- **FR-003**: System MUST auto-assign a unique human-readable `code` per tenant using document sequences: prefixed with `CUST-` when `is_customer` is true, or `SUPP-` when only `is_supplier` is true.
- **FR-004**: System MUST enforce case-insensitive uniqueness on `email` per organization (`organization_id`, `LOWER(email)`) when email is provided, allowing multiple contacts with null/empty email.
- **FR-005**: System MUST maintain optimistic concurrency control via an integer `version` field incremented on every update and reject stale updates with HTTP 409 `STALE_VERSION`.
- **FR-006**: System MUST forbid hard-deletion of contacts; deletion is represented solely via `is_archived` status flag transitions (archive and restore).
- **FR-007**: System MUST verify via a usage hook before archiving a contact whether open orders or unpaid invoices exist, returning HTTP 409 `CONTACT_IN_USE` when in use.
- **FR-008**: System MUST write an append-only audit log entry (`contacts.created`, `contacts.updated`, `contacts.archived`, `contacts.restored`) containing before and after states within the same database transaction as the mutation.
- **FR-009**: System MUST protect all contact endpoints behind permissions: `contacts.read` for list/get and `contacts.write` for create/update/archive/restore.
- **FR-010**: System MUST provide server-side list query capabilities with pagination (default 25, max 100), sort order, role filtering (`all`, `customer`, `supplier`), status filtering (`all`, `active`, `archived`), and multi-field text search matching code, name, email, or phone.
- **FR-011**: System MUST escape search inputs so that `%`, `_`, and backslash characters are treated as literal text.
- **FR-012**: Frontend Contacts pages (`ContactsPage`, `ContactDetailPage`, `ContactNewPage`, `ContactEditPage`) MUST talk directly to the real API client, render discrete address inputs and dual role checkboxes, and remove the "Sample data" banner.
- **FR-013**: Sample customer and supplier data previously imported from the contact mock into other modules (Sales, Purchasing, Invoicing) MUST be moved into those modules' local sample files so they function without dependency on the deleted contact mock.
- **FR-014**: Frontend MUST display inline field errors for server rejections (such as duplicate email or validation failures) and show user-friendly prompts on concurrency conflict (409 `STALE_VERSION`).
- **FR-015**: System MUST update the OpenAPI specification, ensure zero drift, and add `contacts` table verification to database invariant guard scripts.

---

### Key Entities

- **Contact**: Represents a business partner (customer, supplier, or dual-role).
  - Attributes: `id` (UUID), `organization_id` (UUID), `code` (String, unique per tenant, e.g. `CUST-00001` / `SUPP-00001`), `name` (String, required), `email` (String, optional, lowercase-unique per tenant), `phone` (String, optional), `is_customer` (Boolean), `is_supplier` (Boolean), `address_line1` (String, optional), `address_line2` (String, optional), `city` (String, optional), `region` (String, optional), `postal_code` (String, optional), `country` (String, optional), `is_archived` (Boolean, default false), `version` (Integer, default 1), `created_at` (Timestamp), `updated_at` (Timestamp).
- **ContactAuditLog**: Audit entries recording contact lifecycle events within the central append-only `audit_logs` table.

---

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** The `contacts` table includes `organization_id` with foreign key referencing `organizations(id)` and a composite unique constraint/primary index pattern (`organization_id`, `id`). Every query and mutation is explicitly scoped to the request's `organizationId`. Cross-tenant lookups strictly return 404 `NOT_FOUND`. Row Level Security (RLS) is enabled with no policies (deny-all default for direct connections).
- **II. Server-enforced authority:** Endpoints enforce `contacts.read` for read operations and `contacts.write` for mutations via NestJS Guards and `@RequirePermissions()`. Client UI permission checks are purely convenience; the backend is the definitive authority.
- **III. Transactional integrity:** Contact creation, updates, archival, and restoration run inside single transactions via `TransactionService.runInTransaction`. The audit row, sequence allocation, and business record commit together atomically or roll back completely on failure.
- **IV. Exact decimals:** N/A (Contacts do not store monetary amounts or fractional quantities).
- **V. Test-first:** Red-Green-Refactor workflow enforced. Automated integration tests cover tenant isolation, permission gates, duplicate email case-insensitivity, stale version conflicts, usage hook refusal, and transactional rollback before and during implementation.
- **VI. Module boundaries:** Backend logic resides in a self-contained `ContactsModule`. External modules check contact existence and archival state through the exported `ContactsService` seam or dedicated usage hooks.
- **VII. Honest boundaries:** No claims of automatic tax-id validation or international address postal authority certification. Address fields store user-provided text representations honestly.
- **VIII. Design system and accessibility:** Contacts screens strictly utilize existing `@nexuserp/ui` components (`DataTable`, `Card`, `PageHeader`, `Button`, `Input`, `Dialog`, `EmptyState`, `Skeleton`). Forms follow WCAG 2.1 AA accessibility guidelines with visible labels, helper text, and accessible error notifications (`role="alert"`).
- **IX. Scope discipline:** P0 core functionality strictly bounded to single contact entity lifecycle and address fields. Bulk import/export, multi-address support, and document transactions remain out of scope for this feature.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenant isolation verified with 100% test pass rate across all endpoints: querying or mutating a contact ID belonging to another organization returns HTTP 404 without leaking data.
- **SC-002**: Role-based access control verified: requests lacking `contacts.read` or `contacts.write` are rejected with HTTP 403 Forbidden across all endpoints.
- **SC-003**: Case-insensitive duplicate email detection verified: attempting to register `USER@example.com` when `user@example.com` exists in the same tenant fails with HTTP 409 `DUPLICATE_RECORD` and identifies the existing entity name.
- **SC-004**: Optimistic locking verified: concurrent or stale update attempts passing mismatched `version` fail with HTTP 409 `STALE_VERSION`.
- **SC-005**: Append-only audit integrity verified: 100% of successful contact mutations produce corresponding audit entries; any audit insert failure forces full transaction rollback.
- **SC-006**: Sample data elimination verified: Contacts views render zero mock data, display no "Sample data" banner, and remaining mock modules continue operating cleanly without broken dependencies.
- **SC-007**: Quality & guard compliance: `check:migrations`, `check:rls`, `check:boundaries`, `check:structure`, `check:secrets`, and `verify-db-invariants` pass with zero violations.

---

## Assumptions

1. **Single Address Model**: Each contact has one primary address modeled directly on the contact record (line 1, line 2, city, region, postal code, country); separate multi-address entities are out of scope.
2. **Archival over Deletion**: Contacts are never deleted from the database to preserve historical references for accounting and auditing.
3. **Usage Hook Default**: Until Sales, Purchasing, and Invoicing modules implement real document checks, the contact usage hook defaults to reporting `in_use: false`, with refusal behavior verified via unit/integration test stubs.
4. **Permissions Catalog**: The permission codes `contacts.read` and `contacts.write` already exist in the role catalogue and default system roles (Administrator, Sales, Purchasing).
5. **Isolation Test Schema**: All integration tests run strictly within the isolated `nexuserp_test` schema and do not alter row counts in the `public` schema.
