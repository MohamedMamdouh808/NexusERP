# Feature Specification: Authentication, Sessions and First Organization

**Feature Branch**: `005-auth-sessions-org`  
**Created**: 2026-11-08  
**Status**: Draft  
**MoSCoW Priority**: P0 (P3 is never implemented in v1 — Principle IX)  
**Input**: User description: "Build authentication, sessions and the first organization: the backend API only (the interface is a later feature). Source: docs/PRD.md P0-F001 and P0-F002, Sections 7.4, 8 and 9.4, and the constitution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and a first organization (Priority: P1)

A new user registers with email and password. The system creates the user account, their first organization, an Administrator membership linking them to it, the default roles and permissions, a default warehouse, and document sequences — all as one indivisible operation. The user is then logged in and holds the Administrator role on their organization.

**Why this priority**: This is the entry point of the entire product. Without it, no user can ever access the system, and no organization exists to scope data to. It is the first P0 feature in the build order (Constitution: Build order section).

**Independent Test**: Can be fully tested by submitting a registration request and verifying that exactly one user, one organization, one Administrator membership, the full set of default roles/permissions, one warehouse, and document sequences exist — and that nothing exists if any part of the creation fails.

**Acceptance Scenarios**:

1. **Given** no user or organization exists, **When** a valid registration is submitted, **Then** the user, organization, membership, roles, permissions, warehouse and sequences are all created, and the user receives a session cookie.
2. **Given** any step in registration fails, **When** registration is attempted, **Then** none of the user, organization, membership, roles, permissions, warehouse or sequences are created.
3. **Given** registration is attempted with an email that already exists, **When** the request is submitted, **Then** no account is created and a generic error is returned that does not confirm whether the email exists.
4. **Given** registration is attempted with a password shorter than 12 characters, **When** the request is submitted, **Then** no account is created and a generic validation error is returned.

### User Story 2 - Sign in and sign out (Priority: P1)

A registered user signs in with email and password. The system creates a server-side session and issues an opaque session cookie. The user can later sign out, which invalidates the session. The user can also query their current identity.

**Why this priority**: Authentication is the gateway to all authorized operations. Without sign-in, no protected endpoint can be reached. Sign-out and current-user queries are companion operations that complete the session lifecycle.

**Independent Test**: Can be fully tested by signing in, verifying the session cookie is set and the user is recognized, then signing out and verifying the session is invalidated and the cookie cleared.

**Acceptance Scenarios**:

1. **Given** a registered user with correct credentials, **When** sign-in is attempted, **Then** a session is created and an opaque session cookie is issued.
2. **Given** incorrect credentials, **When** sign-in is attempted, **Then** a generic error is returned that does not reveal whether the email exists.
3. **Given** an active session, **When** sign-out is requested, **Then** the session is invalidated and the session cookie is cleared.
4. **Given** an active session, **When** current user is requested, **Then** the user's identity and organization membership are returned.

### User Story 3 - Switch organization (Priority: P2)

A user who is a member of multiple organizations can switch their active organization context. Tenant scope for all subsequent requests resolves from the session and the verified membership of the newly active organization.

**Why this priority**: Multi-tenancy requires users to act within one organization at a time. Organization switching is needed once a user belongs to more than one organization, which cannot happen until registration exists. It is P2 because the first registration creates exactly one organization.

**Independent Test**: Can be fully tested by creating two organizations, adding the user as a member of both, switching between them, and verifying that tenant-scoped data changes accordingly.

**Acceptance Scenarios**:

1. **Given** a user is a member of two organizations, **When** organization switching is requested for the second organization, **Then** subsequent tenant-scoped requests resolve against the second organization.
2. **Given** a user is not a member of an organization, **When** switching to it is requested, **Then** the switch is refused.

### Edge Cases

- What happens when registration is attempted with a valid email but the database is unreachable? The entire registration transaction rolls back and nothing is created.
- How does the system handle more than 5 failed login attempts for the same email within 15 minutes? A 429 response with Retry-After is returned.
- What happens when a session reaches its 30-minute idle timeout or 12-hour absolute lifetime? The session is invalidated and the user must sign in again.
- What happens when a membership is deactivated? All sessions for that membership are invalidated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a new user to register with email and password, creating the user, their first organization, an Administrator membership, default roles and permissions, a default warehouse, and document sequences in one indivisible operation.
- **FR-002**: System MUST allow a registered user to sign in with email and password, establishing a server-side session.
- **FR-003**: System MUST allow a signed-in user to sign out, invalidating their session.
- **FR-004**: System MUST allow a signed-in user to query their current identity and active organization membership.
- **FR-005**: System MUST allow a user who is a member of multiple organizations to switch their active organization.
- **FR-006**: System MUST store sessions in the database with an opaque session identifier delivered in an HttpOnly, Secure, SameSite=Lax cookie.
- **FR-007**: System MUST expire sessions after 30 minutes of idle time and after 12 hours of absolute lifetime.
- **FR-008**: System MUST invalidate sessions on logout, on password change, and when the user's membership is deactivated.
- **FR-009**: System MUST hash passwords with Argon2id and enforce a minimum password length of 12 characters.
- **FR-010**: System MUST return generic login errors that never reveal whether the email exists.
- **FR-011**: System MUST require a per-session CSRF token on every state-changing request.
- **FR-012**: System MUST rate-limit failed logins to no more than 5 per email within 15 minutes, returning 429 with Retry-After.
- **FR-013**: System MUST resolve tenant scope only from the session and the verified membership, never from client input.
- **FR-014**: System MUST return 404 for a request to a record owned by another organization.
- **FR-015**: System MUST require every endpoint to declare a permission; register, login, and health are the only public routes.
- **FR-016**: System MUST create all database objects via migrations, enable row-level security with no policies on every table, use exact column types, and satisfy the schema guards.

### Key Entities *(include if feature involves data)*

- **User**: A person who can sign in to the system. Identified by email, which is unique system-wide (one account per email across all organizations). Holds a hashed password and belongs to one or more organizations through memberships.
- **Organization**: A tenant workspace. Contains users through memberships, and owns data such as warehouse, contacts, products, and documents.
- **Membership**: Links a user to an organization with a role. Determines the user's active tenant context and permissions within that organization. Can be active or deactivated.
- **Role**: A named set of permissions within an organization. Default roles are Administrator, Manager, Sales, Inventory, and Purchasing.
- **Permission**: An action a role can perform on a resource (e.g., contacts.read, products.write).
- **Session**: A server-side record tying an opaque session identifier to a user and membership, with idle and absolute expiry timestamps.
- **LoginAttempt**: A record of a failed login attempt keyed by email and client address, used for rate limiting.
- **Warehouse**: A storage location belonging to an organization. The default warehouse is created during registration.
- **DocumentSequence**: A numbering sequence for documents within an organization. Default sequences are created during registration.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every organization-owned table gains a NOT NULL `organization_id` column indexed, and foreign keys between organization-owned tables are composite over `(organization_id, id)`. Tenant scope resolves from the session and verified membership only; client-supplied organization identifiers are ignored. A cross-tenant record request returns 404. An automated tenant-isolation test provisions two organizations and proves a member of one cannot read, mutate, or enumerate the other's records.
- **II. Server-enforced authority:** Every endpoint declares a required permission via decorator; register, login, and health are the only `@Public()` routes. Default deny applies everywhere else. State transitions are validated server-side. Module availability is enforced server-side.
- **III. Transactional integrity:** Registration creates user, organization, membership, roles, permissions, warehouse, and sequences inside one transaction; any failure rolls back everything. Sessions are invalidated on logout, password change, and membership deactivation.
- **IV. Exact decimals:** No monetary or quantity columns are introduced in this feature; existing `Decimal(14,2)`, `Decimal(14,4)`, and `Decimal(14,3)` conventions apply where relevant. All decimals cross the API as strings.
- **V. Test-first:** A failing cross-tenant isolation test is written before implementation; a failing undeclared-endpoint test is written before implementation; critical-path coverage targets 80% on statements, branches, functions, and lines.
- **VI. Module boundaries:** The feature touches an Auth module and an Organizations module. Each exposes explicit service interfaces; no module reads or writes another module's tables directly. The Platform module owns the database client and transaction boundary.
- **VII. Honest boundaries:** No tax-compliance, e-invoicing, or accounting claim is implied by authentication, sessions, or organizations.
- **VIII. Design system and accessibility:** This is a backend-only feature; no UI changes are involved. N/A.
- **IX. Scope discipline:** P0. Authentication, session management, organization workspaces, and tenant isolation are all P0-F001 and P0-F002 in PRD Section 6. Preceding phase (platform foundation) exit criteria are met.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member of one organization cannot read, mutate, or enumerate another organization's records; all cross-tenant access tests pass.
- **SC-002**: An endpoint that does not declare a permission returns 403, and this is proven by a failing test before implementation.
- **SC-003**: When any step of registration fails, no user, organization, membership, role, permission, warehouse, or sequence is created; this is proven by forcing a failure mid-registration.
- **SC-004**: Sessions expire after 30 minutes of idle time and after 12 hours of absolute lifetime; this is proven by advancing time and observing session invalidation.
- **SC-005**: More than 5 failed logins for the same email within 15 minutes returns 429 with Retry-After; this is proven by submitting 6 failed login attempts.
- **SC-006**: No password or session token appears in any log output; this is proven by inspecting logs during login and session activity.
- **SC-007**: The contract-drift check and every existing guard (schema numeric types, migration history, RLS coverage, default deny, boot smoke) still pass after the feature is implemented.

## Assumptions

- Registration uses email and password as credentials; no SSO, OAuth, or social login is involved in v1.
- The first organization created during registration is the user's active organization by default.
- A user can belong to multiple organizations but has exactly one active organization at a time, resolved from the session.
- Sessions are stored in the same PostgreSQL database as application data; no separate session store is introduced.
- The CSRF token is delivered alongside the session cookie and validated on state-changing requests (POST, PUT, PATCH, DELETE).
- Document sequences are organization-scoped counters used for generating document numbers (e.g., invoice numbers).
- The default warehouse is a single storage location created per organization during registration; no warehouse management UI is part of this feature.
- Login rate limiting uses the proxy-trust setting to determine the client address, consistent with the platform foundation.

## Clarifications *(mandatory)*

### Session 2026-11-08

- Q: Should email be unique system-wide or per-organization? → A: System-wide unique (one account per email across all organizations).

