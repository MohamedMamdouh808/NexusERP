import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Owns the process-wide Prisma client and its lifecycle.
 *
 * Constitution Principle VI: this service belongs to PlatformModule and is the ONLY
 * place the database client is constructed. No domain module creates a client, so no
 * module can bypass the unit of work by opening its own connection (research.md R-003).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
          : [{ emit: 'event', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Reports whether the database is reachable, timing the round trip.
   *
   * Deliberately the cheapest possible query. This runs on a health probe, not on a
   * business path, so it must not add measurable latency to the caller.
   *
   * Returns `unavailable` rather than throwing: the health endpoint reports the state
   * of each component separately, and an exception here would surface as a 500 rather
   * than as an attributed unhealthy check (FR-033, FR-034a).
   */
  async checkReachability(): Promise<{ status: 'ok' | 'unavailable'; latencyMs: number }> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.$queryRaw`SELECT 1`;
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return { status: 'ok', latencyMs: Math.max(0, Math.round(latencyMs)) };
    } catch (error) {
      // The cause is recorded under the request identifier by the caller and never
      // returned to the client (FR-035).
      this.logger.error(
        `Database reachability check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { status: 'unavailable', latencyMs: -1 };
    }
  }
}