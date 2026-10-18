import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from '@jest/globals';

import {
  compareHistory,
  listMigrationFolders,
  resolveMigrationsDir,
  type AppliedMigration,
} from '../check-migration-history';

/**
 * FR-014 requires the system to REFUSE TO PROCEED when the applied history is missing,
 * out of order, or inconsistent with the repository.
 *
 * This guard exists because `prisma migrate status` does not: with the migrations
 * directory renamed away it prints "No migration found" and still exits 0 (verified on
 * Prisma 6.19.3). A guard that cannot fail is worse than no guard, because it is read as
 * evidence that the history is consistent.
 */

const applied = (migration_name: string, overrides: Partial<AppliedMigration> = {}): AppliedMigration => ({
  migration_name,
  finished_at: new Date('2026-01-01T00:00:00Z'),
  rolled_back_at: null,
  ...overrides,
});

const fixtures: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  fixtures.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

describe('compareHistory (FR-014)', () => {
  it('reports nothing when the applied history matches the repository', () => {
    expect(compareHistory([applied('20260101000000_init')], ['20260101000000_init'])).toEqual([]);
  });

  it('refuses when the database records a migration the repository does not contain', () => {
    // This is the case `prisma migrate status` reports and then ignores.
    const problems = compareHistory([applied('20260101000000_init')], []);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('missing-folder');
    expect(problems[0]?.migration).toBe('20260101000000_init');
    expect(problems[0]?.message).toContain('20260101000000_init');
  });

  it('refuses when the repository holds a migration the database has not applied', () => {
    const problems = compareHistory([], ['20260101000000_init']);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('missing-file');
  });

  it('refuses an empty migrations directory with an empty history rather than calling it clean', () => {
    const problems = compareHistory([], []);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('empty-directory');
  });

  it('does not treat a rolled-back migration as a missing folder', () => {
    const problems = compareHistory(
      [applied('20260101000000_init', { rolled_back_at: new Date('2026-02-01T00:00:00Z') })],
      [],
    );

    expect(problems).toEqual([]);
  });

  it('names every disagreement rather than stopping at the first', () => {
    const problems = compareHistory(
      [applied('a'), applied('b')],
      ['c'],
    );

    expect(problems.map((problem) => problem.kind).sort()).toEqual([
      'missing-file',
      'missing-folder',
      'missing-folder',
    ]);
  });
});

describe('listMigrationFolders', () => {
  it('lists migration folders in sorted order and ignores stray files', () => {
    const dir = tempDir();
    mkdirSync(join(dir, '20260102000000_second'));
    mkdirSync(join(dir, '20260101000000_first'));

    expect(listMigrationFolders(dir)).toEqual([
      '20260101000000_first',
      '20260102000000_second',
    ]);
  });

  it('returns nothing for a directory that does not exist', () => {
    expect(listMigrationFolders(join(tempDir(), 'absent'))).toEqual([]);
  });
});

describe('resolveMigrationsDir', () => {
  it('finds the migrations directory by walking up from a nested working directory', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'prisma', 'migrations'), { recursive: true });
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });

    expect(resolveMigrationsDir(nested)).toBe(join(dir, 'prisma', 'migrations'));
  });

  it('throws rather than silently validating nothing when there is no migrations directory', () => {
    expect(() => resolveMigrationsDir(join(tempDir(), 'nowhere'))).toThrow(
      /Could not locate prisma\/migrations/,
    );
  });
});

describe('the check as a command (FR-014, T031)', () => {
  const script = join(__dirname, '..', 'check-migration-history.ts');
  const databaseUrl = process.env.DATABASE_URL;

  function runCheck(): { status: number | null; output: string } {
    const result = spawnSync('npx', ['tsx', script], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: { ...process.env },
    });
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  it('reports the applied history as consistent when the database and repository agree', () => {
    if (databaseUrl === undefined || databaseUrl.length === 0) {
      // Without a database the command legitimately checks only the repository side,
      // so there is nothing here worth asserting.
      return;
    }

    const { status, output } = runCheck();

    expect(status).toBe(0);
    expect(output).toMatch(/consistent/i);
  }, 120_000);

  /**
   * The decisive test, and the reason this guard exists.
   *
   * `prisma migrate status` in exactly this situation - one migration applied to the
   * database, its folder gone from the repository - reports the absence and still
   * exits 0. So a test that only asserted "the command ran" or "the wording changed"
   * would pass against an implementation that never reads the database at all.
   *
   * This one cannot: if the comparison is skipped, the mismatch is invisible and the
   * command exits 0.
   */
  it('refuses when a migration the database applied is missing from the repository', () => {
    if (databaseUrl === undefined || databaseUrl.length === 0) return;

    const migrationsDir = resolveMigrationsDir(join(__dirname, '..'));
    const appliedFolder = join(migrationsDir, '20261018100057_init_reference_tables');
    const hiddenFolder = join(migrationsDir, 'zzz_hidden_for_test');

    renameSync(appliedFolder, hiddenFolder);

    try {
      const { status, output } = runCheck();

      expect(status).toBe(1);
      expect(output).toContain('missing-folder');
      expect(output).toContain('20261018100057_init_reference_tables');
    } finally {
      renameSync(hiddenFolder, appliedFolder);
      expect(existsSync(appliedFolder)).toBe(true);
    }
  }, 120_000);
});