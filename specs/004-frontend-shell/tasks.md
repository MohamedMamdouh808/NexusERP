---

description: "Task list for the frontend design foundation and application shell"
---

# Tasks: Frontend Design Foundation and Application Shell

**Input**: Design documents from `/specs/004-frontend-shell/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md) (user stories + priorities), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: MANDATORY for this project (Constitution Principle V, spec FR-050). Every user story
includes its tests, written first and observed failing before the implementation.

**Mandatory task types** (Constitution Principles I–VI, VIII, IX) — applicability to this
feature, which adds no endpoint, no table and no persistence:

| Mandatory type | Applies here? | Frontend equivalent in this list |
|---|---|---|
| Tenant-isolation test | **No** — no endpoint, report, export or table is added | The sample organization is labelled sample and derives no scope (T021, T026) |
| Permission declaration + default-deny test | **No** — no endpoint | Each navigation entry keeps its future permission as recorded intent only (T024) |
| Idempotency + duplicate-request + 422 tests | **No** — no posting endpoint | — |
| Transaction-rollback test | **No** — no multi-record write | The sample mutation writes nothing durable (T014, T015) |
| Concurrency test | **No** — no stock, shipment or allocation | — |
| Decimal calculation vectors | **Reduced** — no arithmetic is performed | Money is a decimal string and a test fails on a numeric money value (T013, T016, SC-010) |
| Immutability test | **No** — no posted record exists | — |
| Audit-record test | **No** — no business change commits | — |
| UX and accessibility tasks | **Yes** | Design tokens (T010, T011, T032–T037), PRD §7.3 states (T038–T053, T080), WCAG 2.1 AA (T066–T074) |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`–`[US5]`, mapping to the user stories in [spec.md](spec.md)
- Every task names the exact file it touches

## Path Conventions

This feature is the `frontend` workspace of the npm-workspaces monorepo. All application paths
are relative to the repository root; there is no backend change.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baseline and the two delivery changes (one dependency, self-hosted
fonts) before anything is built on them.

- [X] T001 Run the existing frontend gate set — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` in `frontend/` — and record the green baseline in `specs/004-frontend-shell/evidence/bundle-size.md`, including the current production JS/CSS sizes (FR-049, R-012)
- [X] T002 [P] Add `lucide-react` to `dependencies` in [frontend/package.json](file:///d:/web-projects/NexusERP/frontend/package.json) as the single permitted icon library (FR-055, R-001)
- [X] T003 [P] Add self-hosted WOFF2 assets — Fira Sans 400/500/600/700 and Fira Code 400/500/600/700 — under `frontend/public/fonts/`, each with its licence, implementing [research.md](research.md) R-002
- [X] T004 Replace the remote Google Fonts `@import` in [frontend/src/styles/app.css](file:///d:/web-projects/NexusERP/frontend/src/styles/app.css) with `@font-face` declarations pointing at `public/fonts/`, keeping `font-display: swap` (R-002, FR-046)
- [X] T005 Create `frontend/scripts/check-no-gallery-in-build.ts` — scans `dist/assets/*.js` for the gallery marker string and exits non-zero when it is present (FR-070, R-005)
- [X] T006 [P] Record the licences of the icon library (ISC) and the two typefaces (SIL OFL 1.1) in the repository's third-party notices file, creating `frontend/THIRD-PARTY-NOTICES.md` if none exists (FR-057)
- [X] T007 [P] Wire the guard scripts into [frontend/package.json](file:///d:/web-projects/NexusERP/frontend/package.json): `check:design-values` (existing guard) and `check:no-gallery` (T005) into the build/CI path (FR-051, FR-070)
- [X] T008 [P] Confirm [frontend/vitest.config.ts](file:///d:/web-projects/NexusERP/frontend/vitest.config.ts) and `tsconfig.json` `include` scopes cover `src/dev/**`, `src/services/**`, `src/mocks/**` and `scripts/**` so the new suites run (monorepo typecheck hazard, [project memory])

**Checkpoint**: Baseline green, one dependency added, fonts served from the app's own origin, guard entry points in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The design system, the token pipeline, the measured contrast record, the service
seam and the state manifest. Every user story builds on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 Amend [design-system/nexuserp/MASTER.md](file:///d:/web-projects/NexusERP/design-system/nexuserp/MASTER.md) **before any component is built**: the direction (pale blue-grey page, white rounded surfaces, indigo-blue primary, pale-blue active pill, top bar, page header, coloured status pills), the three sidebar groups General/Management/Settings, the visibly unavailable entry state with a "Soon" label and a reason, the compact tablet sidebar, self-hosted typography, and the plain navigation table of group/label/state (FR-001, FR-005, FR-064; [contracts/navigation-list.md](contracts/navigation-list.md))
- [X] T010 [P] Transcribe the direction's values into [frontend/src/styles/tokens.css](file:///d:/web-projects/NexusERP/frontend/src/styles/tokens.css) — the only file permitted a raw value — and bridge them through the Tailwind 4 theme in [frontend/src/styles/app.css](file:///d:/web-projects/NexusERP/frontend/src/styles/app.css) (FR-003, [contracts/design-tokens.md](contracts/design-tokens.md), R-003)
- [X] T011 [P] Measure every text-on-background, border-on-surface and focus-ring-on-surface pair the direction introduces — including the active pill and each status tint — and write `specs/004-frontend-shell/evidence/contrast-report.md` with the computed ratio, the requirement and the result for each (FR-004, FR-052, SC-003, R-009)
- [X] T012 Create the service interface in `frontend/src/services/catalog-service.ts` exactly as [contracts/service-interface.md](contracts/service-interface.md) specifies — asynchronous list/detail/mutation, money as a decimal string, types from `@nexuserp/shared` where a contract exists (FR-036, FR-037, FR-038)
- [X] T013 [P] Create the sample data in `frontend/src/mocks/sample-data.ts`, every money value a decimal string and every status an API status name verbatim (FR-039, FR-022)
- [X] T014 Implement `frontend/src/services/sample-catalog-service.ts` over module-scoped in-memory state with the `simulateFailure` and `simulateSlowResponse` switches, the 429 path reusing the existing `isRateLimited`/`Retry-After` handling, and the call log the guard reads (FR-037, FR-069, R-007; depends on T012, T013)
- [X] T015 [P] Contract test for the service interface in `frontend/src/services/__tests__/catalog-service.spec.ts` — list returns a page and a total, detail returns a record, a mutation resolves without presenting a committed record, and nothing is written to any browser storage (FR-037, FR-068)
- [X] T016 [P] Test in `frontend/src/mocks/__tests__/money-decimal.spec.ts` that every money value in the sample data and in the gallery fixtures (`frontend/src/dev/gallery/fixtures.ts`) is a decimal string and that a numeric money value fails it (FR-039, SC-010)
- [X] T017 Create the state manifest in `frontend/src/dev/gallery/state-manifest.ts` as nested `Record`s keyed by each component's state union, one entry per state the specification's matrix declares — the Badge row expanding to one entry per status name in `BadgeStatus` — each carrying its fixture slot and the assertion its test will make (FR-059, [contracts/state-manifest.md](contracts/state-manifest.md))

**Checkpoint**: Master file amended, tokens in place, contrast measured, the seam and the sample implementation working, the manifest typed. User stories can begin.

> **Note — T016 and the gallery fixtures.** T016 asks for the money check to cover `src/dev/gallery/fixtures.ts`, which T055 creates. The fixtures half of the suite therefore discovers the module with `import.meta.glob` and walks every money-shaped value it finds, so it needs no second edit when T055 lands: until then the discovered set is empty and the sample-data half is the one carrying FR-039. The suite's own negative control (a numeric money value nested inside a fixture) is live now and proves the walk catches what it is meant to catch.

---

## Phase 3: User Story 1 — A Shell That Can Be Walked Through and Never Lies (Priority: P1) 🎯 MVP

**Goal**: A real application frame — grouped sidebar, top bar naming the organization and the
person, content area with a page header and breadcrumb — where every visible module is either a
working destination or visibly unavailable with its reason.

**Independent Test**: Open the product, move between Overview and System Health, confirm the
current destination is highlighted and announced, confirm every unbuilt module reads as
unavailable with its reason, and confirm no element of the shell appears operable while doing
nothing.

> **NOTE**: The sidebar and top bar import primitives from US3. Either complete US3's primitives
> first, or land them as US1's integration tasks reach them; US1's tests do not depend on US3's
> gallery.

### Tests for User Story 1 (MANDATORY — write first, observe failure) ⚠️

- [X] T018 [P] [US1] Test in `frontend/src/components/shell/__tests__/navigation-master-file.spec.ts` that `NAVIGATION`'s groups, labels, order and states match the master file's table; run it once with an entry flipped on one side only and record the failure, then restore ([contracts/navigation-list.md](contracts/navigation-list.md), FR-065, SC-015)
- [X] T019 [P] [US1] Test in `frontend/src/app/__tests__/router.spec.tsx` that every `available` entry's path resolves to a route and that Overview and System Health reach their existing screens (FR-007, FR-010)
- [X] T020 [P] [US1] Test in `frontend/src/components/shell/__tests__/sidebar.spec.tsx` that the sidebar renders three labelled groups, that exactly one entry carries `aria-current="page"`, that a `Soon` entry cannot be activated by pointer or keyboard and exposes its reason (FR-006–FR-009), and that exactly two entries are `available` (Overview and System Health), every group holds at least one entry, and none of the omitted surfaces — Billing & Subscription, Integrations, Upgrade Plan, Help & Support, global search, notifications — is rendered in any form (FR-006, FR-067, SC-016)
- [X] T021 [P] [US1] Test in `frontend/src/components/shell/__tests__/top-bar.spec.tsx` that the organization and the person are labelled as sample, are not presented as records, that neither is carried in a URL or query string, and that the user menu's authenticated-only entries are disabled with an explanation while no control implies a session exists (FR-013–FR-015, FR-040)
- [X] T022 [P] [US1] Test in `frontend/src/components/shell/__tests__/page-header.spec.tsx` that the title sits left and the primary action right, that a description and secondary actions render, that a page with no primary action leaves the right side empty, and that the breadcrumb reflects the current destination and renders no link for a destination that does not exist (FR-017, FR-018)
- [X] T023 [P] [US1] Every-enabled-control guard for the shell in `frontend/src/components/shell/__tests__/every-control.spec.tsx` — activates each enabled control and fails when nothing observable changes; run it once with a button added that has no handler, record the failure, then remove it (FR-071, SC-019)

### Implementation for User Story 1

- [X] T024 [US1] Create the one typed navigation list in `frontend/src/components/shell/navigation.ts` with the twelve entries of the navigation table, the `permission` field as recorded intent only, and the reason each `Soon` entry carries (FR-064, FR-067, FR-015). Labels are copied verbatim from the table, so the existing `System health` label becomes `System Health` (FR-064)
- [X] T025 [US1] Implement the sidebar in `frontend/src/components/shell/sidebar.tsx` — three groups, the active pill on the current destination, `Soon` entries rendered unavailable with a tooltip reason and no activation path (FR-006–FR-009; depends on T024)
- [X] T026 [US1] Implement the top bar in `frontend/src/components/shell/top-bar.tsx` — the organization switcher and the preview user menu, both reached through the service seam and both labelled sample, the "Sample data" marker, and the user menu's authenticated-only entries rendered disabled with an explanation that authentication is not part of this feature, with no sign-in route, sign-out action or session-implying control anywhere (FR-013–FR-015, FR-040, FR-041)
- [X] T027 [P] [US1] Implement the page header and breadcrumb in `frontend/src/components/shell/page-header.tsx` and `frontend/src/components/shell/breadcrumb.tsx` (FR-017, FR-018)
- [X] T028 [US1] Implement the shell frame in `frontend/src/components/shell/app-shell.tsx` — sidebar, top bar and the content area that renders the routed page inside the page header (FR-002; depends on T025, T026, T027)
- [X] T029 [US1] Wire the shell and the gallery-aware route table in [frontend/src/app/router.tsx](file:///d:/web-projects/NexusERP/frontend/src/app/router.tsx), keeping Overview at `/` and System Health at `/health` working and the unknown-path fallback intact (FR-010, SC-006)
- [X] T030 [US1] Retire `frontend/src/components/shell/nav-items.ts` and move its callers onto `navigation.ts`, so one typed list is the single source (FR-064, FR-065). The callers include `sidebar.tsx` and `frontend/src/components/shell/__tests__/no-business-controls.spec.tsx`, whose assertions must be rewritten in the same task because they expect exactly `['/', '/health']` and reject any label matching `\bcustomers\b` — both violated by the twelve-entry navigation — so the existing gate passes for the new reason (FR-049)
- [X] T031 [US1] Apply the shared page header and the shell to the Overview and System Health pages, leaving both destinations' behaviour unchanged (FR-010, FR-054, R-013)

**Checkpoint**: The shell is walkable and honest on its own; US1 is independently testable and demonstrable.

---

## Phase 4: User Story 2 — One Visual Language, Verified (Priority: P1)

**Goal**: The direction is applied and provably single-sourced: every value arrives through the
token pipeline, contrast is measured rather than assumed, and the guard is shown to catch a raw
value.

**Independent Test**: Read the amended master file and the contrast report, then introduce a raw
design value and confirm the guard fails naming the location, and passes once it is removed.

### Tests for User Story 2 (MANDATORY — write first, observe failure) ⚠️

- [X] T032 [P] [US2] Test in `frontend/src/styles/__tests__/tokens.spec.ts` that every token the direction introduces exists in `tokens.css` and is recorded in the master file, so a token added on one side only fails (FR-005, [contracts/design-tokens.md](contracts/design-tokens.md))
- [X] T033 [P] [US2] Extend `frontend/scripts/__tests__/no-raw-design-values.spec.ts` and assert the guard still catches a raw colour, spacing, radius, shadow and type value with no new exemption added (FR-051, SC-002)

### Implementation for User Story 2

- [X] T034 [US2] Apply the direction to the shell's own surfaces — pale blue-grey page background, white rounded sidebar and top bar with subtle borders and shadows, indigo-blue primary, pale-blue active pill — using token-backed classes only (FR-003)
- [X] T035 [US2] Map the design system's status colours to the badge status names so the status pills in tables use the API's names verbatim and are never conveyed by colour alone (FR-022, FR-044)
- [X] T036 [US2] Deliberately introduce a raw hex colour into a shell component, run `npm run check:design-values`, record the failing output in `specs/004-frontend-shell/evidence/design-value-guard-observations.md`, then remove it and record the passing run in the same file (FR-051, SC-002, quickstart.md)
- [X] T037 [US2] Confirm every new token is registered with Tailwind 4 in [frontend/src/styles/app.css](file:///d:/web-projects/NexusERP/frontend/src/styles/app.css) and remove any residual raw value a component still carries (FR-003, SC-002)

**Checkpoint**: The direction is applied and the pipeline is verified end to end; US2 is independently reviewable against the master file and the contrast report.

---

## Phase 5: User Story 3 — Every Component Exists in Every State, and Can Be Seen (Priority: P1)

**Goal**: The whole primitive set exists in every declared state and can be reviewed in a
development-only gallery that never reaches a production build.

**Independent Test**: Open the gallery in development and confirm every component and state
renders; then build for production and confirm the gallery route and its data are absent.

### Tests for User Story 3 (MANDATORY — write first, observe failure) ⚠️

- [ ] T038 [P] [US3] State tests for Button in `frontend/src/components/ui/__tests__/button.spec.tsx` — default, hover and active by applied token class, focus-visible, loading (busy, non-activatable) and disabled (FR-020, FR-050)
- [ ] T039 [P] [US3] State tests for the form controls in `frontend/src/components/ui/__tests__/form-controls.spec.tsx` — Input, Select, Textarea, Checkbox: default, focus-visible, filled or selected, required, with help text, invalid with a programmatically associated inline error, and disabled (FR-021, FR-050)
- [ ] T040 [P] [US3] State tests for Badge and Card in `frontend/src/components/ui/__tests__/badge-card.spec.tsx` — every status name rendering with its text visible, and the card's title, description and actions (FR-022, FR-023, FR-050)
- [ ] T041 [P] [US3] State tests for the data table in `frontend/src/components/ui/__tests__/data-table.spec.tsx` — loading skeleton rows, empty, with rows, sorted ascending and descending exposing the column and direction to a non-visual reader, and server-side page/pageSize/total/sort props (FR-024–FR-026, FR-050)
- [ ] T042 [P] [US3] State tests for Dialog and ConfirmDialog in `frontend/src/components/ui/__tests__/dialog.spec.tsx` — open, Escape closes, focus moves in and is trapped, focus returns to the opener, and the confirm variant names the action and states its consequence with a distinct destructive action (FR-027, FR-028, FR-050)
- [ ] T043 [P] [US3] State tests for the dropdown menu in `frontend/src/components/ui/__tests__/dropdown-menu.spec.tsx` — closed, open, entry unavailable with its reason, Escape closes returning focus to the trigger, outside interaction closes, and only one menu open at a time (FR-029, FR-050)
- [ ] T044 [P] [US3] State tests for the toast in `frontend/src/components/ui/__tests__/toast.spec.tsx` — success, failure and informational, each naming its subject, dismissible, and announced without taking focus (FR-030, FR-050)
- [ ] T045 [P] [US3] State tests for the remaining components in `frontend/src/components/ui/__tests__/feedback.spec.tsx` — Skeleton default and reduced motion, EmptyState with and without the primary create action, ErrorState retryable and not retryable with the request identifier (FR-031–FR-033, FR-050)
- [ ] T046 [P] [US3] State-manifest guard in `frontend/src/dev/gallery/__tests__/state-manifest.guard.spec.ts` — fails when a manifest state has no fixture or no state-specific assertion; run it once against a state with no fixture, record the failure, then restore (FR-061, SC-014)
- [ ] T047 [P] [US3] Manifest-versus-specification test in `frontend/src/dev/gallery/__tests__/state-manifest-matrix.spec.ts` — the manifest's component and state set equals the matrix in [spec.md](spec.md), and the test computes and prints the SC-001 and SC-011 percentages from the manifest so those counts come from the check rather than from a hand count; a divergence fails (FR-060, FR-062, SC-001, SC-011)
- [ ] T048 [P] [US3] Gallery test in `frontend/src/dev/gallery/__tests__/gallery.spec.tsx` — renders every component and every state in the manifest, and the gallery carries the "Sample data" marker (FR-034, FR-068)

### Implementation for User Story 3

- [ ] T049 [P] [US3] Implement the form primitives in `frontend/src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx`, using only token-backed classes (FR-019–FR-021)
- [ ] T050 [P] [US3] Implement the display primitives in `frontend/src/components/ui/badge.tsx`, `card.tsx`, `data-table.tsx` (FR-022–FR-026)
- [ ] T051 [P] [US3] Implement the overlay primitives in `frontend/src/components/ui/dialog.tsx`, `confirm-dialog.tsx`, `dropdown-menu.tsx` (FR-027–FR-029)
- [ ] T052 [P] [US3] Implement the feedback primitives in `frontend/src/components/ui/toast.tsx`, `skeleton.tsx`, `empty-state.tsx`, `error-state.tsx` (FR-030–FR-033)
- [ ] T053 [P] [US3] Implement the icons layer in `frontend/src/components/ui/icon.tsx` — per-icon `lucide-react` imports, token-derived size, `currentColor`, decorative icons hidden from assistive technology, and an accessible name plus tooltip on every icon-only control (FR-055, FR-056)
- [ ] T054 [US3] Replace the existing `frontend/src/components/ui/index.tsx` with the barrel `frontend/src/components/ui/index.ts` exporting the whole set in one place, and migrate every existing consumer — `frontend/src/features/health/health-panel.tsx` and the health suites — off the old `Card` / `StatusBadge` / `Skeleton` exports onto the new primitives, so the new `Badge` supersedes `StatusBadge` and no second barrel remains (plan structure decision; FR-019, FR-049, FR-054; depends on T049–T053)
- [ ] T055 [US3] Create the gallery fixtures in `frontend/src/dev/gallery/fixtures.ts`, typed against the manifest so a missing fixture is a type error (FR-059, FR-061)
- [ ] T056 [US3] Implement the gallery in `frontend/src/dev/gallery/gallery-route.tsx` — every component in every state, the demonstration switches wired to the sample implementation, and the "Sample data" marker (FR-034, FR-068, FR-069)
- [ ] T057 [US3] Register the gallery route in [frontend/src/app/router.tsx](file:///d:/web-projects/NexusERP/frontend/src/app/router.tsx) inside a development-only guard with a dynamic import, so dead-code elimination removes it from a production build (FR-035, R-005; depends on T029, T056)
- [ ] T058 [US3] Every-enabled-control guard for the gallery in `frontend/src/dev/gallery/__tests__/every-control.spec.tsx`, exempting disabled controls (FR-071, SC-019)
- [ ] T059 [US3] Run `npm run build` then `npm run check:no-gallery` and record the result in `specs/004-frontend-shell/evidence/gallery-absent-from-build.md`, proving the gallery route and its data are absent (FR-035, FR-070, SC-008)

**Checkpoint**: The component set is complete and reviewable, and the gallery is provably absent from production.

---

## Phase 6: User Story 4 — Sample Data That Never Pretends to Be Live (Priority: P2)

**Goal**: Every value that is not real is either labelled sample or not on screen; all sample
data sits behind the one seam; money is never a float.

**Independent Test**: Trace every rendered value to its source and confirm sample values are
labelled where they appear, reachable only through the seam, and never floating-point money.

### Tests for User Story 4 (MANDATORY — write first, observe failure) ⚠️

- [ ] T060 [P] [US4] Test in `frontend/src/components/__tests__/no-direct-sample-imports.spec.ts` that no component imports from `src/mocks` and every component's data arrives through the service interface (FR-036)
- [ ] T061 [P] [US4] Test in `frontend/src/components/__tests__/sample-data-markers.spec.tsx` that each surface showing sample data — the top bar's organization and preview user, and the gallery — carries a visible "Sample data" marker, and that no product page renders sample records (FR-040, FR-041, SC-009)
- [ ] T062 [P] [US4] Test in `frontend/src/components/__tests__/no-liveness-claims.spec.tsx` that the interface contains no liveness wording — no "updated just now", no real-time phrasing, no liveness indicator (FR-040)

### Implementation for User Story 4

- [ ] T063 [US4] Verify — rather than re-implement — that the top bar's sample organization and preview user, reached through the seam in T026, come from the service interface and are not written into the interface, and record the trace as evidence (FR-041; depends on T026)
- [ ] T064 [US4] Add the visible "Sample data" marker to every surface that shows sample data, in the direction's own visual language (FR-040; depends on T026, T056)
- [ ] T065 [US4] Verify every type that the shared package already defines is imported from `@nexuserp/shared` and not restated locally in `frontend/src/services/` or `frontend/src/mocks/` (FR-038)

**Checkpoint**: Nothing on screen claims to be live; the seam holds; money is a string.

---

## Phase 7: User Story 5 — Usable Without a Mouse, at the Supported Widths (Priority: P2)

**Goal**: The whole shell is keyboard-operable with visible focus, the sidebar narrows on a
tablet without losing meaning, no supported width scrolls sideways, and reduced motion is
honoured.

**Independent Test**: Perform the recorded keyboard walk-through with no pointing device, check
the compact sidebar's accessible names, and open the shell at 768px, 1024px and 1440px looking
for horizontal page scroll.

### Tests for User Story 5 (MANDATORY — write first, observe failure) ⚠️

- [ ] T066 [P] [US5] Test in `frontend/src/components/shell/__tests__/keyboard.spec.tsx` that every interactive element of the shell is reachable in visual order by keyboard alone with focus never invisible (FR-044, FR-045)
- [ ] T067 [P] [US5] Test in `frontend/src/components/shell/__tests__/compact-sidebar.spec.tsx` that in the compact form each entry keeps its accessible name, its group and its availability, and the current destination stays identifiable (FR-011, FR-044)
- [ ] T068 [P] [US5] Playwright test in `frontend/e2e/responsive.spec.ts` that no supported width (768px, 1024px, 1440px) produces horizontal page scroll and a wide table scrolls inside its container (FR-042, FR-043, SC-005)
- [ ] T069 [P] [US5] Test in `frontend/src/components/ui/__tests__/reduced-motion.spec.tsx` that with a reduced-motion preference every animation — skeleton, dialog, dropdown — is not played and the component's meaning survives as a static state (FR-044, FR-031)
- [ ] T070 [P] [US5] Test in `frontend/src/components/ui/__tests__/status-not-colour-only.spec.tsx` that each status pill conveys its status by text as well as colour (FR-022, FR-044)

### Implementation for User Story 5

- [ ] T071 [US5] Implement the compact tablet sidebar as a width-driven media query in `frontend/src/components/shell/sidebar.tsx`, with a visually hidden label plus a tooltip per entry and no toggle control (FR-011, R-010; depends on T025)
- [ ] T072 [US5] Implement reduced-motion handling for every animation and transition the feature introduces, using the token-defined motion values (FR-044, FR-031)
- [ ] T073 [US5] Constrain the data table to scroll inside its own container and align numeric columns with tabular figures, so no width produces page-level horizontal scroll (FR-026, FR-043)
- [ ] T074 [US5] Record the keyboard walk-through in `specs/004-frontend-shell/evidence/keyboard-walkthrough.md` — each interactive element and the result of operating it from the keyboard (FR-045, FR-053, SC-004)

**Checkpoint**: The shell is operable and readable at every supported width, from the keyboard alone.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature as a whole against the specification's success criteria and
leave the evidence the spec requires.

- [ ] T075 Run the full local gate set in `frontend/` — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:design-values`, `npm run check:no-gallery` — and confirm every existing suite still passes (FR-049, FR-054)
- [ ] T076 Confirm the critical-path coverage threshold (80%) is met in the CI report and that no suite was skipped, weakened or marked pending (Principle V, FR-050)
- [ ] T077 [P] Write the measured bundle-size delta — JS, CSS and font assets, before and after — into `specs/004-frontend-shell/evidence/bundle-size.md` (FR-058, SC-013, R-012)
- [ ] T078 [P] Re-check the cross-artifact agreements in one pass: the specification's matrix, `state-manifest.ts`, `NAVIGATION`, and the master file's navigation table all agree (FR-062, FR-065)
- [ ] T079 [P] Confirm the Configuration and honesty sweep: no authentication, session, chart, dark theme, search, notification, billing or integration surface exists, and no omitted navigation surface is rendered in any form (FR-048, FR-067, Principle IX)
- [ ] T080 [P] Confirm the accessibility and UX-rule review against PRD §7.3 and WCAG 2.1 AA: skeleton on every fetch, disabled-and-spinner submit, inline field errors, dismissible error banner carrying the `requestId`, error panel with Retry, success toast naming the record, confirmation dialog stating the consequence, explanatory empty states with a primary create action, API status names, server-side pagination with a visible total count (Principle VIII)
- [ ] T081 Run [quickstart.md](quickstart.md) end to end — dev server, gallery review with both demonstration switches, the four deliberately-failing guards, and the build-output check — and confirm each step behaves as documented
- [ ] T082 Remove the deliberately introduced demo defects (the unhandled button and the raw design value) if any remain, and confirm the guards pass without them (FR-051, FR-071)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–7)**: all depend on Foundational
- **Polish (Phase 8)**: depends on every story being complete

### User Story Dependencies

- **US1 (P1) — shell**: depends on Foundational. Its implementation imports the primitives from US3, so either complete US3 first or land the primitives as US1 reaches them. Its tests do not depend on US3's gallery.
- **US2 (P1) — visual language**: depends on Foundational. Independent of US1's structure, though it is applied to the shell's surfaces.
- **US3 (P1) — components and gallery**: depends on Foundational. Independent of US1 and US2; the gallery is reviewable with no shell around it.
- **US4 (P2) — sample-data honesty**: depends on Foundational and, for its implementation tasks, on T026 (top bar) and T056 (gallery).
- **US5 (P2) — keyboard and responsive**: depends on Foundational and, for the compact sidebar, on T025.

### Within Each User Story

- Tests are written first and observed failing (Principle V, FR-050)
- The guard tests are additionally run once with the defect present, and the failure recorded
- Primitives before the components that compose them; the manifest before its fixtures; fixtures before the gallery

### Parallel Opportunities

- Setup: T002, T003, T005, T006, T007, T008 are independent files
- Foundational: T010, T011, T013, T015, T016 are independent; T014 depends on T012 and T013
- US1 tests T018–T023 are all `[P]`; US1 implementation T027 is independent of T025/T026
- US3 tests T038–T048 are all `[P]`; US3 implementations T049–T053 are all `[P]`
- US4 tests T060–T062 are all `[P]`; US5 tests T066–T070 are all `[P]`
- Polish T077–T080 are all `[P]`

---

## Parallel Example: User Story 3

```bash
# Launch every state test together (tests are mandatory and independent files):
Task: "State tests for Button in frontend/src/components/ui/__tests__/button.spec.tsx"
Task: "State tests for the form controls in frontend/src/components/ui/__tests__/form-controls.spec.tsx"
Task: "State tests for the data table in frontend/src/components/ui/__tests__/data-table.spec.tsx"

# Launch the primitive implementations together (different files, no dependencies):
Task: "Implement the form primitives in frontend/src/components/ui/{button,input,select,textarea,checkbox}.tsx"
Task: "Implement the display primitives in frontend/src/components/ui/{badge,card,data-table}.tsx"
Task: "Implement the overlay primitives in frontend/src/components/ui/{dialog,confirm-dialog,dropdown-menu}.tsx"
Task: "Implement the feedback primitives in frontend/src/components/ui/{toast,skeleton,empty-state,error-state}.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks every story)
3. Complete the primitives US1 needs (from US3), then Phase 3: US1
4. **STOP and VALIDATE**: walk the shell, confirm the honest-unavailable rule and the route guard
5. Demo the navigable frame

### Incremental Delivery

1. Setup + Foundational → the design system, tokens, contrast record, seam and manifest are ready
2. US1 → an honest, walkable shell (MVP)
3. US2 → the visual direction applied and verified
4. US3 → the full component set and the reviewable gallery
5. US4 → every sample-data claim labelled
6. US5 → keyboard and responsive completeness
7. Polish → evidence, gates and the cross-artifact agreements

### Notes

- `[P]` marks different files with no dependency on an incomplete task
- Commit after each task or logical group; the project works on a single `main` branch
  (see the resolved decision below)
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, two tasks editing the same file, and any change that would require an
  exemption from the design-value guard

### Resolved decision — branch workflow (raised by `/speckit.analyze`, finding C1)

**Status: RESOLVED — Option 2, by the constitution amendment to 1.1.0 (2026-10-20).**

The specification and plan assume a `main`-only workflow, while the constitution's Development
Workflow section as ratified required branches named `NNN-feature-name`. That contradiction is
settled in favour of the workflow this feature already assumes: the constitution's new
"Branch Workflow and What It Means for Deployment" subsection records that all work lands
directly on `main`, that no feature branch is created, and that a feature is identified by its
Spec Kit feature directory, selected through `.specify/feature.json`. The related consequence —
staging deploys are not gated by CI checks — is recorded there too, and the contrary claims in
the README, the staging runbook and the `003-staging-deployment` artifacts are corrected.

Two pieces of tooling still contradict the amended section and must be brought into line before
every `/speckit.*` command works again; both are recorded in the amendment's sync report:

- `.specify/scripts/powershell/common.ps1` — `Test-FeatureBranch` (reached through
  `check-prerequisites.ps1` and `setup-plan.ps1`) exits 1 on `main`.
- `.specify/extensions.yml` — the `before_specify` hook runs `speckit.git.feature`, which
  creates a feature branch.

Neither is this feature's to change, and no task below depends on them: the tasks name their
files explicitly and do not re-run the branch check.
