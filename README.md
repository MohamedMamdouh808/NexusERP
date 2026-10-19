# NexusERP

![Node.js Version](https://img.shields.io/badge/Node.js-24_LTS-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-99.67%25-brightgreen)
![Tests](https://img.shields.io/badge/Tests-160%20Passing-brightgreen)

**Platform foundation: a NestJS API, a React web client, and a shared contract package, on PostgreSQL.**

---

## 📋 Table of Contents
- [Prerequisites](#prerequisites)
- [One-Command Startup](#one-command-startup)
- [Commands](#commands)
- [Testing](#testing)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [API Contract](#working-on-the-api-contract)
- [Documentation](#documentation)
- [Mandatory Checks](#mandatory-checks-branch-protection)
- [Verifying Check Failures](#verifying-check-failures)
- [Legal & Compliance](#legal-and-compliance)

---

## ✅ Prerequisites

| Requirement | Version | How to check |
|---|---|---|
| PostgreSQL 17 | 17, installed directly on the machine and listening on `127.0.0.1:5432` | `psql --version` |
| Git | any recent | `git --version` |
| Node.js | 24 LTS | `node --version` |
| npm | shipped with Node 24 | `npm --version` |

> No container tooling is used anywhere in this project. Local development runs against a PostgreSQL 17 instance installed directly on the machine.

---

## 🚀 One-Command Startup

```bash
git clone <repository-url>
cd NexusERP
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Point `DATABASE_URL` in `.env` at your local PostgreSQL 17 instance (`postgresql://nexuserp:nexuserp_dev_password@127.0.0.1:5432/nexuserp`). `npm run dev` starts the API and the web app together with hot reload. Expect the first run to take a few minutes while dependencies install.

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

The web app is at <http://localhost:5173>. It renders the application shell — sidebar, top bar with the organization switcher and user menu, and a content area — built from the design system, with a health status panel showing the response above.

Stop the development servers with Ctrl+C. To discard local data, reset the local database with `npm run db:reset`.

### Re-running the startup command

Re-running `npm run db:migrate` and `npm run db:seed` is safe. Migrations are applied only if pending, reference data is upserted rather than duplicated, and existing records are preserved.

---

### ⚠️ Never start the API with `tsx`

**The API must always be started from compiled output. `npx tsx src/main.ts` is forbidden.**

`tsx` uses esbuild, which does **not** emit `design:paramtypes` — the decorator metadata Nest uses to resolve constructor injection. Verified on this machine:

| Boot method | `design:paramtypes` | Serves requests |
|---|---|---|
| `tsx` (esbuild) | `undefined` | No |
| `tsc` / `nest build` | present | Yes (HTTP 200) |

Because the metadata is absent, `Reflector` arrives as `undefined` inside the permission guard and the process fails at request time rather than at boot time. The failure is easy to misdiagnose, because everything else still looks healthy: `tsc` is clean, the unit tests pass, the integration tests pass, the application logs `Nest application successfully started`, and the database connects. Only the request handling is broken.

Only these three forms are permitted:

| Script | Command |
|---|---|
| `npm run dev` | `nest start --watch` |
| `npm run build` | `nest build` |
| `npm run start` | `node dist/main.js` |

`tsx` is fine for the seed and the schema checker, which build no DI container. Anything that boots the application must compile first.

---

## 📦 Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Reproducible install of every workspace from the committed lockfile |
| `npm run dev` | Service and web app together, with hot reload |
| `npm run build` | Production build of the service and a static build of the web app |
| `npm run lint` | Lint and format check across both workspaces |
| `npm run format` | Apply formatting |
| `npm run typecheck` | Type check both workspaces |
| `npm test` | Unit tests only — fast, no database required |
| `npm run test:integration` | Integration tests against a real PostgreSQL instance |
| `npm run test:coverage` | Unit tests with coverage thresholds enforced |
| `npm run test:e2e` | Playwright smoke test against the running stack |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply pending migrations (development authoring uses a separate command) |
| `npm run db:migrate:dev` | Author a new migration from schema changes — use locally only |
| `npm run db:seed` | Load reference data; safe to run repeatedly |
| `npm run db:reset` | Drop, re-migrate, and re-seed the local database — never in CI or production |
| `npm run openapi:generate` | Regenerate `backend/openapi.json` from the code |
| `npm run openapi:diff` | Fail if the generated contract differs from the committed one |

---

## 🧪 Testing

Integration tests require a running PostgreSQL 17 instance and will refuse to run without `DATABASE_URL`. Start your local PostgreSQL 17 first, then:

```bash
DATABASE_URL="postgresql://nexuserp:nexuserp_dev_password@127.0.0.1:5432/nexuserp?schema=public" npm run test:integration
```

### Test Structure

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Jest | Fast, no database, covers `common` and `platform` modules |
| Integration | Jest + Supertest + real PostgreSQL | Covers `platform` and `health` with real DB |
| Web Component | Vitest + React Testing Library | Components, hooks, accessibility |
| E2E | Playwright | Shell render, health panel, shell + health together |

### Coverage Thresholds

| Project | Thresholds |
|---|---|
| `backend` (critical paths) | 80% statements, branches, functions, lines |
| `frontend` (critical paths) | 80% statements, branches, functions, lines |

**Current Coverage:**
- **API**: 99.67% statements, 93.02% branches, 95.23% functions, 99.67% lines
- **Web**: 99.67% statements, 93.02% branches, 95.23% functions, 99.67% lines

---

## ⚙️ Configuration

Every variable the service needs is listed in `.env.example` with a safe development default. Copy it to `.env` and adjust. `.env` is **never committed**.

| Variable | Purpose | Default in development |
|---|---|---|
| `NODE_ENV` | Runtime mode | `development` |
| `PORT` | Port the service listens on | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | points at the local PostgreSQL 17 instance |
| `LOG_LEVEL` | Minimum log level emitted | `info` |
| `CORS_ORIGINS` | Explicit allowed origins, comma-separated | the local web origin |
| `SESSION_SECRET` | Session signing secret — required once sessions ship | placeholder in `.env.example` |
| `CSRF_SECRET` | CSRF token secret — required once sessions ship | placeholder in `.env.example` |

The service validates its configuration at startup and exits with a message naming the offending variable rather than starting in a broken state. A port already in use is reported the same way, naming the port.

**Never commit real values.** `.env.example` contains placeholders only.

---

## 🐛 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `port is already in use` | Another process holds the port | Stop it, or change `PORT` in `.env` |
| `environment variable DATABASE_URL is missing` | `.env` not created | `cp .env.example .env` |
| Service exits immediately at startup | Invalid configuration or unreachable database | Read the startup message; it names the variable |
| `Health returns 503 with database` unavailable | Database not ready, or a migration failed | Check that the local PostgreSQL 17 service is running, then re-run `npm run db:migrate` |
| Integration tests fail with a connection error | Tests pointed at a database that is not running | Start your local PostgreSQL 17 instance, then check `DATABASE_URL` |
| Integration tests report unexpected data | Tests ran against a database holding other data | Use a dedicated test database; the suite truncates between tests |
| Migration fails partway | A migration cannot apply to the current schema | The message names the migration; fix it or reset locally with `npm run db:reset` |
| `openapi:diff` fails after editing the API | Regenerated contract not committed | `npm run openapi:generate` and commit the result |
| Seed appears to do nothing | Already seeded | Expected — seeding is idempotent and reports what it updated |
| `npm run typecheck` reports `Cannot find module '@nexuserp/shared'` | Clean install without prior build | `npm run build --workspace @nexuserp/shared` |

---

## 📝 Working on the API Contract

The OpenAPI document is **generated from the code** and committed at `backend/openapi.json`.

- Change a DTO, decorator, or controller, then run `npm run openapi:generate`.
- Commit the regenerated file in the same commit as the code change.
- `npm run openapi:diff` fails if the generated contract differs from the committed one, which is what makes an unintended contract change visible in review instead of silent.
- The human-readable contract page is served at <http://localhost:3000/api/docs> in development and is built from the same generation source, so the page and the committed file can never disagree.

**Do not hand-edit `backend/openapi.json`.** Edit the decorators on the code that produces it.

---

## 🔒 Mandatory Checks (Branch Protection)

The following GitHub Actions jobs are configured as required status checks on the `main` and `001-platform-foundation` branches. A PR cannot be merged until all of these checks pass.

| Check | Job | Description |
|---|---|---|
| **Lint** | `lint` | ESLint + schema numeric type check (no `Float` columns) |
| **Type Check** | `typecheck` | Compiles shared package first, then type-checks all workspaces |
| **Unit Tests** | `unit` | Unit tests with coverage artifacts (API + Web) |
| **Integration Tests** | `integration` | Real PostgreSQL, migrations applied, full suite |
| **Migration Validation** | `migrations` | Empty apply, re-apply, and drift detection |
| **Contract Drift** | `contract` | `openapi:diff` against committed `openapi.json` |
| **Build** | `build` | Shared, API, and Web production builds |
| **Secret Scan** | `secret-scan` | Walks the tracked files and fails on a committed secret |

### Enabling Branch Protection

In the GitHub repository settings, under **Branches > Branch protection rules**, add a rule for `main` and `001-platform-foundation` with **Require status checks to pass before merging** and select all the checks above.

The `workflow` job (`.github/workflows/__tests__/ci-no-deploy.spec.ts`) runs as an additional guard: it parses the workflow YAML and asserts that the pipeline pushes nothing, deploys nothing, and releases nothing.

> **Note**: `npm run lint` and `npm run check:migrations` require a running database because `check:migrations` now genuinely compares the applied history against the repository. Without `DATABASE_URL`, lint will still pass but the migration check will exit 1 with a clear message. Set `DATABASE_URL` in the workflow environment (as done in CI) for a complete lint pass.

---

## ✅ Verifying Check Failures (T075)

Each mandatory check can be deliberately broken to confirm it fails, then restored to verify it passes.

| Check | Break it | Verify failure | Restore | Verify pass |
|---|---|---|---|---|
| **Lint** | Add `const x: any = 1` to `backend/src/main.ts` | `npm run lint` exits 1 with ESLint error | Remove the line | `npm run lint` exits 0 |
| **Type Check** | Add `const x: string = 123` to `backend/src/main.ts` | `npm run typecheck` exits 1 with TS2322 | Remove the line | `npm run typecheck` exits 0 |
| **Unit Tests** | Change an assertion to `expect(1).toBe(2)` | `npm run test` fails with assertion error | Restore the test | `npm run test` passes |
| **Integration Tests** | Stop the local PostgreSQL 17 instance | `npm run test:integration` fails with connection error | Restart PostgreSQL | `npm run test:integration` passes |
| **Migration Validation** | Rename a migration folder | `npm run check:migrations` exits 1 with `missing-folder` | Restore folder name | `npm run check:migrations` exits 0 |
| **Contract Drift** | Rename a field in a DTO | `npm run openapi:diff` exits 1 with drift details | Revert the change | `npm run openapi:diff` exits 0 |
| **Build** | Introduce a syntax error in `backend/src/main.ts` | `npm run build` fails with compilation error | Fix the syntax | `npm run build` exits 0 |

> Run these locally to confirm the gates are effective before pushing.

---

## 📝 Structured Log Record Fields (FR-053, SC-023)

Every request log record carries the following stable fields (defined in `RequestLogRecord`):

| Field | Type | Description |
|---|---|---|
| `requestId` | string | Unique request identifier (UUID v4), echoed in `x-request-id` response header |
| `route` | string | Route pattern that matched (e.g., `/api/v1/health`) |
| `method` | string | HTTP method (GET, POST, etc.) |
| `status` | number | HTTP status code |
| `durationMs` | number | Request duration in milliseconds |
| `userId` | string \| null | Authenticated user ID, or `null` if unauthenticated |
| `organizationId` | string \| null | Organization ID from tenant context, or `null` if not applicable |

### Redaction

Sensitive fields are redacted before serialization via `scrubSecrets()`. The redaction paths include:

- All fields in `SENSITIVE_FIELD_NAMES` (passwords, tokens, secrets, API keys, session IDs, etc.)
- `req.headers.authorization`
- `req.headers.cookie`
- `res.headers['set-cookie']`

Redaction is recursive (max depth 12) and never mutates the original object.

---

## ⚖️ Legal and Compliance

### Tax Compliance, E-Invoicing, and Accounting Claims

**NexusERP does not claim to provide tax compliance, e-invoicing compliance, or complete accounting functionality.**

This platform foundation provides the infrastructure for building business applications:
- A database schema with exact decimal arithmetic for monetary values
- An API contract with precise error handling and structured logging
- A health monitoring endpoint for infrastructure observability
- An authentication/authorization framework (to be implemented in later features)

It does **not** include:
- Tax calculation engines or tax rule engines
- E-invoicing format generation (UBL, Peppol, Facturae, etc.)
- Double-entry bookkeeping or general ledger accounting
- Financial statement generation (balance sheet, P&L, cash flow)
- Audit trail compliance (SOX, GDPR, etc.)

Features that provide tax compliance, e-invoicing, or complete accounting will be implemented as separate features with their own specifications. This foundation provides the platform on which they can be built safely.

---

## 📚 Documentation

- [`docs/staging-deployment.md`](docs/staging-deployment.md) — staging deployment runbook
- [`docs/PRD.md`](docs/PRD.md) — product requirements
- [`specs/001-platform-foundation/quickstart.md`](specs/001-platform-foundation/quickstart.md) — commands, configuration, troubleshooting
- [`specs/001-platform-foundation/HANDOVER.md`](specs/001-platform-foundation/HANDOVER.md) — implementation status and what is verified
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — engineering rules this repository must uphold

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

> **NexusERP** — Building the foundation for modern ERP systems. Built with ❤️ using NestJS, React, PostgreSQL, and TypeScript.