# Performance baseline (Feature 019)

Measured against the isolated `nexuserp_test` schema with the deterministic
performance dataset (≥2,000 products, 20,000 movements, 5,000 invoices,
5,000 sales orders, 2,000 purchase orders, 5,000 payments). Production-like
build (`nest build` + `node dist/main.js`, `NODE_ENV=production`).

## Network floor (round-trip)

`scripts/measure-network-floor.mjs` (100 × `SELECT 1`):

- Median: 370.6 ms
- p95: 667.7 ms

Every endpoint pays this floor once per sequential query, so it is reported
separately from application time.

## Per-request context (before)

Before the change, an authenticated request needed, before its own work:

- Session lookup + membership + organization: 1 query
- Membership roles: 1 query
- Effective permissions: 1 query (nested join)
- Module state: 1 query
- `AuthService.me()` (when called): 3 queries (membership, roles, permissions)
- `lastUsedAt` update: 1 query

Total: 5-8 context queries per authenticated request.

## Per-request context (after)

One round trip (`session.findUnique` with `relationLoadStrategy: 'join'`) loads
session, user, membership, organization, modules, roles and permissions, and a
single `session.update` refreshes `lastUsedAt`:

- Context queries per authenticated request: 2 (target 1; the second is the
  `lastUsedAt` write, which is observable session activity, not authorization)
- Deactivation, role change, module disable and session end take effect on the
  next request (no caching beyond the request).

## Bundle size

- Entry bundle (before route splitting): 1,313.7 KiB single chunk.
- Budgets enforced by `frontend/scripts/check-bundle-budget.mjs`:
  total 2,500 KiB, per chunk 1,800 KiB, per route as declared.

## Ranked costs

1. Network round-trip floor (370 ms median) dominates every endpoint.
2. Per-request context queries (5-8 sequential round trips) added 1.8-3.0 s.
3. Large single JavaScript bundle (1.3 MiB) delayed first paint.
4. List/report endpoints issued N+1 and separate count queries on the
   generated dataset.
