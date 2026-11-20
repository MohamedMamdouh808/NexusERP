# Implementation Plan: Organization name at sign-up and in the account menu

**Branch**: `009-org-name-signup` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009-org-name-signup/spec.md`

## Summary

Let a new user type their organization's name at registration (optional; placeholder kept when omitted), and surface the organization's name as the first, non-interactive row of the account menu in the top bar. Backend: `registerSchema` gains an optional, trimmed `organizationName` (2–128 chars, server-enforced) used inside the existing all-or-nothing registration transaction; `/auth/me` is unchanged. Frontend: the register screen gains the field (validated inline); the account menu gains a static `header` dropdown row showing the organization name with ellipsis + tooltip; English and Arabic strings are added to both locales.

## Technical Context

**Language/Version**: TypeScript 5.6 (backend: Node 24; frontend: React 18)
**Primary Dependencies**: NestJS 10 (backend), React 18 + react-i18next + Tailwind 4 + design tokens (frontend), Zod (contract validation both sides), Prisma 6 (PostgreSQL)
**Storage**: PostgreSQL (Supabase), existing `organizations.name` `VarChar(128)` — no migration
**Testing**: Backend `npm test` (unit) + `npm run test:integration` (real `nexuserp_test`); Frontend `npx vitest run`
**Target Platform**: Linux server (API), evergreen desktop/mobile browsers (web)
**Project Type**: web-service + SPA (existing modular monolith — no new service)
**Performance Goals**: registration behaves exactly as today (one transaction, one network round trip); top bar unchanged (reads the same session payload)
**Constraints**: no floating-point money/quantities involved; no new endpoints; no schema migration; no permission change; public route validation stays strict (unknown keys rejected); exact-decimal/`.strict()` contract discipline maintained
**Scale/Scope**: one optional request field; one registration step (step 2 of the existing transaction); one component extension (`DropdownMenu`); one menu row; two locale files; one contract doc; one migration-free release

## Constitution Check

*GATE: must pass before Phase 0 research — it does; re-check after Phase 1 design — it still does.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs? | **Pass** — no table or column changes; the organization row is written by the existing transaction; no new query surface. |
| II. Server-Enforced Authority | Which permission does each new endpoint declare? | **Pass** — no new endpoint; register stays public; trim/length enforced server-side in the schema. |
| III. Transactional Integrity | Which operations are multi-record / idempotent / immutable? | **Pass** — the organization name is written inside the existing all-or-nothing transaction; partial failure creates nothing. |
| IV. Exact Decimals | Column precisions / rounding? | **Pass** — N/A, no monetary or quantity values. |
| V. Test-First | Which failing test is written first? | **Pass** — integration test for persisted name + whitespace-only refusal (zero records); frontend unit test for non-interactive first menu row. See [research.md](./research.md) D6. |
| VI. Modular Boundaries | Which modules are touched? | **Pass** — auth module (register step 2) + frontend top bar/register page + i18n resources; no cross-module writes. |
| VII. Honest Boundaries | Any tax/accounting implication? | **Pass** — none; no money, invoices or compliance claims. |
| VIII. Design System & A11y | Which tokens / UX rules apply? | **Pass** — muted menu-label treatment, single-line ellipsis + tooltip, non-interactive row (no focus stop, WCAG 2.1 AA preserved). |
| IX. Scope Discipline | P0/P1/P2? Preceding gates met? | **Pass** — P1; small, additive, reversible; no P0 work blocked behind it. |

**Constraints recorded in Technical Context**: real-PostgreSQL integration tests (`test:integration`), no floating-point money/quantities, no microservices/Redis/Kubernetes, phase-appropriate scope.

## Project Structure

### Documentation (this feature)

```text
specs/009-org-name-signup/
├── spec.md            # feature specification (this feature)
├── plan.md            # this file
├── research.md        # Phase 0 decisions D1–D8
├── data-model.md      # entity and request-delta model
├── quickstart.md      # manual + automated verification
├── contracts/
│   └── register.md    # POST /api/v1/auth/register delta
├── checklists/
│   └── requirements.md
└── tasks.md           # Phase 2 (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/src/modules/auth/
├── dto/register.dto.ts          # + optional organizationName (trim, 2–128)
├── auth.service.ts              # register(): step 2 writes typed name or placeholder
├── auth.controller.ts           # unchanged (wiring only)
└── …                            # audit actions unchanged
backend/test/integration/auth.spec.ts   # + typed-name persist, + whitespace refusal, zero records

frontend/src/
├── components/ui/dropdown-menu.tsx     # + 'header' entry kind (non-interactive)
├── components/ui/data-table.tsx        # unchanged
├── components/shell/top-bar.tsx        # user menu: prepend org-name header entry
├── features/auth/register-page.tsx     # + Organization name field (optional, inline-validated)
├── services/auth-session.ts            # register input gains organizationName (request-only)
├── i18n/locales/en/auth.ts, ar/auth.ts # new register strings (both locales)
├── i18n/locales/en/shell.ts, ar/shell.ts # new menu header label if needed
└── …                                   # frontend tests: register spec, top-bar spec
docs/api-auth-contract.md               # + optional organizationName documentation
```

**Structure Decision**: existing modular monolith — no new module, no new package. Backend change is confined to `backend/src/modules/auth/` + its integration spec; frontend change to `components/ui/`, `components/shell/`, `features/auth/`, `services/`, `i18n/`, plus `docs/api-auth-contract.md`.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |

## Implementation order (input for /speckit.tasks)

1. **Failing tests first** (D6): backend integration (typed name persists; whitespace-only 400, zero records); frontend menu test (first row, non-interactive).
2. **Backend**: extend `registerSchema` (`.trim()`, `min(2)`, `max(128)`, optional); `register()` writes typed name or placeholder; keep `.strict()`; audit payload unchanged (organization id already recorded).
3. **Contract**: update `docs/api-auth-contract.md` (new optional field + validation window).
4. **Frontend form**: add optional "Organization name" input on `/register` with inline validation mirroring server rules; send `organizationName` only when non-empty; i18n in en/ar.
5. **Frontend menu**: extend `DropdownMenu` with `'header'` kind; `top-bar.tsx` prepends the organization-name header row; ellipsis + tooltip + accessible name; i18n (en/ar) if a label is needed.
6. **Verify**: unit + integration + full build; manual quickstart paths in both languages and at three widths.

## Phase 2 hand-off

`/speckit.tasks` converts this plan into tasks.md with the same constitution discipline: the integration test lands in the first task batch, never after the implementation it guards.
