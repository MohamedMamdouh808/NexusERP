import { describe, expect, it } from '@jest/globals';
import { HealthService } from '../health.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * FR-034a - FAIL CLOSED.
 *
 * A check that cannot run must never be mistaken for a check that passed. This inversion
 * is how an outage presents as a healthy service: an unmeasured dependency reads as
 * "nothing to report" instead of "something is wrong".
 *
 * Tested without a database by substituting the reachability result the service consumes.
 * The database-backed proof (stopping a real database mid-run) is T044/T045.
 */

/** Minimal PrismaService double returning a scripted reachability result. */
function prismaDouble(result: { status: 'ok' | 'unavailable'; latencyMs: number }) {
  return { checkReachability: async () => result } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('reports healthy when the database is reachable', async () => {
    const service = new HealthService(prismaDouble({ status: 'ok', latencyMs: 2 }));
    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks.application.status).toBe('ok');
    expect(report.checks.database.status).toBe('ok');
    expect(service.isHealthy(report)).toBe(true);
  });

  it('reports the database as unavailable without claiming health', async () => {
    const service = new HealthService(prismaDouble({ status: 'unavailable', latencyMs: -1 }));
    const report = await service.check();

    expect(report.checks.database.status).toBe('unavailable');
    expect(service.isHealthy(report)).toBe(false);
  });

  it('never reports an unmeasured latency as a fast success', async () => {
    // -1 means "not measured". Reporting it as a number next to a healthy status would
    // make a failed probe look like a very fast one.
    const service = new HealthService(prismaDouble({ status: 'unavailable', latencyMs: -1 }));
    const report = await service.check();

    expect(report.checks.database.status).toBe('unavailable');
    expect(report.checks.database.latencyMs).toBe(-1);
  });

  it('reports uptime in whole seconds, never negative', async () => {
    const service = new HealthService(prismaDouble({ status: 'ok', latencyMs: 1 }));
    const report = await service.check();

    expect(Number.isInteger(report.uptimeSeconds)).toBe(true);
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('discloses no version, hostname, or connection detail (FR-035)', async () => {
    const service = new HealthService(prismaDouble({ status: 'ok', latencyMs: 2 }));
    const serialised = JSON.stringify(await service.check());

    // The endpoint is unauthenticated, so anything here is public information.
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('localhost');
    expect(serialised).not.toContain('version');
    expect(serialised).not.toContain('host');
  });

  it('produces exactly the two documented checks', async () => {
    const service = new HealthService(prismaDouble({ status: 'ok', latencyMs: 1 }));
    const report = await service.check();
    expect(Object.keys(report.checks).sort()).toEqual(['application', 'database']);
  });
});