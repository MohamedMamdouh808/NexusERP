# Quickstart: 009-org-name-signup

Manual verification of the feature on a clean test environment.

## Prereqs

- `nexuserp_test` isolated schema (via `scripts/with-test-schema-env.mjs`) or a dev API you own.
- Frontend dev server on the usual port (`npm run dev:api` / `npm run dev:web` from repo root).

## Golden path — typed name

1. Open `/register`.
2. Fill email, password and **Organization name** `Acme Logistics`.
3. Submit → you land signed in.
4. Open the account menu (top bar, right side): the first row reads **Acme Logistics**, above **Profile** and **Sign out**; it is not focusable/clickable.
5. Refresh the page: the row still shows **Acme Logistics** (it comes from the session payload, not local state).

## Backward compatibility — omitted name

1. Open `/register`.
2. Fill email and password only.
3. Submit → signed in. Account menu shows `<email>'s Organization` — exactly what happened before this feature.

## Invalid name — refused inline

1. Open `/register`.
2. Fill email, password and **Organization name** `   ` (spaces only).
3. Submit → field-level error, nothing is created (verify no organization exists via the test DB query or by attempting sign-in).

## Long name — layout

1. Register with a 120-character organization name.
2. Open the account menu at desktop, tablet and phone widths: the name truncates with an ellipsis; **Profile** and **Sign out** remain fully visible and reachable by keyboard.

## Arabic

1. Switch the interface to العربية (Profile → Language).
2. The menu rows and labels render in Arabic; the organization name remains verbatim; RTL layout is mirrored with the organization row at the top.

## Automated tests (run before declaring done)

- `npm run test:integration --workspace @nexuserp/api` (or the registration spec: `backend/test/integration/auth.spec.ts`) — new cases assert the persisted name and the whitespace-only refusal create no records.
- `npx vitest run src/components/shell` — menu renders the organization row first, non-interactive.
- `npx vitest run src/features/auth` — register form accepts/validates the new field.
