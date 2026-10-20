# Implementation Plan: Frontend Design Foundation and Application Shell

**Branch**: `main` (single-branch workflow — no feature branch is created; see [spec.md](spec.md) Notes) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-frontend-shell/spec.md`

## Summary

Build the design foundation every later screen inherits: the design system amended to the
product's own visual direction, transcribed into tokens, and rendered as one reusable
component set inside a real application shell — sidebar, top bar, page header, breadcrumb,
data table — over sample data reached only through a service interface. Two pages exist
(Overview and System Health, both kept as they are); every other module is visibly
unavailable. A development-only gallery reviews every component and state, and the
interface is proven honest by checks that are shown failing on purpose.

The technical approach follows the frontend stack fixed by PRD §9.1 and adds **no runtime
dependency except one icon library**:

1. **The design system first** (spec FR-001, FR-005). `design-system/nexuserp/MASTER.md` is
   amended to the direction — sidebar groups General/Management/Settings, the visibly
   unavailable entry state, the compact tablet sidebar, and the enumerated navigation table
   — before any component is built from it.
2. **One token pipeline, one guard** (FR-003). Every colour, spacing, radius, shadow and type
   value is transcribed into `frontend/src/styles/tokens.css` and bridged to Tailwind 4 as a
   theme; `scripts/check-no-raw-design-values.ts` keeps passing with no exemption added.
3. **One component folder** (FR-019). Every primitive lives in `frontend/src/components/ui/`,
   one file per component with a barrel, typed exhaustively against one state manifest so a
   state cannot be added without a fixture and a test (FR-059–FR-063).
4. **Sample data apart from components** (FR-036). The service interface and its sample
   implementation live in `frontend/src/services/`; the sample data and fixtures live in
   `frontend/src/mocks/`; no component imports sample data directly.
5. **A dev-only gallery** (FR-034, FR-035, FR-068–FR-070) whose controls mutate in-memory
   sample state through the service interface, with two demonstration switches that make the
   sample implementation fail or delay, and a build-output check that proves the route is
   absent from a production build.
6. **Self-hosted fonts**, so the interface makes no third-party request at runtime — the
   current Google Fonts `@import` in `app.css` is replaced by locally served WOFF2 files.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 24 LTS (root `engines.node >=22.13.0`,
`.nvmrc` = `24`). React 18.3 with the automatic JSX runtime.

**Primary Dependencies**: Exactly the PRD §9.1 frontend stack, all already present in
`frontend/package.json` — React 18, React Router 6, TanStack Query 5, React Hook Form 7 with
Zod 3, Tailwind CSS 4 through `@tailwindcss/vite`, and `@nexuserp/shared` for contract types
(FR-038). **One dependency is added: `lucide-react`**, the single icon library permitted by
FR-055, imported per icon so only the icons in use reach a build. It is an application library
consumed by the `frontend` workspace only, not an infrastructure dependency under Principle VI,
so this plan proposes no constitution amendment for it; its measured cost is reported under
SC-013 (T001, T077). No other runtime dependency is added; no chart or charting library is
added (spec excludes charts, FR-048).

**Storage**: None in the browser. There is no backend and no database in this feature
(FR-048). Sample data is module-scoped in memory; nothing is written to `localStorage`,
`sessionStorage`, IndexedDB or a cookie, so a reload restores the initial state (FR-068). The
real persistence layer arrives with the first business module, behind the same service
interface (FR-036, FR-037).

**Testing**: Vitest 2 + React Testing Library 16 + `@testing-library/user-event` 14 for unit
and component tests (existing config: `vitest.config.ts`, 80% coverage thresholds); Playwright
1.49 for the shell's browser smoke test; and the repository's node-script guard pattern for the
checks that must fail on purpose — the design-value guard (`scripts/check-no-raw-design-values.ts`,
FR-051), the state-manifest guard (FR-061), the every-enabled-control guard (FR-071), the
navigation-list/master-file comparison (FR-065), and the build-output gallery check (FR-070).

**Target Platform**: Browsers Chrome 100+, Safari 15+, Firefox 100+, Edge (Chromium) at
tablet and desktop widths 768px–1440px and wider. Light mode only; no phone breakpoint
(FR-042, FR-048). No server, no container, no network service is required to run it.

**Project Type**: Web application — the `frontend` workspace of the existing npm-workspaces
monorepo (`frontend`, `backend`, `database`, `shared`). This feature changes only `frontend/`,
`design-system/`, and feature documentation. It creates no new workspace, package, or runtime
service.

**Performance Goals**: No new numeric target is asserted. Inherited constraints apply: a page
usable within 2 seconds at p95 (constitution), zero horizontal page scroll at every supported
width (SC-005), and a measured, minimal bundle-size change from the icon dependency (FR-058,
SC-013).

**Constraints**: No raw design value outside `tokens.css` (guard stays green); money carried as
decimal strings, never floats (FR-039); no chart, no dark theme, no global search, no
notification, no authentication (FR-048); the gallery route and its data must be absent from a
production build (FR-035, FR-070); sample data must never be persisted (FR-068). The API must
never be started with `tsx` (AGENTS.md) — this feature touches no Nest DI, but the rule governs
how the guards are run.

**Scale/Scope**: Two built pages and one dev-only gallery; one component set of fifteen
components across seventy-five declared states (the state matrix in [spec.md](spec.md), whose
Badge row resolves to fourteen states, one per status name in the design system's mapping); one
typed navigation list of twelve entries in three groups, two of them available; one mock
service interface; one state manifest.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and where does tenant scope enter the request context? | **Pass** — no table, query or tenant data is added. The shell shows a sample organization name that is labelled as sample, is not a record, and derives no scope (FR-014, FR-041). No isolation test is added; the existing suite is unaffected. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | **Pass** — no endpoint is added and no permission changes. The navigation list keeps the permission each destination *will* require as recorded intent only; nothing is filtered or guarded on the client (FR-015). |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | **Pass** — no posting operation and no `Idempotency-Key` endpoint. The gallery exercises the service interface's mutation half in memory only; a mutation result is never presented as a committed record and nothing durable is written (FR-037, FR-047, FR-068). |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | **Pass** — no column and no rounding. Money is a decimal string in the sample data, the fixtures and the interface; the shared package's decimal contract is reused (FR-038, FR-039) and a test fails if a money value is introduced as a number. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | **Pass** — each component state's test is enumerated in the manifest and written before the state is built (FR-050, FR-059). Three guards are shown failing on purpose before being trusted (FR-051, FR-061, FR-071); the 80% threshold stands and no suite is weakened. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | **Pass** — the feature lives entirely in the `frontend` workspace, adds no service-side module, and MUST NOT import from the service, the database or the generated client. All data access passes through one service interface (FR-036). Exactly one dependency is added, in the frontend workspace only (FR-055). |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | **Pass** — the feature claims nothing it does not do. No invoice or tax surface exists here, so the "Operational invoice — not a tax invoice" label is not yet owed; every surface showing sample data says so (FR-040), no control that cannot act looks operable (FR-047, FR-071), and branding is NexusERP's own (FR-046). |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | **Pass** — the master file is amended first and stays the single source of truth (FR-001, FR-005); every value flows through the token pipeline (FR-003); the PRD §7.3 rules are acceptance criteria (skeleton on every fetch, disabled+spinner submit, inline errors, `requestId` banner, Retry, confirmation dialogs stating consequence, explanatory empty states, API status names, visible total count); contrast is measured and recorded and keyboard operation is demonstrated (FR-004, FR-044, FR-045). |
| IX. Scope Discipline | What is this feature's P0/P1/P2/P3 classification, and is the preceding phase's exit criteria met for P1 work? | **Pass** — classified **P0**: the design foundation, base components and shell that the PRD places in the first phase. Nothing from P1–P3 is included; search and notifications are omitted rather than stubbed, unbuilt modules appear as unavailable entries, and surfaces no v1 feature owns are omitted entirely (FR-067). |

Constraints carried into Technical Context: real-PostgreSQL integration tests (not applicable —
no persistence here), no floating-point money or quantities, no microservices/Redis/Kubernetes
in v1, and the Phase 4 build order for the modules involved (no module is involved).

## Project Structure

### Documentation (this feature)

```text
specs/004-frontend-shell/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (input)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── service-interface.md
│   ├── state-manifest.md
│   ├── navigation-list.md
│   └── design-tokens.md
├── evidence/            # Recorded evidence this feature owes (FR-052, FR-053)
│   ├── contrast-report.md
│   ├── keyboard-walkthrough.md
│   ├── design-value-guard-observations.md   # failing run, then passing run (FR-051)
│   ├── gallery-absent-from-build.md         # build-output check (FR-070)
│   └── bundle-size.md                       # baseline (Phase 1) and measured delta (FR-058)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
design-system/nexuserp/
└── MASTER.md                          # Amended first: groups, unavailable state, compact
                                       # sidebar, navigation table, self-hosted typography

frontend/
├── public/fonts/                      # Self-hosted WOFF2 (Fira Sans, Fira Code) — no
│                                      # third-party request at runtime
├── scripts/
│   ├── check-no-raw-design-values.ts  # Existing guard; stays green, no exemption
│   └── __tests__/
│       ├── no-raw-design-values.spec.ts
│       └── ...                        # Guards proven failing on purpose
└── src/
    ├── app/
    │   ├── router.tsx                 # Routes; gallery route registered in DEV only
    │   └── query-client.ts            # Existing
    ├── components/
    │   ├── shell/                     # App shell: sidebar, top bar, page header, breadcrumb
    │   │   ├── app-shell.tsx
    │   │   ├── sidebar.tsx
    │   │   ├── top-bar.tsx
    │   │   ├── page-header.tsx
    │   │   ├── breadcrumb.tsx
    │   │   ├── navigation.ts          # The one typed navigation list (FR-065)
    │   │   └── __tests__/
    │   └── ui/                        # ONE folder for every primitive (FR-019)
    │       ├── index.ts               # Barrel; replaces the existing index.tsx, whose
    │       │                          # Card/StatusBadge/Skeleton exports move onto these files
    │       ├── button.tsx
    │       ├── input.tsx
    │       ├── select.tsx
    │       ├── textarea.tsx
    │       ├── checkbox.tsx
    │       ├── badge.tsx
    │       ├── card.tsx
    │       ├── data-table.tsx
    │       ├── dialog.tsx
    │       ├── confirm-dialog.tsx
    │       ├── dropdown-menu.tsx
    │       ├── toast.tsx
    │       ├── skeleton.tsx
    │       ├── empty-state.tsx
    │       ├── error-state.tsx
    │       └── __tests__/             # One test per state (FR-050)
    ├── services/                      # The service interface, apart from components (FR-036)
    │   ├── catalog-service.ts         # The interface the real client will implement
    │   ├── sample-catalog-service.ts  # In-memory sample implementation + switches
    │   └── __tests__/
    ├── mocks/                         # Sample data, apart from components
    │   └── sample-data.ts
    ├── features/
    │   ├── health/                    # Existing; unchanged behaviour (FR-010)
    │   └── overview/                  # Existing Overview, moved behind the new page header
    ├── dev/
    │   └── gallery/                   # Dev-only: route, fixtures, manifest, controls
    │       ├── gallery-route.tsx
    │       ├── state-manifest.ts      # The one machine-readable manifest (FR-059)
    │       ├── fixtures.ts            # Gallery fixtures, typed against the manifest (FR-061)
    │       └── __tests__/
    ├── lib/                           # Existing api-client.ts, format.ts (real client seam)
    ├── styles/
    │   ├── tokens.css                 # The ONLY file permitted a raw design value
    │   └── app.css                    # Tailwind theme bridge + component classes
    └── test/
        ├── render.tsx
        └── setup.ts
```

**Structure Decision**: The repository is already the npm-workspaces monorepo, so no new
project is created. The feature is confined to the `frontend` workspace plus an amendment to
`design-system/nexuserp/MASTER.md`. Inside `frontend/src` the arrangement is chosen to make
the spec's separations structural rather than conventional:

- **`components/ui/`** is the single home for every primitive (spec FR-019, user input), one
  file per component with a barrel so a later feature imports from one place.
- **`components/shell/`** holds the frame; `navigation.ts` is the one typed navigation list the
  sidebar renders and the tests assert against, mirrored by the master file's table (FR-065).
- **`services/`** and **`mocks/`** are deliberately outside `components/`, so "no component may
  import sample data directly" (FR-036) is visible in the tree, not just in review.
- **`dev/gallery/`** holds the gallery, its fixtures and the state manifest, so everything that
  must not reach a production build lives under one obvious dev-only path (FR-035, FR-063).
- **`public/fonts/`** serves the self-hosted faces, replacing the remote Google Fonts import.

## Complexity Tracking

> No Constitution Check violation requires justification: the table above records a pass for
> every principle. This section is intentionally empty.
