# NexusERP

Platform foundation: a NestJS API, a React web client, and a shared contract package, on PostgreSQL.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- Docker, for the PostgreSQL container
- npm 11+

## Quick start

```bash
cp .env.example .env
docker compose up -d --wait db
npm ci
npm run db:generate     # required after every clean install
npm run db:migrate
npm run db:seed
npm run dev
```

The API is then on <http://localhost:3000> and its health endpoint on
<http://localhost:3000/api/v1/health>.

> `npm ci` deletes `node_modules`, including the generated Prisma client. Run `npm run db:generate`
> before `npm run typecheck`, or every Prisma query will be typed `any` and the type check will
> report phantom errors.

## Never start the API with `tsx`

**Start the API only through `nest build`, `nest start`, or `node dist/main.js`.**
`npx tsx src/main.ts` is forbidden.

`tsx` uses esbuild, which does not emit `design:parammetadata`, so `design:paramtypes` is
`undefined` and Nest cannot resolve constructor injection. The application still logs a successful
start and still connects to the database, but requests fail, because `Reflector` is injected as
`undefined` into the permission guard.

Verified:

| Boot method | `design:paramtypes` | Serves requests |
|---|---|---|
| `tsx` | `undefined` | No |
| `nest build` / `tsc` | present | Yes (HTTP 200) |

| Script | Command |
|---|---|
| `npm run dev` | `nest start --watch` |
| `npm run build` | `nest build` |
| `npm start` | `node dist/main.js` |

`tsx` is fine for the seed and the schema checker, which build no DI container. Anything that boots
the application must compile first.

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `npm ci` | Reproducible install of every workspace from the committed lockfile |
| `npm run dev` | Start with hot reload |
| `npm run build` | Build the API and the web app |
| `npm run lint` | Lint and schema numeric checks |
| `npm run typecheck` | Type check every workspace |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests against a real PostgreSQL instance |

## Testing

Integration tests require a live database and will refuse to run without `DATABASE_URL`:

```bash
docker compose up -d --wait db
DATABASE_URL="postgresql://nexuserp:nexuserp_dev_password@127.0.0.1:5432/nexuserp?schema=public" npm run test:integration
```

## Documentation

- `specs/001-platform-foundation/quickstart.md` — commands, configuration, troubleshooting
- `specs/001-platform-foundation/HANDOVER.md` — implementation status and what is verified
- `.specify/memory/constitution.md` — engineering rules this repository must uphold