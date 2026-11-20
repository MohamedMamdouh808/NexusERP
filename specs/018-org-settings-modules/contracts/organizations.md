# Contract: Organization Settings and Modules

**Feature**: `specs/018-org-settings-modules/spec.md` | **Date**: 2026-11-19

All routes are under `/api/v1`, use the shared error envelope `{ code, message, details, requestId }`, and derive the tenant from the session-side organization context (a client-supplied organization id is ignored). Success and failure bodies are stable strings; decimals are strings.

## GET /organizations/current

**Permission**: authenticated member of the active organization.

Response 200:

```json
{
  "id": "uuid",
  "name": "Acme Retail",
  "currencyCode": "USD",
  "defaultPaymentTermsDays": 30,
  "version": 1,
  "currencyLocked": false,
  "modules": [
    { "key": "inventory", "enabled": true, "version": 1 },
    { "key": "purchasing", "enabled": true, "version": 1 },
    { "key": "sales", "enabled": true, "version": 1 },
    { "key": "invoicing", "enabled": true, "version": 1 },
    { "key": "reports", "enabled": true, "version": 1 }
  ]
}
```

`currencyLocked` is true once any sales order, purchase order or invoice exists in any status. The module list contains the five switchable modules; always-on modules are implicit and not returned as toggleable rows.

## PUT /organizations/current

**Permission**: `settings.manage`.

Request:

```json
{
  "name": "Acme Retail Ltd",
  "currencyCode": "EUR",
  "defaultPaymentTermsDays": 45,
  "version": 1
}
```

Response 200: the same shape as GET with the incremented `version`. Validation: trimmed name 1–100; currency one of USD, EUR, GBP, EGP, SAR, AED, KWD, QAR, JOD; terms integer 0–365.

Failures:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Field rule violated; `details[].field` names it |
| 403 | `FORBIDDEN` | Member lacks `settings.manage` |
| 409 | `STALE_VERSION` | `version` does not match the stored value |
| 409 | `CURRENCY_LOCKED` | A document exists and `currencyCode` changes |

Every success writes an `organizations.updated` audit entry with before/after in the same transaction. Payment-terms changes never modify existing invoice due dates.

## GET /organizations/current/modules

**Permission**: authenticated member. Response 200: `{ "modules": [ { key, enabled, version, createdAt, updatedAt } ] }` for the five switchable modules, plus the always-on keys with `enabled: true, locked: true` for display (no rows required).

## PUT /organizations/current/modules/:key

**Permission**: `settings.manage`. Path `key` must be a switchable module; otherwise 404 `NOT_FOUND`.

Request: `{ "enabled": false, "version": 1 }`

Response 200: `{ "key": "inventory", "enabled": false, "version": 2 }`.

Failures:

| Status | Code | details |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Invalid body or key |
| 403 | `FORBIDDEN` | No `settings.manage` |
| 404 | `NOT_FOUND` | Unknown or always-on key |
| 409 | `STALE_VERSION` | Version mismatch |
| 409 | `MODULE_DEPENDENCY` | `details[]` names the module that requires, or is required by, the toggle |
| 409 | `MODULE_IN_USE` | `details[]` carries each open-document count by document kind |

Every success writes an `organizations.module_toggled` audit entry with before/after in the same transaction, and never deletes records.

## POST /auth/register (extension only)

Existing contract unchanged. Additional optional fields:

```json
{ "email": "…", "password": "…", "organizationName": "Acme Retail", "currencyCode": "USD" }
```

`organizationName` trimmed 1–100 (fallback: existing email-derived name); `currencyCode` from the supported list (default `USD`). Registration creates all five module rows enabled in the same transaction. Failures and responses reveal nothing about existing accounts.

## GET /auth/me (extension only)

The existing membership `name` and organization `name`/`currencyCode` fields remain. Added:

```json
{
  "organization": {
    "currencyCode": "USD",
    "defaultPaymentTermsDays": 30,
    "enabledModules": ["inventory", "purchasing", "sales", "invoicing", "reports"]
  }
}
```

The frontend session store hydrates these fields and refreshes them in place after a successful save or toggle (no re-login).

## Module gate on domain endpoints

Every endpoint of Inventory, Purchasing, Sales, Invoicing and Reports — reads included — declares `@RequireModule(key)`. When its module is disabled the endpoint returns 403 `MODULE_DISABLED` with the module key in `details`, regardless of the member's permissions. No other module's endpoints are affected; re-enabling restores access to existing data.
