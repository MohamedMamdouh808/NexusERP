# Quickstart: Organization Settings and Module Controls

**Feature**: `specs/018-org-settings-modules/spec.md` | **Date**: 2026-11-19

This feature adds settings and module APIs plus real-data UI. Exercise the critical paths locally in this order; all backend integration commands force the isolated `nexuserp_test` schema.

## Prerequisites

- Node >= 22.13.0, PostgreSQL available, root `.env` with a database URL whose username matches the write guard.
- Dependencies installed (`npm install` at root) and migrations applied (`npm run db:migrate`).

## 1. Backend unit and type gates

```powershell
npm run typecheck
npm test --workspace @nexuserp/api
```

## 2. Backend integration (isolated schema; never public)

```powershell
npm run test:integration --workspace @nexuserp/api
npm run verify:invariants:test
```

`pretest:integration` resets the test schema, re-applies migrations (including the module backfill and currency-lock trigger) and runs `check:migrations`. The integration suite proves: two-org isolation and 404s, `settings.manage` enforcement, stale-version refusals, currency lock in every status and in the `Promise.all` first-document race, every dependency and in-use refusal with counts, the module toggle race, `MODULE_DISABLED` on every switchable endpoint including reads, re-enablement with data intact, and registration with/without name and currency.

Public row counts are proven unchanged by snapshotting around the run:

```powershell
node scripts/snapshot-public-counts.mjs      # before
npm run test:integration --workspace @nexuserp/api
node scripts/snapshot-public-counts.mjs      # after — compare
```

## 3. Contract

```powershell
npm run build --workspace @nexuserp/api
npm run openapi:generate
npm run openapi:diff
```

The committed `backend/openapi.json` must include the settings/module endpoints and the extended `/auth/me` payload; drift must be zero.

## 4. Frontend gates and sample-import guard

```powershell
npm test --workspace @nexuserp/web
npm run build --workspace @nexuserp/web       # includes design-values, no-gallery, css-classes, no-sample-imports
```

The new `check:no-sample-imports` guard must fail on a deliberately injected production sample import and pass on the clean tree (the guard spec demonstrates both states).

## 5. Manual verification (real admin session)

1. Sign in as an administrator; open `/settings/organization`. Confirm the General card shows the real name, currency, terms and version, the currency is read-only with "Locked once orders or invoices exist" after the first document, and saving updates the top-bar name at once with a success toast.
2. In the Modules card, turn off a module with no open documents; confirm the ConfirmDialog consequence, the inline state change, the sidebar entry showing "Turned off in Settings", direct-route redirect to Organization settings, absent Overview widgets/quick actions and the hidden Reports section. Re-enable and confirm data returns.
3. Try a forbidden toggle (dependency or open document) and confirm the inline reason and counts.
4. Register a new account with and without an organization name and currency; confirm the defaults (email-derived name, USD) and that all switchable modules start enabled.

## Mandatory checks before phase exit

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run verify:invariants:test`, `npm run verify:invariants`, `npm run openapi:diff`, `npm run build`, and the schema-lint/structure/naming/secrets guards from `npm run check:guards`. Per the constitution these gate phase exit and release, not deployment.
