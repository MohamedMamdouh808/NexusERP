# RBAC and Audit Log API Contract (NexusERP)

Source of truth: the code in `backend/src/modules/access-control/` and
`backend/src/modules/audit/` (controllers, services, guards, DTO schemas) and
the regenerated committed artifact `backend/openapi.json` (regenerate with
`npm run openapi:generate --workspace @nexuserp/api`;
`contract-drift.spec.ts` fails CI when the two disagree).

Base URL: `/api/v1` (global prefix). All request/response bodies are
`application/json; charset=utf-8`. Every failure response uses exactly the
shared envelope `{ code, message, details, requestId }`.

Status mapping: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`,
404 `NOT_FOUND`, 409 `CONFLICT`, 429 `TOO_MANY_REQUESTS`, 500 `INTERNAL_ERROR`.

## Tenant scoping

Every endpoint in this document resolves tenant scope from the session's
verified active membership. Client-supplied organization identifiers are
ignored. A record addressed by id that belongs to another organization returns
404 (never 403, never existence confirmation — FR-022).

## Member management endpoints (`users.manage`)

### GET /api/v1/memberships

Lists the active organization's memberships with their roles.

Response 200:

```json
{
  "memberships": [
    {
      "id": "…",
      "user": { "id": "…", "email": "user@example.com", "name": "Jane" },
      "isActive": true,
      "roles": [ { "id": "…", "key": "sales", "name": "Sales" } ],
      "createdAt": "2026-11-09T10:00:00.000Z"
    }
  ]
}
```

### POST /api/v1/memberships

Creates a member: name, email, initial password, ≥1 role id of the
organization. **Not enumerable** (FR-008/SC-014): identical response whether
the account was created fresh or linked to an existing one.

Request (Zod, strict):

```json
{
  "email": "user@example.com",
  "name": "Jane",
  "password": "InitialPass123",
  "roleIds": ["…"]
}
```

- `password` is **required** and validated against the registration policy
  (min 12, upper/lower/digit) unconditionally — whether or not the email
  already exists (400 `VALIDATION_ERROR` naming `password`).
- `roleIds` must be non-empty and reference only existing roles of the active
  organization (400 `VALIDATION_ERROR` naming `roleIds`).

Behavior (single transaction):

- No account for the email → creates user (Argon2id hash, never stored/echoed
  plain), sets `mustChangePassword`, links membership to the new account.
- Account exists → creates membership on the existing account; its password
  and forced-change flag are left untouched.
- Both paths return the same 201 body shape; no created-versus-linked marker
  is ever present.

Response 201:

```json
{ "membership": { "id": "…", "user": { "id": "…", "email": "…", "name": "Jane" }, "isActive": true, "roles": [...] } }
```

### PUT /api/v1/memberships/:id/roles

Replaces the membership's roles atomically with a single before/after audit
entry. `:id` scoped by active organization (404 cross-org).

Request: `{ "roleIds": ["…"] }` (non-empty, existing roles of the
organization).

- Escalation check (FR-031): the union of permissions of the new roles must be
  a subset of the actor's effective permissions; violation → 403
  `NOT_ENOUGH_PERMISSIONS` naming the missing permission.
- Last-Administrator check (FR-009): removing the Administrator system role
  from the last active administrator → 409 `LAST_ADMINISTRATOR`.

Response 200: same membership projection as GET list item. The member's next
request already acts under the new permissions (FR-004).

### POST /api/v1/memberships/:id/deactivate

409 `INVALID_STATE_TRANSITION` if already inactive. 409 `LAST_ADMINISTRATOR`
if the membership holds the Administrator system role and no other active
administrator remains. Else: sets inactive, deletes that user's sessions whose
membership belongs to this organization (other orgs' sessions survive),
audits `members.deactivated`. Response 200 with the membership projection.

### POST /api/v1/memberships/:id/reactivate

409 `INVALID_STATE_TRANSITION` if already active. Sets active; sessions are
NOT recreated (member signs in again); audits `members.reactivated`.
Response 200 with the membership projection.

## Roles and permissions endpoints (`roles.manage`)

### GET /api/v1/roles

All roles of the active organization, each with its permission codes.

Response 200:

```json
{
  "roles": [
    { "id": "…", "key": "sales", "name": "Sales", "description": "…",
      "isSystem": true, "permissions": ["sales.view", "quotes.view"] }
  ]
}
```

### GET /api/v1/roles/permissions

The system permission catalogue (all seeded `resource.action` codes).

Response 200:

```json
{ "permissions": [ { "code": "users.manage" } ] }
```

### POST /api/v1/roles

Creates a custom role.

Request (Zod, strict):

```json
{ "name": "Support", "key": "support", "description": "…", "permissionCodes": ["quotes.view"] }
```

- Open catalogue (FR-031 clarified): any existing permission may be held,
  including administrative ones (`users.manage`, `roles.manage`, `audit.read`,
  `settings.manage`).
- Name collision case-insensitively within the same organization → 409.
- Unknown permission codes → 400 `VALIDATION_ERROR` naming `permissionCodes`.
- No-escalation (FR-031): resulting permission set ⊆ actor's effective
  permissions, else 403 `NOT_ENOUGH_PERMISSIONS` naming the missing permission.

Response 201: role projection with `permissions`.

### PUT /api/v1/roles/:id

Updates a custom role's name and permission set (full replace).

- System role → 403 (no state change).
- Same validations as POST (collision 409, unknown codes 400).
- No-escalation applies; **editing down** below the actor's own held set is
  allowed.

Response 200: role projection.

### DELETE /api/v1/roles/:id

- System role → 403.
- Assigned to any membership → 409; nothing changes.
- Else: role and its `role_permissions` links removed in one transaction;
  audit `roles.deleted`. Audit trail keeps its JSON copies — references remain
  readable.

Response 200: `{ "deleted": true }`.

## Audit listing endpoint (`audit.read`)

### GET /api/v1/audit-logs

Lists the active organization's audit entries. Scoped by the session's active
organization — organization-less entries (NULL `organization_id`, e.g.
anonymous sign-in failures) can never match (FR-020/SC-013).

Query parameters (all optional):

| Param | Meaning |
|---|---|
| `from`, `to` | inclusive `created_at` bounds (ISO 8601) |
| `userId` | acting user id filter |
| `action` | action code filter (exact) |
| `recordType`, `recordId` | subject filters |
| `page` | 1-based; default `1` |
| `pageSize` | default `25`, max `100` |

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

Ordering: `createdAt` descending. No secrets appear in `before`/`after` or any
entry field (FR-019/SC-007).

No endpoint modifies or deletes audit rows. The table is append-only at the
application level (no UPDATE/DELETE path exists in code or API).

## Administrator-catalogue invariant (FR-032)

The `Administrator` system role of every organization always holds the entire
permission catalogue, including permissions added later by platform work. The
provisioning sync routine (`syncAdministratorRolePermissions`) runs during
registration and must be invoked whenever a catalogue permission is added.
