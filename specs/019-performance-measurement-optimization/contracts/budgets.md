# Contract: Query-Count and Bundle-Size Budgets

**Feature**: `specs/019-performance-measurement-optimization/spec.md` | **Date**: 2026-11-20

## Query-count budget (per endpoint)

Each endpoint declares its maximum number of database queries as a constant in its test file. The test fails when the declared budget is exceeded. Budgets:

| Endpoint class | Max queries |
|----------------|-------------|
| Context loading (session, membership, roles, permissions, module state, organization) | 2 (target 1) |
| List endpoints | 3 |
| Detail endpoints | 2 |
| Report endpoints | 3 |

The budget is enforced by reading the per-request query counter (instrumentation) at the end of the request. The test is deterministic and time-independent.

## Bundle-size budget (per route)

Each route declares its maximum JavaScript bundle size in `frontend/scripts/check-bundle-budget.mjs`. The check reads the built `dist/assets/*.js` files and fails when a route's chunk exceeds its budget. The budgets are enforced in CI alongside the existing guards (`check:design-values`, `check:no-sample-imports`, `check:css-classes`).

## CI wiring

- Backend: the query-count budget tests run as part of `npm run test:integration` (they require the isolated schema and the generated dataset).
- Frontend: the bundle-size check runs as part of `npm run build` and `npm run check:guards`.
- Both are mandatory: a regression fails the build.
