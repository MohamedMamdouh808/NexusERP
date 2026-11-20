# Feature Specification: Organization name at sign-up and in the account menu

**Feature Branch**: `009-org-name-signup`  
**Created**: 2026-11-12  
**Status**: Draft  
**MoSCoW Priority**: P1 (P3 is never implemented in v1 — Principle IX)  
**Input**: User description: "Organization name in the top bar account menu and an organization name field in the create account form"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Name my organization when I create it (Priority: P1)

As a new user creating an account, I want to type my organization's name in the sign-up form so that my workspace starts with a name my team recognizes, instead of a placeholder derived from my email address.

**Why this priority**: The organization is the tenant boundary everything else belongs to; its name is the identity shown to every member. Getting it right at the only moment it is free to set is higher value than any later cosmetic fix.

**Independent Test**: Register an account with a distinctive organization name; then read the identity the service reports for the new session and confirm the organization carries the typed name, not the placeholder.

**Acceptance Scenarios**:

1. **Given** the create-account form, **When** I fill email, password and organization name and submit, **Then** the organization is created with my typed name in the same all-or-nothing transaction as my account.
2. **Given** the create-account form with the organization name left empty, **When** I submit, **Then** registration behaves exactly as it does today and the organization keeps a placeholder name derived from my email.
3. **Given** the create-account form with an organization name that is only whitespace or too short/long, **When** I submit, **Then** the field is refused inline and no records are created.

---

### User Story 2 - See my organization at the top of the account menu (Priority: P1)

As a signed-in user, I want my organization's name as the first row of the account menu (above Profile and Sign out) so I always know which organization I am acting in, without opening the organization switcher.

**Why this priority**: The product is multi-organization by design; acting inside the wrong organization is the most expensive class of user error, and the current menu hides it behind one extra click.

**Independent Test**: Sign in; click the account control on the right of the top bar; the organization name appears as the first, non-interactive row; Profile and Sign out appear below it.

**Acceptance Scenarios**:

1. **Given** I am signed in to an organization with a custom name, **When** I open the account menu, **Then** the organization name is the first row, above Profile and Sign out.
2. **Given** the organization name is long, **When** I open the account menu, **Then** it renders on a single line without breaking the menu, and the full name is available without another click (hover or focus tooltip and an accessible name).
3. **Given** the organization row is a label and not an action, **When** I click or keyboard-activate it, **Then** nothing happens — it has no activation path.

---

### User Story 3 - Long names never break the layout (Priority: P2)

As a member of any organization, including one whose name is close to the limit, I want the account menu and its truncation to hold up on small screens and in both languages.

**Independent Test**: Sign in as a member of an organization with a near-limit name and open the account menu at desktop, tablet and phone widths; text never overflows or pushes controls out of the bar.

**Acceptance Scenarios**:

1. **Given** an organization name of 100+ characters, **When** I open the account menu at tablet and phone widths, **Then** the name truncates with an ellipsis and Profile/Sign out remain reachable.
2. **Given** the account menu is open, **When** I tab through it, **Then** keyboard focus moves through the interactive entries only; the organization row is never focused or announced as a control.

---

### Edge Cases

- Organization name with leading/trailing whitespace → refused or trimmed (never stored with padding).
- Organization name shorter than 2 characters after trimming → refused inline; nothing created.
- Organization name longer than 128 characters after trimming → refused inline; nothing created.
- Unicode, emoji or non-Latin organization names → accepted; stored verbatim (trimmed).
- Organization name consisting only of whitespace or control characters → refused inline; nothing created.
- Existing organizations created before this feature keep their current names untouched; no backfill, no rename, no downtime.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The registration request MUST accept an optional organization name.
- **FR-002**: If the organization name is absent, registration MUST behave exactly as it does today (the organization keeps a placeholder name derived from the registering email).
- **FR-003**: If the organization name is provided, it MUST be trimmed of leading and trailing whitespace; after trimming it MUST be between 2 and 128 characters. Anything else is rejected with a visible, field-level message and creates no records.
- **FR-004**: The trimmed name MUST be stored verbatim (minus trimming) as the organization's name, in the same all-or-nothing transaction that creates the user, membership, roles, warehouse and document sequences.
- **FR-005**: The account menu in the top bar MUST display the signed-in organization's name as its first row, above Profile and Sign out.
- **FR-006**: The organization row MUST NOT be interactive: no pointer activation and no keyboard activation.
- **FR-007**: A long organization name MUST render on a single line, truncated with an ellipsis; the full name MUST be available via tooltip and to assistive technology (accessible name or description).
- **FR-008**: The organization name is user content: it MUST be displayed verbatim and MUST NOT be translated, re-cased or reformatted by the interface.
- **FR-009**: Nothing else about registration, sign-in, sign-out or organization switching changes in this feature. No permission change, no schema change, no new endpoint.
- **FR-010**: The create-account screen and the account menu MUST present the new text in English and Arabic (the organization name itself is never translated).

### Key Entities *(include if feature involves data)*

- **Organization**: existing tenant record; this feature uses its existing `name` attribute only — no schema change. Its name is now either a user-chosen string (trimmed, 2–128 chars) or the pre-existing placeholder.
- **Registration request**: extended with an optional organization name alongside email and password; all-or-nothing semantics unchanged.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** The registration transaction creates the organization and the tenant-scoped rows exactly as it does today; the new field is one more column written inside that transaction. Cross-tenant reads stay impossible — the feature adds no query surface. Isolation test: the registration integration suite asserts two typed-name registrations produce two distinct organizations, each visible only to its own members.
- **II. Server-enforced authority:** The registration route remains public with its documented validation; an organization name grants no authority. Trim and length rules are enforced server-side — the UI never decides what the service will accept.
- **III. Transactional integrity:** The multi-record registration remains a single transaction; the organization name is written inside it (user, organization, membership, roles, warehouse, sequences). No new partial-write path; no idempotency key is introduced or changed by this feature.
- **IV. Exact decimals:** N/A — no monetary or quantity values in scope.
- **V. Test-first:** The failing integration test is written before implementation: register with a typed organization name and assert it persists on the session payload; register with a whitespace-only name and assert a 400 with a field-level message and zero records created; the menu test asserts the organization row renders first and is non-interactive.
- **VI. Module boundaries:** Only the authentication module gains the new field; the account menu reads the same identity payload it already consumes. No cross-module calls are added; no cycle is created.
- **VII. Honest boundaries:** No accounting, tax or compliance claim is introduced; the feature asserts nothing about money, invoices or legal identity.
- **VIII. Design system and accessibility:** The organization row uses the design system's muted menu-label treatment with truncation and tooltip as the design system specifies for overflowing text; the row is readable text, not a control, so keyboard order and screen-reader activation paths stay unchanged; contrast targets are held at WCAG 2.1 AA.
- **IX. Scope discipline:** P1. Multi-tenant identity clarity is a tenancy-correctness concern, not a cosmetic one; it is scoped to registration and the account menu only. Renaming an existing organization is explicitly out of scope (it would be its own feature with its own authority model).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who registers with an organization name sees that exact name in the account menu of every session they open (verified by UI test against a registered session).
- **SC-002**: 100% of registration attempts with an invalid organization name are refused inline with a visible message, and zero records are created (verified by the integration suite).
- **SC-003**: An organization name of 100+ characters renders on one line in the account menu at desktop, tablet and phone widths with Profile and Sign out fully usable (verified by responsive UI tests/visual check).
- **SC-004**: Registration with the new field absent behaves identically to before the feature (placeholder org name, same transaction, same response shape).
- **SC-005**: Keyboard navigation through the account menu changes by exactly zero interactive stops (the organization row is never announced as a control).

## Assumptions

- The field is optional at registration; when omitted, today's placeholder naming is kept, so existing behavior, docs and data are unaffected.
- The 2–128 character window matches the organization name column definition (`VarChar(128)`); no migration is required.
- Full names are shown as-is (per the product-owner clarification of 2026-11-12): long names truncate with ellipsis and expose the full name via tooltip; no automatic shortening of placeholder names is applied.
- The organization row is a non-interactive label; any "edit organization name" capability is a separate feature with its own authorization model.
- The create-account screen and account menu already carry English and Arabic strings; this feature adds its new strings to both locales.
- Renaming an existing organization is out of scope; the mock-backed administration organization page is unaffected.
