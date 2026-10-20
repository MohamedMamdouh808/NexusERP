# Quickstart: Frontend Design Foundation and Application Shell

How to run and review this feature. It needs **no backend and no database** — the interface
runs entirely on sample data reached through the service interface (spec FR-036, FR-048).

## Prerequisites

- Node.js 24 LTS (root `.nvmrc` = `24`; `engines.node >= 22.13.0`).
- `npm ci` at the repository root (workspaces), then `npm run db:generate` **before** any
  typecheck, because a clean install wipes the generated Prisma client
  (see `AGENTS.md`).

## Run the interface

```powershell
npm run dev --workspace @nexuserp/web      # Vite on http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:3000`, so the System Health panel shows its
failure state unless the API is running. That is expected: the shell's live page needs the API;
the rest of the feature does not.

## Review the gallery (development only)

Open `http://localhost:5173/dev/gallery` (the dev-only route — not linked from the shell, and
absent from a production build). On it:

- Every component and every state in the state manifest renders side by side.
- The **"Sample data"** marker is visible (FR-040).
- The controls act on **in-memory sample state** through the sample service: confirming a
  dialog removes the sample row, the toast names the removed record, menu actions run, and the
  organization switch changes the active sample organization. Reload restores the initial state
  (FR-068).
- The labelled switches **"Simulate failure"** and **"Simulate slow response"** make the sample
  service reject or delay, so the loading state, the error state with its `requestId`, and the
  simulated 429 handling can be reviewed as real flows (FR-069).

## Checks

```powershell
# from the repository root, workspace-scoped
npm run typecheck  --workspace @nexuserp/web
npm run lint       --workspace @nexuserp/web
npm test           --workspace @nexuserp/web        # Vitest: unit + component + guard tests
npm run test:coverage --workspace @nexuserp/web     # 80% thresholds
npm run check:design-values --workspace @nexuserp/web
npm run build      --workspace @nexuserp/web        # tsc -b && vite build
npm run test:e2e   --workspace @nexuserp/web        # Playwright smoke test
```

The production build runs the **build-output gallery check**
(`scripts/check-no-gallery-in-build.ts`): it scans `dist/assets/*.js` for the gallery marker and
fails if the route reached the build (FR-070, SC-008).

## Guards that are shown failing on purpose

Each is run once with the defect deliberately present, observed to fail, then run again once the
defect is removed and observed to pass. Record both observations (FR-051, FR-061, FR-065,
FR-071):

| Guard | How it is shown failing | Spec |
|---|---|---|
| Design-value guard | Type a raw hex colour into a component | FR-051, SC-002 |
| State-manifest guard | Add a state with no fixture or no assertion | FR-061, SC-014 |
| Navigation comparison | Flip an entry in code but not the master file (or the reverse) | FR-065, SC-015 |
| Every-enabled-control guard | Add a button with no handler | FR-071, SC-019 |

## Evidence to produce

Write these into `specs/004-frontend-shell/evidence/`:

- `contrast-report.md` — one measured ratio per pair the direction introduces (FR-004, FR-052).
- `keyboard-walkthrough.md` — each interactive element and the result of operating it from the
  keyboard (FR-045, FR-053).
- The deliberate-failure observations above, and the measured bundle-size delta (FR-058,
  SC-013).

## What this feature does not do

No authentication, no backend, no database, no chart, no dark theme, no global search, no
notifications, and no phone layout (FR-048, FR-042). The gallery is a development tool, never a
product screen (FR-035).
