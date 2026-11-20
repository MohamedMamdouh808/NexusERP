# Quickstart: Reports Analytics Page

## Prerequisites
- Dev stack running (`:3000` API, `:5173` web); signed-in member with `reports.read`.

## Walk-through
1. Open `/reports`. Range picker at top with presets and validation; URL reflects range.
2. KPI row loads (compare to previous equal-length period).
3. Scroll through chart grid: sales, purchases, payments, top products, top customers, docs-by-status, receivables aging, stock health, movements by type, low-stock list.
4. Click "Show as table" on any chart card — accessible table appears.
5. "Detailed reports" cards link to the five table reports carrying the same range.
6. Every figure labelled with period ("This period" / "As of today"); empty org shows empty state, never an error.

## Verification
- Backend typecheck/build; OpenAPI regen + drift check.
- Integration (isolated): `npx jest --selectProjects integration --testPathPattern 'analytics'`.
- Measured p95 recorded; no figure claimed without measurement.