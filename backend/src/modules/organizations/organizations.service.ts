import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * Organization service. Handles organization creation and membership management.
 * All organization-owned tables carry organization_id NOT NULL and are RLS-enabled.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(name: string) {
    return this.prisma.organization.create({
      data: { name },
    });
  }

  async createMembership(
    userId: string,
    organizationId: string,
    roleKey: string,
  ) {
    return this.prisma.membership.create({
      data: {
        userId,
        organizationId,
        roleKey,
        isActive: true,
      },
    });
  }

  async createDefaultWarehouse(organizationId: string) {
    return this.prisma.warehouse.create({
      data: {
        organizationId,
        name: 'Default Warehouse',
        isDefault: true,
      },
    });
  }

  async createDefaultSequence(organizationId: string) {
    return this.prisma.documentSequence.create({
      data: {
        organizationId,
        name: 'invoice',
        currentValue: 0,
      },
    });
  }

  async findMembershipByUserAndOrganization(
    userId: string,
    organizationId: string,
  ) {
    return this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
  }

  async deactivateMembership(userId: string, organizationId: string) {
    return this.prisma.membership.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: { isActive: false },
    });
  }
}
