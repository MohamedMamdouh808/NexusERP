import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import {
  TransactionService,
  type TransactionClient,
} from '../../platform/transaction/transaction.service';

/**
 * Access control service. Resolves roles and permissions for a membership.
 * Uses the shared PERMISSION_CATALOG and ROLE_TEMPLATES from @nexuserp/shared.
 */
@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
  ) {}

  /**
   * Materializes the five role templates into an organization's own roles with
   * their permission links. Idempotent: a template role whose key already exists
   * for that organization is left untouched (FR-002 backfill edge case).
   *
   * Uses `TransactionService.getClient()` so the provisioning runs inside the
   * caller's ambient transaction when one is open (registration path), or
   * standalone when called directly (backfill path).
   */
  async grantDefaultRolesAndPermissions(
    organizationId: string,
  ): Promise<Map<string, string>> {
    const client: TransactionClient = this.transaction.getClient();
    const { ROLE_TEMPLATES } = await import('@nexuserp/shared');

    const roleByTemplateKey = new Map<string, string>();

    for (const template of ROLE_TEMPLATES) {
      // Idempotent: skip if a role with this key already exists for this org.
      const existing = await client.role.findFirst({
        where: { organizationId, key: template.key },
        select: { id: true },
      });
      if (existing) {
        roleByTemplateKey.set(template.key, existing.id);
        continue;
      }

      const role = await client.role.create({
        data: {
          key: template.key,
          name: template.name,
          description: template.description,
          isSystem: true,
          organizationId,
        },
      });
      roleByTemplateKey.set(template.key, role.id);
    }

    // Pre-fetch all catalog permissions in one single query rather than 68 individual queries
    const allPermissions = await client.permission.findMany({
      select: { id: true, code: true },
    });
    const permissionByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

    // Batch prepare rolePermission rows
    const rolePermissionData: { roleId: string; permissionId: string }[] = [];
    for (const template of ROLE_TEMPLATES) {
      const roleId = roleByTemplateKey.get(template.key);
      if (!roleId) continue;

      for (const code of template.permissions) {
        const permissionId = permissionByCode.get(code);
        if (permissionId) {
          rolePermissionData.push({ roleId, permissionId });
        }
      }
    }

    if (rolePermissionData.length > 0) {
      await client.rolePermission.createMany({
        data: rolePermissionData,
        skipDuplicates: true,
      });
    }

    return roleByTemplateKey;
  }

  /**
   * Extends every organization's Administrator role to hold the entire
   * permission catalogue. Called when a catalogue permission is added
   * (platform work); seed updates call it too (FR-032).
   */
  async syncAdministratorRolePermissions(): Promise<void> {
    const { ROLE_TEMPLATES } = await import('@nexuserp/shared');
    const administratorTemplate = ROLE_TEMPLATES.find(
      (t) => t.key === 'administrator',
    );
    if (!administratorTemplate) return;

    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    });

    for (const org of orgs) {
      const role = await this.prisma.role.findFirst({
        where: { organizationId: org.id, key: 'administrator' },
        select: { id: true },
      });
      if (!role) continue;

      const existing = await this.prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const have = new Set(existing.map((p) => p.permissionId));

      for (const code of administratorTemplate.permissions) {
        const permission = await this.prisma.permission.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!permission || have.has(permission.id)) continue;

        await this.prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
  }

  /**
   * Resolves the effective permission codes for a membership: the union of all
   * permissions granted through its roles (FR-003).
   */
  async getEffectivePermissions(
  membershipId: string,
  identity?: { membershipId?: string; permissions?: readonly string[] },
): Promise<string[]> {
  if (
    identity?.membershipId === membershipId &&
    Array.isArray(identity.permissions)
  ) {
    return [...identity.permissions];
  }
    const permissions = await this.prisma.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            role: {
              memberships: {
                some: { membershipId },
              },
            },
          },
        },
      },
      select: { code: true },
    });
    return permissions.map((p) => p.code);
  }
}
