# Data Model: Organization Settings and Module Controls

**Feature**: `specs/018-org-settings-modules/spec.md` | **Date**: 2026-11-19

## Entities

### Organization (existing — extended)

`database/prisma/schema.prisma`, `model Organization` (lines 152-194), table `organizations`.

| Field | Type | Change | Rule |
|-------|------|--------|------|
| id | String (UUID) | unchanged | Primary key; tenant root |
| name | VarChar(128) | unchanged column; stricter validation | Trimmed, 1–100 chars, not unique; email-derived default at registration when the optional name is omitted |
| currencyCode | VarChar(3) `@default("USD")` | unchanged column | One of USD, EUR, GBP, EGP, SAR, AED, KWD, QAR, JOD; immutable once any sales order, purchase order or invoice exists (any status) |
| defaultPaymentTermsDays | Int `@default(30)` | unchanged column | Whole number 0–365; applies only to invoices issued after the change |
| version | Int `@default(1)` | **new** | Incremented on every successful settings update; a mismatched version returns 409 `STALE_VERSION` |
| createdAt, updatedAt | DateTime | unchanged | Timestamps |

**Trigger (new)**: schema-pinned `BEFORE UPDATE` on `organizations` raises an exception when `OLD.currency_code <> NEW.currency_code` and any document exists for the organization, in any status. Name and payment-terms updates are unaffected.

### OrganizationModule (new)

`model OrganizationModule`, table `organization_modules`. Composite-keyed, organization-owned, RLS enabled with no policies, migration backfills every existing organization.

| Field | Type | Rule |
|-------|------|------|
| organizationId | String (UUID), `@@map("organization_id")` | NOT NULL; part of composite PK; FK to `organizations(id)` on delete cascade/restrict per convention |
| moduleKey | String, `@@map("module_key")` | NOT NULL; part of composite PK `(organization_id, module_key)`; one of the nine keys below |
| enabled | Boolean `@default(true)` | Switchable modules may be toggled; always-on modules are never disabled |
| version | Int `@default(1)` | Incremented on every successful toggle; stale toggle → 409 `STALE_VERSION` |
| createdAt, updatedAt | DateTime | Timestamps |

Indexes: primary key `(organization_id, module_key)`; index on `(organization_id)` for the session/guard read. The CHECK constraint permits all nine module keys so the reserved vocabulary (including always-on keys) stays valid; only the five switchable modules ever receive rows. Invariants require one row per switchable module per organization and no enabled module with a disabled requirement.

### Module catalogue and dependency rules (application-owned, no table)

| Key | Switchable | Requires | Open-document definition for "in use" |
|-----|-----------|----------|---------------------------------------|
| inventory | yes | — | Any active `StockReservation` |
| purchasing | yes | inventory | Purchase orders in DRAFT, CONFIRMED, PARTIALLY_RECEIVED |
| sales | yes | inventory | Sales orders in DRAFT, CONFIRMED |
| invoicing | yes | sales | Invoices in DRAFT, ISSUED, PARTIALLY_PAID |
| reports | yes | — | No open-document rule |
| contacts, products, settings, audit | no (always on) | — | Never toggled; no rows required |

## Relationships

- `Organization` 1—N `OrganizationModule` (FK on organization id; composite primary key `(organization_id, module_key)`).
- `Organization` 1—N `Membership`, `SalesOrder`, `PurchaseOrder`, `Invoice`, `StockReservation` (all existing, unchanged).
- `ModuleGuard` reads `OrganizationModule` through the Organizations service; no other module writes this table.

## State transitions

### Module availability

```
enabled ──toggle(off)──> disabled      [guarded: version match; dependencies off;
                                        open-document counts zero; audit in same tx]
disabled ──toggle(on)──> enabled       [guarded: version match; requirements enabled;
                                        audit in same tx]
```

No data is deleted on either transition; re-enabling restores access to all existing records.

### Currency

```
mutable ──first document created──> locked (permanent for the organization)
```

The transition is serialized by an `organizations` row lock shared with document creation; the database trigger backstops it.

## Validation rules

| Input | Rule | Error |
|-------|------|-------|
| name | Trimmed, 1–100 chars; not unique | 400 `VALIDATION_ERROR`, field detail `name` |
| currencyCode | Exactly one of the eight supported uppercase codes | 400 `VALIDATION_ERROR`, field detail `currencyCode` |
| defaultPaymentTermsDays | Whole number 0–365 | 400 `VALIDATION_ERROR`, field detail `defaultPaymentTermsDays` |
| version (settings / module) | Must equal stored version at commit | 409 `STALE_VERSION` |
| currency change with any document | Refused under lock; trigger backstop | 409 `CURRENCY_LOCKED` |
| toggle on with a disabled requirement | Named in details | 409 `MODULE_DEPENDENCY` |
| toggle off with an enabled dependent | Named in details | 409 `MODULE_DEPENDENCY` |
| toggle off with open documents | Counts in details | 409 `MODULE_IN_USE` |
| endpoint of a disabled module | Any method, reads included | 403 `MODULE_DISABLED`, module key in details |

## Audit entries

`AuditService.record()` joins the ambient transaction. Two new action codes in `shared/src/audit/index.ts`:

- `organizations.updated` — `recordType: 'organization'`, `recordId`: organization id, before/after: name, currencyCode, defaultPaymentTermsDays, version.
- `organizations.module_toggled` — `recordType: 'organization_module'`, `recordId`: `${organizationId}:${moduleKey}`, before/after: enabled, version.

## Session payload (no table, but a contract shape)

`/auth/me` adds `organization.enabledModules: string[]` (the enabled module keys) and `organization.defaultPaymentTermsDays` (currency code already present). Frontend `SessionOrganization` gains the same fields; `useOrganizationCurrency()` continues to be the single currency reader with the USD fallback only for signed-out states.
