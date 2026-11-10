# Feature Specification: Role-Based Access Control and Audit Log

**Feature Directory**: `specs/006-rbac-audit-log`
**Created**: 2026-11-09
**Status**: Draft
**MoSCoW Priority**: P0
**Input**: User description: "Build role-based access control and the audit log, backend only. Source: docs/PRD.md P0-F003 and P0-F012, Sections 7.4, 8 and 9.4, and the constitution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An organization always has its role catalogue ready (Priority: P1)

When an organization comes into existence — through the normal sign-up flow or by any other supported path — its role catalogue exists immediately: the five role templates (Administrator, Manager, Sales, Inventory, Purchasing) are copied into the organization's own roles together with their permission links. Organizations that already existed before this feature receive the same catalogue through a one-time backfill, without any data loss or role duplication.

**Why this priority**: every permission decision downstream depends on the roles existing inside the right organization. Without the per-organization catalogue, member creation and role assignment have nothing to attach to.

**Independent Test**: Provisions an organization, lists its roles with their permissions, and compares the result against the template definitions. Separately, runs the backfill against a pre-existing organization and verifies each of the five roles appears exactly once with its permission links.

**Acceptance Scenarios**:

1. **Given** an organization was just created, **When** any member lists the organization's roles, **Then** exactly the five template roles exist inside that organization, each linked to the template's permission set.
2. **Given** an organization created before this feature, **When** the backfill runs once, **Then** the five roles are added with their permission links; **When** the backfill runs a second time, **Then** no roles or permission links are duplicated.
3. **Given** a membership holds the Sales role and the Inventory role, **When** the system evaluates what that member may do, **Then** the effective permission set is the union of both roles' permissions.

---

### User Story 2 - An administrator manages members (Priority: P1)

An administrator creates a member with an email, a name, an initial password, and one or more roles. A member whose email already belongs to an account is added as a membership on that account without touching its password, and the answer never tells which of the two results occurred. The created member must change that password at their first sign-in before being allowed to do anything else. Later, the administrator replaces a member's roles. Every one of these actions is checked for permission, scoped to the administrator's organization, and recorded in the audit log with before and after values.

**Why this priority**: user administration is the core of P0-F003; every business module assumes members exist with correct roles.

**Independent Test**: An actor holding the required permission creates a member, signs in as that member with the initial password, observes the forced password change, changes the password, re-signs in, and performs an action allowed by the assigned role.

**Acceptance Scenarios**:

1. **Given** an actor with `users.manage`, **When** they create a member with a valid email, name, initial password and at least one existing role of the organization, **Then** the member exists and the membership appears in the organization's member list.
2. **Given** the same creation request sent twice with the same email, **When** an account for the email already exists in the system, **Then** a membership is created without touching the existing account's password or forced-change flag, and the answer is indistinguishable from a brand-new account, including when the email belongs to a user of a different organization.
3. **Given** a member whose password change is pending, **When** the member signs in with the initial password, **Then** the sign-in response states that a password change is required and every capability except changing their own password, reading their own identity and signing out is refused with a `PASSWORD_CHANGE_REQUIRED` answer until the change is made.
4. **Given** an actor with `users.manage`, **When** they replace a member's roles with a valid list, **Then** the roles are replaced atomically with a single audit entry carrying before and after role sets, and the member's next request already acts under the new permissions.
5. **Given** an actor without `users.manage`, **When** they call any member-management operation, **Then** the request is refused with 403 and no record changes.

---

### User Story 3 - The organization cannot lose its last active Administrator (Priority: P1)

A membership can be deactivated and later reactivated. Deactivating a member invalidates that user's sessions for that organization: their next request with an existing session cookie is refused and they must sign in again, which then tells them their membership is inactive. One protection is absolute: the last active administrator in an organization can never be deactivated and can never lose the Administrator role through a role change.

**Why this priority**: losing administrative access to an organization is unrecoverable without platform surgery; the guard must exist in the same release that allows deactivation at all.

**Independent Test**: In a single-organization setup with exactly one active Administrator, attempts every action that would remove that administrative power (deactivating the membership, changing the member's roles to exclude Administrator) and verifies each is refused, while a second active Administrator exists in the same organization to make the same actions succeed.

**Acceptance Scenarios**:

1. **Given** exactly one active Administrator in the organization, **When** their membership is deactivated, **Then** the request is refused with 409 and their membership remains active with the Administrator role.
2. **Given** exactly one active Administrator in the organization, **When** their roles are changed to a set that does not include Administrator, **Then** the request is refused with 409.
3. **Given** two or more active Administrators, **When** one is deactivated or loses the Administrator role, **Then** the action succeeds and is recorded in the audit log.
4. **Given** a member signs in and holds an active session, **When** the membership is deactivated, **Then** the member's existing sessions for that organization no longer authorize any request, and a fresh sign-in asserts the membership is inactive.

---

### User Story 4 - Administrators shape custom roles without touching system roles (Priority: P2)

An administrator can create additional roles for their organization — any permission in the catalogue may be granted, with no hidden restricted class — change which permissions a custom role holds and rename it, and delete a role that no membership uses. One safeguard bounds every grant: a role's resulting permission set and a membership's assigned role set can never exceed the acting administrator's own effective permissions, so nobody can promote anyone (or themselves) beyond what they hold. The five system roles are read-only: they can never be edited or deleted, the Administrator role always holds the entire catalogue including permissions added later, and deleting a role that is still assigned to a membership is refused.

**Why this priority**: custom roles increase fitness but the five templates alone are sufficient to operate; the read-only, assigned and escalation protection rules must exist the moment custom roles do. It is P2 within the feature, not for the platform: P0-acceptance of P0-F003 needs custom roles only as far as this story makes them safe.

**Independent Test**: Creates a role, assigns it to a membership, verifies deletion is refused, removes the assignment, verifies deletion succeeds, verifies every modify operation against a system role is refused, and verifies an actor cannot create, edit or assign a role with permissions they do not hold while an Administrator can.

**Acceptance Scenarios**:

1. **Given** an actor with `roles.manage`, **When** they create a role with a fresh name and a valid permission set, **Then** the role is available for assignment.
2. **Given** a system role, **When** any modification or deletion is attempted, **Then** the request is refused.
3. **Given** a role assigned to a membership, **When** it is deleted, **Then** the request is refused; **When** no membership holds it anymore, **When** it is deleted, **Then** the deletion succeeds and any audit trail references to it remain readable.
4. **Given** an actor who does not hold a permission, **When** they create or edit a custom role carrying it, or assign a role carrying it, **Then** the request is refused with 403 `NOT_ENOUGH_PERMISSIONS` naming the permission; **When** an Administrator performs the same actions, **Then** they succeed.

---

### User Story 5 - Administrators can see who did what (Priority: P1)

Every in-scope action leaves exactly one audit record committed together with the action: registration, login failures, own-password changes and their failures, organization role catalogue provisioning, member creation, role changes on a membership, membership deactivation and reactivation, and custom role changes. Each record holds the organization, the acting user, the action code, the record type and identifier, the timestamp, and the before and after values — and never a password, token or secret. An actor with `audit.read` lists the organization's entries with filters (period, user, action, record) and server-side paging; organizations with other entries see nothing.

**Why this priority**: the audit log is the tool that makes the other stories trustworthy and is mandated by P0-F012 for these administrative actions.

**Independent Test**: Performs each audited action, verifies each leaves exactly one entry with the required fields, then lists entries as a permitted user with and without filters, as a second organization, and without the permission.

**Acceptance Scenarios**:

1. **Given** an audited action completes, **When** the log is listed, **Then** exactly one entry for the action exists with organization, acting user, action code, record type and id, timestamp, and change details.
2. **Given** an actor with `audit.read`, **When** entries are listed with a filter (for example, a period or an action code), **Then** only matching entries of the active organization return, in the requested page size with a total count.
3. **Given** an actor without `audit.read`, **When** the listing endpoint is called, **Then** the request is refused with 403.
4. **Given** any audit entry of any configured action, **When** its stored details are examined, **Then** no password, token or secret value appears.
5. **Given** entries with no organization exist (anonymous sign-in failures, including one storing a keyed hash of an attacker-controlled string), **When** any organization's listing is queried with any filter or page, **Then** none of them appear; and for repeated failures of the same account in one rate-limit window, only the first-failure and lockout entries exist.

---

### Edge Cases

- What happens when a member is created with an email that already belongs to a user account? The membership is created on the existing account, whose password and forced-change flag stay untouched, and the answer is identical to the brand-new-account case, so member creation cannot discover which emails have accounts.
- What happens when the initial password for a new member violates the password policy? The request is refused before any record exists, and no partial member or membership remains.
- What happens when more than 5 wrong current-password verifications are made for change-own-password within 15 minutes? The request returns 429 with `Retry-After`, honouring the same visible-wait behaviour as repeated failed sign-ins.
- What happens when an audit write fails inside an audited action? The entire action, including the business records it would have produced, rolls back — an action without its audit record never exists and a record without its action never exists.
- What happens when an unknown email is used at sign-in (no matching user) and a login failure should be recorded? The entry is recorded with no acting user and no organization, storing only a keyed truncated one-way hash and a sanitized length-capped marker of the submitted value (people often type a password into the email field, so the raw attacker-controlled text is never stored), and it can never appear in any organization's audit listing.
- What happens when repeated sign-in failures for the same account would flood the append-only audit table? Only the first failure per rate-limit window per account, plus the lockout event itself, is written; further attempts are counted in the existing failed-login counters only.
- What happens when a role name collides (case-insensitively) with an existing role of the same organization? The creation or rename is refused with 409.
- What happens when a member whose effective permissions exclude a permission tries to create or edit a custom role carrying that permission, or to assign such a role to a membership? The request is refused with 403 `NOT_ENOUGH_PERMISSIONS` naming the permission; editing *down* to a set the actor holds is allowed.
- What happens when a member is created or a member's roles are replaced with an empty role list, or with a role id that does not exist or belongs to another organization? The request is refused with 400 `VALIDATION_ERROR` naming the offending field, and nothing changes. (Addressing a role *resource* by id in its own endpoint still returns 404 when the role belongs to another organization.)
- What happens when a member's roles are changed while they hold an active session? The change applies from the member's next request onward; no re-login is needed for permission changes (deactivation, not role change, ends sessions).
- What happens when the backfill migration encounters an organization that somehow already has a role named exactly like a template role? The backfill skips creating a duplicate for that role and completes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST, at organization creation, copy each role template (Administrator, Manager, Sales, Inventory, Purchasing) into the organization's own roles together with its permission links, inside the same indivisible operation that creates the organization.
- **FR-002**: System MUST backfill existing organizations once through a new migration that adds the template roles and permission links, and MUST leave any organization that already holds an equivalently named role untouched for that role.
- **FR-003**: System MUST allow a membership to hold one or more roles of its organization and MUST resolve the member's effective permissions as the union of the permissions of all held roles.
- **FR-004**: System MUST apply role and permission changes to an already-signed-in member's effective permissions from the member's next request onward, without requiring a new session.
- **FR-005**: System MUST provide member management endpoints — listing the organization's memberships; creating a member with name, email, an initial password and roles; replacing a member's roles; deactivating a membership; reactivating a membership — and each of these endpoints MUST declare the permission `users.manage`. The roles list of a member creation or a roles replacement MUST be non-empty and reference only existing roles of the member's organization, otherwise the request is refused with HTTP 400 `VALIDATION_ERROR` naming the offending field. A roles replacement is atomic with its audit entry.
- **FR-006**: System MUST require the initial password of a created member to satisfy the same password policy as ordinary sign-up, MUST hash it in the same irreversible manner on receipt, and MUST mark the newly created account for a forced password change; a linked existing account keeps its password and flag untouched.
- **FR-007**: System MUST, at the member's first sign-in with the initial password, report that a password change is required and MUST refuse every authenticated capability except changing their own password, reading their own identity, and signing out until the change is completed, answering other requests with HTTP 403 `PASSWORD_CHANGE_REQUIRED`.
- **FR-008**: The initial password of a created member is supplied by the actor and MUST satisfy the same policy as ordinary sign-up, validated unconditionally (HTTP 400 naming the field when missing or invalid, whether or not the email already exists). System MUST create the member's user account when no account for the email exists, set its forced password change flag, and link the membership to that new account; when an account for the email already exists, system MUST create the membership on the existing account and MUST leave its password, including its forced-change flag, untouched. System MUST answer identically whether or not the account existed — the response MUST NOT reveal which of the two happened, so membership creation cannot be used to discover which emails have accounts anywhere in the system.
- **FR-009**: System MUST refuse a roles change that would leave the organization without an active Administrator — a membership holding the Administrator system role (HTTP 409 `LAST_ADMINISTRATOR`) — and MUST refuse to deactivate the last active Administrator equally.
- **FR-010**: System MUST, upon deactivating a membership, invalidate that user's sessions for that organization, and MUST prevent reactivation from being performed on an already-active membership and deactivation on an already-deactivated membership (HTTP 409).
- **FR-011**: System MUST provide a roles and permissions read — listing the organization's roles each with its permission codes, and the system permission catalogue — declaring the permission `roles.manage`.
- **FR-012**: System MUST allow an actor with `roles.manage` to create a custom role, update a custom role's name and permission set, and delete a custom role that no membership holds.
- **FR-013**: System MUST treat the five template roles as read-only: editing, renaming, permission-changing or deleting them is refused (HTTP 403), and deleting any role still assigned to a membership is refused (HTTP 409).
- **FR-014**: System MUST enforce role names unique per organization, case-insensitively; MUST refuse role payloads referencing permissions that do not exist (HTTP 400); and MUST return 404 for a role of another organization.
- **FR-015**: System MUST record every configured audited action in exactly one audit entry — registration, login failures, own-password change successes and failures, organization role catalogue provisioning, member creation, membership role changes, membership deactivation and reactivation, and custom role creation, update and deletion — through one central audit helper.
- **FR-016**: System MUST write each audit entry inside the same transaction as the audited action so that a failed audit write rolls the action back entirely, making an unaudited action and an audit entry without its action both impossible.
- **FR-017**: System MUST enforce append-only audit storage at the database level: updates, deletions and truncations of audit entries are rejected for the application's database role, and no in-scope endpoint offers modification or deletion.
- **FR-018**: System MUST store in each audit entry: the organization (nullable for organization-less auth events such as an unknown-email login failure), the acting user (nullable for anonymous events), the action code, the record type and record identifier, the timestamp, and the before and after values of the change.
- **FR-019**: System MUST prevent passwords, tokens, session identifiers and other secrets from appearing in any audit entry or log output produced by this feature. The initial-password request field is covered by the redaction guard; the server never generates, returns, echoes or stores its plain value — it is hashed on receipt and never reappears in a log, audit entry or response.
- **FR-020**: System MUST provide an audit listing endpoint declaring the permission `audit.read`, scoped to the session's active organization — an entry without an organization can never match any query, filter or page of this endpoint — supporting filters by period, acting user, action code and record, with server-side paging and a total count.
- **FR-021**: System MUST return HTTP 403 for every in-scope endpoint when the permission is not held, when the membership is inactive, or when the tenant context cannot be resolved; the default is deny.
- **FR-022**: System MUST scope every in-scope query by the session's active organization and MUST return HTTP 404 for any record identified but owned by another organization, whether it exists or not.
- **FR-023**: System MUST enable row-level security with no policies on every table this feature introduces, and MUST create them through a new migration that is never an edit of an applied migration.
- **FR-024**: System MUST fail the guard suite when a committed migration file's content no longer matches the version recorded as committed.
- **FR-025**: System MUST provide a change-own-password capability for the signed-in user — verified against the current password, CSRF-protected — in which the current password is verified with the same irreversible hashing as sign-in; a wrong current password is answered with HTTP 400 `INVALID_CURRENT_PASSWORD` (never 401) and counts toward the failed login rate limiter keyed by user, so that more than 5 wrong verifications within 15 minutes return HTTP 429 with `Retry-After`.
- **FR-026**: System MUST validate the new password against the same policy as registration, MUST require that it differs from the current password and that it does not equal the user's email, and MUST name the failing field in validation errors (HTTP 400).
- **FR-027**: On a successful change, the system MUST invalidate all of the user's other sessions in every organization, MUST rotate the current session's identifier and CSRF token (a fresh cookie), keeping the user signed in on the current session, and MUST clear the user's forced password change flag.
- **FR-028**: While the forced password change flag is set, the system MUST answer every authenticated capability other than changing their own password, reading their own identity, and signing out with HTTP 403 `PASSWORD_CHANGE_REQUIRED`, and MUST expose the flag through the identity read so callers can route the user to the change form.
- **FR-029**: System MUST audit a password change as `auth.password_changed` and a failed verification as `auth.password_change_failed`, with no password, password hash or token value stored in the audit entry or written to any log.
- **FR-030**: For audited sign-in failures, the system MUST store for a known user their user identifier (never their raw email) and for an unknown account a keyed one-way hash truncated to a fixed length plus a length-capped, control-character-free marker of the submitted account string, never the original submitted value, and no organization on either; MUST write an entry only for the first failure of the rate-limit window per account plus the lockout event itself, counting further attempts in the existing failed-login counters; and MUST limit each such entry to the timestamp, the proxy-trusted client address (never a client-supplied header value unless the trusted-proxy configuration permits it), and the reason code.
- **FR-031**: System MUST prevent permission escalation: the resulting permission set of a custom role created or edited, and the union of permissions of roles assigned to a membership, MUST be a subset of the acting user's own effective permission set; anything beyond it is refused with HTTP 403 `NOT_ENOUGH_PERMISSIONS` naming the permission. Editing a role down to a smaller set the actor holds is allowed; the Administrator system role, holding the whole catalogue, makes Administrators unrestricted.
- **FR-032**: The Administrator system role of every organization MUST always hold the entire permission catalogue, including permissions added later to the catalogue by platform work; adding a catalogue permission MUST also extend every organization's Administrator role.

### Key Entities *(include if feature involves data)*

- **Role**: A named, organization-owned set of permissions. Carries a name, a flag marking the five template roles as system roles, and links to permissions. Five templates exist as seed data; every organization holds its own copies.
- **Permission**: A named capability of the form `resource.action` (for example `users.manage`). Belongs to the system catalogue; roles link to it.
- **Membership**: The link between a user and an organization, with an active/deactivated state, holding one or more roles through membership-role links; effective permissions are the union of held roles' permissions.
- **AuditLog**: The append-only record of an action: organization, acting user, action code, record type and id, timestamp, and before/after values. Never updated or deleted; contains no secrets.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** The organization role copy, membership-role links and the audit log are organization-owned (`organization_id` NOT NULL, indexed; composite foreign keys between organization-owned tables). Tenant scope resolves from the session and the verified active membership; client-supplied organization identifiers are ignored; cross-organization record access returns 404. Every in-scope endpoint gains an automated cross-tenant test (two organizations prove no read, mutate or enumerate), and every new table has RLS enabled with no policies.
- **II. Server-enforced authority:** Every in-scope endpoint declares its required permission (`users.manage` for member operations, `roles.manage` for role operations and the permission catalogue, `audit.read` for listing); default deny covers absent permission, inactive membership and unresolvable tenant context. State transitions (deactivate/reactivate, audit append) are validated server-side with 409 `INVALID_STATE_TRANSITION` semantics where documented.
- **III. Transactional integrity:** Member creation, role-template provisioning and every audited change run in a single transaction; the audit write commits in the same transaction and a failed audit insert rolls the business change back. The audit table becomes immutable for the application role (no UPDATE/DELETE privilege; database-level rejection of UPDATE, DELETE and TRUNCATE).
- **IV. Exact decimals:** No monetary or quantity columns are introduced; where period filters compare timestamps, precision needs of pagination only. N/A for rounding.
- **V. Test-first:** Failing tests are written first and observed red for: cross-tenant access on every endpoint, missing-permission 403 on every endpoint, the last-Administrator rule, session invalidation on deactivation, the append-only rejections, and the audit-rollback coupling. Integration tests run against a real PostgreSQL instance; critical paths target ≥80% coverage.
- **VI. Module boundaries:** Work stays in the AccessControl module (roles, permissions, memberships) and a new Audit module owned by the same backend; both expose explicit service interfaces. The auth module raises events / calls the audit service inside its own transactions; no module reads or writes another module's tables directly; no circular dependencies.
- **VII. Honest boundaries:** No tax-compliance, e-invoicing or accounting claim is implied. The audit log documents system actions only; it is not presented as a compliance or financial-statement artifact.
- **VIII. Design system and accessibility:** Backend-only; no interface is delivered in this feature. N/A.
- **IX. Scope discipline:** P0 — P0-F003 and P0-F012 in PRD Section 6; the required build order puts RBAC and audit before every business module. Invitations (P1-F003), password reset, MFA, SSO and all frontend screens are explicitly out of scope. Preceding phase work (authentication, sessions, organizations, tenant resolution) is implemented and merged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every in-scope endpoint, a cross-tenant test proves a member of another organization receives 404 (never 403 or a data leak) on record-addressing reads and mutations; all cross-tenant tests pass.
- **SC-002**: For every in-scope endpoint, a permission test proves a member lacking the declared permission receives 403 with no state change; all permission tests pass.
- **SC-003**: An organization with exactly one active Administrator refuses every action that would remove that last administrative power (deactivation, role change), and succeeds the same actions once a second active Administrator exists.
- **SC-004**: After deactivating a membership, the member's previously valid session refuses the next request, and a fresh sign-in is refused for that organization as-long-as-state is inactive; proven with a session established before deactivation.
- **SC-005**: A direct attempt to update, delete or truncate audit rows is rejected by the database; the application exposes no path that performs any of them.
- **SC-006**: An audited action whose audit write is forced to fail produces no business change at all (no member, no role change, no membership-state change), and every successful audited action produces exactly one entry.
- **SC-007**: A scan of all audit entries and all log output produced by exercising the feature — including the password-change audit entries — shows no password (current, initial or new), password hash, token, session identifier or other secret value.
- **SC-008**: A new organization's catalogue contains exactly the five template roles with their permission links; the backfill adds exactly these five roles to every pre-existing organization, and re-running it creates no duplicates.
- **SC-009**: The contract drift check and every existing guard (schema numeric types, migration history, RLS coverage, default deny, boot smoke) pass after the feature is implemented, and the new migration files are byte-identical to their committed state as proven by the migration-immutability guard.
- **SC-010**: A member with the forced password change flag set receives `PASSWORD_CHANGE_REQUIRED` for every capability outside the allowed three and full access after a successful change; proven by calling an ordinary endpoint before and after the change.
- **SC-011**: A successful own-password change invalidates every other session of the user, rotates the current session so a fresh identifier/CSRF cookie continues to work while the previous cookie does not, and the new password signs in while the old one does not.
- **SC-012**: The 6th wrong current-password verification within 15 minutes returns 429 with `Retry-After`; a wrong current password returns 400 `INVALID_CURRENT_PASSWORD` and never 401.
- **SC-013**: Every organization-scoped audit query — bare listing, each filter, and every page — returns zero organization-less entries, proven with anonymous sign-in failures seeded before and after, and repeated failures of the same account within a window produce exactly one first-failure entry plus the lockout entry.
- **SC-014**: Creating a member whose email already belongs to an account of another organization behaves byte-for-byte like creating one with a fresh email — same response shape and status, the existing account's password and forced-change flag untouched — with no status or body difference that would let the endpoint enumerate which emails have accounts.
- **SC-015**: A member holding `roles.manage` without another permission is refused with 403 `NOT_ENOUGH_PERMISSIONS` (naming the permission) when creating or editing a role carrying the missing permission or assigning such a role, and succeeds when the set stays within their own; an Administrator with the system role performs both successfully.
- **SC-016**: A permission added to the catalogue by platform work appears on every organization's Administrator role afterward (proven by extending the catalogue in a test), and the last-Administrator rule holds unchanged when custom roles carry administrative permissions.

## Assumptions

- Acting user identity for audit entries is the signed-in user performing the action through the API; system-initiated provisioning at registration attributes the new organization's creator as acting user.
- A failed sign-in with a valid email of an existing user is audited as a security event with the user recorded and no organization attached; unknown-email failures store only a keyed truncated hash plus a sanitized marker of the submitted value. Organization audit listings never return these entries, and repeated failures beyond the first per window are not entries but counter increments.
- A created member is inactive in no sense by default: a created membership is born active, and its forced password change is a user-level flag, independent of membership state.
- The initial password is supplied by the administrator and is required in the creation request; it is policy-checked unconditionally, hashed on receipt, and never stored plain, generated, returned or echoed. The creation response identifies the membership but never reveals whether the account was created fresh (forced change set) or linked to an existing account (its password and flag untouched).
- System role read-only protection applies to the five named template roles copied into each organization (identified by the system flag), never to the templates' seed data itself, which remains platform-owned reference data.
- Reactivation applies to a deactivated-but-existing membership; removal of memberships entirely is out of scope.
- The audit listing's default page size is 25 with a maximum of 100, matching the platform-wide API rules; date filters are inclusive of their boundaries.
- The permission catalogue is stable reference data managed by the platform, not by organizations; creating memberships with permissions that don't exist is a client error. Every organization's Administrator system role mirrors the whole catalogue, so catalogue growth is a two-step platform change (catalogue entry plus every Administrator role) enforced as one invariant.
- The migration-immutability guard compares each committed migration file against a recorded checksum of the content that shipped with the migration; editing history is impossible without failing the suite.
- The change-own-password capability is documented as part of the auth contract in `docs/api-auth-contract.md`, together with the forced-change gating, so the interface can implement the change form without guessing.

## Clarifications *(mandatory)*

### Session 2026-11-09

- Q: Must a membership hold at least one role, or can a member exist with zero roles? → A: At least one role, always. Member creation and every roles replacement require a non-empty list of existing role ids of the same organization, otherwise 400 `VALIDATION_ERROR` naming the offending field; role deletion cannot orphan a membership into zero roles because deleting an assigned role is refused.
- Q: Is the change-own-password capability in scope for the forced first-login change? → A: Yes, in scope. `POST /api/v1/auth/change-password`, authenticated and CSRF-protected, body `currentPassword`/`newPassword`: current password verified by irreversible hash (wrong one → 400 `INVALID_CURRENT_PASSWORD`, never 401, counted by the user-keyed limiter with 429 + `Retry-After` after more than 5 failures in 15 minutes); new password follows the registration policy, differs from the current one and is not the user's email, errors naming the field; success invalidates all other sessions of the user in every organization, rotates the current session's identifier and CSRF token (fresh cookie, user stays signed in) and clears the forced flag; while the flag is set only change-password, the identity read and logout are allowed and everything else answers 403 `PASSWORD_CHANGE_REQUIRED` (the flag is exposed by the identity read); audit entries `auth.password_changed` and `auth.password_change_failed` carry no password or hash; the contract, including this endpoint, goes into `docs/api-auth-contract.md`; frontend screens remain out of scope.
- Q: Where do sign-in-failure audit entries attach, and what do blind unauthenticated floods cost? → A: A known user attaches the user with no organization; an unknown email attaches neither. Organization listings can never return these entries and a test must prove it for the listing, its filters and its paging. Blind floods are contained: the raw submitted account string is never stored (known users → user id only; unknown accounts → keyed truncated hash plus a length-capped control-character-free marker); an entry is written only for the first failure per account per rate-limit window and the lockout event, the rest counting in the existing failed-login counters; entries carry timestamp, proxy-trusted client address (never a client-supplied header unless the trusted-proxy setting allows it) and reason code, nothing else. Administrators see failures only in structured logs and counters; a platform-level view is a recorded follow-up, out of scope.
- Q: Who supplies a new member's initial password, and what happens when the email already has an account? → A: The administrator supplies it; the field is required on member creation and validated unconditionally against the registration policy (400 naming the field when missing or invalid), hashed on receipt, and never generated, returned, echoed or stored plain by the server. When the email already has an account — even in another organization — the membership is created on the existing account with its password and forced-change flag untouched, and the endpoint answers identically either way so it cannot be used to discover which emails have accounts; the response carries no created-versus-linked distinction.
- Q: May a custom role hold administrative permissions, and who may grant what? → A: The catalogue is open: a custom role may hold any existing permission, including `users.manage`, `roles.manage`, `audit.read` and `settings.manage`; there is no hidden restricted class. The no-escalation rule bounds every grant: a created or edited role's resulting permission set, and the union of permissions of roles assigned to a membership, must be a subset of the acting user's own effective permissions, otherwise 403 `NOT_ENOUGH_PERMISSIONS` naming the permission (editing down to a held set is allowed; the Administrator system role makes Administrators unrestricted). The Administrator system role always holds the entire catalogue including permissions added later. The last-active-Administrator guard stays keyed on the Administrator system role, which being read-only guarantees the organization keeps its administrative capability no matter what custom roles carry. Every role create, edit, delete and assignment is audited with the before and after permission sets.
