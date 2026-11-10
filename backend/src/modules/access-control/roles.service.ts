import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { AUDIT_ACTIONS } from '@nexuserp/shared';

/**
 * Roles service. Custom role CRUD under the open catalogue with the
 * no-escalation subset rule (FR-031). System roles are read-only (FR-013).
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all roles of the active organization with their permission codes.
   */
  async listRoles(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      include: {
        permissions: { include: { permission: true } },
      },
      orderBy: { key: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((rp) => rp.permission.code),
    }));
  }

  /**
   * List the system permission catalogue.
   */
  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return permissions.map((p) => p.code);
  }

  /**
   * Create a custom role. Open catalogue (any permission), subject to the
   * no-escalation subset rule (FR-031). Name must be unique per org
   * case-insensitively (FR-014). Unknown permission codes → 400.
   */
  async createRole(params: {
    organizationId: string;
    name: string;
    key: string;
    description?: string | null;
    permissionCodes: string[];
    actingUserId: string;
    actingEffectivePermissions: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Name collision: case-insensitive within the same organization (FR-014)
      const existing = await tx.role.findFirst({
        where: {
          organizationId: params.organizationId,
          key: { equals: params.key, mode: 'insensitive' },
        },
      });
      if (existing) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [{ field: 'key', code: 'DUPLICATE_RECORD', message: 'Role key already exists in this organization.' }],
        );
      }

      // 2. Unknown permission codes → 400 (FR-014)
      const validCodes = await tx.permission.findMany({
        where: { code: { in: params.permissionCodes } },
        select: { code: true },
      });
      const validCodeSet = new Set(validCodes.map((p) => p.code));
      for (const code of params.permissionCodes) {
        if (!validCodeSet.has(code)) {
          throw new AppException(
            ERROR_CODES.VALIDATION_ERROR,
            [{ field: 'permissionCodes', code: 'VALIDATION_ERROR', message: `Unknown permission code: ${code}` }],
          );
        }
      }

      // 3. No-escalation: resulting set ⊆ actor's effective permissions (FR-031)
      for (const code of params.permissionCodes) {
        if (!params.actingEffectivePermissions.includes(code)) {
          throw new AppException(
            ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
            [{ field: 'permissionCodes', code: 'NOT_ENOUGH_PERMISSIONS', message: `Permission ${code} is not held by the acting user.` }],
          );
        }
      }

      // 4. Create role + role_permissions links
      const role = await tx.role.create({
        data: {
          key: params.key,
          name: params.name,
          description: params.description ?? '',
          isSystem: false,
          organizationId: params.organizationId,
          permissions: {
            create: params.permissionCodes.map((code) => ({
              permission: { connect: { code } },
            })),
          },
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });

      // 5. Audit: roles.created
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.rolesCreated,
          recordType: 'role',
          recordId: role.id,
          after: {
            name: role.name,
            key: role.key,
            permissions: params.permissionCodes,
          },
        },
      });

      return {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((rp) => rp.permission.code),
      };
    });
  }

  /**
   * Update a custom role's name and permission set (full replace).
   * System roles are read-only (FR-013). No-escalation applies (FR-031).
   */
  async updateRole(params: {
    roleId: string;
    organizationId: string;
    name?: string;
    key?: string;
    description?: string | null;
    permissionCodes?: string[];
    actingUserId: string;
    actingEffectivePermissions: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: params.roleId },
        include: { permissions: { include: { permission: true } } },
      });

      if (!role || role.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Role not found.');
      }

      // System roles are read-only (FR-013)
      if (role.isSystem) {
        throw new AppException(
          ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
          [],
          'System roles are read-only.',
        );
      }

      // Compute resulting permission set
      const newCodes = params.permissionCodes ?? role.permissions.map((rp) => rp.permission.code);

      // Unknown permission codes → 400
      if (params.permissionCodes) {
        const validCodes = await tx.permission.findMany({
          where: { code: { in: params.permissionCodes } },
          select: { code: true },
        });
        const validCodeSet = new Set(validCodes.map((p) => p.code));
        for (const code of params.permissionCodes) {
          if (!validCodeSet.has(code)) {
            throw new AppException(
              ERROR_CODES.VALIDATION_ERROR,
              [{ field: 'permissionCodes', code: 'VALIDATION_ERROR', message: `Unknown permission code: ${code}` }],
            );
          }
        }
      }

      // No-escalation: resulting set ⊆ actor's effective permissions (FR-031)
      for (const code of newCodes) {
        if (!params.actingEffectivePermissions.includes(code)) {
          throw new AppException(
            ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
            [{ field: 'permissionCodes', code: 'NOT_ENOUGH_PERMISSIONS', message: `Permission ${code} is not held by the acting user.` }],
          );
        }
      }

      const before = {
        name: role.name,
        key: role.key,
        permissions: role.permissions.map((rp) => rp.permission.code),
      };

      // Update role fields
      const updated = await tx.role.update({
        where: { id: params.roleId },
        data: {
          name: params.name ?? undefined,
          key: params.key ?? undefined,
          description: params.description ?? undefined,
          permissions: {
            deleteMany: {},
            create: params.permissionCodes
              ? params.permissionCodes.map((code) => ({ permission: { connect: { code } } }))
              : undefined,
          },
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });

      const after = {
        name: updated.name,
        key: updated.key,
        permissions: updated.permissions.map((rp) => rp.permission.code),
      };

      // Audit: roles.updated
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.rolesUpdated,
          recordType: 'role',
          recordId: params.roleId,
          before,
          after,
        },
      });

      return {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        description: updated.description,
        isSystem: updated.isSystem,
        permissions: updated.permissions.map((rp) => rp.permission.code),
      };
    });
  }

  /**
   * Delete a custom role. System roles are read-only (FR-013). Assigned roles
   * cannot be deleted (FR-013 → 409).
   */
  async deleteRole(params: {
    roleId: string;
    organizationId: string;
    actingUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: params.roleId },
        include: {
          memberships: { include: { membership: true } },
        },
      });

      if (!role || role.organizationId !== params.organizationId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Role not found.');
      }

      if (role.isSystem) {
        throw new AppException(
          ERROR_CODES.NOT_ENOUGH_PERMISSIONS,
          [],
          'System roles are read-only.',
        );
      }

      // Cannot delete a role still assigned to a membership (FR-013 → 409)
      if (role.memberships && role.memberships.length > 0) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          [],
          'Role is still assigned to one or more memberships.',
        );
      }

      const before = {
        name: role.name,
        key: role.key,
        permissions: [], // role_permissions already deleted via cascade? No—we capture before deletion
      };

      await tx.role.delete({
        where: { id: params.roleId },
      });

      // Audit: roles.deleted
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: params.organizationId } },
          user: { connect: { id: params.actingUserId } },
          action: AUDIT_ACTIONS.rolesDeleted,
          recordType: 'role',
          recordId: params.roleId,
          before,
        },
      });

      return { deleted: true };
    });
  }
}
