import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { AppModule } from '../../src/app.module';
import { runWithRequestContext } from '../../src/common/logging/request-context';
import { PrismaService } from '../../src/platform/prisma/prisma.service';
import { TransactionService } from '../../src/platform/transaction/transaction.service';

/**
 * Constitution Principle III: an operation touching more than one record MUST execute in a
 * single transaction, and a partially committed operation is never acceptable.
 *
 * These tests use a REAL PostgreSQL instance and the real reference tables, because the
 * defects that matter here - a rollback that does not roll back, or a nested call that
 * opens a second transaction and splits one operation into two commits - do not appear
 * against a faked client. A mock would happily "roll back" by doing nothing.
 */

const PROBE_PREFIX = 'transaction-probe-';

async function cleanProbes(prisma: PrismaService): Promise<void> {
  await prisma.roleTemplate.deleteMany({ where: { key: { startsWith: PROBE_PREFIX } } });
}

describe('transaction boundary and rollback (Principle III)', () => {
  let app: INestApplication;
  let transactions: TransactionService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    transactions = app.get(TransactionService);
    prisma = app.get(PrismaService);
    await cleanProbes(prisma);
  });

  afterAll(async () => {
    await cleanProbes(prisma);
    await app?.close();
  });

  it('commits every write when the work succeeds', async () => {
    const result = await transactions.runInTransaction(async (tx) => {
      await tx.roleTemplate.create({
        data: { key: `${PROBE_PREFIX}committed`, name: 'Probe', description: 'probe' },
      });
      await tx.roleTemplate.create({
        data: { key: `${PROBE_PREFIX}committed-2`, name: 'Probe 2', description: 'probe' },
      });
      return 'committed';
    });

    expect(result).toBe('committed');
    const rows = await prisma.roleTemplate.findMany({
      where: { key: { startsWith: PROBE_PREFIX } },
      select: { key: true },
    });
    expect(rows.map((row) => row.key).sort()).toEqual([
      `${PROBE_PREFIX}committed`,
      `${PROBE_PREFIX}committed-2`,
    ]);
  });

  it('rolls back EVERY write when the work throws partway through (Principle III)', async () => {
    // The write succeeds and then the work throws. If the boundary were only advisory the
    // row would survive and the system would contain a half-written operation.
    await expect(
      transactions.runInTransaction(async (tx) => {
        await tx.roleTemplate.create({
          data: { key: `${PROBE_PREFIX}rolled-back`, name: 'Probe 3', description: 'probe' },
        });
        throw new Error('failure after the write');
      }),
    ).rejects.toThrow('failure after the write');

    const survivor = await prisma.roleTemplate.findUnique({
      where: { key: `${PROBE_PREFIX}rolled-back` },
      select: { key: true },
    });
    expect(survivor).toBeNull();
  });

  it('propagates the original error rather than swallowing it', async () => {
    // A rollback that returns a generic error loses the reason the operation failed, which
    // is the only thing the caller can act on.
    await expect(
      // The work fails before it does anything, so it rejects rather than resolving: a
      // synchronous throw inside `async` would still reject, but saying so directly keeps
      // the intent ("the operation failed") separate from the mechanism.
      transactions.runInTransaction(() => Promise.reject(new Error('the real cause'))),
    ).rejects.toThrow('the real cause');
  });

  it('joins an ambient transaction instead of opening a second one', async () => {
    // A nested runInTransaction that opened its own transaction would commit the inner work
    // separately: two commits where the caller asked for one.
    await expect(
      transactions.runInTransaction(async (tx) => {
        await tx.roleTemplate.create({
          data: { key: `${PROBE_PREFIX}outer`, name: 'Outer', description: 'probe' },
        });

        await transactions.runInTransaction(async (innerTx) => {
          expect(innerTx).toBe(tx);
          await innerTx.roleTemplate.create({
            data: { key: `${PROBE_PREFIX}inner`, name: 'Inner', description: 'probe' },
          });
          throw new Error('inner failure rolls back the outer work too');
        });
      }),
    ).rejects.toThrow('inner failure rolls back the outer work too');

    // Both rows are gone, because they shared one transaction.
    const rows = await prisma.roleTemplate.findMany({
      where: { key: { in: [`${PROBE_PREFIX}outer`, `${PROBE_PREFIX}inner`] } },
      select: { key: true },
    });
    expect(rows).toHaveLength(0);
  });

  it('reports being inside a transaction only while one is open', async () => {
    expect(transactions.inTransaction).toBe(false);

    await transactions.runInTransaction(async () => {
      await Promise.resolve();
      expect(transactions.inTransaction).toBe(true);
    });

    expect(transactions.inTransaction).toBe(false);
  });

  it('returns the shared client outside a transaction and the ambient one inside', async () => {
    // Outside a transaction the shared client is correct for single-record reads.
    expect(transactions.getClient()).toBe(prisma);

    await transactions.runInTransaction(async (tx) => {
      await Promise.resolve();
      expect(transactions.getClient()).toBe(tx);
    });
  });

  it('does not leak the transaction context to work that runs afterwards', async () => {
    // AsyncLocalStorage is the mechanism; if its scope leaked, unrelated later work would
    // join a transaction that had already committed.
    await transactions.runInTransaction(async () => {
      await Promise.resolve();
      expect(transactions.inTransaction).toBe(true);
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(transactions.inTransaction).toBe(false);
  });

  it('rolls back inside a request context without disturbing it', async () => {
    // The transaction mechanism and the request context are both AsyncLocalStorage; this
    // asserts they do not interfere, which a single shared store could not.
    await runWithRequestContext(
      { requestId: 'tx-ctx-001', userId: null, organizationId: null },
      async () => {
        await expect(
          transactions.runInTransaction(async (tx) => {
            await tx.roleTemplate.create({
              data: { key: `${PROBE_PREFIX}under-ctx`, name: 'Probe 6', description: 'probe' },
            });
            throw new Error('rolled back under a request context');
          }),
        ).rejects.toThrow('rolled back under a request context');
      },
    );

    const survivor = await prisma.roleTemplate.findUnique({
      where: { key: `${PROBE_PREFIX}under-ctx` },
      select: { key: true },
    });
    expect(survivor).toBeNull();
  });
});