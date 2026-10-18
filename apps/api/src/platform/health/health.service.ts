import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reports whether the application is serving and whether its database is reachable,
 * SEPARATELY, so a failure can be attributed to the right component (FR-033).
 *
 * FR-034a - fail closed. An unknown or unmeasured check result is reported unhealthy,
 * never healthy. A check that cannot run must never be mistaken for a check that
 * passed; that inversion is how an outage presents as a healthy service.
 *
 * FR-034b - this feature claims no availability target. The endpoint reports state; it
 * does not assert uptime.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the healthy report.
   *
   * Deliberately narrow per FR-035: no version, hostname, connection string, driver
   * version, or exception message. The endpoint is unauthenticated so infrastructure can
   * use it, which makes anything it returns probe-able by anyone.
   */
  async check(): Promise<{
    status: 'ok';
    uptimeSeconds: number;
    checks: {
      application: { status: 'ok' };
      database: { status: 'ok' | 'unavailable'; latencyMs: number };
    };
  }> {
    const database = await this.prisma.checkReachability();

    return {
      status: 'ok',
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000)),
      checks: {
        // The application is serving, because it is answering.
        application: { status: 'ok' },
        // `unavailable` is reported as-is. -1 latency means "not measured", which is a
        // failure to measure rather than a fast failure, so it never reads as healthy.
        database:
          database.status === 'ok'
            ? { status: 'ok', latencyMs: database.latencyMs }
            : { status: 'unavailable', latencyMs: -1 },
      },
    };
  }

  /** True when every check passed. Anything unmeasured counts as failed. */
  isHealthy(report: Awaited<ReturnType<HealthService['check']>>): boolean {
    return report.checks.application.status === 'ok' && report.checks.database.status === 'ok';
  }
}