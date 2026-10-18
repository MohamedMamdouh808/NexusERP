import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The unit of work: one transaction boundary per operation.
 *
 * Constitution Principle III requires that any operation touching more than one record
 * execute inside a single PostgreSQL transaction, and that a partially committed
 * operation is never an acceptable outcome.
 *
 * The problem this solves: in NestJS, a transaction opened inside one service is not
 * visible to a repository called by another service unless the client is propagated.
 * Threading a client parameter through every signature is the pattern most often
 * skipped under deadline pressure. `AsyncLocalStorage` carries the client out of band
 * instead, so a nested call participates in the caller's transaction BY CONSTRUCTION
 * rather than by reviewer discipline (research.md R-003).
 *
 * Usage:
 *
 *   await transactions.runInTransaction(async (tx) => {
 *     const order = await orders.create({ data }, tx);
 *     await reservations.reserveAll(order.id, tx);
 *   });
 *
 * If `reserveAll` throws, the order is rolled back with it. Neither service knows it
 * was in a transaction; both received the client.
 */

/** The subset of PrismaClient available inside a transaction. */
export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class TransactionService {
  private readonly storage = new AsyncLocalStorage<TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `work` inside a single transaction and returns its result.
   *
   * Nested calls join the ambient transaction rather than opening a second one, so a
   * workflow composed of several services still commits or rolls back as one unit.
   */
  async runInTransaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const ambient = this.storage.getStore();
    if (ambient) {
      // Already inside a transaction: join it. Opening a nested transaction here would
      // silently split the operation into two commits.
      return work(ambient);
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => this.storage.run(tx, () => work(tx)), {
      // A transaction that runs longer than this is a bug, not a slow request; failing
      // is better than holding locks against concurrent stock mutations.
      timeout: 10_000,
      maxWait: 5_000,
    });
  }

  /**
   * The transaction client for the current operation, or the ambient client outside a
   * transaction.
   *
   * Repositories call this. Outside a transaction it returns the shared client, which
   * is correct for single-record reads and for work that genuinely needs no atomicity.
   */
  getClient(): TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }

  /** True when the caller is already inside a transaction. */
  get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }
}