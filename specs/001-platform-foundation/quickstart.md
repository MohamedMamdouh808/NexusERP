# Quickstart: Platform Foundation

**Feature**: 001-platform-foundation | **Date**: 2026-10-18

Everything a new contributor needs to reach a running environment and a green check suite.

---

## Prerequisites

| Requirement | Version | How to check |
|---|---|---|
| Docker with Compose v2 | 22+ with the `compose` plugin | `docker compose version` |
| Git | any recent | `git --version` |
| Node.js | 24 LTS | only needed if you choose the non-Docker path below |
| npm | shipped with Node 24 | `npm --version` |

You do **not** need a PostgreSQL server installed locally. The database runs in a container.

---

## One-command startup

```bash
git clone <repository-url>
cd NexusERP
cp .env.example .env
docker compose up -d --wait
```

`--wait` returns only after the database, the service, and the web app all report healthy. Expect
this to take a few minutes on the first run while images build and dependencies install.

Then confirm:

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "status": "ok",
  "uptimeSeconds": 42,
  "checks": {
    "application": { "status": "ok" },
    "database": { "status": "ok", "latencyMs": 2 }
  }
}
```

The web app is at <http://localhost:5173>. It renders the application shell — sidebar, top bar with
the organization switcher and user menu, and a content area — built from the design system, with
a health status panel showing the response above.

Stop the environment with `docker compose down`. Add `-v` to also delete the database volume, which
discards all local data.

### Re-running the startup command

Running `docker compose up -d --wait` again is safe. Migrations are applied only if pending,
reference data is upserted rather than duplicated, and existing records are preserved.

---

## Non-Docker path

Useful for fast inner-loop development with hot reload. You still need a PostgreSQL server; the
simplest is to run only the database in Docker:

```bash
cp .env.example .env
docker compose up -d --wait db

npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts the service and the web app together with hot reload.

### Never start the API with `tsx`

**The API must always be started from compiled output. `npx tsx src/main.ts` is forbidden.**

`tsx` transpiles through esbuild, which does **not** emit `design:parammetadata` — the
`design:paramtypes` decorator metadata Nest uses to resolve constructor injection. Verified on
this machine:

| Boot method | `Reflect.getMetadata('design:paramtypes', PermissionGuard)` | Serves requests |
|---|---|---|
| `tsx` (esbuild) | `undefined` | No — the port never answers |
| `tsc` / `nest build` | present | Yes, HTTP 200 |

Because the metadata is absent, `Reflector` arrives as `undefined` inside the permission guard and
the process fails at request time rather than at boot time. The failure is easy to misdiagnose,
because everything else still looks healthy: `tsc` is clean, the unit tests pass, the integration
tests pass, the application logs `Nest application successfully started`, and the database connects.
Only the request handling is broken.

Only these three forms are permitted:

| Script | Command |
|---|---|
| `npm run dev` | `nest start --watch` |
| `npm run build` | `nest build` |
| `npm start` | `node dist/main.js` |

`tsx` remains correct for the two scripts that construct **no** Nest DI container — the seed
(`tsx prisma/seed.ts`) and the schema checker (`tsx scripts/check-schema-numeric-types.ts`). Any
future script that boots the application, including OpenAPI generation, must build first and
require `dist`. `test/integration/boot-smoke.spec.ts` enforces this by running `nest build`,
launching `node dist/main.js`, and asserting a real request returns 200.

---

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Reproducible install of every workspace from the committed lockfile |
| `npm run dev` | Service and web app together, with hot reload |
| `npm run build` | Production build of the service and a static build of the web app |
| `npm run lint` | Lint and format check across both workspaces |
| `npm run format` | Apply formatting |
| `npm run typecheck` | Type check both workspaces without emitting output |
| `npm test` | Unit tests only — fast, no database required |
| `npm run test:integration` | Database-backed tests against a real PostgreSQL instance |
| `npm run test:coverage` | Unit tests with coverage thresholds enforced |
| `npm run test:e2e` | Playwright smoke test against the running stack |
| `npm run db:migrate` | Apply pending migrations (development authoring uses a separate command) |
| `npm run db:migrate:dev` | Author a new migration from schema changes — use locally only |
| `npm run db:seed` | Load reference data; safe to run repeatedly |
| `npm run db:reset` | Drop, re-migrate, and re-seed the local database — never in CI or production |
| `npm run openapi:generate` | Regenerate `apps/api/openapi.json` from the code |
| `npm run openapi:diff` | Fail if the generated contract differs from the committed one |
| `docker compose up -d --wait` | Full environment: database, service, web app |
| `docker compose down` | Stop the environment |

### Integration tests and the database

`npm run test:integration` needs a reachable PostgreSQL instance and applies migrations to it
before running. Point `DATABASE_URL` at a database you are willing to have migrated and cleared —
the integration suite truncates between tests. To run the whole environment's checks the way CI
does:

```bash
docker compose up -d --wait db
npm run db:migrate
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
npm run openapi:diff
```

---

## Reference data

`npm run db:seed` loads, repeatably:

- the permission-code catalog for every module in the product, and
- the five default role templates — Administrator, Manager, Sales, Inventory, Purchasing — with
  the permissions each grants.

Seeding upserts on natural keys, so running it twice changes nothing the second time. It is the
supported way to obtain reference data in development and test environments; it is never run
against production.

A tenant-bearing demonstration organization arrives with the organization feature, not with this
one. See [research.md R-016](research.md).

---

## Configuration

Every variable the service needs is listed in `.env.example` with a safe development default.
Copy it to `.env` and adjust. `.env` is never committed.

| Variable | Purpose | Default in development |
|---|---|---|
| `NODE_ENV` | Runtime mode | `development` |
| `PORT` | Port the service listens on | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | points at the `db` container |
| `LOG_LEVEL` | Minimum log level emitted | `info` |
| `CORS_ORIGINS` | Explicit allowed origins, comma-separated | the local web origin |
| `SESSION_SECRET` | Session signing secret — required once sessions ship | placeholder in `.env.example` |
| `CSRF_SECRET` | CSRF token secret — required once sessions ship | placeholder in `.env.example` |

The service validates its configuration at startup and exits with a message naming the missing or
invalid variable rather than starting in a broken state. A port already in use is reported the same
way, naming the port.

Never commit real values. `.env.example` contains placeholders only.

---

## Working on the API contract

The OpenAPI document is **generated from the code** and committed at `apps/api/openapi.json`.

- Change a DTO, decorator, or controller, then run `npm run openapi:generate`.
- Commit the regenerated file in the same commit as the code change.
- `npm run openapi:diff` fails if the generated document differs from the committed one, which is
  what makes an accidental contract change visible in review instead of silent.
- The human-readable documentation page is served at <http://localhost:3000/api/docs> in
  development and is built from the same generation source, so the page and the committed file can
  never disagree.

Do not hand-edit `apps/api/openapi.json`. Edit the decorators on the code that produces it.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `port is already in use` | Another process holds the port | Stop it, or change `PORT` in `.env` |
| `environment variable DATABASE_URL is missing` | `.env` not created | `cp .env.example .env` |
| Service exits immediately at startup | Invalid configuration or unreachable database | Read the startup message; it names the variable or dependency |
| Health returns 503 with `database` unavailable | Database container not ready, or a migration failed | `docker compose logs db`; then `docker compose up -d --wait` again |
| Integration tests fail with a connection error | Tests pointed at a database that is not running | `docker compose up -d --wait db` |
| Integration tests report unexpected data | Tests ran against a database holding other data | Use a dedicated test database; the suite truncates between tests |
| Migration fails partway | A migration cannot apply to the current schema | The message names the migration; fix it or reset locally with `npm run db:reset` |
| `openapi:diff` fails after editing the API | Regenerated contract not committed | `npm run openapi:generate` and commit the result |
| Seed appears to do nothing | Already seeded | Expected — seeding is idempotent and reports what it updated |

---

## Next steps

| To work on | Start with |
|---|---|
| Authentication and sessions | `research.md` R-015 for the reserved seams and the settled decisions |
| Organizations and tenant isolation | `data-model.md` "Tenant scoping convention" |
| Roles and permissions | `data-model.md` `RoleTemplate`, `contracts/error-catalog.md` for the permission catalog |
| A business module | `data-model.md` conventions for decimals, immutability, and transactions; the relevant page file in `design-system/nexuserp/pages/` for its screens |