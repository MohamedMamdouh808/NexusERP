# Data Model: Users & Roles and Change-Own-Password End to End

## Modified entity: Membership

`memberships` (existing table) gains two columns in one migration:

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | VARCHAR(100) | yes | null | Display name for this membership in this organization. Trimmed, 1–100 chars, no control chars, not unique. Required on create, optional in storage. |
| `version` | INTEGER | no | 1 | Optimistic-concurrency counter for edits (name replacement). Incremented on every successful PATCH. |

All other `memberships` fields unchanged (`id`, `userId`, `organizationId`, `isActive`, `createdAt`). Composite keys and RLS unchanged.

## Modified entity: User

Unchanged. `users` keeps `id`, `email`, `passwordHash`, `mustChangePassword`, `createdAt`, `updatedAt`. **No `name` column is added to `users`** (R-001): name is per-membership, and no organization can see or change another organization's name for the same account.

## Entities read (unchanged)

- **Role**: `id`, `key`, `name`, `description`, `isSystem`, `organizationId`. No schema change; `memberCount` is a derived field.
- **Permission**: `code`, grouped by module for the checklist. No schema change.
- **RolePermission**: link table. No schema change.
- **Session**: unchanged; rotated on password change.

## Migration

One new migration:
- `ALTER TABLE memberships ADD COLUMN name VARCHAR(100) NULL;`
- `ALTER TABLE memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1;`
- Backfill: existing rows get `version = 1`, `name = NULL`.
- Existing memberships and accounts created at registration keep `name = NULL` (display falls back to email).

No new tables. No changes to `users`, `roles`, `permissions`, `role_permissions`, `sessions`, `audit_logs`.

## Derived / computed fields (not stored)

- `Member.status`: "ACTIVE" if `isActive`, else "DEACTIVATED".
- `Member.displayName`: `name` when present, otherwise `email`.
- `Member.passwordChangeRequired`: `user.mustChangePassword`.
- `Role.memberCount`: count of `membership_roles` rows for that role (active memberships).
- `Role.system`: `isSystem`.

## State transitions

- Membership: ACTIVE ↔ DEACTIVATED (deactivate/reactivate). Deactivation invalidates the user's sessions for this organization.
- Last active Administrator protection: deactivating or removing the Administrator role from the last active Administrator is refused server-side.
- Role: custom roles may be created, edited, deleted; deletion refused when `memberCount > 0`.
- Name edit: PATCH sets/corrects `name` and increments `version` in one transaction with an audit entry (before/after). Stale version → 409 `VERSION_CONFLICT`.

## Validation rules

- `name`: trimmed, 1–100 characters, no control characters, not unique.
- Required on create (form + server); optional in storage.
- `pageSize`: 1–100 (server cap; above → 400).
- `sort`: one of `name`, `email`, `status`, `createdAt`; direction `asc`/`desc`.
- `status` filter: `ACTIVE` or `DEACTIVATED`.
- New password: ≥12 characters, differs from current and from email (existing policy).

## Audit entries (append-only)

- `members.created`: after = { email, name, roleIds, isActive }. No password, hash, or session id.
- `members.roles_changed`: before/after roles (existing).
- `members.deactivated` / `members.reactivated`: existing.
- `members.name_changed` (new): before = { name }, after = { name }.
- `auth.password_changed`: after = { passwordChanged: true } (existing; no secret).