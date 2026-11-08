import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * Access control service. Resolves roles and permissions for a membership.
 * Uses the shared PERMISSION_CATALOG and ROLE_TEMPLATES from @nexuserp/shared.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async grantDefaultRolesAndPermissions(organizationId: string) {
    const { ROLE_TEMPLATES } = await import('@nexuserp/shared');

    const roleByTemplateKey = new Map<string, string>();

    for (const template of ROLE_TEMPLATES) {
      const role = await this.prisma.role.create({
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
        const permission = await this.prisma.permission.findUnique({
          where: { code },
        });
        if (!permission) continue;

        await this.prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permission.id,
          },
        });
      }
    }

    return roleByTemplateKey;
  }
}
