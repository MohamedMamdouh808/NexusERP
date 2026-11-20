# Feature Specification: Users & Roles and Change-Own-Password End to End

**Feature Branch**: `main` (feature directory: `specs/014-users-roles-password`)
**Created**: 2026-11-15
**Status**: Draft
**MoSCoW Priority**: P0 (P0-F003 Users & Roles, change-own-password)
**Input**: User description: "Build the Users & Roles page and the change-own-password screens end to end: the interface switching from sample data to the real backend, with only the small backend additions listed here. Source: docs/PRD.md P0-F003, Sections 7.4, 8 and 9.4, the constitution, the existing Users & Roles screens, the RBAC and audit feature, and the contract in docs/api-auth-contract.md."

This feature replaces the sample data behind the Users & Roles screens with the real backend and adds the change-own-password flow. The backend additions are limited to what the screens need: search, filter, sort, paging with a total, a password-change-required flag on members, and a member count on roles. No new tables are introduced. Everything else (memberships, roles, permissions, audit, session rotation, module gate) already exists.

## Clarifications *(mandatory)*

### Session 2026-11-15

- Q: Where should a member's display name be stored? → A: On the membership (per-organization), in a new migration adding a nullable `name` column to `memberships` (existing memberships stay null). Name is trimmed, 1–100 characters, no control characters, not unique. Required when adding a member, optional in storage. Display shows name when present, otherwise the email; search matches name and email case-insensitively; sorting by name sorts by the displayed value. The create endpoint stores the name on the membership whether or not the email already had an account (identical response either way). A new PATCH on the membership (users.manage) edits the name with before/after audit and stale-update protection using the membership's version, which gains a version number in the same migration. An administrator can edit any member's name, including their own. User self-service name editing is out of scope (follow-up). The audit entry keeps name and email in after-values; nothing more personal is recorded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and manage members (Priority: P1)

As a member holding `users.manage`, I want to find members by name or email, narrow them by role or status, sort and page through them with a visible total, and act on each row through a kebab menu, so that I can administer membership without leaving the page.

**Why this priority**: Membership administration is the entry point for every other permission; without a working member list no one can be granted or removed access.

**Independent Test**: Sign in as an Administrator, open `/users`, search by a fragment of a name, filter by role and status, change sort and page size, and confirm the table, badges, status text, password-change-required flag, and kebab actions all reflect server data and the total matches.

**Acceptance Scenarios**:

1. **Given** members exist in the organization, **When** Omar types a search term, **Then** the list narrows to members whose name or email contains it, the total updates, and wildcards in the term are treated as literal characters.
2. **Given** a role filter is chosen, **When** the list loads, **Then** only members holding that role appear and the total reflects the filter.
3. **Given** a status filter (Active or Deactivated), **When** the list loads, **Then** only members in that state appear and the total reflects the filter.
4. **Given** sort by name, email, status, or created date, **When** applied, **Then** rows are ordered accordingly and the order survives paging.
5. **Given** a pageSize above the server maximum (100), **When** requested, **Then** the server refuses with 400 and the interface falls back to the maximum.
6. **Given** a member whose `mustChangePassword` is true, **When** the row renders, **Then** a "password change required" flag is shown.
7. **Given** a member holding `users.manage`, **When** the page loads, **Then** Edit roles, Deactivate and Reactivate controls are available; a member without it never sees them, and the server remains the authority.

### User Story 2 - Add a member (Priority: P1)

As an Administrator, I want to add a member with name, email, initial password, and at least one role, so that a new person can work in this organization.

**Why this priority**: Onboarding is the first action after setup; it must never leak or display the initial password.

**Independent Test**: Open the New User dialog, fill name, email, a 12-character password, and one role, submit, and confirm the success message and the new row; verify the password never appears in the response, the UI, or the audit entry.

**Acceptance Scenarios**:

1. **Given** the New User dialog, **When** Omar enters a password shorter than 12 characters, **Then** submission is blocked with an inline validation error.
2. **Given** a valid submission, **When** it succeeds, **Then** the member is created, the dialog closes, the list refreshes, and the message "The member was added. If this person already had an account, they keep their existing password." is shown.
3. **Given** the email belongs to an existing user, **When** Omar submits, **Then** the API answers identically and the same message is shown; the screen does not claim the password was changed.
4. **Given** no role is selected, **When** Omar submits, **Then** submission is blocked with "at least one role".
5. **Given** the password field, **Then** it is `type="password"`, `autocomplete="new-password"`, is never displayed, copied back, stored in client state beyond the field, or logged.

### User Story 3 - Edit a member's roles (Priority: P1)

As an Administrator, I want to change which roles a member holds, so that access matches responsibility.

**Why this priority**: Role assignment is the core of RBAC administration.

**Independent Test**: Open Edit roles for a member, toggle roles, observe the effective permission count and grouped permission preview update, and save; verify the member's effective permissions change.

**Acceptance Scenarios**:

1. **Given** the Edit roles dialog, **When** roles are toggled, **Then** the resulting effective permission count and a grouped read-only preview of the union of permissions update live.
2. **Given** at least one role must be selected, **When** Omar deselects all, **Then** submission is blocked.
3. **Given** the last active Administrator, **When** Omar tries to remove the Administrator role, **Then** the server refuses with "At least one active Administrator is required" shown inline and nothing changes.
4. **Given** a permission the signed-in member does not hold, **When** it appears in a role, **Then** it is shown disabled with the note "You can only grant permissions you hold"; a server 403 `NOT_ENOUGH_PERMISSIONS` shows inline naming the permission.

### User Story 4 - Deactivate and reactivate a member (Priority: P1)

As an Administrator, I want to deactivate or reactivate a member of this organization, so that access can be revoked and restored without deleting history.

**Why this priority**: Offboarding and re-onboarding are routine and must be safe.

**Independent Test**: Deactivate an active member and confirm a ConfirmDialog states the consequence; verify the member can no longer sign in to this organization while history is retained; reactivate and verify access returns.

**Acceptance Scenarios**:

1. **Given** an active member, **When** Omar chooses Deactivate, **Then** a ConfirmDialog states the user loses access to this organization, history is kept, and their other organizations are unaffected; on confirm the member becomes DEACTIVATED.
2. **Given** a deactivated member, **When** Omar chooses Reactivate, **Then** a ConfirmDialog states the consequence; on confirm the member becomes ACTIVE.
3. **Given** the last active Administrator, **When** Omar tries to deactivate them, **Then** the server refuses with "At least one active Administrator is required" shown inline and the member stays ACTIVE.
4. **Given** a deactivated member, **When** they try to sign in, **Then** they are refused with the same generic message as a wrong password.

### User Story 5 - Browse roles, create, edit, and delete custom roles (Priority: P1)

As an Administrator, I want to manage custom roles and inspect system roles, so that access can be shaped to the organization's needs.

**Why this priority**: Roles are the vehicle for every permission; without management the system ships only with fixed templates.

**Independent Test**: Open `/users/roles`, confirm system roles are read-only with the note "System roles cannot be edited" and show permissions grouped by module as a checklist; create a custom role, edit it, and delete an unassigned one; attempt to delete an assigned one and confirm the refusal names the member count.

**Acceptance Scenarios**:

1. **Given** a system role, **When** it is opened, **Then** its permissions are shown as a read-only checklist grouped by module with the note "System roles cannot be edited" and no edit or delete controls.
2. **Given** a custom role with no members, **When** Omar deletes it, **Then** it is removed and the list refreshes.
3. **Given** a custom role assigned to N members, **When** Omar deletes it, **Then** the server refuses and the interface shows the refusal naming the number of members; the role remains.
4. **Given** the role editor, **When** a permission the signed-in member does not hold is shown, **Then** it is disabled with the note "You can only grant permissions you hold".
5. **Given** a role detail page, **When** it loads, **Then** it shows the role's member count.

### User Story 6 - Change my own password (Priority: P1)

As any signed-in member, I want to change my own password, so that I can keep my account secure and clear a forced change.

**Why this priority**: Password change is a baseline security capability and the only way to clear `mustChangePassword`.

**Independent Test**: Open `/account/password` from the user menu, enter the current password and a new 12-character password, submit, and confirm a toast and that the session identifier rotates while the user stays signed in; enter a wrong current password and confirm a 400 `INVALID_CURRENT_PASSWORD` with no sign-out.

**Acceptance Scenarios**:

1. **Given** the change-password page, **When** Omar enters a new password shorter than 12 characters or equal to the current one, **Then** submission is blocked with an inline validation error.
2. **Given** a wrong current password, **When** submitted, **Then** a 400 `INVALID_CURRENT_PASSWORD` is shown inline and the user stays signed in.
3. **Given** a valid submission, **When** it succeeds, **Then** the user stays signed in, the session identifier rotates, and a toast confirms the change.
4. **Given** `GET /auth/me` reports `mustChangePassword: true`, **When** the user navigates anywhere, **Then** they are redirected to `/account/password`, the shell shows only that page and Sign out, and a 403 `PASSWORD_CHANGE_REQUIRED` from any other call sends them here.
5. **Given** the change-password flow, **Then** it is part of the sign-in walk-through (a forced change is exercised end to end in tests).

### Edge Cases

- Search terms containing `%`, `_`, or backslash are treated as literal characters, never as wildcards.
- A member deactivated in this organization keeps access to their other organizations.
- Deactivating or reactivating the last active Administrator is refused by the server and surfaced inline.
- A role with members cannot be deleted; the refusal names the count.
- Permission checkboxes the signed-in member does not hold are disabled, not hidden, so the rule is visible.
- A wrong current password never signs the user out and never rotates the session.
- `mustChangePassword` redirects happen on every route, including deep links and refreshes.
- Server errors always display the request identifier inline.

## Requirements *(mandatory)*

### Functional Requirements

**Members list (backend)**

- **FR-001**: The members list endpoint MUST accept `search` (matched against name and email), `role` (role id), `status` (ACTIVE or DEACTIVATED), `sort` (name, email, status, createdAt with direction), `page`, and `pageSize`, and MUST return `total` alongside the page.
- **FR-002**: `pageSize` MUST be capped at 100; requests above the cap MUST be refused with 400.
- **FR-003**: Search MUST escape wildcard characters (`%`, `_`, backslash) so they are treated literally.
- **FR-004**: Each member row MUST include `passwordChangeRequired` (from `mustChangePassword`).
- **FR-005**: The list MUST be tenant-scoped: a member of another organization never appears.

**Member name and edit (backend)**

- **FR-006**: A membership MUST carry a nullable `name` (trimmed, 1–100 characters, no control characters, not unique), stored per membership so each organization sees only its own name for an account; no organization can see or change another organization's name for the same account. No column is added to `users`, and name is never read from or inferred from `users`.
- **FR-007**: `name` MUST be required when adding a member and optional in storage (existing memberships and accounts created at registration have none).
- **FR-008**: The display rule MUST be: show `name` when present, otherwise the email; never an invented name. Search matches name and email case-insensitively with escaped wildcards; sorting by name sorts by the displayed value.
- **FR-009**: The create endpoint MUST store `name` on the membership whether or not the email already had an account, keeping an identical response in both cases.
- **FR-010**: A membership MUST carry a `version` number (added in the same migration, starting at 1) used for stale-update protection on edits.
- **FR-011**: A PATCH on the membership (guarded by `users.manage`) MUST allow setting or correcting `name`, with an audit entry carrying before and after, and stale-update protection using `version` (incremented on success). An administrator MUST be able to edit any member's name, including their own.

**Roles (backend)**

- **FR-012**: The roles list and the role detail MUST include `memberCount`: the number of memberships holding that role.
- **FR-013**: No new tables are introduced; the only schema additions are a nullable `name` and a `version` on `memberships`.

**Members and roles (interface)**

- **FR-014**: The Users, Roles, and role detail screens MUST use a real API client behind the service seam; sample data and the sample service MUST be deleted; the Sample data banner MUST NOT appear on them.
- **FR-015**: The members table MUST show Name, Email, Roles (badges), Status (ACTIVE or DEACTIVATED, as text and colour), a password-change-required flag, and a kebab menu (Edit roles, Deactivate or Reactivate).
- **FR-016**: The New User dialog MUST collect name, email, initial password, and at least one role; the password field MUST be `type="password"` with `autocomplete="new-password"` and a minimum of 12 characters; the password MUST never be displayed, copied back, stored, or logged.
- **FR-017**: On successful creation the interface MUST show: "The member was added. If this person already had an account, they keep their existing password."
- **FR-018**: The Edit roles dialog MUST offer role checkboxes (at least one) with a live effective permission count and a grouped read-only preview of the union of permissions.
- **FR-019**: Deactivate and Reactivate MUST use a ConfirmDialog stating the consequence: the user loses access to this organization, history is kept, and their other organizations are unaffected.
- **FR-020**: System roles MUST be read-only with the note "System roles cannot be edited"; their permissions MUST show as a checklist grouped by module.
- **FR-021**: Custom roles MUST be creatable, editable, and deletable; deleting a role assigned to members MUST surface the server's refusal naming the member count.
- **FR-022**: Permissions the signed-in member does not hold MUST be shown disabled with the note "You can only grant permissions you hold", using the permissions from `GET /auth/me`.
- **FR-023**: A 403 `NOT_ENOUGH_PERMISSIONS` from the server MUST show inline naming the permission.
- **FR-024**: The last active Administrator MUST never be deactivated or lose the Administrator role; the server's refusal "At least one active Administrator is required" MUST show inline.
- **FR-025**: Controls the member lacks permission for (`users.manage`, `roles.manage`) MUST be hidden or disabled based on `GET /auth/me`, with the server still the authority.
- **FR-026**: The page MUST repeat: "Access to this page is enforced by the server; hiding a control is not security."

**Change password (interface + backend contract)**

- **FR-027**: A page at `/account/password` MUST be reachable from the user menu and use `POST /auth/change-password` with current and new password, both subject to the 12-character policy, with new differing from current.
- **FR-028**: A wrong current password (400 `INVALID_CURRENT_PASSWORD`) MUST NOT sign the user out.
- **FR-029**: On success the user MUST stay signed in, the session identifier MUST rotate, and a toast MUST confirm the change.
- **FR-030**: When `GET /auth/me` reports `mustChangePassword: true`, every route MUST redirect to `/account/password`, the shell MUST show only that page and Sign out, and a 403 `PASSWORD_CHANGE_REQUIRED` from any other call MUST send the user here.
- **FR-031**: The forced-change flow MUST be part of the sign-in walk-through (exercised end to end in tests).

**Errors**

- **FR-032**: Server errors MUST show inline with the request identifier.
- **FR-033**: Controls the member lacks permission for MUST be hidden or disabled from `GET /auth/me`, with the server still the authority.

### Key Entities

- **Membership (member)**: a user's link to an organization, with active/deactivated status, a nullable display `name` (per organization), a `version` number for stale-update protection, roles, and a `mustChangePassword` flag.
- **Role**: a named set of permissions; either system (read-only) or custom (mutable); carries a member count.
- **Permission**: a code grouped by module; granted to a role; the signed-in member's held set comes from `GET /auth/me`.
- **Session**: rotates on password change; never exposed.

### Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every member and role query is scoped to the caller's organization via the composite key and RLS; cross-organization reads and writes return 404. Tenant-isolation tests cover the new list parameters.
- **II. Server-enforced authority:** Permission checks (`users.manage`, `roles.manage`) are enforced server-side on every endpoint; hiding controls in the interface is convenience only. State transitions (deactivate, role assignment) are validated server-side, including the last-Administrator rule.
- **III. Transactional integrity:** Membership creation and role assignment run in one transaction with an audit entry; password change rotates the session atomically. Idempotency applies where the contract requires it.
- **IV. Exact decimals:** Not applicable (no money in this feature).
- **V. Test-first:** Failing tests for the new list parameters, wildcard escaping, permission gating, forced password change, and tenant isolation are written before implementation; critical-path coverage target applies.
- **VI. Module boundaries:** The web layer calls the existing auth/access-control services through the API client; no cross-module database access from the frontend; the backend additions live in the auth and access-control modules.
- **VII. Honest boundaries:** No tax, accounting, or compliance claim is implied; this feature is identity and access control only.
- **VIII. Design system and accessibility:** Uses the existing design system tokens, ConfirmDialog, kebab menu, badges, and form controls; status shown as text as well as colour; WCAG 2.1 AA maintained (keyboard operable dialogs, labelled fields, password manager compatibility via autocomplete).
- **IX. Scope discipline:** P0 (P0-F003). Depends on the already-delivered RBAC and audit feature and the auth contract; no new tables.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Administrator can find a member by name or email fragment and reach their row in under 5 seconds for organizations of up to 10,000 members.
- **SC-002**: 100% of member-list requests are tenant-scoped: a member of another organization never appears in any filtered, sorted, or paged result.
- **SC-003**: 100% of attempts to grant a permission the signed-in member does not hold are refused by the server, and the interface never offers them as actionable.
- **SC-004**: The last active Administrator can never be deactivated or lose the Administrator role; 100% of such attempts return the server refusal inline.
- **SC-005**: A forced password change completes end to end (redirect, change, session rotation, toast) in under 30 seconds and never signs the user out on a wrong current password.
- **SC-006**: No password, password hash, or session identifier appears in any API response, log entry, or audit entry for this feature.
- **SC-007**: Wildcard characters in search are treated literally in 100% of cases.
- **SC-008**: The contract is regenerated and the drift check passes; every existing guard passes; public schema row counts are unchanged.

## Assumptions

- The only schema change is a nullable `name` and a `version` on `memberships`; no new tables are added, and existing memberships keep null name and version 1.
- The members list endpoint already exists and is extended (not replaced) with the new parameters.
- Roles already carry system/custom distinction; member count is added as a computed field.
- The signed-in member's held permissions come from `GET /auth/me` and are the source of truth for disabling checkboxes.
- Initial passwords are never recoverable after creation; the API does not return them.
- Invitations by email, password reset by email, multi-factor, SSO, editing system roles, and an Organization settings screen are out of scope.