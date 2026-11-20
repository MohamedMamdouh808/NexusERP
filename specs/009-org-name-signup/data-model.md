# Phase 1 Data Model: Organization name at sign-up and in the account menu

**Feature**: 009-org-name-signup · **Date**: 2026-11-12

## Entities

### Organization (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | unchanged |
| name | `VarChar(128)` | now either the user-chosen string (trimmed, 2–128 chars) or the legacy placeholder (`${email}'s Organization`). Not unique; no collation change. |
| … | … | every other column unchanged (currency, payment terms, etc.) |

**Validation rules** (enforced server-side in the registration schema, never in the UI):

- optional; absent → placeholder written (today's behavior, byte-identical).
- present → trimmed; 2–128 characters after trimming; otherwise 400 with field-level `details`.
- stored verbatim (post-trim). No normalization of case, punctuation or script.

### Registration request (contract delta, not a stored model)

| Field | Type | Notes |
|-------|------|-------|
| email | string (email) | unchanged |
| password | string | unchanged |
| organizationName | string, optional | new; validation per D1 in [research.md](./research.md) |

Response shape of `POST /api/v1/auth/register` is unchanged (user, organization, membership, roles), so existing clients are unaffected.

## State transitions

None. Organization name is set exactly once, inside the registration transaction, and is never transitioned by this feature (rename is out of scope).

## Relationships

None added. The organization row is written by the same transaction that writes user, membership, roles, warehouse and sequences — unchanged.

## Migration impact

None. `VarChar(128)` already accommodates the validated range. No backfill for existing organizations.
