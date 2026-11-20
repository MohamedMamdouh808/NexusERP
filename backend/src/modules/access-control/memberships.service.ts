import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { AUDIT_ACTIONS } from '@nexuserp/shared';
import { hash as argon2Hash } from 'argon2';

/**
 * Membership service. Member lifecycle: create, list, roles replace,
 * deactivate, reactivate. All multi-record operations run inside a single
 * transaction (Constitution Principle III).
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a member. The initial password is required and validated
   * unconditionally (FR-008). When the email already belongs to an account,
   * the membership is created on that account with its password and flag
   * untouched; the answer is identical either way so the endpoint cannot
   * enumerate which emails have accounts (FR-008, SC-014).
   */
  async createMember(params: {
    organizationId: string;
    email: string;
    name: string;
    password: string;
    roleIds: string[];
    actingUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Look up existing user by email (system-wide)
      const existingUser = await tx.user.findUnique({
        where: { email: params.email },
        select: { id: true, passwordHash: true, mustChangePassword: true },
      });

      let userId: string;

      if (existingUser) {
        // 2a. Account exists: create membership on it, leave password+flag untouched
        userId = existingUser.id;
      } else {
        // 2b. No account: create user with Argon2id hash, flag for forced change
        const passwordHash = await argon2Hash(params.password);
        const user = await tx.user.create({
          data: {
            email: params.email,
            passwordHash,
            mustChangePassword: true,
          },
        });
        userId = user.id;
      }

      // 3. Create membership
      const membership = await tx.membership.create({
        data: {
          userId,
          organizationId: params.organizationId,
          isActive: true,
        },
      });

      // 4. Validate roleIds: the roles must exist in THIS organization.
      //    Without this check the link below fails on a foreign key, and the
      //    database's error ("constraint violated") reaches the caller as an
      //    unexplained 500 instead of a 400 that names the field. A role of
      //    another organization is not a role of this one.
      const roles = await tx.role.findMany({
        where: {
          id: { in: params.roleIds },
          organizationId: params.organizationId,
        },
        select: { id: true },
      });

      if (roles.length !== params.roleIds.length) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [
            {
              field: 'roleIds',
              code: 'VALIDATION_ERROR',
              message: 'One or more roles do not exist in this organization.',
            },
          ],
        );
      }

      // 5. Link membership to roles
      for (const roleId of params.roleIds) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            roleId,
            organizationId: params.organizationId,
          },
        });
      }

      // 6. Audit: members.created (after = non-secret projection)
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.membersCreated,
          recordType: 'membership',
          recordId: membership.id,
          after: {
            email: params.email,
            name: params.name,
            roleIds: params.roleIds,
            isActive: true,
          },
        },
      });

      // 6. The answer is the SAME whether the account was created now or already
      // existed (FR-008): no "accountCreated"/"accountLinked" marker, so the answer
      // cannot be used to tell whether an email address was already known. The
      // membership carries its roles, because the caller assigned them.
      const linkedRoles = await tx.membershipRole.findMany({
        where: { membershipId: membership.id },
        include: { role: true },
      });

      return {
        membership: {
          id: membership.id,
          roles: linkedRoles.map((link) => ({
            id: link.role.id,
            key: link.role.key,
            name: link.role.name,
          })),
          isActive: membership.isActive,
        },
      };
    });
  }

  /**
   * Replaces a membership's roles atomically with a single before/after audit
   * entry. Enforces no-escalation (FR-031) and last-Administrator (FR-009).
   */
  async replaceRoles(params: {
    membershipId: string;
    organizationId: string;
    roleIds: string[];
    actingUserId: string;
    actingEffectivePermissions: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load the membership and its current roles
      const membership = await tx.membership.findUnique({
        where: { id: params.membershipId },
        include: {
          roles: { include: { role: true } },
        },
      });

      if (!membership || membership.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Membership not found.');
      }

      // 2. Validate roleIds: non-empty, existing roles of the organization
      const roles = await tx.role.findMany({
        where: {
          id: { in: params.roleIds },
          organizationId: params.organizationId,
        },
      });

      if (params.roleIds.length === 0) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'roleIds', code: 'VALIDATION_ERROR', message: 'At least one role is required.' }],
        );
      }

      if (roles.length !== params.roleIds.length) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'roleIds', code: 'VALIDATION_ERROR', message: 'One or more roles do not exist in this organization.' }],
        );
      }

      // 3. No-escalation: resulting permission set ⊆ actor's effective permissions (FR-031)
      const resultingPermissionCodes = new Set<string>();
      for (const role of roles) {
        const rolePermissions = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permission: { select: { code: true } } },
        });
        for (const rp of rolePermissions) {
          resultingPermissionCodes.add(rp.permission.code);
        }
      }

      for (const code of resultingPermissionCodes) {
        if (!params.actingEffectivePermissions.includes(code)) {
          throw new AppException(
            ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
            [{ field: 'roleIds', code: 'NOT_ENOUGH_PERMISSIONS', message: `Permission ${code} is not held by the acting user.` }],
          );
        }
      }

      // 4. Last-Administrator check (FR-009)
      const hasAdministrator = roles.some((r) => r.key === 'administrator');
      if (!hasAdministrator) {
        const remainingAdmins = await tx.membershipRole.count({
          where: {
            organizationId: params.organizationId,
            role: { key: 'administrator' },
            membership: { isActive: true },
          },
        });
        const targetHasAdmin = membership.roles.some((mr) => mr.role.key === 'administrator');
        if (targetHasAdmin && remainingAdmins <= 1) {
          throw new AppException(ERROR_CODES.LAST_ADMINISTRATOR, [], 'An organization must keep at least one administrator.');
        }
      }

      // 5. Capture before state. The roles are sorted by key: an audit entry
      //    whose order changes between two identical requests cannot be read as
      //    a difference, and the before/after pair is meant to be compared.
      const beforeRoles = membership.roles
        .map((mr) => ({
          id: mr.role.id,
          key: mr.role.key,
          name: mr.role.name,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

      // 6. Replace role links: delete all, then create new ones
      await tx.membershipRole.deleteMany({
        where: { membershipId: params.membershipId },
      });

      for (const roleId of params.roleIds) {
        await tx.membershipRole.create({
          data: {
            membershipId: params.membershipId,
            roleId,
            organizationId: params.organizationId,
          },
        });
      }

      // 7. Capture after state, in the same stable order.
      const afterRoles = roles
        .map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

      // 8. Audit: members.roles_changed
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.membersRolesChanged,
          recordType: 'membership',
          recordId: params.membershipId,
          before: { roles: beforeRoles },
          after: { roles: afterRoles },
        },
      });

      return { roles: afterRoles };
    });
  }

  /**
   * Lists the active organization's memberships with their roles, with
   * server-side search, filtering, sorting, and paging.
   */
  async list(
    organizationId: string,
    params: {
      search?: string;
      role?: string;
      status?: 'ACTIVE' | 'DEACTIVATED';
      sort?: 'name' | 'email' | 'status' | 'createdAt';
      direction?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sort = params.sort ?? 'createdAt';
    const direction = params.direction ?? 'desc';

    const where: Record<string, unknown> = { organizationId };
    if (params.status === 'ACTIVE') where.isActive = true;
    if (params.status === 'DEACTIVATED') where.isActive = false;
    if (params.role) {
      where.roles = { some: { roleId: params.role } };
    }

    // Escape ILIKE wildcards so search terms are treated literally.
    const escaped = params.search
      ? params.search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
      : '';
    if (escaped) {
      where.OR = [
        { user: { email: { contains: escaped, mode: 'insensitive' } } },
        { name: { contains: escaped, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      sort === 'email'
        ? { user: { email: direction } }
        : sort === 'status'
          ? { isActive: direction }
          : sort === 'name'
            ? { name: direction }
            : { createdAt: direction };

    const [memberships, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, mustChangePassword: true } },
          roles: { include: { role: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      items: memberships.map((m) => ({
        id: m.id,
        userId: m.user.id,
        email: m.user.email,
        name: m.name,
        displayName: m.name ?? m.user.email,
        isActive: m.isActive,
        status: m.isActive ? 'ACTIVE' : 'DEACTIVATED',
        roles: m.roles.map((mr) => ({
          id: mr.role.id,
          key: mr.role.key,
          name: mr.role.name,
        })),
        passwordChangeRequired: m.user.mustChangePassword,
        createdAt: m.createdAt,
        version: m.version,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Updates a membership's display name with before/after audit and version
   * bump. Tenant-scoped: another organization's membership → 404.
   */
  async updateName(params: {
    membershipId: string;
    organizationId: string;
    name: string;
    version: number;
    actingUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: params.membershipId },
        select: { id: true, organizationId: true, name: true, version: true },
      });
      if (!membership || membership.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Membership not found.');
      }
      if (membership.version !== params.version) {
        throw new AppException(ERROR_CODES.STALE_VERSION, [{ field: 'version', code: 'STALE_VERSION', message: `This member has changed since you opened it (it is now version ${membership.version}). Reload it and try again.` }], 'Stale version.');
      }
      const before = { name: membership.name };
      const updated = await tx.membership.update({
        where: { id: params.membershipId, version: params.version },
        data: { name: params.name, version: { increment: 1 } },
        select: { id: true, name: true, version: true },
      });
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.membersNameChanged,
          recordType: 'membership',
          recordId: params.membershipId,
          before,
          after: { name: params.name },
        },
      });
      return { membership: updated };
    });
  }

  /**
   * Deactivates a membership. Refuses if already inactive (409) or if it would
   * leave the organization without an active Administrator (409 LAST_ADMINISTRATOR).
   * Invalidates the user's sessions for this organization (FR-010).
   */
  async deactivate(params: {
    membershipId: string;
    organizationId: string;
    actingUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: params.membershipId },
        include: {
          roles: { include: { role: true } },
        },
      });

      if (!membership || membership.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Membership not found.');
      }

      if (!membership.isActive) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [],
          'Membership is already inactive.',
        );
      }

      // Last-Administrator check
      const targetHasAdmin = membership.roles.some((mr) => mr.role.key === 'administrator');
      if (targetHasAdmin) {
        const remainingAdmins = await tx.membershipRole.count({
          where: {
            organizationId: params.organizationId,
            role: { key: 'administrator' },
            membership: { isActive: true },
          },
        });
        if (remainingAdmins <= 1) {
          throw new AppException(ERROR_CODES.LAST_ADMINISTRATOR, [], 'An organization must keep at least one administrator.');
        }
      }

      const before = { isActive: membership.isActive };

      await tx.membership.update({
        where: { id: params.membershipId },
        data: { isActive: false },
      });

      // Invalidate the user's sessions for this organization
      await tx.session.deleteMany({
        where: {
          membershipId: params.membershipId,
        },
      });

      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.membersDeactivated,
          recordType: 'membership',
          recordId: params.membershipId,
          before,
          after: { isActive: false },
        },
      });

      return { isActive: false };
    });
  }

  /**
   * Reactivates a deactivated membership. Refuses if already active (409).
   */
  async reactivate(params: {
    membershipId: string;
    organizationId: string;
    actingUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: params.membershipId },
      });

      if (!membership || membership.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Membership not found.');
      }

      if (membership.isActive) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [],
          'Membership is already active.',
        );
      }

      const before = { isActive: membership.isActive };

      await tx.membership.update({
        where: { id: params.membershipId },
        data: { isActive: true },
      });

      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.membersReactivated,
          recordType: 'membership',
          recordId: params.membershipId,
          before,
          after: { isActive: true },
        },
      });

      return { isActive: true };
    });
  }

  /**
   * Asserts that the resulting permission set is a subset of the actor's
   * effective permissions. Throws 403 NOT_ENOUGH_PERMISSIONS naming the first
   * missing permission (FR-031).
   */
  assertWithinActorPermissions(
    resultingPermissionCodes: string[],
    actorEffectivePermissions: string[],
  ): void {
    for (const code of resultingPermissionCodes) {
      if (!actorEffectivePermissions.includes(code)) {
        throw new AppException(
          ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
          [{ field: 'permissions', code: 'NOT_ENOUGH_PERMISSIONS', message: `Permission ${code} is not held by the acting user.` }],
        );
      }
    }
  }

  /**
   * Asserts that the change leaves at least one active Administrator.
   * Throws 409 LAST_ADMINISTRATOR if not (FR-009).
   */
  async assertNotLastAdministrator(
    organizationId: string,
    targetHasAdministrator: boolean,
  ): Promise<void> {
    if (!targetHasAdministrator) return;

    const remainingAdmins = await this.prisma.membershipRole.count({
      where: {
        organizationId,
        role: { key: 'administrator' },
        membership: { isActive: true },
      },
    });

    if (remainingAdmins <= 1) {
      throw new AppException(ERROR_CODES.LAST_ADMINISTRATOR, [], 'An organization must keep at least one administrator.');
    }
  }
}
