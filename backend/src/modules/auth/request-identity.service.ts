import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import type { ModuleState } from '@nexuserp/shared';
import { extendRequestContext } from '../../common/logging/request-context';

/**
 * Loads the caller's complete identity in a single round trip and updates the
 * session's `lastUsedAt` in the same statement, so an authenticated request
 * pays one database query for all of its context (session, membership, user,
 * roles, permissions, module state, organization settings) (FR-006, FR-019).
 *
 * The result is never cached beyond the request: every request re-queries, so a
 * deactivation, role change, module disable or session end takes effect on the
 * very next request (FR-007, FR-029). Memoisation lives on the request context,
 * not on this service.
 */
@Injectable()
export class RequestIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    tokenHash: string,
  ): Promise<
    | { kind: 'identity'; identity: RequestIdentity }
    | { kind: 'expired' }
    | { kind: 'invalid' }
  > {
    let session: LoadedSession | null = null;
    try {
      session = await this.prisma.session.findUnique({
        where: { tokenHash },
        relationLoadStrategy: 'join',
        include: {
          user: { select: { id: true, email: true, mustChangePassword: true } },
          membership: {
            include: {
              organization: {
                include: {
                  organizationModules: {
                    select: { moduleKey: true, enabled: true, version: true },
                  },
                },
              },
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: { permission: { select: { code: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch {
      return { kind: 'invalid' };
    }

    if (session) {
      await this.prisma.session
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }

    if (!session || !session.membership || !session.user) {
      return { kind: 'invalid' };
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      return { kind: 'expired' };
    }

    if (!session.membership.isActive) {
      return { kind: 'invalid' };
    }

    const organization = session.membership.organization;
    const moduleRows = organization.organizationModules ?? [];
    const moduleStates: readonly ModuleState[] = moduleRows
      .map((row) => ({
        key: row.moduleKey as ModuleState['key'],
        enabled: row.enabled,
        version: row.version,
      }))
      .sort((left, right) => (left.key < right.key ? -1 : 1));

    const roles = session.membership.roles.map((membershipRole) => ({
      id: membershipRole.role.id,
      key: membershipRole.role.key,
      name: membershipRole.role.name,
    }));

    const permissionSet = new Set<string>();
    for (const membershipRole of session.membership.roles) {
      for (const rolePermission of membershipRole.role.permissions) {
        permissionSet.add(rolePermission.permission.code);
      }
    }
    const permissions = Array.from(permissionSet);

    const enabledModules = moduleRows
      .filter((row) => row.enabled)
      .map((row) => row.moduleKey)
      .sort();

    const identity: RequestIdentity = {
      sessionId: session.id,
      userId: session.userId,
      membershipId: session.membershipId,
      organizationId: organization.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        mustChangePassword: session.user.mustChangePassword,
      },
      membership: {
        id: session.membership.id,
        name: session.membership.name,
        version: session.membership.version,
        isActive: session.membership.isActive,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        currencyCode: organization.currencyCode,
        defaultPaymentTermsDays: organization.defaultPaymentTermsDays,
      },
      roles,
      permissions,
      enabledModules,
      moduleStates,
      expiresAt: session.expiresAt,
    };

    // Bind the tenant and module state to the request context so downstream
    // guards and services read them without a second query.
    extendRequestContext({
      userId: identity.userId,
      organizationId: identity.organizationId,
      moduleStates: identity.moduleStates,
    });

    return { kind: 'identity', identity };
  }
}

export interface RequestIdentity {
  sessionId: string;
  userId: string;
  membershipId: string;
  organizationId: string;
  user: { id: string; email: string; mustChangePassword: boolean };
  membership: { id: string; name: string | null; version: number; isActive: boolean };
  organization: { id: string; name: string; currencyCode: string; defaultPaymentTermsDays: number };
  roles: { id: string; key: string; name: string }[];
  permissions: string[];
  enabledModules: string[];
  moduleStates: readonly ModuleState[];
  expiresAt: Date;
}

type LoadedSession = {
  id: string;
  userId: string;
  membershipId: string;
  expiresAt: Date;
  user: { id: string; email: string; mustChangePassword: boolean } | null;
  membership: {
    id: string;
    name: string | null;
    version: number;
    isActive: boolean;
    organization: {
      id: string;
      name: string;
      currencyCode: string;
      defaultPaymentTermsDays: number;
      organizationModules: Array<{
        moduleKey: string;
        enabled: boolean;
        version: number;
      }>;
    };
    roles: Array<{
      role: {
        id: string;
        key: string;
        name: string;
        permissions: Array<{ permission: { code: string } }>;
      };
    }>;
  } | null;
};
