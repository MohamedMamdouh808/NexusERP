# Performance after (Feature 019)

## Per-request context

| Metric | Before | After |
|---|---|---|
| Context queries per authenticated request | 5-8 | 2 |
| Authorization effect delay | next request | next request (unchanged) |

## Network floor

Unchanged (hosting/database region): median 370.6 ms, p95 667.7 ms.

## Bundle size

- Route-level lazy loading and `staleTime` (5 min) for reference data reduce
  initial JavaScript and refetch pressure.
- Bundle budget check passes on the clean tree.

## Non-improvements

- The network round-trip floor is unchanged: it is a hosting/region property,
  out of scope (no hosting or region change).
- Password hashing parameters are unchanged (security requirement).
- No Redis or in-memory business-data caching was added (out of scope).

## Where the remaining time goes

Recommendations only, not changes made by this feature:

1. **Network floor (370 ms median, 668 ms p95):** the database round trip
   dominates. Options: move the application closer to the database region, or
   use a lower-latency connection pooler. This is the single biggest lever.
2. **Cold starts:** the first request after idle pays connection setup.
   Pool warm-up (`SELECT 1` on `OnModuleInit`) is implemented; further gains
   require a always-warm host.
3. **Hosting regions:** frontend and API are in different regions from the
   database; co-locating them would remove a hop.
4. **Frontend rewrite hop:** the SPA re-fetches `/auth/me` and reference data
   on navigation; longer `staleTime` and conditional requests (ETag) reduce
   this. A server-rendered or edge-cached shell would remove it entirely.
5. ** ORM/schema:** list endpoints still issue up to 3 queries; further
   reduction needs query rewriting, out of scope for this pass.
