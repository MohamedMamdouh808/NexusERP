# Research: Users & Roles and Change-Own-Password End to End

## R-001 — Where does a member's display name live?

- **Decision**: On `memberships`, as a nullable `name` column added in a new migration. No column on `users`.
- **Rationale**: The PRD collects name per membership ("enters name, email, initial password, and selects one or more roles"), and a single account can belong to several organizations. Storing the name on the membership keeps each organization's view of the person independent, matches the existing audit entry which already records name per membership, and avoids cross-organization leakage. The `users` table stays identity-only (email, password hash, mustChangePassword).
- **Alternatives considered**: account-level `name` on `users` (rejected — would let one organization overwrite another's view of the same person); deriving from email (rejected — no human name, conflicts with the PRD collecting one).

## R-002 — Stale-update protection for membership name edits

- **Decision**: Add a `version` integer to `memberships` (default 1) in the same migration; PATCH increments it in the same transaction; the request carries the expected version and a mismatch returns 409 `VERSION_CONFLICT`.
- **Rationale**: Matches the pattern already used for invoices, sales orders, contacts, products, and organizations. Reuses the existing optimistic-concurrency helper.
- **Alternatives considered**: timestamp-based (rejected — less precise, race-prone); no protection (rejected — violates Constitution III).

## R-003 — Members list response shape

- **Decision**: `{ items: Member[], total, page, pageSize }` where each item carries `id` (membership id), `userId`, `email`, `name` (nullable), `displayName` (name ?? email), `isActive`, `status` ("ACTIVE"/"DEACTIVATED"), `roles: [{id,key,name}]`, `passwordChangeRequired`, `createdAt`. Sort keys: `name` (displayed value), `email`, `status`, `createdAt`; default `createdAt desc`.
- **Rationale**: Matches the existing frontend `SampleUser`/`useUsers` expectations (`data.items`, `data.total`) and the DataTable props already in use; `displayName` removes per-row fallback logic from the client.
- **Alternatives considered**: keeping the `{ memberships }` envelope (rejected — no total/paging and inconsistent with other list endpoints).

## R-004 — Search wildcard escaping

- **Decision**: Escape `%`, `_`, and backslash in the search term before building the `ILIKE` pattern, then wrap with `%…%`. Use a parameterized query; never interpolate the term.
- **Rationale**: Prevents a search for `100%` from matching everything; satisfies FR-003 and the redaction/injection expectations.
- **Alternatives considered**: client-side filtering (rejected — defeats server-side search and paging).

## R-005 — Role member count

- **Decision**: Computed via a correlated count of `membership_roles` (active memberships only) in the roles list and a single count in `GET /roles/:id`. Exposed as `memberCount: number`.
- **Rationale**: Read-only derived field, no new table; cheap with the existing `membership_roles` index on `roleId`.
- **Alternatives considered**: storing a counter (rejected — drift risk, extra write path).

## R-006 — Role detail endpoint

- **Decision**: Add `GET /roles/:id` returning the role with its permissions and `memberCount`. Tenant-scoped; 404 for another organization's role.
- **Rationale**: The role detail screen needs a single record; the list alone forces the client to filter. Matches the existing pattern of `GET /contacts/:id`.
- **Alternatives considered**: client-side lookup from the list (rejected — stale after edits, and no deep-link support).

## R-007 — Status filter and sort canonical values

- **Decision**: Status filter accepts `ACTIVE`/`DEACTIVATED` (mapped to `isActive`). Sort accepts `name|email|status|createdAt` with `asc|desc`. Unknown values → 400.
- **Rationale**: Aligns with the spec's stated labels and the existing frontend filter options; validated server-side so the client cannot inject arbitrary columns.

## R-008 — Forced password change redirect

- **Decision**: Reuse the existing `SessionGate` + `ChangePasswordScreen` (already implemented). Add the remaining wiring: any 403 `PASSWORD_CHANGE_REQUIRED` from any call routes to `/account/password`; the shell renders only the change-password page and Sign out while pending. The walk-through test exercises register → forced change → session rotation.
- **Rationale**: Most of this already exists; the work is verification and the 403-interceptor wiring, not new architecture.

## R-009 — No-escalation and last-Administrator enforcement

- **Decision**: Reuse the existing subset check in `roles.service` and `memberships.service` (already throw `NOT_ENOUGH_PERMISSIONS` naming the permission, and `LAST_ADMINISTRATOR` for the last admin). The frontend disables checkboxes for permissions not held (from `GET /auth/me`) and shows the server's refusal inline.
- **Rationale**: Enforcement already exists; only the visible, disabled-state UI is new.

## R-010 — Audit redaction

- **Decision**: Audit entries for member creation and name edits record only `email`, `name`, `roleIds`, `isActive` in `after` (and the prior values in `before` for edits). No password, hash, or session id in any response, log, or audit entry. The existing redaction guard covers the new fields by construction (they are never secret).
- **Rationale**: Constitution III and the feature's SC-006.