# Phase 0 Research: Organization name at sign-up and in the account menu

**Feature**: 009-org-name-signup · **Date**: 2026-11-12 · **Spec**: [spec.md](./spec.md)

Unknowns from the Technical Context were resolved against the repository before writing this file. No external research was required; every decision cites a shipped artifact or an explicit product-owner clarification (2026-11-12).

## D1 — Organization name validation rule

- **Decision**: Trim leading/trailing whitespace; require 2–128 characters after trimming; reject anything else with a field-level 400 and zero records created. No character-class restriction beyond trimming (Unicode, emoji and non-Latin scripts allowed, matching how the column stores arbitrary text).
- **Rationale**: The column is `VarChar(128)` (`database/prisma/schema.prisma`, `model Organization`), so 128 is the hard bound; 2 is the smallest meaningful name (a single letter/rune is rejected as likely a stray keystroke, mirroring the 2-character minimum used elsewhere for names). Server-side trimming is the only trimming (never trust the client).
- **Alternatives considered**: a regex whitelist (rejects legitimate names like "Café № 9"), and a 1-character minimum (useless for organizations and invites junk data).
- **Owner of the rule**: the registration schema (server); the UI mirrors it only for inline feedback.

## D2 — Backward compatibility of omitted name

- **Decision**: When the organization name is absent, registration behaves exactly as it does today and the placeholder `${email}'s Organization` is written, unchanged. The field is optional in the contract.
- **Rationale**: Zero migration, zero breakage for existing integrations and tests, additive-only contract change (`docs/api-auth-contract.md` gains one optional field; existing clients keep working). The alternative (required) would break the registration endpoint for every existing caller.

## D3 — Where the name is written and by whom

- **Decision**: The `organization` row is created by the same `auth.service.register()` transaction that already creates the user, organization, membership, roles, warehouse and sequences; step 2 changes from a constant name to the trimmed provided name or the placeholder when absent. No second transaction, no compensation step.
- **Rationale**: Principle III (all-or-nothing multi-record write). Splitting the rename into a follow-up call would create a half-provisioned organization on partial failure.
- **Alternatives considered**: a separate rename after registration (partial-write window, rejected); a database default (useless — the name is request data, not static).

## D4 — Account menu row component

- **Decision**: The `DropdownMenu` component gains a third entry kind, `header`: rendered as a static, non-interactive row (`role="none"`, no activation path, no focus) showing the organization name. The user menu (top bar, right side) prepends one header entry with the current organization's name before Profile and Sign out.
- **Rationale**: The component already discriminates between `item` and `unavailable` entries by `kind`; a third kind is the smallest additive extension and keeps the menu's keyboard model (item-only focus set) untouched — the label is skipped entirely.
- **Alternatives considered**: rendering a raw `<li>` outside the menu's entry model (breaks the component's contract and its tests); making the row a disabled button (announces as a control; rejected per FR-006); putting it in the organization switcher instead (product owner chose the account menu).

## D5 — Ellipsis and tooltip for long names

- **Decision**: The organization row uses the design system's overflow pattern for menu labels: single line, `text-overflow: ellipsis`, with the full name exposed via `title` and via the accessible name (`aria-label`) and `aria-describedby` if the label is visually truncated.
- **Rationale**: FR-007/FR-008 require the full name to be available without extra clicks while keeping the menu layout intact; the design system already uses this pattern for other long values (e.g. contact names in command-palette hints).
- **Note**: Exact CSS class choice is an implementation detail; the pattern (single line + ellipsis + tooltip/accessible name) is the decision.

## D6 — Test strategy (Principle V)

- **Decision**: Failing tests first, in this order: (1) backend integration test — register with a typed name persists it on the `/auth/me` payload; register with a whitespace-only name returns 400 with field-level `details` and creates nothing; (2) frontend unit test — the user menu renders the organization name as the first entry with `role="none"` (or non-interactive marker) and Profile/Sign out remain the only focusable entries; (3) full existing suite stays green.
- **Rationale**: The feature is P1 but small; the critical-path coverage is the registration transaction (already covered) extended by the two new cases.

## D7 — Contract and docs update

- **Decision**: `docs/api-auth-contract.md` (the canonical auth contract) gains one optional field `organizationName` on `POST /api/v1/auth/register`, with the trim/length rule stated verbatim. `specs/009-org-name-signup/contracts/register.md` records the delta. No version bump of the contract (additive, optional).
- **Rationale**: The contract doc is the shared-schema-of-record between backend and frontend; an undocumented request field drifts the contract silently.

## D8 — What this feature deliberately does not do

- No renaming of existing organizations (the mock-backed administration page stays mock; a real rename endpoint is a separate feature).
- No idempotency key on registration (registration is not idempotent today; unchanged).
- No locale-specific display of the organization name (user content, shown verbatim).
- No permission change; no schema migration; no new endpoint.
