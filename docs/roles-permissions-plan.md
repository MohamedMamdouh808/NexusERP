# Roles & permissions — current resolution path and smallest fix

Status: **proposed, awaiting approval** — the code paths below are facts from
the source as of 2026-11-08; nothing has been changed yet. Approved items map
one-to-one to the sections at the bottom.

## How membership permissions resolve TODAY

1. **Registration** (`backend/src/modules/auth/auth.service.ts` →
   `register()`): creates `users` + `organizations` + one `memberships` row
   with `roleKey: 'administrator'`, a default `warehouses` row, a default
   `document_sequences` row, and a session — all in one transaction.
   It does **NOT** create organization-owned `roles` or `role_permissions`
   rows.
2. **The permission data model**, per `database/prisma/schema.prisma`:
   - `Permission` — global catalog (`permissions`, 25 rows), loaded by seed.
   - `RoleTemplate` + `RoleTemplatePermission` — the RECIPE (5 templates,
     68 template-permission links), loaded by seed (`role_templates`,
     `role_template_permissions`).
   - `Role` + `RolePermission` — the per-organization MATERIALIZED grant.
3. **Authorization** (`backend/src/common/guards/permission.guard.ts`):
   - Global default-deny: a route is 403 unless it is `@Public()` or declares
     `@RequirePermission(...)`.
   - `effectivePermissions()` **returns a hardcoded empty array** — the guard's
     control flow is final, its data source was never wired to authentication.
   - Every undeclared route is also unauthorized even WITH a valid session
     (e.g. `POST /auth/logout` is currently 403 for everybody).
4. **The materializer exists but is dead code**:
   `backend/src/modules/access-control/access-control.service.ts`
   `grantDefaultRolesAndPermissions(organizationId)` creates the per-org roles
   from `ROLE_TEMPLATES` and links `role_permissions` from the template
   grants. **It is exported by its module but has zero callers.**

## Measured database state (hosted dev database, 2026-11-08)

- `permissions`: 25 (seed)
- `role_templates`: 5 (seed); `role_template_permissions`: 68 (seed)
- `roles`: 5 rows — **not produced by any current code path** (the seed never
  writes `roles`, and no migration inserts into it). They are leftovers of an
  earlier manual/manual-seeded state. `organizationId` is NULL on them (they
  look global), and `role_permissions` is EMPTY — so even those stale rows
  grant nothing.
- Registration-created data: 54 users / memberships, 185 organizations.

## Verdict on the PRD's "per-organization default roles with permission links"

**NOT implemented.** Registration creates a membership that references a
role-template KEY, but no per-organization roles and no permission links are
created. The materializer that would do it was written but never invoked, and
`PermissionGuard` never resolves anything from the database.

## Smallest correct fix (2 code changes + 1 schema decision

1. **Call the existing materializer from registration.** Pass the Prisma
   transaction client into `grantDefaultRolesAndPermissions(tx, …)` so the
   roles/grants are created in the SAME transaction as the user/org/membership
   (Constitution Principle III).
2. **Uniqueness**: `Role.key` is `@unique` GLOBALLY, so a second organization's
   `administrator` role create fails. Change `Role.key` to
   `@@unique([organizationId, key])` (plain `organizationId`-nullable
   composite) and set `key = template.key` per organization. Migration:
   drop the global unique index, add the composite one.
3. **Wire the guard** to resolve permissions: given
   `request.membershipId` → membership → organization →
   `role_permissions JOIN roles ON roles.organizationId = membership.organizationId
   WHERE roles.key = membership.roleKey` → distinct `permission.code` set fed
   into `effectivePermissions()`.

## Tests that would prove it (backend/test/integration)

- register creates 5 per-org roles with `organizationId` set and permission
  links matching each `ROLE_TEMPLATES` grant set.
- membership `roleKey 'administrator'` resolves to the full catalog (25
  permissions) via the new resolver seam.
- a non-admin membership roleKey resolves to a reduced set (manager lacks
  `users.manage`/`roles.manage`/`settings.manage`).
- two different organizations can each create `key 'administrator'`
  (composite uniqueness) and see only their own grants.
- registration still atomic: forcing a failure mid-transaction leaves no
  roles/grants behind (count proof).
- unauthenticated caller gets 401 on a route that needs only a session and
  lacks permission; authenticated caller lacking the permission gets 403.
