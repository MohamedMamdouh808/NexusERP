# Quickstart: Performance Measurement and Optimization End to End

**Feature**: `specs/019-performance-measurement-optimization/spec.md` | **Date**: 2026-11-20

## Prerequisites
- Node >= 22.13.0, PostgreSQL available, root `.env` with a database URL.
- Dependencies installed (`npm install` at root), migrations applied (`npm run db:migrate`).
- The isolated test schema rebuilt: `node scripts/reset-test-schema.mjs --migrate`.
- The generated dataset: `node scripts/generate-perf-dataset.mjs` (isolated schema only).

## 1. Build the production-like artefacts (mandatory for measurement)
```powershell
npm run build --workspace @nexuserp/api
npm run build --workspace @nexuserp/web
```

## 2. Run the API in production mode
```powershell
$env:NODE_ENV = 'production'
node backend/dist/main.js
```

## 3. Baseline
```powershell
node scripts/measure-network-floor.mjs
# Run the measurement suite (per endpoint + per screen) and write docs/performance-baseline.md
```

## 4. Optimise and re-measure
Apply the Phase 2 changes, rebuild, re-run the measurement suite, write `docs/performance-after.md` with before/after and the "Where the remaining time goes" section.

## 5. Guards
```powershell
npm run typecheck
npm run test
npm run test:integration
npm run verify:invariants:test
npm run verify:invariants
npm run openapi:diff
npm run build
npm run check:guards
```

## Mandatory checks before phase exit
`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run verify:invariants:test`, `npm run verify:invariants`, `npm run openapi:diff`, `npm run build`, `npm run check:guards`, plus the query-count and bundle-size budgets. Per the constitution these gate phase exit and release, not deployment.
