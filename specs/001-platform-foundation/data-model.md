# Data Model: Platform Foundation

**Feature**: 001-platform-foundation | **Date**: 2026-10-18 | **Phase**: 1

This feature creates three reference tables and no tenant-owned tables. It also establishes the
schema conventions that every later feature inherits, so those conventions are recorded here even
though no column uses them yet.

---

## Tables Created by This Feature

All three tables are **global**: they describe the product's own vocabulary, not any
organization's data. None carries `organization_id`, and none is organization-scoped. See
[research.md R-016](research.md) for why.

### Permission

The catalog of permission codes the product uses. Referenced by `RoleTemplatePermission` now and by
organization-owned roles in a later feature.

| Field | Type | Rules | Notes |
|---|---|---|---|
| `id` | UUID | primary key | |
| `code` | text | NOT NULL, unique | Permission string in `resource.action` form, lowercase |
| `module` | text | NOT NULL | Owning domain module, e.g. `sales`, `inventory` |
| `description` | text | NOT NULL | Human-readable purpose of the permission |
| `createdAt` | timestamp | NOT NULL, UTC | |

- **Uniqueness**: `code` is globally unique. Two organizations granting the same code is the point
  of a catalog; two catalog rows with the same code is a defect.
- **Validation**: `code` matches `^[a-z]+\.[a-z]+$`. A code without a resource or without an action
  is rejected, because Constitution Principle II requires every endpoint to declare a permission and
  a permission without an action cannot be enforced meaningfully.
- **Immutability after seed**: `code`, `module`, and `description` are treated as read-only once
  seeded. A permission can be retired but never redefined, because redefinition would silently
  change the meaning of a permission already granted to a role.

### RoleTemplate

The definition of one of the default roles. A template is the recipe, not the grant: an
organization's role is materialized from a template by the AccessControl feature.

| Field | Type | Rules | Notes |
|---|---|---|---|
| `id` | UUID | primary key | |
| `key` | text | NOT NULL, unique | Stable machine key, e.g. `administrator` |
| `name` | text | NOT NULL | Display name, e.g. `Administrator` |
| `description` | text | NOT NULL | What the role is for |
| `isSystem` | boolean | NOT NULL, default true | Marks a product-defined role; user-created roles will set false |
| `createdAt` | timestamp | NOT NULL, UTC | |

- **The five default role templates** seeded by this feature: `administrator` (Administrator),
  `manager` (Manager), `sales` (Sales), `inventory` (Inventory), `purchasing` (Purchasing). These
  are fixed by the product requirements document and are not configurable in v1.
- **Uniqueness**: `key` is globally unique. A user's `isSystem` flag distinguishes product roles
  from organization-defined ones without a second table.
- **Validation**: `key` matches `^[a-z][a-z0-9_]*$`.

### RoleTemplatePermission

The join between a role template and the permissions it grants.

| Field | Type | Rules | Notes |
|---|---|---|---|
| `roleTemplateId` | UUID | NOT NULL, FK to RoleTemplate, cascade delete | |
| `permissionId` | UUID | NOT NULL, FK to Permission, restrict delete | |
| `createdAt` | timestamp | NOT NULL, UTC | |

- **Primary key**: composite `(roleTemplateId, permissionId)`. The composite key is itself the
  duplicate-grant guard, so a duplicate insert fails at the database rather than in application code.
- **Referential integrity**: deleting a permission is restricted while a template still grants it,
  because a dangling grant would produce a role whose behavior is undefined. Deleting a template
  cascades to its grants, which is safe because a template grants nothing else.

### Seeded permission sets

Derived from the product requirements document and defined once as constants in the shared package
so the seed and the AccessControl feature cannot disagree:

| Role template | Grants |
|---|---|
| `administrator` | every permission in the catalog |
| `manager` | every permission except `users.manage`, `roles.manage`, `settings.manage` |
| `sales` | `contacts.read`, `contacts.write`, `products.read`, `inventory.read`, `sales.read`, `sales.write`, `invoices.read` |
| `inventory` | `products.read`, `inventory.read`, `inventory.write`, `inventory.receive`, `inventory.ship`, `inventory.adjust`, `purchasing.read`, `sales.read` |
| `purchasing` | `contacts.read`, `contacts.write`, `products.read`, `inventory.read`, `purchasing.read`, `purchasing.write` |

Later features add their own permissions to the catalog in the same commit that introduces the
endpoint declaring them, so the catalog never contains a permission no endpoint checks.

---

## Schema Conventions Established Here (no columns yet)

These conventions are decided and recorded now so that every later table inherits them by default
rather than by argument. Constitution Principles I, III, and IV are enforced through them.

### Tenant scoping convention

- Every organization-owned table carries `organization_id`, NOT NULL, referencing the
  organization, with an index on it.
- Every foreign key **between** organization-owned tables is composite over `(organization_id, id)`,
  not over `id` alone. A single-column foreign key would permit a row to reference a parent in
  another organization; the composite key makes that structurally impossible.
- The first such table will be created by the organization feature. This feature contributes the
  naming, the index, and the composite-key rule, plus the rule that a repository query without a
  resolved tenant context fails rather than reading unscoped.

### Exact decimal convention

| Kind | Column type | Example columns |
|---|---|---|
| Money | `NUMERIC(14,2)` | line totals, document totals, balances, paid amounts |
| Unit price and unit cost | `NUMERIC(14,4)` | `unit_price`, `unit_cost`, `purchase_price`, `selling_price` |
| Quantity | `NUMERIC(14,3)` | ordered, received, reserved, on-hand, shipped quantities |

- Prisma models these as `Decimal`. Values cross the API boundary as **strings**. A JavaScript
  number never holds a monetary or quantity value at any point, in application code or in tests.
- Money and quantity columns carry a NOT NULL check constraint; quantities that are signed by
  nature (movement deltas, adjustment quantities) are exempt from the non-negative check and are
  instead constrained by the movement type that produced them.

### Immutability and append-only convention

- Posted tables (`stock_movements`, `audit_logs`, shipments, issued invoices, payments,
  allocations) are created append-only. The application database role is granted INSERT and SELECT
  only; UPDATE and DELETE are revoked at the database level, not merely omitted from the ORM.
- The revoke is expressed in a migration, so it is version-controlled and applied everywhere the
  schema is applied, rather than being a manual production step someone can forget.

### Transaction boundary convention

- Every multi-record operation runs inside one transaction obtained from the unit of work
  (see [research.md R-003](research.md)).
- The idempotency key record and the business change commit in the same transaction.
- The audit record commits in the same transaction; a failed audit insert rolls back the business
  change. `AuditLog` itself is not created by this feature.

### Ordering and numbering convention

- Document numbers are assigned from a per-organization sequence row locked inside the creating
  transaction. The `NumberSequence` table belongs to the organization feature and is not created
  here.
- The number format is fixed and shared with the design system: `PO-`, `GR-`, `SO-`, `SH-`, `INV-`,
  `PAY-` followed by six digits, rendered in the design system's monospace face.

### Timestamp convention

- All timestamps are stored as `timestamp with time zone` in UTC. Local time is a presentation
  concern applied at the edge. This keeps log records, migration history, and audit records
  comparable across machines and timezones.

---

## Tables Explicitly Not Created Here

Recorded so their absence reads as a decision rather than an omission.

| Table | Owning feature | Why not here |
|---|---|---|
| `Organization`, `OrganizationModule` | P0-F002 organization workspaces | Creates the tenant; required before any organization-owned table |
| `User`, `Membership`, `MembershipRole`, `Role`, `RolePermission` | P0-F003 RBAC | Requires `Organization`; `Role` is organization-owned and will be materialized from `RoleTemplate` |
| `Session` | P0-F001 authentication | Outside this feature's scope ([research.md R-015](research.md)) |
| `IdempotencyKey` | P0-F002 or P0-F014 execution | Consumed by posting endpoints, none of which exist yet |
| `NumberSequence` | P0-F002 organization workspaces | Scoped per organization |
| `AuditLog` | P0-F012 audit log | No audited business action exists yet |
| `Contact`, `Product`, `ProductCategory`, `UnitOfMeasure`, `Warehouse`, `StockBalance`, `StockMovement`, `StockReservation`, and all order, shipment, invoice, and payment tables | their own P0 features | Business data; this feature stores none |

---

## Entity Relationships

```text
RoleTemplate 1 ──< RoleTemplatePermission >── 1 Permission
```

Two independent single-parent trees. No relationship to any other entity exists in this feature
because no other entity does.

---

## Validation Rules Summary

| Rule | Enforced by | Failure behavior |
|---|---|---|
| `Permission.code` unique | database unique constraint | Seed upsert updates instead of failing |
| `Permission.code` matches `^[a-z]+\.[a-z]+$` | seed-time validation in shared package | Seed fails loudly; no partial catalog |
| `RoleTemplate.key` unique | database unique constraint | Seed upsert updates instead of failing |
| `RoleTemplate.key` matches `^[a-z][a-z0-9_]*$` | seed-time validation | Seed fails loudly |
| A permission code must be granted by at least the `administrator` template | seed-time invariant check | Seed fails; a permission nobody holds is a defect |
| No grant to a nonexistent permission | foreign keys on both sides | Seed transaction rolls back entirely |
| Duplicate grant within a template | composite primary key | Seed upsert prevents it; a manual duplicate insert fails |