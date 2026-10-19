import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * The documented setup is `cp .env.example .env` at the repository root, followed by
 * `npm run db:migrate` (quickstart.md, README.md). That only works if the Prisma
 * commands read the ROOT `.env`.
 *
 * It used not to: Prisma loads `.env` from its schema directory and its working
 * directory, both of which were `backend` and `database/prisma`, and it never walks
 * up to the repository
 * root. The documented command therefore failed with "environment variable
 * DATABASE_URL is missing" on a correct setup, and the documented fix
 * (`cp .env.example .env`) did not help, because the file it creates was in the wrong
 * place. A developer following the quickstart exactly could not run the first database
 * command.
 *
 * These tests pin the fixed behaviour so the gap cannot reopen silently.
 */

const repoRoot = resolve(__dirname, '..', '..', '..');
const apiRoot = join(repoRoot, 'backend');
const apiPackageJson = JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const prismaScripts = ['db:generate', 'db:migrate', 'db:migrate:dev', 'db:reset'] as const;

// These read runtime configuration, so they fail the same way the Prisma commands did:
// `setup-integration.ts` refuses to run without DATABASE_URL rather than silently
// substituting an in-memory database (Constitution Principle V, FR-047), and the
// application validates its environment at module load.
const runtimeScripts = ['dev', 'start', 'test', 'test:unit', 'test:integration', 'test:coverage'] as const;

describe('The documented database commands read the repository-root .env', () => {
  it('exists at the repository root, because that is where the docs tell you to create it', () => {
    expect(existsSync(join(repoRoot, '.env.example'))).toBe(true);
  });

  it.each(prismaScripts)('%s loads the root .env instead of relying on Prisma default lookup', (script) => {
    const command = apiPackageJson.scripts[script];

    // Every Prisma command goes through the loader, so the root .env is always read.
    expect(command).toContain('with-root-env');

    // And it is not a bare `prisma` invocation, which would silently regress to
    // the broken behaviour.
    expect(command).not.toMatch(/^\s*prisma\s/);
  });

  it.each(runtimeScripts)('%s loads the root .env so runtime configuration is present', (script) => {
    expect(apiPackageJson.scripts[script]).toContain('with-root-env');
  });

  it('the loader exists and loads the root .env rather than a path inside the workspace', () => {
    const loader = join(repoRoot, 'scripts', 'with-root-env.mjs');
    expect(existsSync(loader)).toBe(true);

    // Strip comments before checking: the loader's own doc comment legitimately
    // NAMES `backend/.env` to explain what it does not read, and a source scan that
    // counted prose would pass or fail for the wrong reason.
    const source = readFileSync(loader, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, (whole, prefix: string) => prefix + ' '.repeat(whole.length - prefix.length));

    expect(source).toContain('.env');
    // It must read the root file, not a path inside the workspace.
    expect(source).not.toMatch(/apps[/\\]api[/\\]\.env/);
  });
});