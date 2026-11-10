# Contract: Audit Listing Endpoint

Permission: `audit.read`. Base URL `/api/v1`. Scoped by the session's active organization at the guard/service level — client-supplied organization ids are ignored (no parameter exists).

## GET /api/v1/audit-logs

Query parameters (all optional):

| Param | Meaning |
|---|---|
| `from`, `to` | inclusive `created_at` bounds (ISO 8601) — period filter |
| `userId` | acting user id filter |
| `action` | action code filter (exact) |
| `recordType`, `recordId` | subject filters |
| `page` | 1-based; default `1` |
| `pageSize` | default `25`, max `100` (out-of-range clamped per platform API rules) |

Response 200:

```json
{
  "entries": [
    {
      "id": "…",
      "organizationId": "…",
      "userId": "…",
      "action": "members.roles_changed",
      "recordType": "membership",
      "recordId": "…",
      "before": { "roles": ["sales"] },
      "after": { "roles": ["sales", "inventory"] },
      "createdAt": "2026-11-09T10:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 25
}
```

Ordering: `createdAt` descending (tie-break `id`). Entry fields mirrored from the data model; login-failure-specific columns (`reasonCode`, `unknownAccountHash`, `unknownAccountMarker`, `clientAddress`) are also serialized — org listings simply never contain such rows.

### Organization-less entries can never match (FR-020 / SC-013)

The listing predicate is `organization_id = <active org>`; entries with NULL organization (known-user login failures, unknown-account login failures) can never be returned — proven by tests seeding anonymous sign-in failures before and after organization entries, then asserting the bare listing, every filter, and every page return zero organization-less rows.

### never contains secrets (FR-019 / SC-007)

`before`/`after` are built from non-secret projections; the change-password and login-failure audit entries contain no password, hash or token. A scan-level test exercises the feature end-to-end and greps audit rows + log output for secret-shaped values.

## Cross-tenant

There is no org parameter to misuse: scoping is structural. A second organization's actor sees only their own entries (test: two orgs, prove no read/enumeration).

## No modification path

No endpoint writes audit rows; the database role cannot UPDATE/DELETE/TRUNCATE them (SC-005). Appending happens only inside audited actions' transactions.
