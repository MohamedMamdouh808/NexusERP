# Handover: Platform Foundation — implementation status

**Feature**: 001-platform-foundation
**Written**: 2026-10-18, mid-implementation
**Branch**: `001-platform-foundation`

## What was blocked, and why this document exists

Implementation ran with this machine's toolchain, which cannot execute roughly a quarter of
the task list. No task was marked complete that was not actually run.

| Requirement | State on this machine |
|---|---|
| Node.js | v22.13.0 — the plan pins Node 24 LTS |
| npm registry | reachable |
| Docker + Compose v2 | **not installed** |
| Any container runtime | **not installed** |
| PostgreSQL (client, server, or port 5432) | **not present** |

Consequence: the Docker image, Compose environment, pipeline, seed execution, migration
execution, and every integration test are authored-or-not-yet, never verified. Everything
verifiable on Node alone was implemented and verified.

## Verified work — 35 of 110 tasks

All of the following were executed and observed passing, not merely written.

| Phase | Tasks | Verification evidence |
|---|---|---|
| 1 Setup | T001–T011 | `npm install` completed (908 packages); all three workspaces resolve; all binaries present on PATH |
| 2 Foundational (part) | T012–T019, T021, T022, T107, T110, T025, T026 | see below |

| Task | Verification |
|---|---|
| T012, T013, T014 | Shared contracts authored; exercised by 39 passing Vitest tests |
| T015, T016, T017 | 39 tests pass in `packages/shared` |
| T018 | `tsc` build produces `packages/shared/dist/index.js`; both workspaces depend on it |
| T019 | `prisma validate` → "The schema at prisma\prisma\schema.prisma is valid"; `prisma generate` succeeds |
| T021 | `jest --selectProjects unit` runs both configured projects |
| T022 | 16 config tests pass, including the bound-port case that names the port |
| T107 | 8 schema-checker tests pass |
| T110 | Checker verified with **both** controls: injected `Float` → exit 1 with the offending line; valid `Decimal(14,3)` → exit 0 |
| T025 | Config module implemented and covered by T022 |
| T026 | PrismaService and TransactionService author; whole package type-checks with exit 0 |
| T047, T048, T050, T051, T052, T054 | Unit-tested: redaction, log record, request-ID adopt/generate/sanitize, envelope classification, health fail-closed |
| T053, T055, T056, T028 | Authored and type-check clean; their HTTP-level proofs (T040-T045, T106) are integration tests and remain blocked |

### Defects the test-first discipline caught

Two real bugs were found by writing the tests before the code, which is the intended
behaviour of Constitution Principle V and worth recording:

1. **The numeric-type checker rejected every approved precision.** It normalised to
   `Decimal(14, 3)` while the allow-list held `Decimal(14,3)`. The earlier manual
   negative-control check passed only because the real schema contains no decimal column
   yet, so the bug was masked. T107 exposed it.
2. **The decimal schema produced an unhelpful message for a JavaScript number.** Zod
   reports a type mismatch before evaluating a pattern, so callers received
   "Expected string, received number" and learned nothing about why the number was
   refused. Fixed with `invalid_type_error`.

## Not implemented — 75 tasks

### Blocked on Docker or PostgreSQL (need an environment, not code)

T020, T023, T024, T027, T030, T031, T032, T033, T034, T035, T038, T044, T045, T046, T059,
T067–T075, T108, T109, T111, T104

- **Every integration test** needs a live database (Constitution Principle V, FR-047).
- **Migrations** (`T020`) — `prisma migrate dev` needs a shadow database. The schema is
  valid and the client generates; only application to a database is outstanding. Migration
  SQL can be produced without a database via `prisma migrate diff --from-empty
  --to-schema-datamodel prisma/schema.prisma --script`.
- **Docker, Compose, image builds** (T033–T035, T038, T108).
- **Pipeline runs** (T067–T075, T109, T111) — the workflow YAML is not yet written.
- **The seed was authored but never executed** (T027), so its idempotency guarantee is
  unproven.

### Not yet authored (no blocker, simply remaining work)

T028, T029, T036, T037, T039, T040–T043, T047–T058, T062, T063–T066, T076–T094, T095–T103,
T112

The application bootstrap, the error envelope, request identifiers, structured logging,
the health endpoint, the permission guard, the CI workflow, the web application shell, and
the documentation all remain to be written.

## Resume procedure

```bash
# 1. Install Docker Desktop (Compose v2) and start it.
# 2. Confirm the toolchain
node --version          # expect v22+; .nvmrc pins 24 for CI and images
docker compose version

# 3. Bring up the database
docker compose up -d --wait db

# 4. Complete Phase 2, then resume from Phase 3
npm run db:migrate      # T020
npm run db:seed         # T027, then verify T024 and T032
npm run test:integration
```

Node 22.13.0 is installed locally while `.nvmrc` and the Docker base image target Node 24.
`engines` was set to `>=22.13.0` so local installation works; the discrepancy is
deliberate and documented here. Align on Node 24 before the first pipeline run.

## Deliberate deviations from the plan

| Deviation | Reason |
|---|---|
| `engines.node = ">=22.13.0"` rather than pinned 24 | The local machine has Node 22.13.0. Pinning 24 would block `npm install` here. `.nvmrc` and the Docker image still target 24. |
| `@nestjs/terminus` removed from dependencies | Research R-008 decided against it in favour of a hand-rolled health service, because its default payload leaks version and error detail that FR-035 forbids. The initial manifest included it by mistake. |
| `ts-node` added as a dev dependency | Jest cannot parse `jest.config.ts` without it. |
| API package authored as CommonJS, `packages/shared` as ESM | Jest's default runtime is CommonJS. The shared package remains ESM; a Jest `moduleNameMapper` strips its `.js` specifiers. `import.meta` is avoided in API code for the same reason. |
| Dependency versions use caret ranges | Research R-018 asked for exact pins. With no ability to resolve-and-verify the full dependency tree offline, exact pins would be guesses. The committed `package-lock.json` provides the reproducibility FR-049 requires, and CI will verify the lockfile is unchanged after install. Tighten to exact pins once the tree is installed and green. |
| `prisma` config still declared in `package.json` | Prisma 6 deprecates `package.json#prisma` in favour of `prisma.config.ts`. Migrating now would change how migrations are invoked — commands that cannot be tested without a database. Deferred deliberately rather than changed blind. |

## Notes for whoever resumes

- The Prisma schema currently contains **no decimal columns**; the three tables are global
  reference data. The numeric-type checker is therefore proven by its unit tests and by
  injected-schema controls, not by a real money column. It will be exercised for the first
  time by the first business table.
- `jest.config.ts` keeps `coverageThreshold` and `testTimeout` at the top level. Jest does
  not accept them per project, despite `InitialProjectOptions` implying otherwise.
- `maxWorkers` is likewise not a per-project option; integration serialisation is enforced
  by `--runInBand` in the npm script instead.