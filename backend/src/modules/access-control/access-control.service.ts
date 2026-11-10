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

    for (const template of ROLE_TEMPLATES) {
      const roleId = roleByTemplateKey.get(template.key);
      if (!roleId) continue;

      for (const code of template.permissions) {
        const permission = await client.permission.findUnique({
          where: { code },
        });
        if (!permission) continue;

        await client.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: permission.id } },
          update: {},
          create: { roleId, permissionId: permission.id },
        });
      }
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
  async getEffectivePermissions(membershipId: string): Promise<string[]> {
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
