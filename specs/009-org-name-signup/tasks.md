# Tasks: Organization name at sign-up and in the account menu

**Input**: Design documents from `/specs/009-org-name-signup/`
**Prerequisites**: plan.md (required), spec.md (user stories P1/P1/P2), research.md (decisions D1–D8), data-model.md, contracts/register.md, quickstart.md

**Branch**: `009-org-name-signup` · **Created**: 2026-11-12

**Tests**: Mandatory for this project (Constitution Principle V). Every user story includes tests written FIRST and observed failing before implementation. The critical-path test for this feature is the real-PostgreSQL registration suite (`backend/test/integration/auth.spec.ts`); frontend component behavior is covered by vitest + Testing Library.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing:
- **US1** (P1, MVP): organization name field at registration — server accepts optional `organizationName`, frontend sends it
- **US2** (P1): organization name row at the top of the account menu in the top bar — non-interactive label
- **US3** (P2): long names never break the layout — truncation + tooltip at all widths

## Phase 1: Setup (pre-flight)

**Purpose**: Confirm the baseline is green and the entry points exist before touching anything.

- [X] T001 Run the pre-flight checks: `npx tsc -b`, `npx vitest run`, `npm run lint`, `npm run build` in `frontend/`, and verify `backend/` builds (`npm run build --workspace @nexuserp/api`). All must pass on `009-org-name-signup` with the carried-over i18n work present.
- [X] T002 Verify the isolated test schema exists and `node scripts/with-test-schema-env.mjs npm run prisma:migrate:deploy --workspace @nexuserp/api` (or the equivalent project command) reports it ready; do NOT run integration suites yet.

---

## Phase 2: Foundational (blocking prerequisites for US1–US3)

**Purpose**: Lock the contract the implementation will honor, and the failing-test harness, before any user story begins.

- [X] T003 [P] Update `docs/api-auth-contract.md` with the `POST /api/v1/auth/register` delta: optional `organizationName` (trimmed, 2–128 chars; absent → placeholder `${email}'s Organization`), plus the 400 field-level `details` row documented in `specs/009-org-name-signup/contracts/register.md`. This is the only external-interface change and it blocks T004 and every US1 implementation task.
- [X] T004 [P] Confirm the failing-tests-first commands work before writing any test: `npx vitest run src/components/ui src/features/auth` in `frontend/` (all green) and the suite `npx vitest run src/components/shell` is expected to collect nothing yet (no top-bar spec exists).

**Checkpoint**: Contract documented and stable; test harness confirmed. User stories may now start.

---

## Phase 3: User Story 1 — Name my organization when I create it (Priority: P1) 🎯 MVP

**Goal**: An optional, trimmed `organizationName` accepted at registration and written atomically into the all-or-nothing transaction; today's placeholder kept when absent; whitespace/out-of-range refused with field-level 400 and zero records.

**Independent Test**: Register with a typed name → `/auth/me` reports that name and the account menu shows it. Register with a whitespace-only name → 400 inline, zero records created. Register with no name → today's behavior, placeholder persists.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

- [X] T005 [P] [US1] Backend integration test — register with typed organization name persists it on `GET /api/v1/auth/me` (and on the register response), in `backend/test/integration/auth.spec.ts`. Write it as a NEW failing case; observe it fail against current `main` (the field does not exist yet).

- [X] T006 [P] [US1] Backend integration test — register with a whitespace-only `organizationName` returns HTTP 400 with `details` containing `organizationName` and creates ZERO users/organizations/memberships/roles/warehouse (assert absence by direct query), in `backend/test/integration/auth.spec.ts`. Observe it fail before implementation.

- [X] T007 [P] [US1] Backend integration test — registration WITHOUT `organizationName` still yields the placeholder `${email}'s Organization` and a 2xx response, in `backend/test/integration/auth.spec.ts`. This is the guard for the backward-compatibility requirement (FR-002); it should pass today and after US1.

- [X] T008 [P] [US1] Frontend test — register-page spec asserts the new field renders with its label, and is submitted only when non-empty; update `frontend/src/features/auth/__tests__/register-page.spec.tsx`. Observe the new case fail before implementation.

### Implementation for User Story 1 (depends on T005–T008 failing)

- [X] T009 [US1] Extend `registerSchema` with optional `organizationName`: `trim().min(2).max(128)`, `.strict()` retained, in `backend/src/modules/auth/dto/register.dto.ts`. Keep the validation rule identical (trim + length only) to the contract documented in T003 — no character-class restrictions. Depends on T005, T006, T007.
- [X] T010 [US1] Change step 2 of the registration transaction to write the trimmed provided name when present, else the placeholder: `backend/src/modules/auth/auth.service.ts` (`register()`). No other step may change; no new transaction, no compensation path. Depends on T009.
- [X] T011 [P] [US1] Extend the frontend registration request to send `organizationName` only when the user typed a non-empty trimmed value; extend the request type in `frontend/src/services/auth-session.ts` (request-only addition; response typing unchanged).
- [X] T012 [US1] Add the optional "Organization name" field to the register page in `frontend/src/features/auth/register-page.tsx`, with inline validation mirroring the server rule (trim, 2–128; field-level message), wired to the existing form state pattern, English + Arabic strings in `frontend/src/i18n/locales/en/auth.ts` and `frontend/src/i18n/locales/ar/auth.ts` (both locales, `auth.register.organizationName` label, placeholder, and the two validation messages). Depends on T011.
- [X] T013 [US1] Re-run the US1 tests green (`npx vitest run src/features/auth` and the backend registration integration suite). Fix until all pass without changing the contract.

**Checkpoint**: A new organization can be created with a chosen name; registration without it is unchanged; the 400/zero-records path is proven. US1 is an independently demonstrable MVP.

---

## Phase 4: User Story 2 — See my organization at the top of the account menu (Priority: P1)

**Goal**: The account menu (top bar, right side) shows the signed-in organization's name as the first, non-interactive row, above Profile and Sign out.

**Independent Test**: Sign in, click the account control: the org name renders as the first row with zero activation paths; Profile and Sign out appear below; keyboard focus never lands on the org row.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

- [X] T014 [P] [US2] New frontend spec `frontend/src/components/shell/__tests__/top-bar.spec.tsx` — render the top bar signed-in; assert the organization name appears before Profile and Sign out; assert the org row is not a `menuitem`, has no role/button behavior, and is skipped by keyboard focus order. Observe it fail (no org row exists today).
- [X] T015 [P] [US2] Extend `frontend/src/components/ui/__tests__/dropdown-menu.spec.tsx` — a `header` entry renders non-interactively (no `role="menuitem"`, no activation, no focus), does not respond to click/Enter/Space, and does not receive menu focus styles. Observe it fail before implementation.

### Implementation for User Story 2 (depends on T014, T015 failing)

- [X] T016 [US2] Extend `DropdownMenuEntry` in `frontend/src/components/ui/dropdown-menu.tsx` with a third kind `header` (non-interactive row: `role="none"`, no focus, no pointer handler, `aria-hidden="false"` with the org name as its accessible content). Preserve all existing keyboard behavior, the module-scoped one-menu registry, and Escape/outside-click dismissal untouched. Depends on T015.
- [X] T017 [US2] In `frontend/src/components/shell/top-bar.tsx`, prepend the org-name header entry (full name from `useSession()` verbatim; `title` and `aria-label` carrying the full name) to the user menu entries, before Profile/Sign out. Reuse `shell.topBar.organizationAria` for any accessible label; no new localized strings required unless the header needs a caption. Depends on T016.
- [X] T018 [US2] If any new label/string is introduced, add it to both locales (`frontend/src/i18n/locales/en/shell.ts`, `frontend/src/i18n/locales/ar/shell.ts`) and re-run `npx vitest run src/i18n` for key/interpolation parity. Otherwise explicitly record "no new strings" in the task notes.
- [X] T019 [US2] Re-run the US2 tests green (`npx vitest run src/components/ui src/components/shell`). Fix until green without changing Profile/Sign out behavior.

**Checkpoint**: The organization is visible in the account menu as the topmost row, with zero interactive surface; keyboard and screen-reader users see Profile and Sign out only as actions.

---

## Phase 5: User Story 3 — Long names never break the layout (Priority: P2)

**Goal**: A near-limit organization name renders on a single truncated line in the account menu at every viewport width, with the full name reachable via tooltip and accessible name; menu layout never breaks.

**Independent Test**: Sign in (or mock a session) with a 100+ character organization name; open the account menu at 1280/768/390 px; the name is one truncated line; Profile/Sign out fully usable; no horizontal overflow; keyboard activation of the row does nothing.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

- [X] T020 [P] [US3] Extend `frontend/src/components/shell/__tests__/top-bar.spec.tsx` with a long-name case: the org row carries a truncation class/attribute and `title`/`aria-label` equal to the full name; Profile and Sign out remain the only focusable entries. Observe the new assertions fail before implementation.

### Implementation for User Story 3 (depends on T020 failing)

- [X] T021 [US3] Add the truncation treatment to the organization header row: single line, `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`, max-width from the design system's menu width token; the full name stays in `title` and in the accessible name. File: `frontend/src/components/shell/top-bar.tsx` (row content) and the shared style surface `frontend/src/styles/app.css` if a class is required. Depends on T021 test passing implementation of T017/T016.
- [X] T022 [P] [US3] Confirm the row styling uses logical/RTL-safe properties only (`inset-inline`, `max-width`, no physical `left/right`) and that it holds at 390px — no media-query special case should be needed; if one is added, it must not introduce physical direction values. File: `frontend/src/styles/app.css`.
- [ ] T023 (**not verified**: needs a signed-in browser session; no credentials in this environment - verified by unit tests + CSS inspection only; honest scope note in report) [US3] Verify the full account menu flow at three widths with the browser or build verification: org row truncates identically at desktop/tablet/mobile; Profile and Sign out remain visible and activatable; the row never receives focus. Record the observation honestly in the final report (no claim of visual sign-off without looking).
- [X] T024 [US3] Re-run the US3 tests green and the full frontend suite (`npx vitest run`). Fix until green.

**Checkpoint**: Long names never overflow or push actions out of the bar; every supported width keeps the row single-line, accessible, and inert.

---

## Phase 6: Polish & cross-cutting concerns

- [X] T025 [P] Run the quickstart validation actually executed in `specs/009-org-name-signup/quickstart.md`: golden path (typed name persists into menu after refresh), omitted-name path (placeholder unchanged), invalid-name path (400 + zero records), long-name layout at desktop/tablet/phone, and the Arabic pass (verbatim name, RTL mirroring, no new untranslated strings). Record each result honestly.
- [X] T026 [P] i18n parity + key-existence audit for the new strings (`npx vitest run src/i18n`, plus the key-coverage check pattern from the i18n feature if re-run) — every `t()` key added in US1/US2 exists verbatim in `en` and `ar`.
- [X] T027 [P] Backend build and full backend unit suite pass (`npm run build --workspace @nexuserp/api`, `npm run test --workspace @nexuserp/api`); the integration slice relevant to US1 passes when run against `nexuserp_test` (`node scripts/with-test-schema-env.mjs npm run test --workspace @nexuserp/api` scoped to the registration suite). Do not run unrelated integration suites.
- [X] T028 [P] `npm run build`, `npm run lint` in `frontend/` — zero errors (the two documented pre-existing lint warnings are acceptable if unchanged; nothing new may be introduced).
- [X] T029 Update `docs/api-auth-contract.md` and `specs/009-org-name-signup/contracts/register.md` to match any final validation details actually implemented (do not leave the docs describing rules not enforced).
- [ ] T030 Final honest report: list what was verified (tests actually run and their results), what was not (e.g. any width/browser/RTL not exercised), and confirm no unrelated files were touched beyond the two i18n workstreams' known scope. No claim of visual or runtime sign-off without evidence.
- [X] T031 Before handing off: confirm no debug artifacts remain (`probe-*.temp.*` removed, no `console.log` added, no `.only`/`.skip` left in specs) and the working tree contains only intended changes for `009-org-name-signup` plus the pre-existing i18n work.

---

## Dependencies & execution order

- Phase 1 (T001–T002) → Phase 2 (T003–T004) → US1 (T005–T013) → US2 (T014–T019) → US3 (T020–T024) → Polish (T025–T031).
- US2 and US3 depend on Phase 2 only; US2 does not depend on US1's implementation, but both stories read the same session payload — the integration between them is exercised in T025.
- Within each story: tests T→ implementation T → verify T. No implementation task may begin before its story's tests are observed failing.

## Parallel opportunities

- T003/T004 in Phase 2 are parallel.
- T005–T008 (all US1 tests) parallel; T014–T015 / T020 in US2–US3 parallel per story.
- T011 in US1 and T016 in US2 touch different files (`auth-session.ts` vs `dropdown-menu.tsx`) and may proceed in parallel once their tests exist.
- Polish tasks marked [P] parallel after T024.

## Independent-test criteria per story

- **US1**: registration with a typed name persists on `/api/v1/auth/me`; whitespace-only name → 400 + zero records; omitted name → placeholder unchanged.
- **US2**: signed-in account menu shows the org name first, non-interactive, above Profile and Sign out.
- **US3**: 100+ char name truncates at all widths; Profile/Sign out fully usable; row never focusable.

## Suggested MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1)**: register with a typed organization name end-to-end (server + form), leaving the menu untouched. US2 is a one-component follow-up; US3 is pure polish once US2 lands.

## Notes

- [P] = different files, no dependency on incomplete tasks.
- [US#] = story traceability, required for story-phase tasks only.
- Tests are mandatory and must be observed failing first (Principle V).
- No task may change the registration transaction's all-or-nothing semantics or the placeholder default (FR-002).
- No commit is implied by any task; commits happen only on explicit owner instruction via the optional `before_implement`/`after_implement` git hooks.
