# Research & Design Decisions: Contacts End to End

## Decision 1: Contact Table Schema & Tenant Keying
- **Decision**: Define table `contacts` with `id` (UUID), `organization_id` (UUID), `code` (VarChar), `name` (VarChar), `email` (VarChar, nullable), `phone` (VarChar, nullable), `is_customer` (Boolean), `is_supplier` (Boolean), `address_line1` (VarChar, nullable), `address_line2` (VarChar, nullable), `city` (VarChar, nullable), `region` (VarChar, nullable), `postal_code` (VarChar, nullable), `country` (VarChar, nullable), `is_archived` (Boolean, default false), `version` (Integer, default 1), `created_at` (timestamptz), `updated_at` (timestamptz).
- **Constraints**:
  - Primary Key: `id`.
  - Composite Unique: `(organization_id, id)` and `(organization_id, code)`.
  - Case-insensitive Unique: Unique index on `(organization_id, LOWER(email))` WHERE `email IS NOT NULL AND email != ''`.
  - Check constraint: `CHECK (is_customer = true OR is_supplier = true)`.
  - Row Level Security (RLS) enabled with no policies.
- **Rationale**: Complies with Constitution Principle I (Tenant Isolation) and PRD Section 9.3/9.7. Allows multiple contacts with null email, but prevents duplicate emails within the same organization.

## Decision 2: Document Sequence & Code Generation
- **Decision**: Auto-generate contact codes on creation using the `DocumentSequence` table within the same transaction.
  - Prefix rule: If `is_customer` is true (including customer+supplier), use sequence name `contact_customer` with format `CUST-00001`. If only `is_supplier` is true, use sequence name `contact_supplier` with format `SUPP-00001`.
  - The sequence is incremented atomically (`current_value = current_value + 1`) inside the transaction using `UPDATE document_sequences ... RETURNING current_value` or Prisma update.
- **Rationale**: Eliminates user burden to invent unique codes, ensures predictable sorting and clean references, and prevents sequence gaps via transactional rollback.

## Decision 3: Optimistic Concurrency Control (Version Check)
- **Decision**: All update requests must include the current `version: number`.
  - The service executes `UPDATE contacts SET ... , version = version + 1 WHERE id = :id AND organization_id = :orgId AND version = :clientVersion`.
  - If 0 rows are affected, the service checks whether the contact exists. If it exists, it throws HTTP 409 `STALE_VERSION`. If not, HTTP 404 `NOT_FOUND`.
- **Rationale**: Prevents lost updates when two operators edit the same contact simultaneously.

## Decision 4: Safe Archival & Usage Hook
- **Decision**: Contact deletion is forbidden. Archival calls an injectable `ContactsUsageHook`.
  - In v1, `ContactsUsageHook.isInUse(organizationId, contactId)` returns `{ inUse: false }`.
  - Future modules (Sales, Purchasing, Invoicing) will implement this hook to check for open purchase orders, open sales orders, or unpaid invoices.
  - When in use, returns HTTP 409 `CONTACT_IN_USE` with message `"Cannot archive contact because active documents reference it."`.
  - Unit and integration tests verify the 409 rejection via a test stub.
- **Rationale**: Satisfies PRD Section 7.4 Alternate Flow A2 without creating premature circular dependencies across modules.

## Decision 5: Audit Logging Format
- **Decision**: In the same transaction as every mutation, call `AuditService.record`:
  - `contacts.created`: `recordType: 'contact'`, `recordId: contact.id`, `before: null`, `after: { ...contactFields }`.
  - `contacts.updated`: `recordType: 'contact'`, `recordId: contact.id`, `before: { ...oldValues }`, `after: { ...newValues }`.
  - `contacts.archived`: `recordType: 'contact'`, `recordId: contact.id`, `before: { isArchived: false }`, `after: { isArchived: true }`.
  - `contacts.restored`: `recordType: 'contact'`, `recordId: contact.id`, `before: { isArchived: true }`, `after: { isArchived: false }`.
- **Rationale**: Fulfills Constitution Principle III and FR-015/FR-017 for audit trail compliance.

## Decision 6: Frontend Mock Data Relocation
- **Decision**: Remove sample contact data from `frontend/src/services/catalog-service.ts` and `sample-catalog-service.ts`.
  - Contacts screens (`ContactsPage`, `ContactDetailPage`, `ContactNewPage`, `ContactEditPage`) now call `contactsClient` (`/api/v1/contacts`) via React Query.
  - Other modules (Sales, Purchasing, Invoicing) that referenced sample contacts are updated to use dedicated local mock lists (`sample-contacts.ts`) so they continue running with sample banners intact.
- **Rationale**: Completely severs Contacts from mock data while preventing breakage in unmigrated prototype pages.
