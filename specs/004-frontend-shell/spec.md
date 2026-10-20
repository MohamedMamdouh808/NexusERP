# Feature Specification: Frontend Design Foundation and Application Shell

**Feature Branch**: `main` (single-branch workflow — no feature branch is created; see Notes)
**Created**: 2026-10-20
**Status**: Draft
**MoSCoW Priority**: P0 (P3 is never implemented in v1 — Principle IX)
**Input**: User description: "Build the NexusERP frontend design foundation and application shell, using mock data only. No authentication, backend, database or real business data." Visual direction, given as a style reference rather than a copy: a soft pale blue-grey page background, white rounded cards with very subtle borders and shadows, one indigo-blue primary colour, a left sidebar with section labels and a pale-blue pill on the active item, a top bar, a page header with the title on the left and the primary action on the right, and data tables with coloured status pills; all branding is NexusERP's own, with no third-party name, logo, icon set or text. Requirements: update the design-system master file to this direction first, verify and record contrast, keep every value in the design-token pipeline, and keep the no-raw-design-values guard passing; a sidebar with the groups General, Management and Settings, in which built pages navigate and modules that are not built yet render visibly disabled with a "Soon" label and a tooltip, the current page highlighted and marked with `aria-current`, the existing Overview and System Health destinations still working, the sidebar collapsing to icons on tablet widths and fully keyboard operable; a top bar with an organization switcher and a user menu, both fed by clearly labelled sample data ("Sample organization", "Preview user"), no sign-in screen, and menu items that need authentication disabled with an explanation, while global search and notifications are omitted because they are not v1 features; a page header and a breadcrumb used by every page; a reusable component set covering Button (variants, loading, disabled), Input, Select, Textarea and Checkbox with inline errors, Badge (status colours from the design system), Card, a data table (sortable headers, props ready for server-side pagination, loading skeleton, empty state), Dialog, ConfirmDialog (stating the consequence), a dropdown menu, a toast, a skeleton, an empty state and an error state that shows a request identifier; a development-only component gallery route, excluded from production builds, to review every component and state; mock data in one place, separate from components and reachable only through a service interface the real REST client will implement later, with types taken from the shared package wherever a contract exists, money as decimal strings and never floating point, a visible "Sample data" marker on every screen showing mock data, and nothing pretending to be live; responsiveness for desktop and tablet only, with no horizontal page scroll and tables scrolling inside their container; and WCAG 2.1 AA with visible focus, reduced motion respected and keyboard operation. Success criteria: all existing tests still pass and every new component has tests for its states; the no-raw-design-values guard is re-broken on purpose and shown failing; a recorded contrast report and a keyboard walk-through of the shell pass; Overview and System Health still work; nothing in the interface looks active and does nothing; and CI is green. Out of scope: authentication, backend, database, dashboard charts, the Products module, billing, integrations, global search, notifications and dark mode.

---

## Clarifications

### Session 2026-10-20

- Q: Does the product gain a real screen showing sample records, or is sample record data confined to the development-only gallery? → A: Neither Overview nor a new product page shows sample records. The "Sample data" marker appears wherever sample data is shown — the top bar's sample organization and preview user, which are visible in every build, and the development-only gallery — and the success criteria count those surfaces. Overview and System Health stay untouched.
- Q: Where do the compact sidebar's identifiers and other icon-only controls get their glyphs, given that FR-046 forbids a third-party "icon set"? → A: One permissively licensed icon library (Lucide) is permitted as a dependency; it is not a third-party "icon set" in the sense of FR-046. FR-046 is amended to forbid a third-party product name, logo or copied text, and any icon, glyph or illustration copied from the reference design. Conditions: icons are imported individually so unused ones are tree-shaken, one library only, decorative icons are hidden from assistive technology, every icon-only control has an accessible name and a tooltip, the library's licence notice is added to the repository's third-party notices, and the plan justifies the dependency and reports the bundle-size change.
- Q: Where does the authoritative per-component state list live, given that SC-001 and SC-011 depend on it being exact? → A: The specification pins an exhaustive component × state matrix with a "verified by" column naming unit test, gallery review or both; hover and active are verified by gallery review plus a test that the token-based class or attribute is applied, because the test DOM does not compute `:hover`. One machine-readable manifest in the repository lists the same components and states, and the gallery fixtures and the tests are typed exhaustively against it, so adding or removing a state without both a fixture and a test fails type checking. SC-001 and SC-011 are computed from the manifest rather than asserted by hand. Each state's test asserts something specific to that state — an attribute, class, role or accessible value — and a guard test fails when a manifest state has no gallery fixture or no assertion, shown failing on purpose. The specification's matrix stays the authority, and a change to it requires the matching manifest change, checked at analyse.
- Q: Where is the sidebar's list of entries decided? → A: Pinned in this specification as the initial contents, and the design-system master file must enumerate the same entries in a plain table of group, label and state (available or Soon). The shell reads one typed navigation list in code, the sidebar tests assert against that list, and one test compares its groups, labels, order and states with the master file's table — shown failing on purpose when an entry is added, removed or flipped in only one place. Analyse checks the specification's table against both. A later feature that makes a module available flips its entry from Soon to available in the navigation list and the master file in the same change, and the sidebar tests must pass.
- Q: Do the gallery's interactive demos operate on in-memory sample state, given that FR-047 forbids a control that appears operable while doing nothing? → A: Yes. The gallery's controls work against in-memory sample state through the same mock service interface the real client will implement, so the mutation half of that interface is exercised rather than only declared: confirming the dialog removes the sample row, the toast names the sample record it reports, menu actions run, and the organization switch changes the active sample organization. Nothing persists — no browser storage — and a reload restores the initial state; the gallery carries the "Sample data" marker. The gallery also carries labelled demonstration switches, "Simulate failure" and "Simulate slow response", that make the mock service reject or delay, so loading, the error state with its request identifier, and the simulated 429 handling are reviewed through real flows rather than as static snapshots. A guard test activates every enabled control in the gallery and in the shell and fails when nothing observable changes — a service call, a DOM change or navigation — and is shown failing on purpose by adding a button with no handler; disabled controls are exempt because they are not operable. A build-output check proves the production build contains no gallery route.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Shell That Can Be Walked Through and Never Lies (Priority: P1) 🎯 MVP

Mohamed opens the product and finds a real application shell: a sidebar whose entries are grouped under
General, Management and Settings, a top bar that names the organization and the person, and a content
area whose every page opens with a title, a breadcrumb and its primary action. He can reach Overview and
System Health exactly as before. Every other module he can see is visibly unavailable and says so, and
nothing he can see pretends to be somewhere he can go.

**Why this priority**: The shell is the frame every later screen is built inside. If it cannot be walked
through — or if it offers doors that open onto nothing — every later feature inherits that dishonesty,
and the shell is the hardest thing to change once modules are attached to it.

**Independent Test**: Open the product, move between Overview and System Health, confirm the current
destination is highlighted and announced, confirm every unbuilt module reads as unavailable with its
reason, and confirm no element in the shell appears operable while doing nothing. Deliverable value: a
navigable product frame whose claims about itself are true.

**Acceptance Scenarios**:

1. **Given** the product is open, **When** the sidebar is read, **Then** its entries are grouped under
   three labelled groups — General, Management and Settings — and every entry belongs to exactly one of
   them.
2. **Given** a destination that exists, **When** it is chosen, **Then** the content area navigates to it
   and that entry is highlighted and marked `aria-current="page"`, with exactly one entry marked at a
   time.
3. **Given** a module whose screen does not exist, **When** its entry is read, **Then** it is rendered
   visibly unavailable with a "Soon" label and a tooltip giving the reason, and it cannot be activated by
   mouse, keyboard or assistive technology.
4. **Given** the Overview destination, **When** it is visited, **Then** it renders as it does today; and
   **given** the System Health destination, **when** it is visited, **then** the health panel behaves as
   it does today.
5. **Given** the shell is on screen, **When** every element that looks interactive is examined, **Then**
   each one either performs the action it names or is exposed as unavailable with a reason.

---

### User Story 2 - One Visual Language, Verified (Priority: P1)

The product has a single visual direction: a soft pale blue-grey page, white rounded cards with very
subtle borders and shadows, one indigo-blue primary colour, a pale-blue pill on the current sidebar
entry, and coloured status pills in tables. The design-system master file describes that direction before
anything is built from it, every value reaches the interface through the design-token pipeline, and the
contrast of every token pair is measured and written down rather than assumed.

**Why this priority**: A visual direction applied from underneath — from tokens the guard enforces —
is the only version that survives the next forty screens. Contrast measured after the fact is how an
inaccessible palette gets shipped as a finished design system, and it is far cheaper to fix here.

**Independent Test**: Read the updated design-system master file, confirm it describes the direction
above and records a measured ratio for every text, border and focus pair, and confirm the design-value
guard fails on a deliberately introduced raw value and passes once it is removed. Deliverable value: a
design foundation with verified, enforceable, single-sourced values.

**Acceptance Scenarios**:

1. **Given** the design-system master file, **When** it is read, **Then** it describes the direction in
   this specification — the pale blue-grey page, white rounded surfaces with subtle borders and shadows,
   one indigo-blue primary colour, the pale-blue active pill, the top bar, the page header with its title
   left and primary action right, and coloured status pills in tables.
2. **Given** every value the direction introduces, **When** the interface is searched for design values,
   **Then** each one arrives through the design-token pipeline and no component carries a raw colour,
   spacing, radius, shadow or type value.
3. **Given** the design-value guard, **When** a raw design value is deliberately introduced, **Then** the
   guard fails and names the offending location; **when** the value is removed, **then** the guard passes.
4. **Given** the updated master file, **When** the recorded contrast report is read, **Then** it lists a
   measured ratio for every text-on-background pair, every border-on-surface pair and every
   focus-ring-on-surface pair, with no pair below 4.5:1 for text or below 3:1 for borders and focus rings.

---

### User Story 3 - Every Component Exists in Every State, and Can Be Seen (Priority: P1)

A developer or reviewer opens a development-only gallery and sees every component this feature introduces
in every state it declares: a button that is loading, an input carrying an inline error, a table showing
skeleton rows and then an empty result, a confirmation dialog stating a consequence, an error state
showing a request identifier, a toast. The gallery never reaches a production build.

**Why this priority**: Components become "done" in the states someone happened to build. Naming the
states in advance, and giving each one a place it can be looked at, is what stops the loading, empty,
error and disabled states from being discovered in production instead of here.

**Independent Test**: Open the gallery in development and confirm every component and every declared
state renders; then build for production and confirm the gallery and its sample record data are absent
from the build. Deliverable value: a reviewable component set with no hidden states.

**Acceptance Scenarios**:

1. **Given** the development-only gallery, **When** it is opened, **Then** it renders every component
   named in this specification together with every state declared for that component.
2. **Given** a production build, **When** the produced interface is examined, **Then** the gallery route
   is absent, the sample record data used only by the gallery is absent, and a request for the gallery
   path does not render it.
3. **Given** a component with an error state, **When** that state is shown, **Then** it displays a
   request identifier alongside the failure, so a failure can be traced rather than described.
4. **Given** a confirmation dialog, **When** it is opened, **Then** it names the action and states its
   consequence in plain language before the confirming action can be taken.

---

### User Story 4 - Sample Data That Never Pretends to Be Live (Priority: P2)

Every value on screen that is not real is either labelled as sample or is not on screen at all. The
sample values live in one place behind a single service seam, so the interface already speaks the shape
the real client will speak; money is carried as decimal strings; and every surface that shows sample data
says so in the interface itself.

**Why this priority**: The cheapest way to lose trust in a demo is a number that looks real. The seam
matters because it is what lets the real client arrive later without every screen being rewritten, and
the decimal rule because money that is ever a floating-point number is wrong before it is displayed.

**Independent Test**: Trace every value the interface renders to its source; confirm sample values are
labelled where they appear, are reachable only through the service seam, and appear nowhere as
floating-point money. Deliverable value: a demonstrable interface with no false claim about its data.

**Acceptance Scenarios**:

1. **Given** the interface's source, **When** its use of sample data is traced, **Then** all of it lives
   in one place outside the components and is reached only through the service interface that the real
   client will implement.
2. **Given** a surface that shows sample data, **When** it is viewed, **Then** it carries a visible
   "Sample data" marker — the top bar's sample organization and preview user in every build, and the
   gallery — and no element of the interface claims the data is live, current or real.
3. **Given** any money value in the interface, the sample data or a fixture, **When** it is inspected,
   **Then** it is a decimal string and never a floating-point number, and the interface formats it
   without performing arithmetic on it.
4. **Given** the top bar, **When** it is read, **Then** the organization and the person are labelled as
   sample ("Sample organization", "Preview user") rather than presented as records.

---

### User Story 5 - Usable Without a Mouse, at the Supported Widths (Priority: P2)

Mohamed tabs through the shell and reaches everything: each sidebar entry, the organization switcher, the
user menu, the page's primary action, a table's sortable headers, a dialog and its close action, a toast's
dismiss. Focus is always visible. On a tablet the sidebar narrows to a compact form without losing any
entry's meaning, and no supported width produces sideways scrolling of the page. Where he has asked his
system to reduce motion, nothing animates.

**Why this priority**: The shell is the one part of the product every user uses on every screen, and
keyboard operation is a hard requirement of the product's accessibility standard rather than a
progressive enhancement. Tablets are in scope; phones are not, and the layout must not pretend otherwise.

**Independent Test**: Perform the recorded keyboard walk-through of the shell with no pointing device,
check the accessible names of the compact sidebar, and open the shell at 768px, 1024px and 1440px looking
for horizontal page scroll. Deliverable value: a shell that can be operated and read at the widths the
product supports.

**Acceptance Scenarios**:

1. **Given** the shell, **When** it is operated with the keyboard alone, **Then** every interactive
   element is reachable in the visual order, focus is always visible, and no operation requires a
   pointing device.
2. **Given** a supported width, **When** a page containing a wide data table is shown, **Then** the page
   itself does not scroll horizontally and the table scrolls inside its own container.
3. **Given** a tablet width, **When** the sidebar is shown, **Then** it presents each entry in a compact
   form that keeps its accessible name, its group and its availability, and the current destination
   remains identifiable.
4. **Given** the system reports a preference for reduced motion, **When** the interface animates anything
   — a skeleton, a dialog, a dropdown — **Then** the animation is not played and the component's meaning
   is preserved as a static state.
5. **Given** a status shown as a coloured pill, **When** it is read without colour, **Then** the status is
   still conveyed by its text.

---

### Edge Cases

- **The tablet boundary is crossed.** The supported range begins at 768px and the sidebar changes form
  somewhere between the tablet and desktop widths. Nothing may be lost at the boundary: the entry's
  name, group and availability must survive the change, and neither side of the boundary may produce
  horizontal page scroll.
- **The viewport is narrower than the supported range.** Phone widths are out of scope. The layout must
  degrade predictably rather than claim a phone layout it does not have, and no phone breakpoint is
  added.
- **A group contains only unavailable entries.** A grouped sidebar whose Settings entries are all
  unbuilt must still be honest: the group is labelled, its entries are visibly unavailable with reasons,
  and nothing about the group implies it currently leads anywhere.
- **A name does not fit.** A long organization or person name must not widen the layout or introduce
  horizontal page scroll, and its full value must remain retrievable without a pointing device.
- **A table is wider than its container.** The table scrolls inside its container, and its scrolled
  content must still be reachable and operable from the keyboard.
- **An empty result is sorted.** A zero-row result shows the explanatory empty state offering the
  primary create action, and the sort controls remain operable rather than seeming broken over nothing.
- **A sort is applied.** A sortable header exposes which column is sorted and in which direction to a
  reader who cannot see the arrow, and activating it requests the next state rather than sorting a
  sample array in place in a way that would not survive being server-side.
- **A confirmation is dismissed instead of confirmed.** Closing a confirmation dialog by Escape, by its
  close action or by confirming returns focus to the control that opened it, and dismissing performs no
  action.
- **Two menus could be open at once.** Opening a menu closes any other open menu, and Escape from a menu
  returns focus to its trigger.
- **A toast carries a failure.** A toast duplicates a failure rather than replacing it: the failure also
  appears where it belongs on the screen, with its request identifier, so dismissing the toast loses no
  information.
- **A sample operation fails.** The error state shows a request identifier that is labelled as sample along
  with the rest of the gallery, so a reviewer never mistakes it for a live incident reference.
- **The gallery path is requested in a production build.** No gallery route exists there, and the request
  falls through to the shell's existing not-found behaviour rather than rendering the gallery. A
  build-output check shows the route is absent from the build rather than leaving it to be assumed from the
  source (FR-070).
- **A control is added with no handler.** A button that looks operable and does nothing is exactly the
  defect FR-047 forbids. The every-control guard fails when activating it changes nothing observable, and
  the guard is shown failing on purpose before the feature is called done (FR-071).
- **A demo switch is left on.** With "Simulate failure" or "Simulate slow response" enabled, the gallery's
  flows reject or hang by design. The switch is labelled, its effect is confined to the gallery's in-memory
  sample implementation, nothing in the shell behaves differently, and no state is persisted (FR-069).
- **The gallery's mutations are mistaken for persistence.** Confirming a dialog removes a row and the toast
  names it, which can read as a saved change. Nothing is written to browser storage or anywhere else, and
  a reload restores the initial state, so the demonstration cannot be confused with a committed record
  (FR-068).
- **The icon library would ship its whole catalogue.** An import that pulls in the library as a whole puts
  every glyph it contains into the build. Icons are therefore imported individually so only the ones in use
  are included, and the plan reports the measured size change rather than assuming tree-shaking happened.
- **A second icon appears to be needed.** Adding another library for one glyph is how a project ends up
  with two visual languages. One library only; where it has no suitable glyph, a shape the project draws
  itself is used instead of a second dependency.
- **An icon stands alone as the only label.** An icon-only control whose glyph is the only indication of
  its meaning is unreadable to assistive technology and ambiguous to sighted readers. Icon-only controls
  carry an accessible name and a tooltip, and decorative icons are hidden from assistive technology so they
  are not announced as meaningless content.
- **A state is in the manifest with nothing behind it.** Adding a state without a gallery fixture or without
  an assertion is exactly how a state becomes a claim rather than a fact. The guard test fails, and the
  guard itself is shown failing on purpose (FR-061) so that the check is known to work rather than believed
  to.
- **A state's appearance depends on a pseudo-class the test DOM does not compute.** An element cannot be
  hovered in a test DOM, so a test asserting "the hover appearance is correct" would assert nothing. Those
  states are verified by gallery review together with a test that the token-based class or attribute
  carrying the appearance is applied.
- **The state matrix and the manifest drift apart.** A state added to one and not the other makes the
  counts in SC-001 and SC-011 wrong while every test still passes. The matrix is the authority, a change to
  either requires the other, and the two are compared at analyse (FR-062).
- **The shell carries a selected sample organization.** Its name must never be presented as, or
  substituted for, a real organization's data, and no scope may be derived from it.
- **The window is short.** A sidebar whose entries exceed the available height scrolls inside itself while
  the top bar stays in place, so the shell's frame is never lost.
- **An entry is flipped in code but not in the master file.** The entry navigates while the design system
  still describes it as unavailable, and every test that only reads the code passes. The comparison
  between the navigation list and the master file's table fails, which is why the two are changed together
  (FR-065, FR-066).
- **A change would leave a group with no entries.** A group heading with nothing under it presents a
  section the product does not have. A group is never rendered empty, and the initial contents keep at
  least one entry in each group (FR-006, FR-067).
- **A money value arrives with more precision than money allows.** It must not be silently reinterpreted
  through floating-point arithmetic; it is carried as the string it is.

---

## Requirements *(mandatory)*

### Functional Requirements

**Design foundation**

- **FR-001**: The design-system master file MUST be updated to the direction in this specification before
  any component is built from it, so components consume the updated foundation rather than restating
  values that the master file does not yet define.
- **FR-002**: The direction MUST be: a soft pale blue-grey page background; white surfaces with rounded
  corners and very subtle borders and shadows; one indigo-blue primary colour used for primary actions,
  the current navigation entry and the focus ring; a left sidebar carrying section labels and a pale-blue
  pill on the current entry; a top bar; a page header with the title on the left and the single primary
  action on the right; and data tables carrying coloured status pills.
- **FR-003**: Every colour, spacing, radius, shadow and type value the direction introduces MUST reach the
  interface through the existing design-token pipeline. No component may carry a raw design value, no
  exemption may be added to the design-value guard to make it pass, and the guard MUST keep passing
  unchanged.
- **FR-004**: Contrast MUST be measured and recorded in the repository as a report covering every pair
  the direction introduces: text against white surfaces, text against the page background, text inside
  status pills against the pill background, the current entry's text against the active pill, and input
  borders and focus rings against the surface they sit on. Every text pair MUST measure at least 4.5:1
  and every border and focus pair at least 3:1, and any pair that fails MUST be changed rather than
  documented as an accepted exception.
- **FR-005**: The design-system master file MUST remain the single source of truth: it MUST record the
  shell rules this feature changes — the sidebar's grouping, the visibly unavailable state for unbuilt
  modules, and the compact sidebar at tablet widths — so no later feature reads a rule the product no
  longer follows. It MUST also enumerate the sidebar's entries, per FR-064. The existing light-mode-only
  and desktop-and-tablet-only rules MUST remain in force.

**Application shell**

- **FR-006**: The sidebar MUST present its entries grouped under exactly three labelled groups: General,
  Management and Settings. Every entry MUST belong to exactly one group, and a group MUST NOT be rendered
  empty.
- **FR-007**: A sidebar entry whose destination exists MUST navigate to it. An entry whose destination
  does not exist MUST be rendered visibly unavailable, carrying a "Soon" label and a tooltip giving the
  reason, and MUST NOT be activatable by mouse, keyboard or assistive technology.
- **FR-008**: The sidebar MUST NOT offer a navigation entry for anything that is not a v1 feature. Where a
  surface the design system lists belongs to a later feature, it is presented in the unavailable form
  above; where it belongs to no v1 feature at all, it is omitted entirely.
- **FR-009**: The current destination MUST be highlighted and marked with `aria-current="page"`, and
  exactly one entry MUST be marked at any time.
- **FR-010**: The existing Overview and System Health destinations MUST keep working, at their existing
  paths and with their current behaviour, including the System Health panel's live behaviour.
- **FR-011**: The sidebar MUST become a compact, icon-only form at tablet widths. The change MUST be
  driven by the available width rather than by a control, so no control exists that would do nothing at
  another width, and in the compact form every entry MUST keep an accessible name, its group and its
  availability, with the current destination still identifiable.
- **FR-012**: The sidebar MUST be fully keyboard operable: every entry reachable in the visual order,
  activatable without a pointing device, carrying visible focus, and scrolling inside itself when its
  entries exceed the available height while the top bar stays in place.
- **FR-013**: The top bar MUST carry an organization switcher and a user menu, both fed by sample data
  that is labelled as sample in the interface ("Sample organization", "Preview user"). The active
  organization's name MUST always be visible in the top bar.
- **FR-014**: Selecting a sample organization MUST change only what the shell displays as the active
  organization. It MUST NOT be presented as resolving a membership or a permission, MUST NOT persist, and
  MUST NOT scope any request or be carried in a URL or query string.
- **FR-015**: Menu entries that would require authentication MUST be rendered disabled alongside an
  explanation that authentication is not part of this feature. The interface MUST NOT contain a sign-in
  screen, a sign-in route, a sign-out action or any control implying that a session exists.
- **FR-016**: Global search and notifications MUST NOT be rendered at all — not as unavailable controls,
  not as placeholders — because neither is a v1 feature.
- **FR-017**: The shell MUST provide a page header used by every page: the page title on the left and the
  page's single primary action on the right, with support for a description and for secondary actions.
  Where a page has no primary action, the right side MUST be empty rather than carrying a control that
  does nothing.
- **FR-018**: The shell MUST provide a breadcrumb used by every page. It MUST name the current location
  within the shell's structure, MUST mark its final entry as the current page without making it a link,
  and MUST NOT render an entry as a link unless that destination exists.

The navigation table is the initial contents of the sidebar and the authority for it (FR-064). The order of
rows is the order of entries. Entry labels are as recorded here, including the capitalisation of the two
available entries; their paths and behaviour are unchanged (FR-010).

| Group | Entry | State |
|-------|-------|-------|
| General | Overview | available |
| General | Sales Orders | Soon |
| General | Inventory | Soon |
| General | Reports | Soon |
| Management | Products | Soon |
| Management | Customers & Suppliers | Soon |
| Management | Purchasing | Soon |
| Management | Invoicing | Soon |
| Management | Users & Roles | Soon |
| Settings | Organization | Soon |
| Settings | Audit Log | Soon |
| Settings | System Health | available |

Omitted entirely, because no v1 feature owns them: Billing & Subscription, Integrations, Upgrade Plan,
Help & Support, global search and notifications. Exactly two entries are available — Overview and System
Health — and every group carries at least one entry (FR-067).

**Components**

- **FR-019**: The component set MUST cover: Button, Input, Select, Textarea, Checkbox, Badge, Card, data
  table, Dialog, ConfirmDialog, dropdown menu, toast, skeleton, empty state and error state. Each
  component MUST implement every state listed for it in the state matrix below, and a state that is not
  implemented MUST NOT be declared. A state that is not in the matrix does not exist.
- **FR-020**: Button MUST implement its variants as the design system defines them, together with
  default, hover, focus, active, loading and disabled states. A loading button MUST keep its accessible
  name, MUST announce that it is busy, and MUST NOT be activatable a second time while it is loading.
- **FR-021**: Input, Select, Textarea and Checkbox MUST each support a label, help text, a required
  indication, a disabled state and an inline error message. An error MUST be associated with its field
  programmatically and MUST be shown to the reader rather than only conveyed by colour.
- **FR-022**: Badge MUST render status colours from the design system's status mapping and MUST use the
  status names the API uses, verbatim. A status MUST NOT be conveyed by colour alone.
- **FR-023**: Card MUST render a white, rounded surface with a subtle border and shadow, together with a
  title, optional description and optional actions.
- **FR-024**: The data table MUST support sortable column headers, and MUST expose which column is sorted
  and in which direction to a reader who cannot see the sort indicator.
- **FR-025**: The data table's inputs MUST be ready for server-side pagination and sorting — page, page
  size, total count, sort column, sort direction, and the callbacks that request a change — so the table
  requests a result rather than sorting or slicing a local array, and no change is needed when a real
  service replaces the sample one.
- **FR-026**: The data table MUST support a loading state rendered as skeleton rows, an empty state, and a
  visible total count. It MUST scroll inside its own container without producing horizontal page scroll,
  and its numeric columns MUST be right-aligned with aligned figures.
- **FR-027**: Dialog MUST be modal, MUST expose an accessible name, MUST move focus into itself when
  opened, MUST keep focus within itself while open, MUST close on Escape, and MUST return focus to the
  control that opened it when it closes.
- **FR-028**: ConfirmDialog MUST be built on Dialog, MUST name the action it confirms, and MUST state the
  consequence in plain language before the confirming action can be taken. The confirming action MUST be
  visually distinct when the action is destructive, and the dialog's behaviour MUST match the design
  system's dialog rules.
- **FR-029**: The dropdown menu MUST support a trigger, entries, and disabled entries carrying the reason
  they are unavailable. It MUST be operable from the keyboard, MUST close on Escape returning focus to its
  trigger, MUST close on interaction outside it, and MUST ensure only one menu is open at a time.
- **FR-030**: Toast MUST support success, failure and informational messages, MUST name the record or the
  subject it refers to, MUST be dismissible, and MUST be announced to assistive technology without taking
  focus. A toast MUST duplicate rather than replace the information it carries.
- **FR-031**: Skeleton MUST render a loading placeholder for the shape it stands in for, MUST be
  presented so that assistive technology is not read a meaningless placeholder, and MUST NOT animate when
  a preference for reduced motion is reported.
- **FR-032**: Empty state MUST explain what the list it replaces contains and MUST offer the primary
  create action where one exists.
- **FR-033**: Error state MUST show a human-readable explanation together with the request identifier the
  failure carries, and MUST offer a retry where the failure can be retried.

The state matrix is the authority for FR-019, the gallery (FR-034), the state tests (FR-050) and the
manifest (FR-059). Verification values mean:

- **unit test** — a test asserting the attribute, class, role or accessible value specific to that state,
  not merely that the component renders.
- **gallery** — visual review of that state in the development gallery.
- **applied-class test** — for a pseudo-class a test DOM does not compute (`:hover`, `:active`), a test
  asserting that the token-based class or attribute carrying that state's appearance is applied, paired
  with gallery review of the appearance itself.

A variant axis is a prop, not a state: FR-020's Button variants are covered by FR-020 and shown in the
gallery in their default state, and are not rows in this matrix.

| Component | State | Verified by |
|-----------|-------|-------------|
| Button | default | unit test + gallery |
| Button | hover | gallery + applied-class test |
| Button | focus-visible | unit test + gallery |
| Button | active | gallery + applied-class test |
| Button | loading | unit test + gallery |
| Button | disabled | unit test + gallery |
| Input | default | unit test + gallery |
| Input | focus-visible | unit test + gallery |
| Input | filled | unit test + gallery |
| Input | required | unit test + gallery |
| Input | with help text | unit test + gallery |
| Input | invalid, with inline error | unit test + gallery |
| Input | disabled | unit test + gallery |
| Select | default | unit test + gallery |
| Select | focus-visible | unit test + gallery |
| Select | selected value | unit test + gallery |
| Select | required | unit test + gallery |
| Select | with help text | unit test + gallery |
| Select | invalid, with inline error | unit test + gallery |
| Select | disabled | unit test + gallery |
| Textarea | default | unit test + gallery |
| Textarea | focus-visible | unit test + gallery |
| Textarea | filled | unit test + gallery |
| Textarea | required | unit test + gallery |
| Textarea | with help text | unit test + gallery |
| Textarea | invalid, with inline error | unit test + gallery |
| Textarea | disabled | unit test + gallery |
| Checkbox | unchecked | unit test + gallery |
| Checkbox | checked | unit test + gallery |
| Checkbox | focus-visible | unit test + gallery |
| Checkbox | required | unit test + gallery |
| Checkbox | invalid, with inline error | unit test + gallery |
| Checkbox | disabled | unit test + gallery |
| Badge | one state per status name in the design system's status mapping — DRAFT, CONFIRMED, ISSUED, PARTIALLY_RECEIVED, PARTIALLY_SHIPPED, PARTIALLY_PAID, RECEIVED, SHIPPED, PAID, CANCELLED, VOID, ACTIVE, CONSUMED, RELEASED | unit test + gallery |
| Badge | status conveyed by more than colour | unit test + gallery |
| Card | title only | unit test + gallery |
| Card | with description | unit test + gallery |
| Card | with actions | unit test + gallery |
| Data table | default | unit test + gallery |
| Data table | loading, as skeleton rows | unit test + gallery |
| Data table | empty | unit test + gallery |
| Data table | sorted ascending | unit test + gallery |
| Data table | sorted descending | unit test + gallery |
| Data table | a page after the first | unit test + gallery |
| Dialog | closed | unit test + gallery |
| Dialog | open | unit test + gallery |
| ConfirmDialog | open, non-destructive | unit test + gallery |
| ConfirmDialog | open, destructive | unit test + gallery |
| ConfirmDialog | confirming | unit test + gallery |
| Dropdown menu | closed | unit test + gallery |
| Dropdown menu | open | unit test + gallery |
| Dropdown menu | entry unavailable, with its reason | unit test + gallery |
| Toast | success | unit test + gallery |
| Toast | failure | unit test + gallery |
| Toast | informational | unit test + gallery |
| Toast | dismissed | unit test + gallery |
| Skeleton | default | unit test + gallery |
| Skeleton | reduced motion | unit test + gallery |
| Empty state | with the primary create action | unit test + gallery |
| Empty state | without a create action | unit test + gallery |
| Error state | retryable | unit test + gallery |
| Error state | not retryable | unit test + gallery |

The fourteen names in the Badge row are the manifest's `BadgeStatus` union, so FR-059 types it
exhaustively and FR-060 counts Badge's states from the manifest instead of from one open-ended
row. The set is the design system's status mapping as it stands — including its P1-marked
`PARTIALLY_SHIPPED` — because FR-022 renders a name from that mapping verbatim, and a status name
is a badge value rather than the module that produces it.

**Development-only gallery**

- **FR-034**: A development-only gallery route MUST render every component named in FR-019 together with
  every state listed for it in the state matrix, so the component set can be reviewed without a business
  module existing.
- **FR-035**: The gallery and the sample record data it needs MUST be absent from a production build. A
  production build MUST NOT contain the gallery route or its data, and a request for the gallery path
  there MUST NOT render it. The gallery MUST NOT be linked from the shell.

**Sample data and the service seam**

- **FR-036**: All sample data MUST live in one place, separate from the components, and MUST be reached
  only through a service interface that the real REST client will implement later. No component may import
  sample data directly.
- **FR-037**: The service interface MUST be shaped like the calls the real client will make — asynchronous,
  returning a page of records with a total for a list, a record for a detail, and a result for a mutation
  — so replacing the sample implementation does not change a component.
- **FR-038**: Types MUST come from the shared package wherever a contract exists there. A type already
  defined by the shared package MUST NOT be restated locally.
- **FR-039**: Money MUST be carried as a decimal string and never as a floating-point number, in the
  sample data, in the fixtures and in the interface. The interface MUST format money for display without
  performing arithmetic on it, and a test MUST fail if a money value is introduced as a number.
- **FR-040**: Every surface that shows sample data MUST carry a visible "Sample data" marker: the top
  bar's sample organization and preview user, which are present in every build, and the development-only
  gallery. No product page may render sample records — the Overview and System Health destinations are the
  only built pages, and neither shows mock data. Nothing in the interface may imply that sample data is
  live: no liveness indicator, no "updated just now", and no real-time wording.
- **FR-041**: Sample data MUST NOT be presented as any real organization's data and MUST NOT be sent
  anywhere. This includes the sample organization and preview user the top bar displays, which stand in
  for values the real client will supply later and MUST be reached through the same service interface as
  every other sample value rather than being written into the interface.

**Responsiveness and accessibility**

- **FR-042**: The interface MUST support desktop and tablet widths from 768px upwards, and MUST NOT claim
  a phone layout. No phone breakpoint may be added.
- **FR-043**: No supported width may produce horizontal page scroll. Content wider than its container MUST
  scroll inside that container.
- **FR-044**: The interface MUST meet WCAG 2.1 AA for the surfaces it introduces: visible focus on every
  interactive element, keyboard operation of the whole shell, reduced-motion preferences respected by
  every animation and transition, accessible names for every control including icon-only ones, and status
  conveyed by more than colour.
- **FR-045**: The accessibility of the shell MUST be demonstrated rather than asserted: the recorded
  keyboard walk-through in FR-053 MUST reach and operate every interactive element of the shell using the
  keyboard alone.

**Product identity and honesty**

- **FR-046**: All branding MUST be NexusERP's own. The interface MUST NOT contain a third-party product
  name, logo or copied text, and MUST NOT contain an icon, glyph or illustration copied from the reference
  design or from another product's visual identity. A permissively licensed icon library used as a
  dependency is allowed and is not a third-party "icon set" in the sense of this requirement, subject to
  FR-055 to FR-058.
- **FR-047**: Nothing in the interface may appear operable while performing no action. Every element that
  looks interactive MUST either perform the action it names or be exposed as unavailable together with the
  reason it is unavailable. This is checked rather than asserted (FR-071).
- **FR-048**: The interface MUST NOT claim, imply or display anything belonging to the features this
  specification excludes: no authentication or session, no backend or database, no dashboard chart, no
  Products module, no billing, no integration, no global search, no notification, and no dark theme.

**Verification**

- **FR-049**: Every existing test suite MUST still pass, and the full local gate set — type checking,
  linting, unit tests, integration tests and the build — MUST stay green.
- **FR-050**: Every component this specification introduces MUST have tests covering each state in the
  state matrix, and each state's test MUST be written before that state is implemented. A state's test MUST
  assert something specific to that state — an attribute, class, role or accessible value — and MUST NOT be
  satisfied by the component merely rendering.
- **FR-051**: The design-value guard MUST be deliberately re-broken and shown failing during this feature,
  and shown passing once the deliberately introduced value is removed. The guard's own test MUST continue
  to assert that a raw design value is caught.
- **FR-052**: The contrast report required by FR-004 MUST be recorded in the repository as part of this
  feature.
- **FR-053**: The keyboard walk-through required by FR-045 MUST be recorded, listing each interactive
  element of the shell and the result of operating it from the keyboard.
- **FR-054**: The Overview and System Health destinations MUST be verified as still working by their
  existing tests rather than by inspection.

**Icons and the icon dependency**

- **FR-055**: Exactly one permissively licensed icon library may be used, and its icons MUST be imported
  individually so that only the icons the interface actually uses are included in a build; the library's
  whole catalogue MUST NOT reach a build. An icon's size and colour MUST come from the design tokens, so an
  icon carries no raw design value and the design-value guard keeps passing.
- **FR-056**: An icon that is decorative MUST be hidden from assistive technology. Every icon-only control
  MUST have an accessible name and a tooltip, so no control's meaning is carried by its glyph alone.
- **FR-057**: The icon library's licence notice MUST be added to the repository's third-party notices, so
  the dependency's licence is recorded where the project's other third-party notices live.
- **FR-058**: The plan MUST justify the icon dependency and MUST report the bundle-size change it causes,
  measured rather than estimated, so the cost of the dependency is recorded rather than assumed.

**State matrix and manifest**

- **FR-059**: One machine-readable manifest in the repository MUST list the same components and states as
  the state matrix, and the gallery's fixtures and the state tests MUST be typed exhaustively against it —
  a record keyed by the state union, for example — so that adding or removing a state without both a
  fixture and a test fails type checking rather than passing unnoticed.
- **FR-060**: SC-001 and SC-011 MUST be computed from the manifest rather than asserted by hand, so the
  counts they state are produced by the check rather than by a person.
- **FR-061**: A guard test MUST fail when a state in the manifest has no gallery fixture or no assertion in
  its test. It MUST be deliberately shown failing and then shown passing, as FR-051 does for the
  design-value guard.
- **FR-062**: The state matrix in this specification is the authority. A change to it MUST be accompanied by
  the matching manifest change, and the two MUST be compared during the analyse step so they cannot
  diverge.
- **FR-063**: The manifest MUST be a development-time artifact: it MUST NOT reach a production build, and
  it MUST NOT import sample data into a component.

**Navigation contents**

- **FR-064**: The navigation table above is the initial contents of the sidebar and the authority for it.
  The design-system master file MUST enumerate the same entries in a plain table of group, label and state
  — available or Soon — so a reader of the master file sees what the shell actually offers rather than only
  the rule that decides it.
- **FR-065**: The shell MUST read one typed navigation list in code, and the sidebar's tests MUST assert
  against that list. One test MUST compare the list's groups, labels, order and states with the master
  file's table, and that comparison MUST be shown failing on purpose when an entry is added, removed or
  flipped in only one place. The analyse step MUST check the specification's table against both.
- **FR-066**: A later feature that makes a module available MUST flip its entry from Soon to available in
  the navigation list and in the master file in the same change, and the sidebar's tests MUST pass, so an
  entry never becomes navigable in one place only.
- **FR-067**: The initial contents MUST keep exactly two entries available — Overview and System Health —
  and every group MUST contain at least one entry. The entries recorded above as omitted because no v1
  feature owns them MUST NOT be rendered at all, not even in the unavailable form.

**Gallery demonstration**

- **FR-068**: The gallery's controls MUST operate on in-memory sample state through the same service
  interface the real client will implement (FR-036, FR-037), so the interface's mutation half is exercised
  rather than only declared: confirming a confirmation dialog removes the sample row, a success toast names
  the sample record it reports, a menu action runs, and the organization switch changes the active sample
  organization. Nothing may persist — no browser storage and no durable write of any kind — so a reload
  restores the initial state. The gallery carries the "Sample data" marker (FR-040).
- **FR-069**: The gallery MUST provide two labelled demonstration switches, "Simulate failure" and
  "Simulate slow response", that make the sample implementation of the service interface reject or delay.
  With them the loading state, the error state with its request identifier, and the simulated 429 handling
  MUST be reached and reviewed as real flows rather than as static snapshots.
- **FR-070**: A build-output check MUST show that a production build contains no gallery route, so FR-035
  is checked against the build rather than asserted.
- **FR-071**: A guard test MUST activate every enabled control in the gallery and in the shell and MUST
  fail when activating a control changes nothing observable — no service call, no DOM change and no
  navigation. It MUST be deliberately shown failing, by adding a control that has no handler, and then
  shown passing once that control is removed. Controls that are disabled are exempt, because they are not
  operable (FR-047).

### Key Entities

- **Design token**: A named design value — colour, spacing, radius, shadow, type — defined once in the
  design system, carried into the interface by the token pipeline, and referenced rather than restated.
- **Contrast record**: One measured ratio for one pair of values the direction introduces, with the pair,
  the ratio and the requirement it must meet, kept in the repository so the claim can be re-checked.
- **Shell**: The persistent frame around every page — the sidebar, the top bar, and the content area that
  carries each page's header and breadcrumb.
- **Navigation entry**: One destination in the sidebar, with its label, its group and its state; available
  entries navigate, entries whose module is not built yet carry a "Soon" label and a reason.
- **Navigation list**: The one typed list in code that the shell renders and the sidebar's tests assert
  against, mirrored by the master file's table of group, label and state so the two cannot disagree about
  what the sidebar offers (FR-065).
- **Component state**: One declared appearance or behaviour of a component — loading, empty, error,
  disabled, and so on — each of which appears in the state matrix, has a gallery fixture and has a test.
- **State manifest**: The machine-readable list of the same components and states as the state matrix, typed
  against by the gallery's fixtures and the state tests so a state cannot be added or removed without both,
  and read by the checks that compute SC-001 and SC-011.
- **Sample record**: A value that stands in for a real record so the interface can be reviewed — including
  the sample organization and the preview user the top bar shows — living in one place behind the service
  interface and marked as sample wherever it is shown.
- **Service interface**: The seam through which the interface obtains its data, shaped like the calls the
  real client will make, implemented today by sample data and later by the real client.
- **Request identifier**: The identifier a failure carries, shown by an error state so a failure can be
  traced in the record rather than only described.
- **Icon library**: The single permissively licensed dependency that supplies the interface's glyphs, used
  through individual imports so only the icons in use reach a build, sized and coloured from design tokens,
  and recorded in the repository's third-party notices.
- **Demonstration switch**: A labelled control in the gallery that makes the sample implementation of the
  service interface reject or delay — "Simulate failure" and "Simulate slow response" — so the loading,
  error and rate-limited states can be reached as real flows; it changes the gallery's in-memory sample
  state only and persists nothing.

---

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** No table, no query and no tenant data is added by this feature. The shell
  displays a sample organization name that is labelled as sample, is not a record, and resolves no
  membership or permission; no scope is derived from it and it is never carried in a URL or query string
  (FR-014). Sample records MUST NOT be any real organization's data (FR-041). No request leaves the
  interface, so no isolation test is added; the existing isolation suite is unaffected and MUST keep
  passing.
- **II. Server-enforced authority:** No endpoint is added and no permission changes, so default deny is
  untouched. The navigation already records the permission each destination will require and this feature
  keeps that as recorded intent only: nothing is filtered or guarded on the client, and no control is
  presented as though the client enforced authority. Where an entry would need a permission the client
  cannot know, it is shown unavailable with a reason rather than hidden, and the reason explains that
  authentication is not part of this feature (FR-015). The one authority-shaped decision this feature
  makes — that a selected sample organization scopes nothing — is stated in FR-014 rather than left to
  the screen to imply.
- **III. Transactional integrity:** The feature adds no posting operation and no `Idempotency-Key`
  endpoint, and creates no record that becomes immutable. The service interface is the point where this
  could go wrong, so it is required to be honest about it: a mutation result MUST NOT be presented as
  having committed a record, and no sample operation may persist anything durable (FR-037, FR-047). The
  gallery exercises the interface's mutation half, and that is the strongest case: confirming a dialog
  removes a row in memory and a reload restores it, with no browser storage and no durable write anywhere
  (FR-068). The Posting, numbering and immutability rules the foundation establishes are untouched because
  no business record exists here.
- **IV. Exact decimals:** Money is a decimal string throughout this feature and never a floating-point
  number — in the sample data, in the fixtures and in the interface (FR-039) — and the shared package's
  decimal contract is reused rather than restated (FR-038). The interface formats money for display and
  performs no arithmetic on it, so no rounding decision is taken on the client at all; where a total is
  displayed it is displayed as the service stated it. A test MUST fail when a money value is introduced as
  a number, making the rule structural rather than a convention.
- **V. Test-first:** Every component's states are enumerated in the state matrix before any of them is
  built, and each state's test is written before that state is implemented (FR-050, FR-059). The evidence
  this feature owes is produced as observations rather than claims: the design-value guard is deliberately
  re-broken and observed failing before being restored (FR-051, FR-052), the state-manifest guard is shown
  failing on a state left without a fixture or an assertion (FR-061), and the keyboard walk-through is
  recorded from an actual pass over the shell (FR-053). The existing coverage threshold continues to
  apply, and no suite may be skipped, weakened or marked pending to make this feature look finished. The
  same rule governs the gallery: the guard that every enabled control changes something observable is
  shown failing on a control added with no handler before it is trusted (FR-071, SC-019).
- **VI. Module boundaries:** The feature lives entirely in the web workspace and adds no service-side
  module, endpoint or dependency. It consumes the shared workspace's types where a contract exists
  (FR-038) and MUST NOT import from the service, the database, or the generated database client. All data
  access passes through one interface so the real client can replace the sample implementation without a
  component changing (FR-036, FR-037) — which is what keeps this feature from becoming a second,
  competing data layer. No broker, cache, worker or additional runtime service is introduced. Exactly one
  third-party dependency is added, in the web workspace only — the icon library (FR-055) — with its cost
  measured in the plan (FR-058), its icons imported individually so only what is used reaches a build, and
  its licence notice recorded (FR-057). No dependency is added to the service or the database workspace.
- **VII. Honest boundaries:** This feature claims nothing it does not do. Every surface showing sample data
  says so (FR-040); nothing implies liveness, a session, a persisted change or a working business module
  (FR-048); every control that cannot act says why instead of looking operable (FR-047); and the interface
  carries no tax, accounting or compliance claim. The identity rule is part of the same honesty: the
  interface carries NexusERP's own branding and no third party's name, logo, glyph or copied text (FR-046).
  The gallery is where the temptation to imply more is strongest, so its controls change in-memory sample
  state only and persist nothing (FR-068), and every control that looks operable — there and in the shell —
  is checked rather than trusted to act (FR-047, FR-071).
- **VIII. Design system and accessibility:** The design-system master file is updated to this direction
  before anything is built from it and stays the single source of truth, including the shell rules this
  feature changes (FR-001, FR-005). Every value flows through the existing token pipeline and the
  design-value guard keeps passing with no exemption added (FR-003). The PRD section 7.3 UX rules that
  apply here are implemented as acceptance criteria rather than polish: inline field errors, a skeleton
  for every fetch, submit controls disabled with a spinner while working, confirmation dialogs that state
  the consequence, explanatory empty states offering the primary action, status names matching the API,
  a visible total count, and an error panel carrying its request identifier with a retry (FR-021,
  FR-026, FR-028, FR-030, FR-032, FR-033). WCAG 2.1 AA is the bar, with contrast measured and recorded
  and the keyboard walk-through performed rather than asserted (FR-004, FR-044, FR-045). The master file is
  also the record of what the shell offers: it enumerates the sidebar's entries beside the rule that
  decides them, and a single test compares that table with the list the shell renders, so the design system
  cannot describe a sidebar the product does not have (FR-064, FR-065).
- **IX. Scope discipline:** Classified P0 — this is the design foundation, the base components and the
  shell the product requirements place in the first phase, before any business module can be built on
  them, and it is the frame every later feature inherits. Nothing from P1, P2 or P3 is included:
  authentication, a backend, a database, dashboard charts, the Products module, billing, integrations,
  global search, notifications and dark mode are all excluded (FR-048), and where one of them would
  otherwise leave a hole in the shell — search and notifications — the surface is omitted rather than
  stubbed (FR-016, FR-008). Unbuilt modules appear as explicitly unavailable entries, which is the scope
  boundary made visible instead of implied, and the initial contents keep exactly two entries available
  (FR-067). Surfaces that no v1 feature owns — Billing & Subscription, Integrations, Upgrade Plan and
  Help & Support alongside search and notifications — are omitted entirely rather than stubbed, so the
  sidebar lists only what the product intends to build.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every existing test suite still passes with zero failures, and 100% of the components and
  states in the state manifest have a gallery fixture and a test that asserts something specific to that
  state — the percentage computed from the manifest, not counted by hand.
- **SC-002**: The design-value guard fails on a deliberately introduced raw design value and passes once
  it is removed, with both observations recorded.
- **SC-003**: The recorded contrast report lists a measured ratio for 100% of the text, border and focus
  pairs the direction introduces, with every text pair at 4.5:1 or above and every border and focus pair
  at 3:1 or above, and zero failing pair left in the design system.
- **SC-004**: The recorded keyboard walk-through reaches and operates every interactive element of the
  shell using the keyboard alone — each sidebar entry, the organization switcher, the user menu, each page
  header action, each sortable table header, each dialog and its close action, and each toast's dismiss —
  with zero elements unreachable and zero operations requiring a pointing device.
- **SC-005**: The shell shows zero horizontal page scroll at 768px, 1024px, 1440px and wider, and a data
  table wider than its container scrolls inside the container at each of those widths.
- **SC-006**: The Overview and System Health destinations render and behave as they do today, verified by
  their existing tests rather than by inspection.
- **SC-007**: Zero interactive elements in the shell appear operable while performing no action: every one
  either performs the action it names or is exposed as unavailable with a reason.
- **SC-008**: A production build contains neither the gallery route nor the sample record data used only
  by the gallery, and a request for the gallery path there does not render it — checked against the build's
  own output rather than asserted (FR-035, FR-070).
- **SC-009**: 100% of the surfaces that show sample data carry a visible "Sample data" marker — the top
  bar's sample organization and preview user in every build, and the development-only gallery — and the
  number of surfaces showing sample data without a marker is zero. No product page renders sample records.
- **SC-010**: Zero money values exist as floating-point numbers anywhere in the interface, its sample data
  or its fixtures, verified by a test that fails when one is introduced.
- **SC-011**: The component gallery renders 100% of the components and states in the state manifest when
  opened in development — computed from the manifest rather than reviewed by eye.
- **SC-012**: Every mandatory check is green on `main`, including the design-value guard, the existing
  suites and the build.
- **SC-013**: A production build contains only the icons the interface actually uses, the icon dependency's
  measured bundle-size change is recorded in the plan beside the justification for adding it, and the
  library's licence notice appears in the repository's third-party notices.
- **SC-014**: The state-manifest guard fails on a state left without a fixture or without an assertion, and
  passes once it is restored, with both observations recorded.
- **SC-015**: The navigation list in code and the master file's table agree on groups, labels, order and
  states, and a change made in only one of the two is shown failing that comparison, with the sidebar's
  tests passing once both are changed together.
- **SC-016**: Exactly two sidebar entries are available — Overview and System Health — every group holds at
  least one entry, and no omitted surface is rendered in any form, each asserted by a test.
- **SC-017**: The gallery's controls operate on in-memory sample state through the service interface —
  confirming a dialog removes the sample row, a toast names the record it reports, a menu action runs and
  the organization switch changes the active sample organization — nothing persists, and a reload restores
  the initial state, with the gallery carrying the "Sample data" marker.
- **SC-018**: With "Simulate failure" and "Simulate slow response" enabled, the loading state, the error
  state with its request identifier and the simulated 429 handling are each reached and reviewed through a
  real flow rather than a static snapshot, and both switches are labelled in the gallery.
- **SC-019**: Every enabled control in the gallery and in the shell produces an observable change when
  activated — a service call, a DOM change or a navigation — with zero controls that do nothing; the guard
  fails on a control deliberately added with no handler and passes once it is removed, both observations
  recorded.

---

## Assumptions

- The design system master file is amended by this feature rather than replaced. It already defines an
  indigo-blue primary, a pale page background, white card surfaces, a status-badge mapping and a shell
  layout; this feature changes the sidebar's grouping, introduces the visibly unavailable state for
  unbuilt modules, and narrows the sidebar to a compact form at tablet widths, where the master file
  previously kept labels visible and grouped navigation by domain module. Those changes are recorded in
  the master file because that file is the single source of truth (FR-005), not left to the code.
- "No third-party icon set" is read as a constraint on the product's visual identity rather than on its
  dependencies: the interface must not carry another product's name, logo, glyph or copied text, but a
  permissively licensed icon library may be used as a dependency (FR-046, FR-055). One library only — the
  compact sidebar and every icon-only control draw from it — and its icons are taken as generic
  glyphs rather than as a visual language of their own, sized and coloured from the project's tokens. If
  the constraint was meant to forbid any icon dependency at all, FR-055 to FR-058 are the requirements to
  remove, and the compact sidebar's per-entry identifier becomes a monogram drawn from the project's own
  type instead. The library is treated as a fixed choice for this feature in the same way the deployment
  platforms are fixed by their own specification; a licence notice is recorded (FR-057) and the plan
  reports the measured bundle-size change (FR-058).
- The visible status colours come from the design system's existing status mapping, whose names are the
  API's own status names. This feature does not add a status, and the pills it renders in the gallery and
  in sample tables use the existing vocabulary rather than inventing one.
- Money appears only in sample data and in fixtures during this feature — no business module exists to
  produce a real amount — so the decimal-string rule is proven by test rather than by a live screen
  (FR-039). The rule is applied here so that the first module that does produce an amount inherits a code
  base that already refuses floating-point money.
- The service interface is implemented today by sample data and later by the real client. Because no
  backend exists, every operation it exposes is read-only or in-memory, nothing is persisted, and a
  mutation result is never presented as a committed record (FR-037). The interface's shape is the
  contract; the sample implementation is a stand-in, not a data layer.
- The gallery is a development tool, not a product screen. It is grouped with the other development-only
  surfaces, it is excluded from production builds, and it is not linked from the shell (FR-035), so a
  reviewer reaches it by a documented development path rather than through the interface.
- The gallery's controls are demonstrations rather than product behaviour: they mutate only the sample
  implementation's in-memory state through the service interface, so the mutation half of that interface is
  exercised instead of merely declared, and the two demonstration switches change the sample
  implementation's behaviour for the reviewer alone (FR-068, FR-069). Nothing is persisted anywhere — no
  browser storage, no durable write — a reload restores the initial state, and neither a switch nor a
  mutation reaches the shell or a production build.
- No product page shows sample records. The shell's built pages remain Overview and System Health — one
  static, one live — and the only surfaces that show sample data are the top bar's sample organization and
  preview user, present in every build, and the development-only gallery. The data table and its loading,
  empty, sorted and paginated states are therefore reviewed in the gallery rather than on a page, and
  nothing is added to the sidebar to host them: every Management and Settings entry stays in its
  unavailable "Soon" form, and Overview and System Health are untouched (FR-010, FR-040, SC-006, SC-009).
- Desktop and tablet widths are supported from 768px upwards, matching the product requirements and the
  existing layout targets. Phone layouts remain out of scope and no phone breakpoint is added; the
  compact sidebar is a tablet behaviour rather than the beginning of a mobile design.
- The shell's two existing destinations are the only pages this feature builds. Everything else the
  sidebar lists is a module belonging to a later feature, so its entry exists in the unavailable form or
  is omitted when it belongs to no v1 feature at all. The Settings group is therefore expected to consist
  entirely of unavailable entries, which is the honest state rather than a defect.
- No sign-in screen, route or action is created (FR-015). Where a menu entry would need a session, it is
  disabled with an explanation, so the absence of authentication is stated in the interface instead of
  being hidden behind a control that looks as though it would work.
- The recorded evidence this feature owes — the contrast report, the keyboard walk-through, and the
  observed failure and recovery of the design-value guard — lives with the feature's documentation in the
  repository, so a later reader can re-run each one rather than taking the summary on trust.

---

## Notes

This is the feature that decides what every later screen looks like and how honestly it behaves. Its
value is not the two pages it renders; it is that the frame, the tokens and the components arrive
verified — with contrast measured, states enumerated before they are built, and keyboard operation
demonstrated — so the forty screens that follow inherit a foundation instead of a guess.

The most consequential decisions in this specification are about what is left out and how that is
represented. Two of the sidebar's three groups lead nowhere yet, so the unavailable entry is a
first-class state with a label and a reason rather than a broken link. Global search and notifications
are not v1 features, so they are omitted entirely rather than rendered as dead controls — the interface
must not carry a control that looks active and does nothing. Nothing on screen claims to be live: sample
data lives in one place behind one seam, is labelled wherever it appears, and money is a decimal string
so that the first real amount this product displays cannot be a floating-point number.

The plan and the tasks that follow must carry these boundaries into the master file, the components and
the recorded evidence rather than softening them, and the design system change must land before the
components that consume it.
