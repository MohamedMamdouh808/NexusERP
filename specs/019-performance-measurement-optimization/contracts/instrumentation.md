# Contract: Instrumentation and Measurement

**Feature**: `specs/019-performance-measurement-optimization/spec.md` | **Date**: 2026-11-20

## Server-Timing header

Every response carries:

```
Server-Timing: db;dur=<ms>, app;dur=<ms>
```

- `db`: total time spent in database queries during this request (sum of query durations).
- `app`: total request time minus `db` (everything outside the database: serialisation, logging, framework overhead).
- In development and tests (`NODE_ENV !== 'production'`) the header is always emitted, along with `X-Query-Count: <n>`.
- In production the header is emitted only when `PERF_INSTRUMENTATION=1`; otherwise it is omitted (cheap: a single integer increment per query is still collected for the budget tests).

## Per-query log (development and tests only)

Each query is logged once at debug level with masked parameters:

```json
{ "level": "debug", "query": "SELECT ... WHERE organization_id = $1", "durationMs": 12.3, "requestId": "..." }
```

- Parameters are masked to `[?]` in the logged text; passwords, tokens, session identifiers and personal data (emails, names) are never logged.
- In production the per-query log is off by default (debug level disabled).

## Network floor

A one-off measurement script (`scripts/measure-network-floor.mjs`) runs `SELECT 1` 100 times and reports median and p95 round-trip time. The result is recorded in `docs/performance-baseline.md` as "round-trip floor" and every endpoint is reported as `queries × round-trip floor + everything else`.

## Baseline report (`docs/performance-baseline.md`)

Per endpoint, per screen: median and p95 latency, queries per request, payload size, at concurrency 1 and 8. Login and registration are reported separately. A ranked list of the biggest costs with evidence precedes any fix.

## After report (`docs/performance-after.md`)

The same measurements after the changes, with before and after for every changed endpoint and screen, including non-improvements and their reasons, plus a "Where the remaining time goes" section naming the network floor, hosting regions, cold starts and the frontend rewrite hop as recommendations.
