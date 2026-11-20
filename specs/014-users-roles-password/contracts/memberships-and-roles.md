# Contracts: Users & Roles and Change-Own-Password

All endpoints are under `/api/v1`, require a valid session cookie, and are tenant-scoped to the caller's active organization. Errors use the standard envelope `{ code, message, details, requestId }`.

## GET /memberships

Lists the active organization's memberships. Requires `users.manage`.

Query parameters:
- `search` (string, optional): case-insensitive substring match on `displayName` (name ?? email) and `email`. Wildcards `%`, `_`, `\` are escaped and treated literally.
- `role` (uuid, optional): filter to memberships holding this role id.
- `status` (enum, optional): `ACTIVE` | `DEACTIVATED`.
- `sort` (enum, optional, default `createdAt`): `name` | `email` | `status` | `createdAt`.
- `direction` (enum, optional, default `desc`): `asc` | `desc`.
- `page` (integer, optional, default 1, min 1).
- `pageSize` (integer, optional, default 20, min 1, max 100). Values above 100 → 400.

Response 200:
```json
{
  "items": [
    {
      "id": "uuid (membership id)",
      "userId": "uuid",
      "email": "string",
      "name": "string | null",
      "displayName": "string",
      "isActive": true,
      "status": "ACTIVE | DEACTIVATED",
      "roles": [{ "id": "uuid", "key": "string", "name": "string" }],
      "passwordChangeRequired": false,
      "createdAt": "ISO-8601"
    }
  ],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

## POST /memberships

Creates a member. Requires `users.manage`. Body: `{ name (required, trimmed 1-100, no control chars), email, password (min 12), roleIds (non-empty) }`. Response 201: `{ membership: { id, roles: [{id,key,name}], isActive } }` — identical whether the account is new or already existed. The initial password is never returned. Audit: `members.created`.

## PATCH /memberships/:id

Updates a member's display name. Requires `users.manage`. Body: `{ name (trimmed 1-100, no control chars), version }`. Response 200: `{ membership: { id, name, version } }`. Stale version → 409 `VERSION_CONFLICT`. Audit: `members.name_changed` with before/after. Cross-org → 404.

## POST /memberships/:id/roles

Replaces a membership's roles (existing). Requires `users.manage`. Body: `{ roleIds (non-empty) }`. No-escalation enforced server-side → 403 `NOT_ENOUGH_PERMISSIONS` naming the permission. Last-Administrator protection → 409 `LAST_ADMINISTRATOR`.

## POST /memberships/:id/deactivate

Deactivates the membership, invalidates its sessions for this organization. Requires `users.manage`. Last-Administrator protection → 409 `LAST_ADMINISTRATOR`.

## POST /memberships/:id/reactivate

Reactivates a deactivated membership. Requires `users.manage`.

## GET /roles

Lists the organization's roles. Requires `roles.manage`. Response includes `memberCount` per role.

Response 200: array of `{ id, key, name, description, isSystem, permissions: string[], memberCount: number }`.

## GET /roles/:id

Role detail. Requires `roles.manage`. Response: `{ id, key, name, description, isSystem, permissions: string[], memberCount: number }`. Cross-org → 404.

## GET /roles/permissions

Permission catalogue grouped by module: `[{ module, label, permissions: [{ code, description }] }]`.

## POST /roles, PUT /roles/:id, DELETE /roles/:id

Custom role CRUD. Requires `roles.manage`. No-escalation on permissions → 403 `NOT_ENOUGH_PERMISSIONS`. Delete of an assigned role → 409 naming the member count. System roles are read-only (403/409 on edit or delete).

## GET /auth/me (existing, consumed)

Returns `user.mustChangePassword` and the held permission set used to disable checkboxes. No change to shape beyond what already exists; `mustChangePassword` already present.

## POST /auth/change-password (existing)

Body: `{ currentPassword, newPassword }`. Wrong current → 400 `INVALID_CURRENT_PASSWORD` (no sign-out). New must differ from current and from email, min 12 chars. On success: password hash updated, `mustChangePassword=false`, session rotated (new `session_id` cookie), all other sessions invalidated, audit `auth.password_changed`. Response sets fresh cookies.