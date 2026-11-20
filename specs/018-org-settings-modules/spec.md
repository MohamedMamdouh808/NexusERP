# Feature Specification: Organization Settings and Module Controls End to End

**Feature Branch**: `018-org-settings-modules` (created by the pre-specify hook; the active feature is selected by `.specify/feature.json` → `specs/018-org-settings-modules` and work integrates into `main` per the constitution)
**Created**: 2026-11-19
**Status**: Draft
**MoSCoW Priority**: P0 (P0-F002 — Organization Workspaces and Tenant Isolation)
**Input**: User description: "Build Organization settings end to end: the backend API and the interface, and finish the move away from sample data. Source: docs/PRD.md P0-F002, Sections 7.4, 8 and 9.4 to 9.5, the constitution, the existing Organization screen, and the earlier features as the pattern (snake_case naming, composite organization keys, version numbers, audit entries, RLS with no policies, migrations immutable, the module-gate hook already declared on the Purchasing, Sales and Invoicing endpoints)." The description specifies organization settings, a currency lock once documents exist, module availability with dependency and in-use rules, registration and backfill, server-side module enforcement, session-driven interface adaptation, and complete removal of production sample-data paths.

This feature completes the organization workspace: one place to set the organization's identity and defaults, a safe way to switch modules on and off, and a product that no longer shows sample data anywhere outside the development gallery. All rules are enforced on the server; the interface reflects them and explains refusals rather than deciding them.

## Clarifications

### Session 2026-11-19

- Q: Should switching a module on or off also write an audit entry with before and after values in the same transaction? → A: Yes — every module toggle writes before/after audit in the same transaction, matching settings changes.
- Q: Does a module toggle check the availability row's version and refuse a stale toggle? → A: Yes — a toggle carries the version; a stale version returns 409 `STALE_VERSION`, matching settings saves.
- Q: After a successful settings save or module toggle, does the current tab refresh its session-derived currency, payment terms and modules without re-login? → A: Yes — the session-derived values refresh in place after every successful save or toggle.
- Q: Which Reports sections are hidden when a module is disabled? → A: Each section whose source module is off is hidden; module-neutral sections remain visible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure organization identity and defaults (Priority: P1)

As an organization administrator, I want to view and change my organization's name, currency and default payment terms, so that every document and report carries the right identity and defaults.

**Why this priority**: This is the core of P0-F002. Without authoritative settings and a version-checked, audited update, every later figure is untrustworthy.

**Independent Test**: Sign in as an administrator, open the Organization settings page, change the name and payment terms, save, and confirm the new name appears in the top bar immediately, a success confirmation is shown, and an audit entry records the before and after values. A second administrator with a stale copy is prompted to reload rather than overwriting silently.

**Acceptance Scenarios**:

1. **Given** any active member of the organization, **When** they open Organization settings, **Then** they see the current name, currency code, default payment terms, version and module list.
2. **Given** a member without `settings.manage`, **When** they try to change settings, **Then** the change is refused by the server and the controls are disabled with an explanation.
3. **Given** a name of 1 to 100 characters after trimming, **When** saved, **Then** the trimmed name is stored; it need not be unique; blank, whitespace-only and over-long names are refused with a field-level error.
4. **Given** a currency from USD, EUR, GBP, EGP, SAR, AED, KWD, QAR, JOD, **When** saved before any document exists, **Then** it becomes the organization's currency; any other code, lower-case code, or code of another length is refused.
5. **Given** a whole number from 0 to 365, **When** saved as default payment terms, **Then** it is stored; fractional, negative and over-365 values are refused.
6. **Given** a save carrying a version that no longer matches, **When** submitted, **Then** the server refuses it as a stale update and the interface offers to reload the current values.
7. **Given** a successful settings change, **When** it commits, **Then** the audit entry with before and after values commits in the same transaction; if the audit write fails, the settings change does not persist.
8. **Given** existing invoices with due dates, **When** default payment terms change, **Then** those due dates are unchanged; the new terms apply only to invoices issued afterwards.

### User Story 2 - Control module availability safely (Priority: P1)

As an organization administrator, I want to switch modules on and off with the rules explained when a switch is refused, so the workspace offers only the capabilities the organization needs without losing anything already recorded.

**Why this priority**: Module controls are the second half of P0-F002 and decide which of the later workflows are reachable. An unsafe toggle could strand open documents or break a dependent module.

**Independent Test**: Sign in as an administrator, open the Modules card, switch off a switchable module that has no open documents and no dependent module, and confirm access to it is refused everywhere while its data remains; turn it back on and confirm the data is accessible again. Then attempt each forbidden toggle and confirm the specific reason and counts are shown.

**Acceptance Scenarios**:

1. **Given** the switchable modules inventory, purchasing, sales, invoicing and reports, **When** the organization is opened, **Then** each has an availability row with its own version and timestamps; contacts, products, settings and audit are shown as always on and cannot be switched.
2. **Given** sales is enabled, **When** inventory is switched off, **Then** the refusal names inventory as required by sales (409 `MODULE_DEPENDENCY`).
3. **Given** purchasing is enabled, **When** inventory is switched off, **Then** the refusal names inventory as required by purchasing.
4. **Given** invoicing is enabled, **When** sales is switched off, **Then** the refusal names sales as required by invoicing.
5. **Given** inventory is off, **When** sales or purchasing is switched on, **Then** the switch is refused and names the missing requirement.
6. **Given** an enabled module with open documents, **When** it is switched off, **Then** the refusal states the module and the number of open documents (409 `MODULE_IN_USE`); "open" means purchase orders in DRAFT, CONFIRMED or PARTIALLY_RECEIVED, sales orders in DRAFT or CONFIRMED, invoices in DRAFT, ISSUED or PARTIALLY_PAID, and for inventory any active stock reservation.
7. **Given** a toggle racing the creation of a first document in that module, **When** both are attempted concurrently, **Then** exactly one succeeds; the system never ends with a module disabled while an open document was created through the race.
8. **Given** a module switched off, **When** its records are later inspected after re-enabling, **Then** every record that existed before is present and accessible; no data is deleted by a toggle.
9. **Given** an administrator switching a module off, **When** they confirm the action, **Then** a confirmation dialog has already stated the consequence: access to that module's screens and data will be refused until it is switched on again.
10. **Given** a successful module toggle, **When** it commits, **Then** an audit entry with the before and after enabled states commits in the same transaction; if the audit write fails, the toggle does not persist.
11. **Given** a toggle carrying a version read before another administrator toggled the same module, **When** submitted, **Then** it is refused as stale and the interface offers to reload the current availability.

### User Story 3 - The interface follows the enabled modules (Priority: P1)

As a member of an organization, I want the navigation, landing page and reports to reflect the modules my organization actually uses, so I never reach a screen that cannot work for us and never see an explanation that contradicts what the server allows.

**Why this priority**: A disabled module that still looks reachable is an avoidable dead end; the runtime state must come from the same authoritative source as the server guard.

**Independent Test**: Sign in with a module disabled, confirm its sidebar entry appears unavailable with the reason "Turned off in Settings", confirm navigating directly to its route redirects to Organization settings with that explanation, confirm its dashboard widgets and quick actions are absent, and confirm Reports hides its sections. Re-enable and confirm everything returns without data loss.

**Acceptance Scenarios**:

1. **Given** a disabled switchable module, **When** the shell loads, **Then** its navigation entry appears unavailable with the reason "Turned off in Settings", while the static navigation list and the design-system master table are unchanged.
2. **Given** a direct request for a route of a disabled module, **When** the route is opened, **Then** the member is redirected to Organization settings with the explanation that the module is turned off there.
3. **Given** a disabled module, **When** the Overview page loads, **Then** its dashboard widgets and quick actions are absent and the remaining widgets still load.
4. **Given** a disabled module, **When** Reports is opened, **Then** each section whose source module is that module is hidden, module-neutral sections remain visible, and unaffected sections are unchanged.
5. **Given** a member without `settings.manage`, **When** they view Organization settings, **Then** the controls are disabled with an explanation and the page states: "Access to this page is enforced by the server; hiding a control is not security."

### User Story 4 - Register with the right organization identity and currency (Priority: P1)

As a new user, I want registrations to create a complete workspace with the identity and currency I choose, so that the organization is usable immediately and old workspaces are not left incomplete.

**Why this priority**: Registration is where module rows and currency first exist; an incomplete workspace breaks every later gate and invariant check.

**Independent Test**: Register with no optional fields and confirm an email-derived name, USD, all switchable modules enabled and an unchanged response contract; register with an organization name and a supported currency and confirm both are used; register with invalid optional values and confirm validation without revealing whether an account exists.

**Acceptance Scenarios**:

1. **Given** a registration without an organization name, **When** it completes, **Then** the existing email-derived name is used.
2. **Given** an organization name of 1 to 100 characters after trimming, **When** registration completes, **Then** the trimmed name is stored; invalid values are refused.
3. **Given** a supported currency code, **When** registration completes, **Then** that code is stored; with no code, USD is stored.
4. **Given** a newly registered organization, **When** its module rows are inspected, **Then** every switchable module has an enabled row.
5. **Given** an existing organization created before this feature, **When** the backfill has run, **Then** it has a row for every switchable module and none is missing.
6. **Given** any registration failure or duplicate-account attempt, **When** the response is returned, **Then** it reveals nothing about whether an existing account holds that email.

### User Story 5 - Trust that the interface shows real data (Priority: P1)

As a member, I want no sample data, sample banners or sample module lists in the product, so that every figure I see can be traced to my organization's records, while the development gallery keeps its own fixtures.

**Why this priority**: The whole feature is about authoritative data; a single sample path undermines every guarantee above.

**Independent Test**: Search production code paths for imports of sample services, sample data, the "not connected" banner and sample module configuration lists; confirm zero references, confirm the development gallery still renders its dev-only fixtures, and confirm a deliberately introduced sample import makes the new guard fail.

**Acceptance Scenarios**:

1. **Given** production code, **When** it is scanned, **Then** no production path imports the sample service, sample data, "not connected" banner or sample module configuration list; those files are removed.
2. **Given** the development gallery, **When** it is opened, **Then** it still uses its own development-only fixtures and is unaffected by the removals.
3. **Given** the new guard, **When** a production file imports from a sample or mock folder, **Then** the guard fails; this is demonstrated once on purpose and then reverted.

### User Story 6 - One currency across the product (Priority: P2)

As a member, I want prices, totals and reports to use my organization's currency from the session, so that no screen displays a figure under the wrong currency code.

**Why this priority**: Follows from the settings and session work; it is a consistency outcome rather than a new capability.

**Independent Test**: Change the organization currency before any document exists, sign in again, and confirm the currency code shown on prices, totals and reports matches the session's organization currency.

**Acceptance Scenarios**:

1. **Given** an organization currency, **When** any price, total or report figure is displayed, **Then** it uses that currency code from the session and no hard-coded default.
2. **Given** a session, **When** it is loaded, **Then** it includes the enabled modules and the organization's currency and payment terms, so the interface needs no extra calls.
3. **Given** a successful settings save or module toggle, **When** it completes, **Then** the current tab's session-derived currency, payment terms and enabled modules update in place without re-login or manual reload.

### Edge Cases

- A settings update whose version was read before another administrator saved: refused as stale, with a reload prompt rather than a silent overwrite.
- A currency change attempted after a document exists in any status, including cancelled or voided documents: refused.
- A currency change and the creation of the organization's first document arriving at the same instant: exactly one outcome, never both.
- A module toggle and the creation of a first document in that module arriving at the same instant: exactly one outcome.
- Switching off a module whose dependent module is enabled, and switching on a module whose requirement is disabled: both refused with the specific module named.
- A module with several open documents of different statuses: the refusal reports each relevant count.
- Inventory with active stock reservations but no orders: still counted as in use.
- Re-enabling a module after a long period: all pre-existing data is still there.
- A member who holds a permission but whose module is disabled: access is refused by the server, and hidden controls are never the enforcement mechanism.
- A request for another organization's settings or module records: answered as not found, with no signal that the record exists.
- A registration that supplies only an optional organization name, only a currency, neither, or invalid values for either.
- Existing invoices whose due dates were computed under the old payment terms: unchanged after the terms are updated.
- An organization created before module rows existed: backfilled with all switchable modules enabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Any active member of an organization MUST be able to read the current organization's name, currency code, default payment terms in days, version and module list.
- **FR-002**: Only a member holding `settings.manage` MAY change organization settings or toggle a module; every such endpoint MUST declare that permission and refuse all others.
- **FR-003**: The organization name MUST be trimmed, 1 to 100 characters, and MUST NOT be required to be unique.
- **FR-004**: The currency MUST be exactly three uppercase letters drawn only from USD, EUR, GBP, EGP, SAR, AED, KWD, QAR and JOD.
- **FR-005**: Default payment terms MUST be a whole number between 0 and 365 inclusive.
- **FR-006**: An update carrying a version different from the stored version MUST be refused as `STALE_VERSION` and MUST NOT modify the organization.
- **FR-007**: Every successful settings update MUST record an audit entry containing the before and after values in the same transaction as the change; a failed audit write MUST roll the change back.
- **FR-008**: Changing default payment terms MUST NOT alter the due date of any existing invoice; the new terms MUST apply only to invoices issued afterwards.
- **FR-009**: Once any sales order, purchase order or invoice exists in the organization in any status, the currency MUST be immutable; an attempted change MUST be refused as `CURRENCY_LOCKED`.
- **FR-010**: The currency lock MUST be enforced inside the settings transaction under a lock that serializes with document creation, and a database trigger MUST exist as a backstop.
- **FR-011**: A currency change racing the creation of the first document MUST have exactly one successful outcome; both MUST NOT succeed.
- **FR-012**: Module availability MUST be stored per organization, with the module key, enabled state, version and creation/update timestamps.
- **FR-013**: The switchable modules MUST be inventory, purchasing, sales, invoicing and reports; contacts, products, settings and audit MUST always be on and MUST NOT be switchable.
- **FR-014**: The declared dependencies MUST be: sales requires inventory, purchasing requires inventory, invoicing requires sales.
- **FR-015**: Switching a module on MUST require every dependency to be on; switching a module off MUST be refused while an enabled module depends on it. Both refusals MUST be `MODULE_DEPENDENCY` and MUST name the module responsible.
- **FR-016**: Switching a module off MUST be refused while it has open documents; the refusal MUST be `MODULE_IN_USE` and carry the relevant counts.
- **FR-017**: Open documents MUST mean purchase orders in DRAFT, CONFIRMED or PARTIALLY_RECEIVED; sales orders in DRAFT or CONFIRMED; invoices in DRAFT, ISSUED or PARTIALLY_PAID; and, for inventory, any active stock reservation.
- **FR-018**: The open-document check and the module toggle MUST execute in one transaction under a lock that serializes with document creation; a toggle racing a first document MUST have exactly one successful outcome. Every successful toggle MUST also record an audit entry containing the before and after enabled states in that same transaction; a failed audit write MUST roll the toggle back.
- **FR-019**: Any member of the organization MUST be able to list module availability; only `settings.manage` MAY toggle a module. A toggle MUST carry the availability row's version and MUST be refused as `STALE_VERSION` when that version no longer matches; a stale toggle MUST NOT change the module.
- **FR-020**: A single shared server guard MUST read module state once per request and refuse every endpoint of a disabled switchable module, reads included, with `MODULE_DISABLED`; endpoints of other modules MUST NOT be affected.
- **FR-021**: The module guard MUST also cover Inventory and Reports endpoints, using the same shared rule.
- **FR-022**: A test MUST assert that every endpoint belonging to a switchable module declares the module guard and that a disabled module returns the refusal on every one of those endpoints, including read endpoints.
- **FR-023**: Toggling a module off MUST NOT delete, archive or alter any record; re-enabling MUST restore access to all existing records.
- **FR-024**: Registration MUST create module rows for the new organization with all switchable modules enabled.
- **FR-025**: Registration MUST accept an optional organization name (trimmed, 1 to 100 characters, falling back to the existing email-derived name) and an optional supported currency code (default USD), with the rest of its contract and responses unchanged and no disclosure about existing accounts.
- **FR-026**: A migration MUST backfill module rows for every existing organization, with every switchable module enabled.
- **FR-027**: The session payload MUST additionally carry the enabled modules and the organization's currency and default payment terms, so the interface can adapt without additional calls. After every successful settings save or module toggle, the current tab MUST refresh these session-derived values in place, without requiring re-login or a manual page reload.
- **FR-028**: The database invariant verification MUST check that every organization has a row for every switchable module, that no enabled module has a disabled requirement, and that the currency-lock trigger exists; comparison with a first-document-era audit entry MUST NOT be required.
- **FR-029**: Every endpoint MUST declare its required permission; a request for a record of another organization MUST return 404; every new table MUST enable row-level security with no policies; migrations MUST remain immutable.
- **FR-030**: The published contract and documentation MUST be regenerated so the drift check passes.
- **FR-031**: The Organization settings page MUST present two cards: General and Modules.
- **FR-032**: The General card MUST show the name, a currency selector, default payment terms with the note "Applies to invoices issued from now on", and the current version.
- **FR-033**: When the server reports the currency as locked, the currency selector MUST be read-only and show the reason "Locked once orders or invoices exist".
- **FR-034**: Saving MUST show a spinner while in flight, inline field and form errors on failure, a stale-version reload prompt when the update is refused as stale, and a success toast confirming the saved settings.
- **FR-035**: A successful save MUST update the organization name shown in the top bar immediately.
- **FR-036**: The Modules card MUST show a table of switchable modules, each with an on/off switch, and MUST show the always-on modules as locked.
- **FR-037**: Dependency and in-use refusals MUST be shown inline with the module, the reason and the counts returned by the server.
- **FR-038**: Turning a module off MUST require a confirmation dialog stating that access to its screens and data will be refused until it is switched on again.
- **FR-039**: Controls a member cannot use MUST be disabled with an explanation, and the page MUST state: "Access to this page is enforced by the server; hiding a control is not security."
- **FR-040**: The shell MUST derive module state from the session payload: a disabled module's navigation entry MUST appear unavailable with "Turned off in Settings", and its routes MUST redirect to Organization settings with that explanation.
- **FR-041**: The Overview page and its quick actions MUST hide everything that depends on a disabled module; the Reports page MUST hide each section whose source module is disabled and MUST keep module-neutral sections visible.
- **FR-042**: Runtime module state MUST NOT modify the static navigation list or the design-system master file's navigation table.
- **FR-043**: The registration form MUST offer an optional organization name and an optional currency selector defaulting to USD, applying the same validation as the server.
- **FR-044**: Prices, totals and reports everywhere MUST use the organization's currency code obtained from the server.
- **FR-045**: No production code path MAY import the sample service, sample data, the "not connected" banner or the sample module configuration list; those production files MUST be deleted.
- **FR-046**: The development gallery MUST retain its own development-only fixtures.
- **FR-047**: A guard MUST fail when production code imports from a sample or mock folder, and the guard MUST be demonstrated failing on purpose before being left green.
- **FR-048**: Tests for this feature MUST run only in the isolated schema with the same API-role grants as public and MUST leave public row counts unchanged.

### Key Entities *(include if feature involves data)*

- **Organization settings**: name, currency code, default payment terms in days, version; the single authoritative identity and defaults for one workspace; name need not be unique.
- **Module availability**: one row per organization and module key holding enabled state, version and timestamps; switchable modules are inventory, purchasing, sales, invoicing and reports; contacts, products, settings and audit are permanently available.
- **Module dependency rule**: a named prerequisite relationship between modules, used to refuse an unsafe toggle with the responsible module named.
- **Open-document count**: the number of documents or active reservations that make a module in use, counted with the exact statuses defined in FR-017.
- **Currency lock**: the state reached when the organization has any sales order, purchase order or invoice in any status; thereafter the currency is read-only.
- **Audit entry**: the before and after values of a settings or module change, committed together with the change.
- **Session module context**: the enabled modules, currency code and payment terms delivered with the session so the interface adapts without extra calls.
- **Registration input**: optional organization name and optional currency code alongside the existing email and password.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Module availability is keyed by the organization and resolves only from the server-side session and an active membership; every new read, settings update, module toggle and module-list endpoint receives a two-organization isolation test, and requests for another organization's records return 404.
- **II. Server-enforced authority:** Reading settings requires membership; changing settings or modules requires `settings.manage`; a disabled module returns 403 `MODULE_DISABLED` on all of its endpoints including reads; the shared guard is the enforcement point, and the interface's disabled controls are explanatory only.
- **III. Transactional integrity:** Settings changes plus audit entries, currency locking, and open-document checks plus module toggles each commit as one transaction; version checks and locking serialize conflicting updates and document creation; a failed audit write rolls back the change; toggling a module off never deletes data.
- **IV. Exact decimals:** No new monetary values are introduced; currency is a code string and payment terms are a whole number; existing invoice due dates are not recomputed, and displayed amounts continue to use exact decimal values with the organization's currency code.
- **V. Test-first:** Tenant isolation, permission enforcement, stale-version refusal, currency lock including the first-document race, every dependency and in-use refusal with counts, the module-toggle race, disabled-module 403s across all endpoints, re-enablement and the sample-import guard are written as failing tests before implementation; critical-path coverage is at least 80%.
- **VI. Module boundaries:** Organization settings and module availability are owned by the organization module; the shared module guard is read once per request; other modules consult that guard rather than reading another module's state directly; no circular dependency is introduced.
- **VII. Honest boundaries:** The feature makes no tax, e-invoicing or accounting claim; supported currencies are codes for display only with no conversion, and existing invoice labelling and limitations are unchanged.
- **VIII. Design system and accessibility:** The two settings cards, table, switches, selectors, spinner, inline errors, toast and confirmation dialog use design-system tokens, labelled controls, visible focus, keyboard operation and PRD 7.3 feedback rules; refusals are conveyed as text, never by colour alone.
- **IX. Scope discipline:** Classified P0 because it completes P0-F002 and precedes dependable use of every later module; time zone, multiple currencies, branding, locale settings, organization deletion, billing/plans and ownership transfer are explicitly out of scope, and no P3 work is added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of organization settings and module endpoints refuse access to a member of a different organization, with a not-found response and no existence signal.
- **SC-002**: In 100% of successful saves, the new organization name appears in the top bar without a page reload and a success confirmation is shown.
- **SC-003**: Zero currency changes succeed after any document exists, across every document status and in the first-document race; the rate of incorrect successes is 0%.
- **SC-004**: 100% of dependency and in-use attempts are refused with the correct rule code, the responsible module and the relevant counts.
- **SC-005**: 100% of endpoints of a disabled module refuse access, 100% of endpoints of enabled modules remain available, and re-enabling restores access to 100% of pre-existing records.
- **SC-006**: 0 organizations remain without module rows after backfill, and 0 enabled modules have a disabled requirement.
- **SC-007**: Registration succeeds with and without the optional name and currency in 100% of valid cases, with exactly the documented default name source and default currency, and reveals nothing about existing accounts on failure.
- **SC-008**: 0 production code paths reference sample services, sample data, the "not connected" banner or sample module configuration lists, while the development gallery keeps its fixtures.
- **SC-009**: The session payload alone drives navigation, dashboard, quick actions and Reports adaptation in 100% of the checked module configurations.
- **SC-010**: An administrator completes a settings change in under 10 seconds end to end, and a module toggle is reflected across the interface within the next page load.
- **SC-011**: Every mandatory check, the contract-drift check and the invariant verification pass, with public row counts unchanged before and after the isolated-schema test run.
- **SC-012**: The new sample-import guard fails when deliberately violated and passes on the clean tree, verified in both states.

## Assumptions

- The existing session, role, permission, audit and row-level-security conventions are reused; no new identity mechanism is introduced.
- The supported currency list is exactly the eight codes in FR-004, and v1 performs no currency conversion.
- "Active stock reservation" means a reservation in an active state as already defined by the Inventory feature.
- Module availability is a workspace-wide setting; per-member module visibility remains driven by permissions.
- Turning a module off removes access only; it never deletes, archives or mutates records.
- Payment terms are computed when an invoice is issued; already-issued invoices keep their due dates.
- Tests run in the isolated schema with the same API-role grants as public, and public row counts are recorded before and after to prove no writes leak.
- The first-document-era audit comparison in the invariant script is not required; only the presence of the currency-lock trigger is verified.
- The pre-specify hook created a feature branch for tooling; per the constitution, work is integrated into `main` and the feature is identified by `specs/018-org-settings-modules` through `.specify/feature.json`.
- Time zone settings, multiple currencies, branding, locale settings, organization deletion, billing/plans and ownership transfer are deferred by the product definition and are not part of this feature.
