import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getPerformanceContext, getRequestId } from '../../common/logging/request-context';
import { maskQueryText } from '../observability/query-text';

/**
 * Owns the process-wide Prisma client and its lifecycle.
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        ...(process.env.NODE_ENV === 'development'
          ? [{ emit: 'event' as const, level: 'warn' as const }]
          : []),
        { emit: 'event', level: 'error' },
      ],
    });

    const base = this;

    (base as unknown as { $on: (event: string, cb: (e: Prisma.QueryEvent) => void) => void }).$on(
      'query',
      (event: Prisma.QueryEvent) => {
      if (process.env.NODE_ENV !== 'production') {
        const requestId = getRequestId() ?? 'outside-request';
        new Logger('PrismaService').debug(
          `${maskQueryText(event.query)} (${event.duration.toFixed(1)}ms, request ${requestId})`,
        );
      }
    });

    const extended = base.$extends({
      query: {
        $allModels: {
          async $allOperations({ query, args }) {
            const performanceContext = getPerformanceContext();
            const startedAt = performance.now();
            try {
              return await query(args);
            } finally {
              if (performanceContext) {
                performanceContext.queryCount += 1;
                performanceContext.dbTimeMs += performance.now() - startedAt;
              }
            }
          },
        },
      },
    });

    const originalQueryRaw = (extended as { $queryRaw: (...args: unknown[]) => unknown }).$queryRaw.bind(extended);
    const originalExecuteRaw = (extended as { $executeRaw: (...args: unknown[]) => unknown }).$executeRaw.bind(extended);
    const originalQueryRawUnsafe = (extended as { $queryRawUnsafe: (...args: unknown[]) => unknown }).$queryRawUnsafe.bind(extended);
    const originalExecuteRawUnsafe = (extended as { $executeRawUnsafe: (...args: unknown[]) => unknown }).$executeRawUnsafe.bind(extended);

    const makeAsyncWrapper = (original: (...args: unknown[]) => unknown) => {
      return async (...args: unknown[]) => {
        const performanceContext = getPerformanceContext();
        const startedAt = performance.now();
        try {
          return await original(...args);
        } finally {
          if (performanceContext) {
            performanceContext.queryCount += 1;
            performanceContext.dbTimeMs += performance.now() - startedAt;
          }
        }
      };
    };

    (extended as Record<string, unknown>).$queryRaw = makeAsyncWrapper(originalQueryRaw);
    (extended as Record<string, unknown>).$executeRaw = makeAsyncWrapper(originalExecuteRaw);
    (extended as Record<string, unknown>).$queryRawUnsafe = makeAsyncWrapper(originalQueryRawUnsafe);
    (extended as Record<string, unknown>).$executeRawUnsafe = makeAsyncWrapper(originalExecuteRawUnsafe);

    const logger = new Logger('PrismaService');

    (extended as Record<string, unknown>).onModuleInit = async () => {
      await (extended as { $connect: () => Promise<void> }).$connect();
      // Warm the connection pool so the first real request does not pay setup.
      await (extended as { $queryRaw: (...args: unknown[]) => Promise<unknown> }).$queryRaw`SELECT 1`;
      logger.log('Database connection established');
    };
    (extended as Record<string, unknown>).onModuleDestroy = async () => {
      await (extended as { $disconnect: () => Promise<void> }).$disconnect();
      logger.log('Database connection closed');
    };
    (extended as Record<string, unknown>).checkReachability = async () => {
      const startedAt = process.hrtime.bigint();
      try {
        await (extended as { $queryRaw: (...args: unknown[]) => Promise<unknown> }).$queryRaw`SELECT 1`;
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        return { status: 'ok' as const, latencyMs: Math.max(0, Math.round(latencyMs)) };
      } catch {
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        return { status: 'unavailable' as const, latencyMs: Math.max(0, Math.round(latencyMs)) };
      }
    };

    return extended as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {}
  async onModuleDestroy(): Promise<void> {}
  async checkReachability(): Promise<{ status: 'ok' | 'unavailable'; latencyMs: number }> {
    return { status: 'unavailable', latencyMs: 0 };
  }
}
