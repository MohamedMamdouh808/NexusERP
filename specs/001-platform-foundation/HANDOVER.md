# Handover: Platform Foundation — implementation status

**Feature**: 001-platform-foundation
**Updated**: 2026-10-18 (session 2, after the Docker reinstall)
**Branch**: `001-platform-foundation`
**Ledger**: **54 of 110 tasks verified** in this session

## What changed since the last session

Nothing from the failed session was trusted. Every previously checked task was reset to
unchecked and re-executed from a clean state. This session also found four problems the failed
session had masked.

### Pre-flight (mandatory, both passed)

```
docker version   -> client=29.8.2 server=29.8.2
docker run --rm hello-world -> "Hello from Docker!"  exit 0
docker compose version -> v5.6.0 (bundled)
```

Installed Docker only: `C:\Users\toshiba\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`.
The temporary standalone CLI and the `DOCKER_CONFIG` redirect are confirmed deleted, and no file
in the repository references either. Nothing was downloaded this session.

---

## Root cause of the previous session's failure

The disk was full (`ENOSPC`). That, not a Docker defect, caused the layer-extraction error and the
`Docker Desktop is unable to start` message. `vitest` had also been silently reporting
"no tests" for the same reason — writing its cache failed. Disk now: C: 12 GB, D: 60 GB free.

---

## Verified this session — command and result

| Task | Command | Result |
|---|---|---|
| T035 | `docker compose config -q` then `docker compose up -d --wait db` | Valid; `nexuserp-db` **Healthy**. `postgres:17-alpine` reports **PostgreSQL 17.11**, matching the pin's major version |
| T038 | `docker compose up -d --wait db` | Returns only after `Container nexuserp-db Healthy` |
| T020 | `docker compose down -v`, `up -d --wait db`, confirm **0 tables**, then `prisma migrate deploy` | `0` tables before; `Applying migration 20261018100057_init_reference_tables`; created `permissions`, `role_templates`, `role_template_permissions` |
| T020 (repeat) | Full `down -v` / `up` / `deploy` cycle, twice | Identical result both times |
| T030 | `prisma migrate deploy` again, then `prisma migrate diff --exit-code` | `No pending migrations to apply.` / `No difference detected.` exit **0** |
| T031 | `npm run check:migration-history` | `1 migration folder(s) found`. Now **wired into `npm run lint`** — it was authored but not reachable from any script before |
| T023 | Transaction unit-of-work integration tests | Rollback leaves row counts unchanged; a nested `runInTransaction` joins the outer transaction rather than opening a second commit boundary |
| T024 / T027 | `npm run db:seed` run twice | `Seeded 25 permissions and 5 role templates`; `25 permissions, 5 role templates, 68 grants` after both runs |
| T032 | Direct SQL invariants | `permissions 25 rows / 25 distinct code`; `role_templates 5 / 5 distinct key`; `role_template_permissions 68 rows / 68 distinct pairs` — **no duplicates**. `administrator` = 25 grants, `manager` = 22. `organization_id` columns = **0** |
| T033 | `docker build -f docker/api.Dockerfile` | Built. Then proven against a **fresh** database: 0 tables → entrypoint logged `Applying migration` → 3 tables → health 200 |
| T040–T043 | Error-envelope integration suite | Envelope has exactly four fields; `details` always an array; supplied id echoed, malformed id replaced, envelope id matches `x-request-id`; no `/app/`, `node_modules`, `at Object.`, or `postgresql://` in any body |
| T044 | `node dist/main.js` + `GET /api/v1/health` | **HTTP 200** `{"status":"ok",...,"database":{"status":"ok","latencyMs":51}}` |
| T045 | `docker compose stop db`, then request | **HTTP 503**, body captured (255 bytes): `{"code":"SERVICE_UNAVAILABLE","message":"The service is temporarily unavailable. Please try again shortly.","details":[{"field":null,"code":"CHECK_FAILED","message":"The database check is unavailable."}],"requestId":"..."}` |
| T045 leakage | grep the 503 body | `postgresql://`, `localhost`, `127.0.0.1`, `5432`, `node_modules`, `PostgreSQL 17`, `prisma`, `.ts`, `stack`, `Error:`, `ECONNREFUSED` — **all absent**. Recovers to 200 when the database restarts |
| T046 | Default-deny egress describe | Zero outbound calls on success and failure paths |
| T106 | Default-deny spec | Undeclared route → 403; `@Public()` → 200; declared permission without a session → 403; non-catalog permission → 403; never 404 |
| T108 | `sh scripts/verify-image-portability.sh nexuserp-api:portability` in **Git Bash** | **PASS**. Image started on an isolated network with a PostgreSQL container alongside it, configured only from `.env.example`; health returned `{"status":"ok",...,"database":{"status":"ok","latencyMs":2}}` |

### Whole-suite results

| Suite | Count |
|---|---|
| Shared (`vitest`) | 3 files, 39 tests |
| API unit (`jest --selectProjects unit`) | 6 suites, **78 tests** |
| API integration (real PostgreSQL) | 5 suites, **48 tests** |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, exit 0 |

### Clean-state commands (all exit 0)

| Command | Result |
|---|---|
| `npm ci` | 921 packages installed from the committed lockfile |
| `npx prisma generate` | Required after `npm ci` (see below) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors + numeric check + migration history guard |

---

## Four bugs found by executing rather than assuming

### 1. `npm ci` silently breaks the type check

After `npm ci`, `node_modules/.prisma` is gone, so every Prisma query is typed `any` and `tsc`
reported **8 phantom errors** (`TS7006` implicit any, `TS2347` untyped call). `prisma generate`
resolves all 8 with no code change. This will break CI the same way. Documented in `AGENTS.md`
and `README.md`.

### 2. Lint had never been run — 30 errors

`npm run lint` had not been executed before. 30 violations across 20 files: a `jest.config.ts`
parsing error (not in the tsconfig project), 12 unsafe enum comparisons in the exception filter,
6 `require()` imports in an integration spec, 5 unused variables, 2 `require-await`, 2 unsafe
calls, 1 unsafe member access, 1 unsafe return. All fixed; lint now exits 0.

Two were worth fixing properly rather than suppressing:

- `codeForStatus` now takes `HttpStatus` and the comparison uses `HttpStatus.INTERNAL_SERVER_ERROR`
  instead of a bare `500`, so the switch is type-checked against the same enum.
- `reference-data.spec.ts` no longer uses `require()`; it imports the migration-history helpers at
  the top level, which is safe because that script guards its `main()` behind `invokedDirectly`.

**A latent bug appeared en route:** the `require()` calls were hiding that the real
`AppliedMigration` type requires `finished_at`, which the looser inline type annotation had
omitted. The integration fixtures were asserting against a weaker shape than the code uses.

### 3. T033 was marked done on an image that did not do what the task says

The task requires the image to **run migrations before serving**. The Dockerfile's `CMD` was
plain `node dist/main.js`, and a comment deferred migrations to compose — so the image alone, which
is what a hosting platform receives, would have served against an empty database.

Fixed by adding `docker/api-entrypoint.sh`, which runs `prisma migrate deploy` under `set -e` and
then `exec node dist/main.js`. Proven against a fresh database: 0 tables → migration applied → 3
tables → health 200. I had already ticked T033 and un-ticked it when I noticed.

### 4. `docker-compose.yml` bound the database to every interface

The comment promised "Bound to loopback only" but the mapping was `'${POSTGRES_HOST_PORT:-5432}:5432'`,
which publishes on `0.0.0.0` and `[::]`. Changed to `127.0.0.1:...`; `docker compose ps` now shows
`127.0.0.1:5432->5432/tcp`. Host port 5432 was free, so no override was needed.

### Also fixed

- `verify-image-portability.sh` never removed its ephemeral database container, had no readiness
  wait before starting the API, and hardcoded credentials instead of reading `.env.example`.
  All three fixed.
- `check:migration-history` existed as a file but was not a script and was not in `lint`. Wired in.

---

## The two requested bugs and their tests

### Bug A — `HealthReportDto.checks` circular reference

**Test added:** `apps/api/src/common/dto/__tests__/openapi-document.spec.ts` — 3 tests that
`compile()` the real `AppModule`, call `SwaggerModule.createDocument`, and assert the document
builds, that `/api/v1/health` and both DTO schemas are present, and that `checks` resolves to a
`$ref` on `DependencyChecksDto` rather than an inlined type. No port is opened, so it stays a unit
test.

**Honest caveat on "fails first":** I could **not** reproduce a red-to-green cycle for the original
defect. The original self-referential code no longer exists, and my two attempts to recreate it —
an inline intersection with an explicit `type:` decorator, and an inline intersection with no
decorator at all — both built the document without error in this Swagger version. So I have
demonstrated that the test catches a *schema-shape* regression, but not that it reproduces the
original crash. Claiming otherwise would be false.

The test did earn its keep immediately: it failed three separate times during authoring for reasons
unrelated to the circular dependency — missing config, an incorrect `/api/v1/health` path (the
global prefix is applied in `main.ts`, not in `AppModule`), and a wrong assertion about how
`@nestjs/swagger` emits a `type: () => X` property (it wraps it in `allOf`, not a bare `$ref`).

### Bug B — `tsx` breaks dependency injection

**Verified mechanism.** The same probe, run both ways:

| Boot method | `Reflect.getMetadata('design:paramtypes', PermissionGuard)` |
|---|---|
| `tsx` (esbuild) | `undefined` |
| `tsc` / `nest build` | present |

And observed behaviour: under `tsx` the process boots, logs
`Nest application successfully started`, and **connects to the database** — but the port never
answers a request. Under `node dist/main.js` the same endpoint returns 200.

**Test added:** `apps/api/test/integration/boot-smoke.spec.ts` — runs `nest build`, asserts
`dist/main.js` exists, spawns it on a dedicated port, polls `/api/v1/health`, and requires 200 with
`status: "ok"`. It **fails** if the process exits before serving, and surfaces the captured stdout
and stderr rather than timing out blindly.

**Demonstrated failing:** with the fix in place the test passes. After removing the constructor
parameter that `PermissionGuard` depends on — simulating an unresolvable injection — the test
fails. Restored, it passes again.

**Documented in** `README.md`, `specs/001-platform-foundation/quickstart.md` (new section, with
the measurement table), and `AGENTS.md` (a new "Never run the API with `tsx`" section).

**Script audit** — the permitted forms are confirmed and unchanged:

| Script | Command | Verdict |
|---|---|---|
| `dev` | `nest start --watch` | ok |
| `build` | `nest build` | ok |
| `start` | `node dist/main.js` | ok |
| `db:seed` | `tsx prisma/seed.ts` | ok — no DI container |
| `check:schema-numeric-types` | `tsx scripts/check-schema-numeric-types.ts` | ok — no DI container |
| `openapi:generate` | `tsx scripts/generate-openapi.ts` | **dangling** — the file does not exist yet (T089). When written it must build first and require `dist` |

---

## Still unchecked, with reasons

| Task | Reason |
|---|---|
| **T034** | The web UI was never authored. `apps/web` contains only `eslint.config.mjs`, `package.json`, `tsconfig.json`, `vite.config.ts` — there is no `index.html`. `docker/web.Dockerfile` and `docker/static-server.mjs` exist but the build fails at `Could not resolve entry module "index.html"`. Blocked on T076–T088 |
| T029, T036, T037, T039 | Not authored |
| T047+ | See the task ledger |
| T057–T066 | Web shell and API client, not authored |
| T089–T094 | OpenAPI generation scripts; CI workflow |
| T095–T105 | Documentation and remaining coverage |

---

## Still needs GitHub Actions to verify

None of the following can be proven locally.

| Check | What CI must run | Why local proof is insufficient |
|---|---|---|
| Lint | `npm ci && npm run lint` | Passes locally now; never run on a clean checkout |
| Typecheck | `npm run typecheck` | Passes locally; must prove the `prisma generate` ordering in a fresh CI container |
| Unit + integration | `npm test`, `npm run test:integration` with a `postgres:17-alpine` service container | Locally verified against Compose; CI must prove the service-container path |
| Migration validation | `migrate deploy` from empty, re-apply, `migrate diff --exit-code`, `check:migration-history` | Verified locally against a Compose volume |
| **Lockfile reproducibility (FR-049)** | `npm ci --frozen-lockfile` in **every** job | Never implemented |
| **Contract drift (FR-044)** | Regenerate `openapi.json`, diff against the committed file, fail on difference | T089 not authored |
| **Image build (FR-050)** | `docker build` both Dockerfiles | API passes locally; **web fails** until the UI exists |
| **Image portability (SC-020)** | Run `verify-image-portability.sh` on a Linux runner | Passes locally in Git Bash |
| **No deploy stage (SC-019)** | Assert the workflow has no registry push, deploy job, or environment URL | No workflow authored yet |
| Required status checks (FR-051) | Repository settings | Not code |

### Coverage

`jest.config.ts` declares thresholds: **80%** for `src/common/`, `src/platform/` and `scripts/`
(Constitution Principle V, SC-014), with global thresholds at 0 because `main.ts` and modules are
excluded. These have **not** been run with `--coverage` in this session, so the 80% figure is
configured but unproven. T059 remains unchecked on that basis.

---

## Disk hygiene (T-pruning requirement)

`docker system df` before pruning:

```
Images        3   1   1.435GB   1.011GB reclaimable
Local Volumes 4   1   192.1MB   143.7MB reclaimable
Build Cache  38   0   3.21GB    3.21GB reclaimable
```

After `docker builder prune -af`, `docker image prune -f`, and removing the unused volumes:

```
Images        3   1   1.435GB
Local Volumes 1   1   48.37MB   (the live nexuserp-postgres-data, preserved)
Build Cache   0   0   0B
```

**3.21 GB of build cache and 143.7 MB of stale volumes reclaimed.** Three anonymous volumes left
by the failed session were removed. No dangling images remained. The live database volume was
preserved and the API image was kept so T108 remains reproducible.