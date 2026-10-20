# Research: Frontend Design Foundation and Application Shell

Phase 0 decisions for `/speckit.plan`. Each entry records the decision, why it was
chosen, and what was rejected. No entry is left as NEEDS CLARIFICATION.

---

## R-001 — Icon library: `lucide-react`, imported per icon

**Decision.** Add **one** dependency, `lucide-react` (ISC licence), and import icons by name
(`import { Menu, X } from 'lucide-react'`). Size and colour come from the design tokens: the
component sets `width`/`height` from a `--space-*`-derived token and inherits `currentColor`,
so no icon carries a raw value and the design-value guard keeps passing (FR-055).

**Rationale.** The spec permits exactly one permissively licensed icon library and names Lucide
(FR-055, clarification 2). `lucide-react` is ESM and side-effect-free, so Rollup/Vite
tree-shakes unused icons from a named import; per-icon imports make the guarantee independent
of the bundler's analysis. The licence is permissive and recordable in the repository's
third-party notices (FR-057).

**Alternatives rejected.** Heroicons (named in the master file's anti-pattern list, but
Lucide is the one the clarification selected — mixing both would create two visual
languages); Simple Icons (brand marks, not UI glyphs); drawing every glyph by hand (the
monogram fallback the spec keeps only as a contingency if the library is disallowed).

**Verification.** Measure the production bundle before and after with the build output's
reported sizes and record the delta (FR-058, SC-013). Confirm unused icons are absent by
searching the built chunk for a deliberately unused icon's path data.

---

## R-002 — Self-hosted fonts, no third-party request at runtime

**Decision.** Replace the remote Google Fonts `@import` in `frontend/src/styles/app.css` with
self-hosted **WOFF2** files under `frontend/public/fonts/`, declared with `@font-face` and
`font-display: swap`. Serve the weights the design system actually uses — **Fira Sans**
400/500/600/700 for UI text and **Fira Code** 400/500/600/700 for identifiers and figures.
`--font-ui` and `--font-mono` in `tokens.css` keep their current values; only the delivery
changes.

**Rationale.** A `@import` to `fonts.googleapis.com` makes the interface depend on a third
party at runtime, leaks a request to that party, and fails when the network or the CDN does.
Self-hosting keeps the whole interface on one origin (matching the established single-origin
rule for `/api`), works offline in development, and matches the project's rule that its
identity is its own. The faces are SIL OFL 1.1, so redistribution and self-hosting are
permitted and the licence goes in the third-party notices.

**Alternatives rejected.** Keeping the Google Fonts import (third-party runtime dependency,
inconsistent with the single-origin decisions in `vite.config.ts`); a system-font stack
(would change the visual direction the master file fixes); `@fontsource/*` npm packages (they
are self-hosting too, but they add eight npm dependencies where committing the WOFF2 files
adds none — the spec's "justify every new dependency" makes the zero-dependency path the better
one).

**Consequence.** `design-system/nexuserp/MASTER.md` records the change: its "Google Fonts"
line and CSS import are replaced by the self-hosted declaration, because the master file is
the single source of truth for typography (FR-005). The added asset weight is measured and
reported alongside the icon delta (FR-058).

---

## R-003 — Counting the assets: no system fonts fallback chain change

**Decision.** Keep `--font-ui: "Fira Sans", system-ui, sans-serif` and
`--font-mono: "Fira Code", ui-monospace, monospace` exactly as `tokens.css` has them. The
`system-ui`/`ui-monospace` fallbacks remain the safety net for a failed font fetch, and
because they are already inside the token file they are not raw values.

**Rationale.** Self-hosting changes where the file comes from, not what the type stack is. No
token value changes, so no contrast or layout re-verification is triggered by R-002.

---

## R-004 — The state matrix becomes one machine-readable manifest

**Decision.** One module, `frontend/src/dev/gallery/state-manifest.ts`, exports the manifest as
a `Record` keyed by a component key, whose value is a `Record` keyed by that component's state
union. Because both levels are `Record<Union, …>` rather than arrays, TypeScript fails the build
when a component or a state is added to the union without a matching fixture and test entry
(FR-059).

**Rationale.** The spec's clarification 3 chose the authority-plus-checked-twin pattern: the
matrix in `spec.md` is the authority, the manifest is the checked twin, and the fixtures and
tests are typed against it. A `Record` gives exhaustiveness at compile time, which is stronger
than a guard test alone — the guard then adds the runtime assertion that each entry has a
non-trivial test (FR-061).

**Alternatives rejected.** An array of `{ component, states }` (no compile-time exhaustiveness);
a JSON file (no type checking); deriving the manifest from tests (circular — the tests are what
must be checked).

**Verification.** FR-061's guard test reads the manifest and fails when an entry has no fixture
or no state-specific assertion; it is shown failing on purpose, then passing. FR-060 makes
SC-001 and SC-011 compute their percentages from the manifest.

---

## R-005 — The gallery is a development-only route, proven absent from a production build

**Decision.** Register the gallery route inside a `if (import.meta.env.DEV)` branch that
statically references a dynamic import of `frontend/src/dev/gallery/gallery-route.tsx`. Vite
replaces `import.meta.env.DEV` with `false` in a production build, dead-code elimination drops
the branch and the dynamic import with it. Prove it with a **build-output check**:
`frontend/scripts/check-no-gallery-in-build.ts` scans `dist/assets/*.js` for a unique gallery
marker string and fails if it is present (FR-070). Wire it into the frontend build step and CI.

**Rationale.** The spec forbids the gallery route and its data in a production build and
requires the check to read the build output rather than the source (FR-035, FR-070). A marker
scan of `dist/` is the only check that observes what actually shipped.

**Alternatives rejected.** Relying on the DEV branch alone (asserts intent, does not observe the
artifact); a separate Vite entry (more build configuration than one invisible route needs).

**Consequence.** The manifest and fixtures live with the gallery under `dev/gallery/`, so
everything that must not ship sits on one path (FR-063).

---

## R-006 — The every-enabled-control guard

**Decision.** A harness test (`frontend/src/components/ui/__tests__/every-control.spec.tsx`,
plus a shell counterpart) renders the gallery and the shell, enumerates every enabled control
from the DOM, and for each one records a baseline and then activates it, asserting that **at
least one** of three observable channels changed:

1. a service call recorded by the sample implementation's call log,
2. a DOM change in the rendered tree,
3. a navigation (a change of the router location).

Controls that are `disabled` or `aria-disabled` are excluded, because the spec exempts
inoperable controls (FR-071). The guard is shown failing on purpose by adding a button with no
handler, then passing once it is removed (FR-071, SC-019).

**Rationale.** FR-047 forbids a control that appears operable while doing nothing, and
clarification 5 requires it to be *checked*, not asserted. Three channels are needed because a
given control legitimately changes only one of them (a nav entry navigates; a dialog's confirm
button calls the service; a toast's dismiss changes the DOM).

**Alternatives rejected.** A hand-maintained list of controls (drifts from the DOM — the same
class of defect the guard exists to catch); asserting only on DOM change (a navigation or a
service-only mutation would be missed).

---

## R-007 — The service interface shape, and how the sample implementation is switched

**Decision.** `frontend/src/services/catalog-service.ts` declares the interface as
**asynchronous** methods shaped like the REST calls the real client will make: a list call
returning `{ items, total }`, a detail call returning one record, and mutations returning a
result (FR-037). `sample-catalog-service.ts` implements it over module-scoped in-memory state
and exposes two switches — `simulateFailure` and `simulateSlowResponse` — that make a call
reject (with a request identifier) or delay. The 429 path reuses the existing
`isRateLimited` / `ERROR_CODES.TOO_MANY_REQUESTS` / `Retry-After` handling already in
`src/lib/api-client.ts`, so the error state shown in the gallery is the same one the real client
produces. Types come from `@nexuserp/shared` wherever a contract exists there (FR-038).

**Rationale.** The interface must survive replacing the sample implementation with the real
client without a component changing (FR-036, FR-037). Making it async now means no component
is written against a synchronous shortcut that the real client cannot honour.

**Alternatives rejected.** A synchronous in-memory array read (would not match the real client,
so every component would need rework); a mocked `fetch`/MSW layer (heavier than the spec asks
and introduces a dependency; the spec's "sample implementation of the service interface" is
explicitly a peer of the real client).

---

## R-008 — The navigation list and the master file's table are compared by one test

**Decision.** `frontend/src/components/shell/navigation.ts` exports the one typed navigation
list (groups, labels, order, states) the sidebar renders and the tests assert against
(FR-065). It replaces the current `nav-items.ts`, which carries only the two available entries
and documents a rule the feature inverts. One test
(`frontend/src/components/shell/__tests__/navigation-master-file.spec.ts`) parses the plain
group/label/state table out of `design-system/nexuserp/MASTER.md` and compares groups, labels,
order and states against the list, failing when either side changes alone (FR-065, SC-015).
The list keeps the `permission` field each entry will require as recorded intent only (FR-015,
Principle II).

**Rationale.** Two sources that must agree need one comparison that fails when they do not;
the spec calls for exactly that, and for the comparison to be shown failing on purpose.

**Alternatives rejected.** Generating the master file's table from the code (the master file
would stop being an independent record); comparing only the set of labels (order and state
would drift unnoticed).

---

## R-009 — Contrast measurement is a recorded, reproducible report

**Decision.** Measure every pair the direction introduces with an explicit WCAG 2.1 relative
luminance computation, and record the pairs, the ratios and the requirement in
`specs/004-frontend-shell/evidence/contrast-report.md`. The pairs the master file has not yet
stated are computed and stated rather than assumed: text on the page background and on white
surfaces, status-badge text on each tint (already stated in the master file and re-checked),
the active pill's text on `--color-primary`, and input borders and the focus ring against the
surfaces they sit on (FR-004, SC-003).

**Rationale.** FR-004 and Principle VIII require measurement, not assertion, and the spec
forbids accepting a failing pair as an exception. Computing from the token values makes the
report reproducible when a token changes.

**Alternatives rejected.** A browser DevTools inspection (not reproducible in CI); trusting the
master file's existing ratios for the new pairs (the active pill is new).

---

## R-010 — Compact tablet sidebar driven by width, not a control

**Decision.** Implement the compact, icon-only sidebar as a pure CSS media query at the tablet
breakpoint (below the desktop width the master file fixes), so no toggle control exists that
would do nothing at another width. In the compact form each entry keeps its accessible name
(via a visually hidden label plus a tooltip), its group and its availability, and the current
destination stays identifiable (FR-011). The master file's current rule ("labels stay visible"
at tablet widths) is amended, since this feature changes it (FR-005).

**Rationale.** FR-011 requires the change to be driven by available width rather than by a
control, precisely so no control exists that does nothing — the same honesty rule as FR-047.

**Alternatives rejected.** A collapse toggle (creates a control whose effect is meaningless at
some widths, and adds a state the spec does not ask for).

---

## R-011 — Data table is server-side-shaped from the start

**Decision.** The table takes `page`, `pageSize`, `total`, `sort`, `sortDirection` and the
change callbacks as props (FR-025), renders numeric columns right-aligned with tabular
figures, and scrolls inside its own container (FR-026). The sample service returns a page and a
total so the table never sorts or slices a local array (FR-025, FR-037).

**Rationale.** PRD §7.3.8 and Principle VIII require server-side pagination with a visible
total; shaping the props now means no change is needed when the real client replaces the sample
one.

---

## R-012 — Bundle-size change is measured and reported

**Decision.** Record the measured production bundle size before the icon dependency and font
assets are added, and after, and state the delta in this feature's documentation (FR-058,
SC-013). Use the sizes Vite reports at build time for the JS/CSS chunks and the on-disk size of
the committed WOFF2 files for the asset delta; report gzip sizes where the build reports them.

**Rationale.** The spec requires the dependency's cost to be measured rather than assumed, and
the user's instruction repeats it. A number recorded at build time is re-checkable.

**Alternatives rejected.** Estimating from the package's published size (measures the
catalogue, not what is used).

---

## R-013 — Two existing destinations stay untouched

**Decision.** Overview and System Health keep their paths and behaviour (FR-010, SC-006). The
Overview page acquires the shared page header and breadcrumb; the System Health page keeps the
existing `HealthPanel` and its live behaviour, now inside the shell's page header. Both are
verified by their existing test suites rather than by inspection (FR-054, SC-006). The health
feature keeps using the real `api-client.ts`; nothing about it moves onto the sample service.

**Rationale.** The spec keeps both pages working and forbids the feature from claiming the
health check's live behaviour is sample data. Reusing the existing suites is the spec's stated
verification (FR-054).

---

## R-014 — `tsx` governs how guards run, and the guards build no Nest DI

**Decision.** The node-based guards that must run as scripts (the design-value guard and any
build-output check) run under `tsx` or plain `node`, exactly as
`scripts/check-no-raw-design-values.ts` already does. None boots a Nest DI container, which is
the only thing AGENTS.md forbids `tsx` from doing. Guards that are plain assertions are written
as Vitest tests so they inherit the existing configuration.

**Rationale.** AGENTS.md permits `tsx` only for scripts that build no Nest DI container; these
qualify, and the existing guard already establishes the pattern.

**Alternatives rejected.** Running any guard through the API's compilation path (unnecessary and
forbidden-adjacent).

---

## Open questions

None. Every NEEDS CLARIFICATION from Technical Context is resolved above; the feature's five
ambiguities were already resolved in [spec.md](spec.md) `## Clarifications`.
