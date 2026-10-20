# Quickstart: Staging Deployment

How to run every check this feature adds, and where the deployment procedure itself lives. The
procedure — creating the three projects, setting the variables, the first deploy, verification,
rollback, and the cost and backup statements — is the runbook at
[`docs/staging-deployment.md`](../../../docs/staging-deployment.md). This file is about running
the checks; that file is about *doing* the deployment.

Nothing below deploys anything, and nothing below requires a hosted environment except the
data-surface check, which asserts against a project that already exists
(FR-042).

---

## 1. The deploy-definition checks (unit, no database, no server)

```powershell
npm run test --workspace @nexuserp/api
```

The `unit` Jest project picks up `backend/scripts/**/*.spec.ts`, so these run with the rest of
the unit suite and in the `unit` job of the pipeline. Individually:

```powershell
npm run test:unit --workspace @nexuserp/api -- render-blueprint
npm run test:unit --workspace @nexuserp/api -- vercel-config
npm run test:unit --workspace @nexuserp/api -- trust-proxy
```

| Check | Asserts |
|---|---|
| `render-blueprint.spec.ts` | The Blueprint parses; exactly one `web` service; `runtime: node`; `plan: free`; `autoDeployTrigger: commit` (the deploy is not gated by the checks, per FR-010); the build and start commands are the repository's own, and the start command applies migrations before it starts the API; `healthCheckPath` **equals the route the service actually serves** (the bootstrap's global prefix composed with the health controller's path); every `envVars` entry names a key and uses exactly one value mode; secret entries carry no `value`; `SESSION_SECRET` and `CSRF_SECRET` use `generateValue`; `DATABASE_URL` uses `sync: false`; `PORT` is absent; `preDeployCommand` is absent; no value matches a secret pattern |
| `vercel-config.spec.ts` | The file parses as JSON; the API rewrite precedes the single-page fallback; the API rule matches the `/api` **segment** (not a string prefix); the fallback is `/(.*)` → `/index.html`; `installCommand` installs from the repository root with `--frozen-lockfile`; `buildCommand` builds `@nexuserp/shared` **before** `@nexuserp/web`; `outputDirectory` is `dist`; no value matches a secret pattern |
| `trust-proxy.spec.ts` | `TRUST_PROXY` defaults to off; it accepts `false` and a positive hop count; an invalid value fails startup with a message **naming the variable**; the parsed value is what the bootstrap passes on |

**What these checks do not do.** They do not validate Render's or Vercel's own schema. Read the
two files as data and assert *this feature's* requirements; a file can satisfy the provider's
schema and still declare the wrong health path or the wrong trigger. The provider's validator is
a complementary step:

```powershell
render blueprints validate render.yaml
```

## 2. The real-database integration check (integration, real PostgreSQL)

```powershell
npm run test:integration --workspace @nexuserp/api
```

The `integration` Jest project runs the service against a **real PostgreSQL 17**, applying the
repository's migrations first and then starting the API, so the migration route, startup, and the
`/api/v1/health` endpoint are all exercised together (FR-015, FR-023). Because the deployed
artefact is produced by the repository's own build and start commands, these are the same commands
Render runs, so the deployed service and the tested one do not drift.

It runs in an existing mandatory check rather than a new one.

## 3. The secret scan (runnable anywhere, part of the mandatory checks)

```powershell
node scripts/check-secrets.mjs
```

It walks the tracked files, reports any secret-shaped finding, and exits non-zero when it finds
one. The documented placeholders in `.env.example` are allowlisted, so the scan does not fail
for the values FR-029 *requires* the file to contain (FR-030).

## 4. The data-surface check (against an existing staging project)

```powershell
# Required: the project's reference and an access token with project-read access.
#   SUPABASE_PROJECT_REF=<project-ref>
#   SUPABASE_ACCESS_TOKEN=<personal access token>
sh scripts/check-supabase-data-api.sh
```

It performs **two** assertions and fails unless both hold, which is what stops it passing for
the wrong reason:

1. an anonymous request naming a known table at the project's own REST surface is **refused**
   and discloses no rows, with the observed status recorded so the assertion is pinned to a
   response the provider actually returns; and
2. the project's own Data API configuration reads as **disabled**.

A mistyped address, a missing project, or an unrelated error all produce "no rows", so the
second assertion is what makes the result non-vacuous (FR-021, SC-005). It is deliberate that
this is a documented, runnable check rather than a pipeline step: it asserts against a live
project, and the pipeline must never touch a hosted environment (FR-011).

## 5. The local behaviour that must not change

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

FR-032 requires local development to run the API and the interface directly on the machine
against a local PostgreSQL 17, with `npm run dev` starting both together and no container runtime
involved, and FR-043 requires the existing suites to keep passing. The feature changes no service,
no default, and no local command; it adds a configuration variable that defaults to off.

---

## Applying the trust setting by hand

`TRUST_PROXY` is off by default. To check the staging value locally, start the service with the
hop count that is actually in front of the service and observe the client address the service
records through the forwarded-for chain. Setting it higher than the real hop count trusts an
entry a caller can supply, which is the spoofing path the default exists to close
([research.md R-006](research.md)).

## Troubleshooting

| Symptom | Cause | Where to look |
|---|---|---|
| The page loads but the health panel fails | The rewrite order is reversed, or the API rule matches a string prefix instead of the `/api` segment | `vercel-config.spec.ts`; `contracts/deploy-definitions.md` §2 |
| The platform judges every deploy unhealthy | The declared health path and the served route disagree | `render-blueprint.spec.ts`; the deploy's health-check log |
| The deploy succeeds, then the first request is slow | A cold start on the free instance, or a paused database project waking up | The runbook's observed-behaviour section — this is documented behavior, not an outage |
| The service records the proxy's address, not the client's | `TRUST_PROXY` is unset in an environment that has a proxy in front | The environment-variable contract; the Blueprint's `envVars` |
| A migration fails and the deploy is discarded | Working as designed: the previous version keeps serving and the database stays at its last applied state | The runbook's rollback section, and the platform's deploy history |
