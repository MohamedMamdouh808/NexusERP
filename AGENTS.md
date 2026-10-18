<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan

**Current Plan**: [001-platform-foundation](specs/001-platform-foundation/plan.md)
**Spec**: [001-platform-foundation/spec.md](specs/001-platform-foundation/spec.md)
**Research decisions**: [research.md](specs/001-platform-foundation/research.md)
**Data model**: [data-model.md](specs/001-platform-foundation/data-model.md)
**API contract**: [contracts/openapi.yaml](specs/001-platform-foundation/contracts/openapi.yaml) and [contracts/error-catalog.md](specs/001-platform-foundation/contracts/error-catalog.md)
**Setup and commands**: [quickstart.md](specs/001-platform-foundation/quickstart.md)
**Project rules**: [.specify/memory/constitution.md](.specify/memory/constitution.md)
**Product requirements**: [docs/PRD.md](docs/PRD.md)
**Design system**: [design-system/nexuserp/MASTER.md](design-system/nexuserp/MASTER.md)

## Tooling rules

- **On Windows PowerShell 5.1, never use `Get-Content`/`Set-Content` to edit files; use the Edit tool or explicit UTF-8 read/write.**
  PowerShell 5.1 defaults to the system ANSI code page, so that round-trip silently
  re-encodes UTF-8: em-dashes become `â€”` and other multi-byte characters are lost. It
  has already corrupted `specs/001-platform-foundation/HANDOVER.md` once. Use the Edit
  tool for in-place changes, or read and write with an explicit encoding, for example
  `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` paired with
  `[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))`.
- Prefer the Edit tool over `Set-Content` for the same reason.
- `.editorconfig` and `.gitattributes` enforce UTF-8 and LF; honour them when adding files.

## Never run the API with `tsx`

`npx tsx src/main.ts` is **forbidden**. `tsx` transpiles through esbuild, which does not emit
`design:parammetadata`, so `Reflect.getMetadata('design:paramtypes', ...)` is `undefined` and Nest
resolves constructor injection to `undefined`. `Reflector` then reaches `PermissionGuard` as
`undefined` and every request fails — while the app still logs a successful start and still
connects to the database, so the breakage looks like a request bug rather than a DI bug.

Start the API only with `nest build`, `nest start`, or `node dist/main.js`:

- `npm run dev` → `nest start --watch`
- `npm run build` → `nest build`
- `npm start` → `node dist/main.js`

`tsx` is acceptable only for scripts that build no Nest DI container: `prisma/seed.ts` and
`scripts/check-schema-numeric-types.ts`. Any script that boots the app, including OpenAPI
generation, must compile first and import from `dist`.
`apps/api/test/integration/boot-smoke.spec.ts` enforces this at the suite level.

## Prisma client after a clean install

`npm ci` wipes `node_modules`, including the generated client in `node_modules/.prisma`. Run
`npm run db:generate` before `npm run typecheck`, or every Prisma call is typed `any` and the type
check reports phantom `TS7006` / `TS2347` errors.
<!-- SPECKIT END -->