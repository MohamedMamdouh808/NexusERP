import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import type { ModuleState } from '@nexuserp/shared';
import { extendRequestContext, getRequestContext } from '../../common/logging/request-context';

/**
 * One database read per request for an organization's module availability.
 *
 * The rows are loaded once and cached on the request context (`AsyncLocalStorage`)
 * for the lifetime of the request, so the shared module guard and any number of
 * guarded reads hit the database exactly once per request (FR-020). The cache is
 * per-request: AsyncLocalStorage gives every request its own context object, so
 * module state can never leak between organizations or between concurrent requests.
 */
@Injectable()
export class ModuleStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** All module states for the organization, cached on the request context. */
  async getStates(organizationId: string): Promise<readonly ModuleState[]> {
    const cached = getRequestContext()?.moduleStates;
    if (cached !== undefined) {
      // Fast path: the request has already loaded this organization's modules.
      return cached;
    }

    const rows = await this.prisma.organizationModule.findMany({
      where: { organizationId },
      select: { moduleKey: true, enabled: true, version: true },
      orderBy: { moduleKey: 'asc' },
    });

    const states: readonly ModuleState[] = rows.map((row) => ({
      key: row.moduleKey as ModuleState['key'],
      enabled: row.enabled,
      version: row.version,
    }));

    extendRequestContext({ moduleStates: states });
    return states;
  }

  /** The enabled switchable module keys for the organization. */
  async getEnabledModules(organizationId: string): Promise<readonly string[]> {
    const states = await this.getStates(organizationId);
    return states.filter((s) => s.enabled).map((s) => s.key);
  }

  /** Whether a single module is enabled for the organization. Fail closed. */
  async isEnabled(organizationId: string, key: string): Promise<boolean> {
    const states = await this.getStates(organizationId);
    const state = states.find((s) => s.key === key);
    return state?.enabled ?? false;
  }

  /** Clear the per-request cache so the next read re-queries the database. */
  clearRequestCache(): void {
    extendRequestContext({ moduleStates: undefined });
  }
}
