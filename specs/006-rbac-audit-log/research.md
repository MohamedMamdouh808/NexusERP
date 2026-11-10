# Phase 0 Research: RBAC and Audit Log

Consolidated code-grounded findings (source as of 2026-11-09). Every "Decision" below is driven either by the clarified spec (`specs/006-rbac-audit-log/spec.md`) or by facts verified in the repository.

## R-001: Per-organization role ownership and uniqueness

**Decision**: `roles.organization_id` becomes NOT NULL; `roles.key`'s global `@unique` is replaced by `@@unique([organizationId, key])`; `Role.key` remains a stable machine key per organization.

**Facts** (verified):
- `database/prisma/schema.prisma` currently has `key String @unique` on `Role` and `organizationId String?` (nullable).
- The dev database contains 5 stale `roles` rows with NULL organization and empty `role_permissions` (probe: `database/scripts/probe-roles-catalog.ts`).
- `docs/roles-permissions-plan.md` documents the same facts against the source as of 2026-11-08.

**Rationale**: FR-001 requires each organization to hold its own copy of the five templates; a globally unique key makes copying template keys impossible across organizations. NOT NULL makes the "role without owner" state unrepresentable, and the uniqueness stays scoped per organization so role names collide only inside one org (FR-014 is name-based; uniqueness on key stays an implementation convenience).

**Migration handling**: the new migration deletes the stale NULL-org rows first (they have no permissions and no members point at them — memberships move to `membership_roles`, and the dev rows' `role_key` values no longer match anything after the join-table migration), then backfill template roles per organization (see R-002), then drop `memberships.role_key` semantics.

**Alternatives considered**:
- Keep global unique keys and suffix template keys per org (`administrator:<orgId>`) — rejected: leaks org ids into role keys and makes the last-admin guard and system-role identification fragile.
- Polymorphic `role_key` string references on memberships — rejected: no FK integrity, can reference nothing.

## R-002: Registration-time provisioning and the backfill migration

**Decision**: fix `AccessControlService.grantDefaultRolesAndPermissions(organizationId)` to accept a `TransactionClient` and call it (or its corrected service equivalent) from `AuthService.register()` inside the one existing transaction; the same provisioning logic, wrapped in idempotent checks, is also executed by the new migration for pre-existing organizations and for the dev database's dead-code history.

**Facts** (verified):
- The materializer exists (`backend/src/modules/access-control/access-control.service.ts`), takes only `organizationId` (uses the shared PrismaService, NOT a tx client), has **zero callers** — dead code awaiting exactly this wiring.
- `AuthService.register()` already creates user + org + membership (`roleKey: 'administrator'`) + warehouse + sequence + session in one transaction, but no roles/grants/audit.
- Seed data exists and is idempotent: `permissions` (25 rows), `role_templates` (5), `role_template_permissions` (68).

**Rationale**: FR-001 says "inside the same indivisible operation that creates the organization"; FR-002 says the backfill is a one-time migration. Both paths must use the identical recipe (ROLE_TEMPLATES from `@nexuserp/shared`), so one provisioning routine serves both, parameterized by a tx client and an idempotency check (skip a template role whose key already exists for that organization — the edge case covering "somehow already has a role named like a template role").

**Idempotency**: the migration `INSERT ... ON CONFLICT DO NOTHING`-equivalent (via Prisma `upsert`) on `(organizationId, key)`; a second full run creates nothing.

**Alternatives considered**:
- Provision lazily on first role list — rejected: violates FR-001's "immediately" and breaks member creation.
- Backfill in application code on boot — rejected: FR-002 mandates a migration, and boot-time data surgery is invisible to the migration-history guard.

## R-003: Membership roles join table

**Decision**: new `membership_roles` join table (composite PK `(membership_id, role_id)`), replacing `memberships.role_key`. One migration backfills it from the existing single-role memberships (mapping `role_key` → the organization's role with that key), then the column is dropped in a second migration step (or the same migration, ordered).

**Rationale**: FR-003 mandates "one or more roles"; effective permissions are the union. Composite FKs `(organization_id, role_id)` and `(organization_id, membership_id)` keep tenant scoping structural — you cannot link a role of org A to a membership of org B.

**Alternatives considered**: array column of role ids — rejected (no FK, no RLS-scopable child table); duplicate row semantics — rejected.

## R-004: Permission resolution wiring (the empty seam)

**Decision**: `PermissionGuard.effectivePermissions(userId, membershipId)` resolves the real union by querying `membership_roles → roles(role_permissions) → permissions.code` scoped to the membership's organization, replacing the hardcoded `[]`.

**Facts** (verified): `backend/src/common/guards/permission.guard.ts` currently returns a hardcoded empty array; the seam (`REQUIRED_PERMISSION_KEY` decorator + global guard) is already registered.

**Rationale**: FR-003/FR-004. A role/permission change applies from the member's next request because the guard queries per request (no caching in v1 — caching would violate FR-004's "next request onward" and adds invalidation complexity the spec does not ask for; revisit only if the PRD §8 numbers say so).

**Alternatives considered**: cache the union on the session row — rejected for v1: role changes must take effect without touching sessions (FR-004), which would force an invalidation write into every roles-replace; querying directly is simpler and honest.

## R-005: Audit table and append-only enforcement

**Decision**: `audit_logs` (or Prisma model `AuditLog`) with: nullable `organization_id`, nullable `user_id`, `action` VARCHAR, `record_type` VARCHAR, `record_id` VARCHAR nullable, `before` JSONB nullable, `after` JSONB nullable, `client_address` VARCHAR nullable, `created_at` TIMESTAMPTZ default `now()`. Append-only is enforced at the database level by revoking `UPDATE`, `DELETE` (and thereby `TRUNCATE`) from the application's database role (the role `DATABASE_URL` uses) in the same migration; the RLS migration extends `enable RLS, no policies` to the new table.

**Facts** (verified):
- Existing RLS migration `20261108004024_enable_rls_on_all_tables` establishes the "RLS enabled, no policies" pattern; `database/scripts/check-rls.ts` guards it.
- No `AuditLog` model exists.
- `LoginAttempt` stores the raw email today; it stays as-is (out of audit scope per spec FR-030's clarification — counters stay counters).

**Rationale**: FR-016 (same-transaction write), FR-017 (DB-enforced immutability), FR-018 (fields). SC-005 proves the privilege is actually missing by attempting UPDATE/DELETE/TRUNCATE from the app role and expecting failure.

**Alternatives considered**:
- Trigger-based immutability (BEFORE UPDATE ... RAISE) — rejected: privilege revocation is simpler, report-grade, and cannot be bypassed by the app role; triggers would still allow superuser confusion and add surface.
- Table partitioning for retention — deferred (nothing deletes; retention policy is a recorded follow-up).

## R-006: Central audit helper and transactional coupling

**Decision**: `AuditService.record(...)` injected wherever audited actions occur (Auth, AccessControl); it calls `TransactionService.getClient()` so it writes to the ambient transaction when one is open and fails the action when the audit insert fails (the insert throws → caller's transaction rolls back).

**Facts** (verified): `TransactionService` (AsyncLocalStorage-based) nests calls in the caller's transaction by construction; `register` and login already run through `runInTransaction` or the shared client.

**Rationale**: FR-015/FR-016 — exactly one entry per audited action, in the same transaction, so an unaudited action is impossible and a failed audit write rolls back the business change (edge case; SC-006 proves both directions).

**Alternatives considered**: outbox/eventual audit writes — rejected: spec forbids an action existing without its entry; two-phase commit complexity unneeded in a monolith.

## R-007: No-escalation subset rule and the Administrator catalogue invariant

**Decision**: role create/edit and roles-replace compute the resulting permission sets in the same transaction and refuse with 403 `NOT_ENOUGH_PERMISSIONS` (new shared error code, status 403) naming the first offending permission, unless the actor's effective set contains them (Administrator's system role achieves unconditional containment by holding the whole catalogue). Owner-of-role edits "down" freely.

**Facts** (verified): `ERROR_CODES` in `shared/src/errors/index.ts` has no `NOT_ENOUGH_PERMISSIONS`, `INVALID_CURRENT_PASSWORD` or `PASSWORD_CHANGE_REQUIRED` yet — all three are added there with their status mappings and catalogued messages (400, 400/`INVALID_CURRENT_PASSWORD` → 400, `PASSWORD_CHANGE_REQUIRED` → 403). The error-envelope machinery (status + message catalogues) makes this a data-table edit, not new mechanism.

**Administrator mirrors catalogue**: FR-032 — provisioning syncs `Administrator.role_permissions` to the full `permissions` table; the same sync routine runs when a catalogue permission is added (platform work) and is exercised by a test that inserts a new permission in the test DB and proves Administrator of an existing org gains it (SC-016). The routine is exposed from AccessControl and called from any future platform catalogue change; seed updates call it too.

**Alternatives considered**:
- Restrict catalogue per role class — rejected (clarified Q5: open catalogue, no hidden class).
- Count "administrative permission holders" for last-admin — rejected (Q5: guard keys on the Administrator system role only).

## R-008: Member creation, linkage, and non-enumerability

**Decision**: `POST /memberships` validates the initial password unconditionally (same Zod policy as `register.dto.ts` — min 12, upper/lower/digit), hashes with Argon2id on receipt, then: lookup the user by email; if absent → create User (hash, `mustChangePassword=true`) + Membership; if present → create Membership on the existing user only (password and flag untouched). Both paths return the same response body shape and status (201), identical field semantics (never a created-vs-linked marker). The request runs inside one transaction with an audited write (`members.created` with record id being membership id; before/after omit everything secret).

**Facts** (verified): request body redaction guard exists for secrets in logging (`docs/roles-permissions-plan.md` + FR-019 reference the redaction guard used by 005); `register.dto.ts` holds the canonical policy; `argon2` is a backend dependency.

**Rationale**: FR-008 + SC-014 (byte-for-byte identical answers), overriding PRD A2's 409 `DUPLICATE_RECORD` for this endpoint.

**Alternatives considered**: 409 on duplicate — rejected per clarified decision Q4.

## R-009: Change-own-password, forced-change gating, rate limiting

**Decision**: `POST /auth/change-password` (authenticated, CSRF-protected like other state-changing endpoints): verify current (`argon2.verify`; wrong → 400 `INVALID_CURRENT_PASSWORD`, never 401) with each failure counted in the existing login-attempt failure limiter keyed by **user id** (5 in 15 min → 429 + `Retry-After`); validate new password (policy, ≠ current, ≠ email lowercased, field-named errors); on success in one transaction: update hash, clear flag, invalidate all the user's OTHER sessions in every org, rotate the current session (new token + CSRF token, fresh cookies). During the forced flag: a password-change gate (guard) allows ONLY change-password, `GET /auth/me`, and logout, everything else 403 `PASSWORD_CHANGE_REQUIRED`; the flag is included in `/auth/me`.

**Facts** (verified):
- Rate limiter on login is noted as "not yet enforced" in `docs/api-auth-contract.md` truth file — the `login_attempts` table exists (`20261108010542_sessions_rate_limiting`). Whether the limiter itself lands in 005 or 006, the 006 change-password path reuses the same counters keyed by user; if login enforcement is still unwired at implementation time, this feature wires it for its own paths first.
- Sessions store `tokenHash` only; rotation = delete + create with new hash in one tx; cookie issuing lives in the controller (pattern exists in `login`).
- Membership-liveness check in `SessionGuard` already refuses deactivated members.

**Rationale**: FR-025/026/027/028/029, Q2 clarification. Gating implemented as a guard (replacing/extending `PermissionGuard` so the gate precedes permission resolution — a forced-change member must not pass permission checks even for held permissions; the gate key is the session's user record, which the guard can read cheaply by id).

**Alternatives considered**:
- Wrong current password → 401 — rejected explicitly (Q2: never 401; it's a body-level validation of a signed-in session).
- Rotating only the token and reusing the CSRF cookie — rejected: spec demands both rotate.

## R-010: Login-failure audit attachment and flood bounding

**Decision**: failed sign-in writes `auth.login_failed` (code `auth.login_failed` or confirm naming at task time; reason code values: `invalid_credentials`, `unknown_account`, `locked_out`): a known user → `user_id` set, no org; unknown → neither, storing only `keyedHash` (HMAC-SHA256 truncated to 32 hex chars of the normalized submitted string, keyed by a server secret) and a sanitized, length-capped `client_marker` (strip control chars, upper-bound length). Entries carry only timestamp, client address from the trusted proxy chain (never `x-forwarded-for` unless trusted), and reason code. Only the FIRST failure per account per rate-limit window writes, plus the lockout event itself.

**Facts** (verified): `LoginAttempt` exists with raw email (stays, serving counters); trusted-proxy setting is configuration-owned (`Configuration`), same authority as the existing cookie-flags path.

**Rationale**: FR-030 + Q3. Determining "first failure per window" uses the existing failure-window logic (count failures for the account key in the last 15 min — the same query the limiter needs); the audit write happens only when the count transitions 0→1 or the lockout event fires.

**Alternatives considered**: storing a user id resolved by prefix matching — rejected; storing raw email in audit — rejected (attacker-controlled string).

## R-011: Last-active-Administrator guard

**Decision**: `memberships.deactivate` and `PUT /memberships/:id/roles` (and future equivalents) run the same transactional check: count memberships of the organization that are isActive AND hold the Administrator system role (join through membership_roles) — a change that would reduce that count to zero (removing Admin from the target, or deactivating the target while it holds Admin) is refused 409 `LAST_ADMINISTRATOR` (code exists already, status mapping 409 exists).

**Facts** (verified): `LAST_ADMINISTRATOR` already in `shared/src/errors/index.ts` with 409 mapping.

**Rationale**: FR-009, US3, SC-003. Keyed on the system role (Q5), immune to custom roles carrying `users.manage`.

**Alternatives considered**: check administrative permissions instead — rejected per Q5.

## R-012: Deactivation session invalidation

**Decision**: `POST /memberships/:id/deactivate` deletes the membership's user's sessions **bound to that organization** (join sessions → membership of that org); the user keeps sessions in their other organizations. A fresh login attempt during inactivity is refused by the existing `SessionGuard` membership check.

**Facts** (verified): sessions carry `membership_id`; `SessionGuard` refuses inactive memberships already.

**Rationale**: FR-010 + SC-004. Clarification said sessions are keyed by org; deleting them for the deactivated org's memberships is the direct encoding. (If session↔org indexing proves awkward, sessions whose `membership_id` belongs to the deactivated org are exactly the set to delete — same predicate via join.)

**Alternatives considered**: flag-based deactivation of sessions — rejected: deletion is the established mechanism (logout, expiry, password change).

## R-013: Migration-immutability guard — reuse, don't rebuild

**Decision**: FR-024's requirement is already implemented: `database/scripts/check-migration-history.ts` (checksum mismatch detection, wired into `npm run check:migrations`) verifies committed migration files against recorded checksums; `database/scripts/refresh-migration-checksums.ts` exists solely for the one historical reconciliation. The feature simply never edits an applied migration and adds up-to-date checksums on commit.

**Rationale**: SC-009's "migration-immutability guard" names this existing guard; adding a second one is duplication.

**Alternatives considered**: none — the guard exists and is proven (it caught the `20261108010540` incident).

## R-014: Audit listing endpoint

**Decision**: `GET /audit-logs` (`@RequirePermission('audit.read')`): scoped by the session's active organization (query predicate `organization_id = activeOrg`, which can never match NULL-organization entries — FR-020/SC-013 hold by construction and get a pointed test with unknown-email failures seeded before and after); filters `from`/`to` (inclusive timestamps), `userId`, `action`, `recordType`/`recordId`; paging `page` (1-based), `pageSize` default 25 max 100, response `{ entries, total, page, pageSize }`; ordering `createdAt desc` (tie-break id). Cross-org concept doesn't exist (org-scoped list), so cross-tenant is structurally impossible.

**Facts** (verified): page-size defaults in platform API rules (assumption in spec: default 25, max 100).

## R-015: OpenAPI and contract docs

**Decision**: the four endpoint contracts live under `specs/006-rbac-audit-log/contracts/`; `docs/api-auth-contract.md` is extended only for what touches auth (change-password + forced-change gating), keeping that file the code-mirroring truth for existing endpoints. `backend/openapi.json` is regenerated after implementation, and `contract-drift.spec.ts` fails CI on drift (SC-009).

**Facts** (verified): `backend/test/integration/contract-drift.spec.ts` compares committed `openapi.json` against a document generated from the source module graph — new paths automatically appear once controllers exist, so the artifact must be regenerated in the same change.

## R-016: Audit retention

**Decision**: deferred. Nothing in the feature ever deletes audit rows (append-only is the point); a retention/compaction policy is a platform-level follow-up (recorded, out of scope). Growth is bounded today by the flood-bounding rule (R-010).

## Open items left to tasks.md

- Exact audit action code strings freeze here (one shared constants module, used by every audit call site): `auth.register`, `auth.login_failed`, `auth.lockout`, `auth.password_changed`, `auth.password_change_failed`, `roles.catalogue_provisioned`, `roles.created`, `roles.updated`, `roles.deleted`, `members.created`, `members.roles_changed`, `members.deactivated`, `members.reactivated`.
- Whether the change-password limiter and login limiter share a counter window (they do — same table, same 15-min window, keyed by user id).
- Role-name uniqueness mechanism (application-level `lower(name)` collision check vs. functional unique index) — decide at task time; both satisfy FR-014.
- Audit `REVOKE` role-name resolution in the migration (resolve from `DATABASE_URL`'s user rather than hardcoding) — decide at task time.
