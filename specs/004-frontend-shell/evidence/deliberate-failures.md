# Deliberately failing guards — both observations, per guard

Six guards in this feature are meant to fail on a defect that is present on purpose, and to
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

## Phase 5 guards — manifest, gallery controls, and production bundle

The per-task red and green observations for all Phase 5 state tests are in [phase5-evidence.md](phase5-evidence.md). These three checks are repeated here because they are deliberate guard demonstrations required by the feature.

### State-manifest guard — T046 (FR-061, SC-014)

**Defect:** `Button.default` was temporarily changed to an empty fixture string.

**Command:** `npm test -- --run src/dev/gallery/__tests__/state-manifest.guard.spec.ts`

**Observed with the defect:** exit code `1`; the guard named `Component Button state default` and reported a missing or empty fixture (`phase5-manifest-negative.log`).

**Observed after restore:** exit code `0`; both guard tests passed (`phase5-manifest-pass.log`).

### Gallery every-control guard — T058 (FR-071, SC-019)

**Defect:** `toggleFailure` was temporarily made a no-op by removing its state update.

**Command:** `npm test -- --run src/dev/gallery/__tests__/every-control.spec.tsx`

**Observed with the defect:** exit code `1`; the test saw no visible state change after activating “Simulate failure” (`phase5-every-control-negative.log`).

**Observed after restore:** exit code `0`; both tests passed, covering both demo switches, dialog cancellation, and the sample-record removal/toast flow (`phase5-every-control-pass.log`).

### Gallery absent from production build — T059 (FR-035, FR-070)

**Defect:** A temporary JavaScript bundle containing `nexuserp-dev-gallery-route` was supplied to the build guard.

**Command:** `npm run check:no-gallery -- <temporary-assets-directory>`

**Observed with the marker:** exit code `1`; the guard named the marker and bundle file (`phase5-no-gallery-negative.log`). The temporary directory was removed.

**Observed on the production build:** `npm run build` exited `0`; its `check:no-gallery` step scanned the emitted JavaScript bundle and reported the gallery absent (`phase5-build.log`).
