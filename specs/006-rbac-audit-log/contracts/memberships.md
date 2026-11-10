# Contract: Member Management Endpoints

Permission on every route: `users.manage`. Base URL `/api/v1`. Errors use the shared envelope; unknown `code`s from this document are additions to `shared/src/errors/index.ts` with status mappings as noted. Cross-organization addressing → 404 (never 403, never data). Permission missing → 403 `FORBIDDEN`; inactive membership or unresolvable tenant → 403.

## GET /api/v1/memberships

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

## POST /api/v1/memberships

Creates a member: name, email, initial password, ≥1 role id of the organization. **Not enumerable** (FR-008/SC-014): identical response whether the account was created fresh or linked to an existing one.

Request (Zod, strict):

```json
{
  "email": "user@example.com",
  "name": "Jane",
  "password": "InitialPass123",   // required, same policy as registration (min 12, upper/lower/digit)
  "roleIds": ["…"]                // non-empty, only roles of the organization
}
```

Validation (400 `VALIDATION_ERROR`, `details[].field` naming the offending field):
- `password` missing/invalid — checked **unconditionally**, whether or not the email exists.
- `roleIds` empty, or any id not resolving inside the active organization.
- `email`/`name` per shared rules.

Behavior (single transaction):
1. Look up user by email (system-wide).
2. No account → create User (Argon2id hash of the received password, never stored/echoed/generated plain), `mustChangePassword = true`; create Membership (active); link roles.
3. Account exists → create Membership on it; link roles; **password and flag untouched**.
4. Audit `members.created` (record: membership id; before null; after non-secret projection).
5. Response 201, identical either way:

```json
{ "membership": { "id": "…", "user": { "id": "…", "email": "…", "name": "Jane" }, "isActive": true, "roles": [...] } }
```

## PUT /api/v1/memberships/:id/roles

Replaces the membership's roles atomically. `:id` scoped by active organization (404 cross-org).

Request:

```json
{ "roleIds": ["…"] }   // non-empty, existing roles of the organization
```

Behavior (single transaction):
- Empty/unknown/cross-org role id → 400 `VALIDATION_ERROR` naming `roleIds`.
- Escalation check (FR-031): the union of permissions of the new roles must be ⊆ actor's effective set; violation → 403 `NOT_ENOUGH_PERMISSIONS` naming the first missing permission.
- Last-Administrator check (FR-009): removing the Administrator system role from the last active administrator → 409 `LAST_ADMINISTRATOR`.
- Success: replace links atomically; audit `members.roles_changed` (record: membership id; before/after = ordered role id+key+name arrays).
- The member's next request already acts under the new permissions (guard resolves per request).

Response 200: same membership projection as GET list item.

## POST /api/v1/memberships/:id/deactivate

409 `INVALID_STATE_TRANSITION` if already inactive. 409 `LAST_ADMINISTRATOR` if the membership holds the Administrator system role and no other active administrator remains. Else: set inactive, **delete that user's sessions whose membership belongs to this organization** (other orgs' sessions survive), audit `members.deactivated` (before `{isActive:true}`, after `{isActive:false}`). Response 200 with the membership projection.

## POST /api/v1/memberships/:id/reactivate

409 `INVALID_STATE_TRANSITION` if already active. Sets active; sessions are NOT recreated (member signs in again); audit `members.reactivated`. Response 200 with the membership projection.

## New error codes introduced here

| Code | Status | Message (catalogued) |
|---|---|---|
| `NOT_ENOUGH_PERMISSIONS` | 403 | Added for the no-escalation rule (message per catalogue; details name the permission) |
| `LAST_ADMINISTRATOR` | 409 | exists already |
| `INVALID_STATE_TRANSITION` | 409 | exists already |

## Audit entries produced here

| Action code | record_type | record_id |
|---|---|---|
| `members.created` | membership | membership id |
| `members.roles_changed` | membership | membership id |
| `members.deactivated` | membership | membership id |
| `members.reactivated` | membership | membership id |
