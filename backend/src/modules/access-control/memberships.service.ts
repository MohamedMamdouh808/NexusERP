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

      // 4. Link membership to roles
      for (const roleId of params.roleIds) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            roleId,
            organizationId: params.organizationId,
          },
        });
      }

      // 5. Audit: members.created (after = non-secret projection)
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

      return membership;
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

      // 5. Capture before state
      const beforeRoles = membership.roles.map((mr) => ({
        id: mr.role.id,
        key: mr.role.key,
        name: mr.role.name,
      }));

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

      // 7. Capture after state
      const afterRoles = roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
      }));

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
   * Lists the active organization's memberships with their roles.
   */
  async list(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true } },
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.id,
      user: m.user,
      isActive: m.isActive,
      roles: m.roles.map((mr) => ({
        id: mr.role.id,
        key: mr.role.key,
        name: mr.role.name,
      })),
      createdAt: m.createdAt,
    }));
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
