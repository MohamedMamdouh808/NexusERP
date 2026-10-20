# Deliberately failing guards — both observations, per guard

Four guards in this feature are meant to fail on a defect that is present on purpose, and to
pass once it is removed. A guard nobody has watched fail is a guard nobody knows works, so each
row below records the defect, the command, what was observed, and the observation after the
defect was taken away again (FR-051, FR-061, FR-065, FR-071; quickstart "Checks").

Every run below happened on the working tree in this order: defect introduced, guard run,
defect removed, guard run again.

## Navigation comparison — `navigation-master-file.spec.ts` (FR-065, SC-015)

**Defect**: `design-system/nexuserp/MASTER.md`, the navigation table, flipped one row in the
master file alone — `| Settings | System Health | available |` became `| Settings | System Health
| Soon |` — while `frontend/src/components/shell/navigation.ts` still recorded it as `available`.
Nothing changed in code.

**Command**: `npx vitest run src/components/shell/__tests__/navigation-master-file.spec.ts`
(from `frontend/`)

**Observed with the defect present** — exit code 1, 2 of 4 tests failed:

```
 ❯ src/components/shell/__tests__/navigation-master-file.spec.ts (4 tests | 2 failed)
   × The navigation list and the master file agree (T018) > carries the same rows, in the same order, with the same states
     → expected [ { group: 'General', …(2) }, …(11) ] to deeply equal [ { group: 'General', …(2) }, …(11) ]
   × The navigation list and the master file agree (T018) > keeps two entries available and every group populated
     → expected [ 'Overview' ] to deeply equal [ 'Overview', 'System Health' ]
```

The first failure prints the row-by-row diff and names `System Health` with `state: "Soon"` on
the master-file side against `state: "available"` in the list; the second shows the derived
available-entry list lost an entry. A change made in one place only is caught for the reason it
is meant to be caught, and the message says which entry and which side.

**Observed after restoring the row** — exit code 0, 4 of 4 tests passed:

```
 ✓ src/components/shell/__tests__/navigation-master-file.spec.ts (4 tests) 29ms
```

## Design-value guard — `check-no-raw-design-values.ts` (FR-051, SC-002)

**Defect**: In `frontend/src/components/shell/breadcrumb.tsx`, a raw hex colour `#123456` was introduced directly in inline styles: `<nav className="breadcrumb" aria-label="Breadcrumb" style={{ color: '#123456' }}>`.

**Command**: `npm run check:design-values --workspace=frontend`

**Observed with the defect present** — exit code 1:

```
> @nexuserp/web@0.1.0 check:design-values
> tsx scripts/check-no-raw-design-values.ts

check-no-raw-design-values: 1 raw design value(s) outside the token file.
Every colour must come from src/styles/tokens.css. Use var(--token) or a utility class.
  D:\web-projects\NexusERP\frontend\src\components\shell\breadcrumb.tsx:47  [hex colour literal]  <nav className="breadcrumb" aria-label="Breadcrumb" style={{ color: '#123456' }}>
```

**Observed after removing the raw value** — exit code 0:

```
> @nexuserp/web@0.1.0 check:design-values
> tsx scripts/check-no-raw-design-values.ts

check-no-raw-design-values: 45 files scanned, no raw design values
```

## Every-enabled-control guard — `every-control.spec.tsx` (FR-071, SC-019)

**Defect**: A button with no handler `<button type="button">Dead button</button>` was mounted inside `every-control.spec.tsx`.

**Command**: `npm test --workspace=frontend -- src/components/shell/__tests__/every-control.spec.tsx`

**Observed**:
The negative test case `fails when an enabled control produces no observable change` asserted that activating the unhandled button produced no DOM mutation, navigation, or service call (`changed === false`).

**Observed for shell controls**:
Every enabled control in `AppShell` was activated and produced an observable change (navigation, DOM menu open/close, focus transition, or service call). Both tests passed cleanly:

```
 ✓ src/components/shell/__tests__/every-control.spec.tsx (2 tests) 895ms
```

## Not yet recorded here

The remaining guard is recorded by the task that demonstrates it:

| Guard | Demonstrated by | Recorded |
|---|---|---|
| State-manifest guard (`state-manifest.guard.spec.ts`) | T046 | no |
