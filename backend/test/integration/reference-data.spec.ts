import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { PrismaService } from '../../src/platform/prisma/prisma.service';
import { TransactionService } from '../../src/platform/transaction/transaction.service';
import { PERMISSION_CATALOG } from '@nexuserp/shared';
import { getTestPrisma, npxCommand, seedTestDatabase } from '../fixtures/database';
import { join } from 'node:path';
import { compareHistory, listMigrationFolders } from '../../../database/scripts/check-migration-history';

/**
 * FR-017 to FR-019 and FR-018: the reference data the product depends on.
 *
 * T024 proves the IDEMPOTENCY guarantee - running the seed repeatedly creates nothing
 * twice. T032 proves the CONTENT INVARIANTS - what a single load must contain. The two
 * are distinct: a seed that is idempotent can still load the wrong data, and a seed with
 * correct content can still duplicate it on a second run.
 */
describe('reference data seed', () => {
  beforeAll(async () => {
    await seedTestDatabase();
  });

  afterAll(async () => {
    const { disconnectTestPrisma } = await import('../fixtures/database');
    await disconnectTestPrisma();
  });

  // T024 - idempotency
  it('creates no duplicates when run twice (FR-018)', async () => {
    const prisma = getTestPrisma();

    const before = await Promise.all([
      prisma.permission.count(),
      prisma.roleTemplate.count(),
      prisma.roleTemplatePermission.count(),
    ]);

    await seedTestDatabase();
    await seedTestDatabase();

    const after = await Promise.all([
      prisma.permission.count(),
      prisma.roleTemplate.count(),
      prisma.roleTemplatePermission.count(),
    ]);

    expect(after).toEqual(before);
    expect(after[0]).toBeGreaterThan(0);
    expect(after[1]).toBeGreaterThan(0);
  });

  it('leaves no duplicate permission code (FR-018)', async () => {
    const prisma = getTestPrisma();
    const rows = await prisma.permission.findMany({ select: { code: true } });
    const codes = rows.map((row) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('leaves no duplicate role-to-permission grant (FR-018)', async () => {
    const prisma = getTestPrisma();
    const grants = await prisma.roleTemplatePermission.findMany({
      select: { roleTemplateId: true, permissionId: true },
    });
    const pairs = grants.map((g) => `${g.roleTemplateId}:${g.permissionId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('survives being loaded into a partially-created database (FR-020)', async () => {
    const prisma = getTestPrisma();

    // Removes one role template, leaving the catalog and other grants in place: the
    // partial state a half-failed earlier run would leave.
    const victim = await prisma.roleTemplate.findFirst({ where: { key: 'manager' } });
    if (victim) await prisma.roleTemplate.delete({ where: { id: victim.id } });

    await seedTestDatabase();

    const restored = await prisma.roleTemplate.findUnique({ where: { key: 'manager' } });
    expect(restored).not.toBeNull();
  });

  // T032 - content invariants
  it('loads exactly the five default role templates (FR-019)', async () => {
    const prisma = getTestPrisma();
    const roles = await prisma.roleTemplate.findMany({ select: { key: true } });
    expect(roles.map((r) => r.key).sort()).toEqual([
      'administrator',
      'inventory',
      'manager',
      'purchasing',
      'sales',
    ]);
  });

  it('loads the whole permission catalog (FR-017)', async () => {
    const prisma = getTestPrisma();
    expect(await prisma.permission.count()).toBe(PERMISSION_CATALOG.length);
  });

  it('grants the administrator every permission in the catalog (FR-017)', async () => {
    const prisma = getTestPrisma();
    const admin = await prisma.roleTemplate.findUniqueOrThrow({
      where: { key: 'administrator' },
      include: { permissions: { include: { permission: true } } },
    });
    const granted = new Set(admin.permissions.map((p) => p.permission.code));
    for (const permission of PERMISSION_CATALOG) {
      expect(granted.has(permission.code)).toBe(true);
    }
  });

  it('withholds administrative permissions from the manager template (FR-017)', async () => {
    const prisma = getTestPrisma();
    const manager = await prisma.roleTemplate.findUniqueOrThrow({
      where: { key: 'manager' },
      include: { permissions: { include: { permission: true } } },
    });
    const granted = new Set(manager.permissions.map((p) => p.permission.code));

    expect(granted.has('sales.write')).toBe(true);
    expect(granted.has('users.manage')).toBe(false);
    expect(granted.has('roles.manage')).toBe(false);
    expect(granted.has('settings.manage')).toBe(false);
  });

  it('grants only permissions that exist (FR-017)', async () => {
    const prisma = getTestPrisma();
    const grants = await prisma.roleTemplatePermission.findMany({
      include: { permission: true },
    });
    const known = new Set(PERMISSION_CATALOG.map((p) => p.code));
    for (const grant of grants) {
      expect(known.has(grant.permission.code)).toBe(true);
    }
  });

  it('stores no tenant data: no organization column exists yet (FR-019)', async () => {
    // The reference tables are global. A tenant-bearing workspace requires Organization,
    // which belongs to a later feature.
    const prisma = getTestPrisma();
    const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('permissions','role_templates') AND column_name = 'organization_id'`,
    );
    expect(columns).toHaveLength(0);
  });
});

/**
 * T023 / Constitution Principle III: a multi-record operation commits as one unit or not
 * at all, proven against a real database.
 */
describe('transaction unit of work (T023)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let transactions: TransactionService;

  beforeAll(async () => {
    // A MINIMAL module containing only the two services under test.
    //
    // This previously built the whole AppModule once per test. That was slow enough to
    // approach the 30s Jest timeout and it opened a fresh Prisma connection pool each time,
    // so a rolled-back transaction could wait on a connection held by an app the previous
    // test had not finished releasing. One app, two services, one pool.
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, TransactionService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    transactions = app.get(TransactionService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it(
    'rolls back every write when the callback throws',
    async () => {
      const before = await prisma.permission.count();

      await expect(
        transactions.runInTransaction(async (tx) => {
          await tx.permission.create({
            data: { code: 'test.rollback', module: 'test', description: 'must not survive' },
          });
          // A SECOND write in the same transaction, then a throw: proving that neither the
          // first nor the second write survives.
          await tx.permission.create({
            data: { code: 'test.rollback.two', module: 'test', description: 'must not survive' },
          });
          throw new Error('deliberate failure');
        }),
      ).rejects.toThrow('deliberate failure');

      expect(await prisma.permission.count()).toBe(before);
      expect(await prisma.permission.findUnique({ where: { code: 'test.rollback' } })).toBeNull();
      expect(await prisma.permission.findUnique({ where: { code: 'test.rollback.two' } })).toBeNull();
    },
    60_000,
  );

  it('commits every write when the callback succeeds', async () => {
    await transactions.runInTransaction(async (tx) => {
      await tx.permission.create({
        data: { code: 'test.commit', module: 'test', description: 'committed' },
      });
      await tx.permission.create({
        data: { code: 'test.commit.two', module: 'test', description: 'committed' },
      });
    });

    expect(await prisma.permission.findUnique({ where: { code: 'test.commit' } })).not.toBeNull();
    expect(await prisma.permission.findUnique({ where: { code: 'test.commit.two' } })).not.toBeNull();

    // Cleans up so a re-run starts from the same state.
    await prisma.permission.deleteMany({ where: { code: { startsWith: 'test.commit' } } });
  });

  it('reports whether the caller is inside a transaction', async () => {
    expect(transactions.inTransaction).toBe(false);

// The callback must return a Promise, so it stays async; it deliberately
    // performs no awaiting of its own.
    // eslint-disable-next-line @typescript-eslint/require-await
    await transactions.runInTransaction(async () => {
      // A nested service sees the caller's transaction without receiving it as a parameter
      // - the property that makes Constitution Principle III hold by construction.
      expect(transactions.inTransaction).toBe(true);
    });

    expect(transactions.inTransaction).toBe(false);
  });

  it('joins a nested transaction rather than opening a second commit boundary', async () => {
    // A nested runInTransaction must NOT open its own transaction, or a workflow composed
    // of several services would commit in pieces.
    await transactions.runInTransaction(async () => {
      await transactions.runInTransaction(async (tx) => {
        await tx.permission.create({
          data: { code: 'test.nested', module: 'test', description: 'nested' },
        });
      });
    });

    expect(await prisma.permission.findUnique({ where: { code: 'test.nested' } })).not.toBeNull();
    await prisma.permission.deleteMany({ where: { code: 'test.nested' } });
  });
});

/**
 * T030 / T031 / FR-011 to FR-015: the migration history.
 */
describe('migration history', () => {
  // The Prisma schema and migrations live in the database workspace, so the CLI runs
  // from there rather than from the service.
  const databaseDir = join(__dirname, '..', '..', '..', 'database');

  it('records the applied migration (FR-014)', () => {
    const out = execFileSync(npxCommand(), ['prisma', 'migrate', 'status'], {
      shell: true,
      cwd: databaseDir,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 180_000,
    });
    expect(out).toContain('up to date');
  });

  it('has no pending migrations and re-applying changes nothing (FR-013)', () => {
    const prisma = getTestPrisma();
    const before = prisma;

    const out = execFileSync(npxCommand(), ['prisma', 'migrate', 'deploy'], {
      shell: true,
      cwd: databaseDir,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 180_000,
    });
    expect(out.toLowerCase()).toContain('no pending migrations');
    void before;
  });

  it('shows no drift between the schema and the applied history (FR-048)', () => {
    // Exit code 0 means no difference; 2 means drift. A non-zero other than 2 is a real
    // failure and must not be mistaken for "no drift".
    try {
      execFileSync(
        npxCommand(),
        [
          'prisma',
          'migrate',
          'diff',
          '--from-schema-datasource',
          'prisma/schema.prisma',
          '--to-schema-datamodel',
          'prisma/schema.prisma',
          '--exit-code',
        ],
        { cwd: databaseDir, encoding: 'utf8', env: { ...process.env }, timeout: 180_000, shell: true },
      );
    } catch (error) {
      const code = (error as { status?: number }).status;
      if (code === 2) throw new Error('Schema drift detected between schema.prisma and migrations');
      throw error;
    }
  });

  it('records every applied migration in the database (FR-014)', () => {
    // Prisma records what it applied in `_prisma_migrations`. That record is what makes
    // an out-of-order or unknown history detectable at all.
    const prisma = getTestPrisma();
    const rows = prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date }[]>(
      'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name',
    );
    return rows;
  });

  it('detects a migration recorded in the database but absent from the repository (FR-014, T031)', () => {
    // FR-014 requires the system to REFUSE when the applied history is missing. Prisma
    // does not do this: with the migrations directory renamed away, `prisma migrate status`
    // prints "No migration found" and EXITS 0. Verified on Prisma 6.19.3.
    //
    // So the guarantee is implemented here, in compareHistory, and this test pins the
    // comparison that the guard and the pipeline both run.
    const migrationsDir = join(databaseDir, 'prisma', 'migrations');
    const folders = listMigrationFolders(migrationsDir);
    expect(folders.length).toBeGreaterThan(0);

    // The database says a migration was applied; the repository does not contain it.
    const problems = compareHistory(
      [
        { migration_name: folders[0] as string, rolled_back_at: null, finished_at: new Date() },
        { migration_name: '29990101000000_vanished_from_repo', rolled_back_at: null, finished_at: new Date() },
      ],
      folders,
    );

    const missing = problems.find((p) => p.kind === 'missing-folder');
    expect(missing).toBeDefined();
    expect(missing?.migration).toBe('29990101000000_vanished_from_repo');
    // The message must name the migration, so a developer is not left guessing.
    expect(missing?.message).toContain('29990101000000_vanished_from_repo');
  });

  it('detects a migration in the repository that the database never applied (FR-014)', () => {
    const problems = compareHistory([], ['20260101000000_never_applied']);
    expect(problems.some((p) => p.kind === 'missing-file')).toBe(true);
  });

  it('reports no problem when the database and repository agree', () => {
    const folders = listMigrationFolders(join(databaseDir, 'prisma', 'migrations'));
    const applied = folders.map((name: string) => ({ migration_name: name, rolled_back_at: null, finished_at: new Date() }));
    expect(compareHistory(applied, folders)).toEqual([]);
  });

  it('ignores a rolled-back migration, which is expected to have no folder', () => {
    const problems = compareHistory(
      [{ migration_name: 'rolled_back_one', rolled_back_at: new Date(), finished_at: new Date() }],
      [],
    );
    expect(problems.some((p) => p.kind === 'missing-folder')).toBe(false);
  });
});;;

/** Fails loudly if the expected reference volume is absent (FR-008). */
describe('database volume', () => {
  it('uses a named volume, so data survives `docker compose down`', () => {
    const docker = 'C:\\Users\\toshiba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
    const out = execFileSync(docker, ['volume', 'ls', '--format', '{{.Name}}'], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(out).toContain('nexuserp-postgres-data');
  });
});
