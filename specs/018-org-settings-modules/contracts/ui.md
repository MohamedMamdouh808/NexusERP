# Contract: Organization Settings UI Behaviour

**Feature**: `specs/018-org-settings-modules/spec.md` | **Date**: 2026-11-19

## /settings/organization

Two cards rendered from design-system tokens.

### General card

- Fields: organization name, currency select, default payment terms (note: "Applies to invoices issued from now on"), current version displayed as read-only.
- Currency select becomes read-only with the reason "Locked once orders or invoices exist" when `currencyLocked` is true from `GET /organizations/current`.
- Save: submit button shows a spinner while in flight, is disabled during the request, and uses `react-hook-form` + Zod validation (`name` trim 1–100; currency one of the eight codes; terms integer 0–365) on blur and submit, with inline field errors.
- On `STALE_VERSION`: an inline reload prompt is shown; the failed values are not silently retried.
- On success: a success toast names the saved settings, and the top-bar organization name updates immediately. The session-derived currency, terms and modules refresh in place.
- A dismissible error banner shows a server failure with its `requestId`.

### Modules card

- A table of the five switchable modules, each with an on/off switch (`input role="switch"`, labelled), showing version and dependency state.
- Always-on modules (contacts, products, settings, audit) are displayed as locked and cannot be toggled.
- Turning a module off first opens a `ConfirmDialog` whose description states the consequence: access to that module's screens and data will be refused until it is switched on again.
- Dependency (`MODULE_DEPENDENCY`) and in-use (`MODULE_IN_USE`) refusals are shown inline with the responsible module, the reason and the counts from `details[]`.
- `STALE_VERSION` on a toggle offers the same reload prompt as the General card.
- Members without `settings.manage` see all controls disabled with an explanation, and the page states: "Access to this page is enforced by the server; hiding a control is not security."

## Shell adaptation (from `/auth/me` session state)

- A disabled switchable module's sidebar entry appears unavailable with the reason "Turned off in Settings"; the static `NAVIGATION` list and the design-system master file are unchanged.
- A direct route request for a disabled module redirects to `/settings/organization` with that notice; this includes reports.
- Overview hides widgets and quick actions that depend on a disabled module; Reports hides each section whose source module is disabled and keeps module-neutral sections visible.
- After a successful save or toggle the session-derived module/currency/terms values refresh in place without re-login.

## Registration form

- Optional organization name field (trim 1–100) and optional currency select defaulting to USD, using the same supported list and validation as the server.

## Prices, totals and reports

- Every figure uses `useOrganizationCurrency()` (session-derived `currencyCode`); no hard-coded USD outside the signed-out fallback.
