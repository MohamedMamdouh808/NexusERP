import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationLockService } from './organization-lock.service';
import { SWITCHABLE_MODULE_KEYS, ERROR_CODES, AUDIT_ACTIONS } from '@nexuserp/shared';
import { AppException } from '../../common/errors/all-exceptions.filter';

/**
 * Organization service. Handles organization creation and membership management.
 * All organization-owned tables carry organization_id NOT NULL and are RLS-enabled.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly organizationLock: OrganizationLockService,
  ) {}

  async createOrganization(name: string) {
    return this.prisma.organization.create({
      data: { name },
    });
  }

  async createMembership(
    userId: string,
    organizationId: string,
    roleId?: string,
  ) {
    const membership = await this.prisma.membership.create({
      data: {
        userId,
        organizationId,
        isActive: true,
      },
    });

    if (roleId) {
      await this.prisma.membershipRole.create({
        data: {
          membershipId: membership.id,
          roleId,
          organizationId,
        },
      });
    }

    return membership;
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

  /**
   * The default due date of an operational invoice for this organization:
   * issue date plus this many days. Read-only here; editing it belongs to the
   * organization settings feature.
   */
  async getDefaultPaymentTermsDays(organizationId: string): Promise<number> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { defaultPaymentTermsDays: true },
    });
    return organization.defaultPaymentTermsDays;
  }

  /**
   * Settings for the active organization, readable by any active member
   * (FR-001). `currencyLocked` is true once any order or invoice exists.
   */
  async getCurrentSettings(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const modules = await this.prisma.organizationModule.findMany({
      where: { organizationId, moduleKey: { in: [...SWITCHABLE_MODULE_KEYS] } },
      select: { moduleKey: true, enabled: true, version: true },
      orderBy: { moduleKey: 'asc' },
    });
    const currencyLocked = await this.isCurrencyLocked(organizationId);

    return {
      id: organization.id,
      name: organization.name,
      currencyCode: organization.currencyCode,
      defaultPaymentTermsDays: organization.defaultPaymentTermsDays,
      version: organization.version,
      currencyLocked,
      modules: modules.map((module) => ({
        key: module.moduleKey,
        enabled: module.enabled,
        version: module.version,
      })),
    };
  }

  /**
   * Settings update with optimistic locking, currency lock and same-transaction
   * audit (FR-006, FR-007, FR-009, FR-010). A stale version or a locked currency
   * changes nothing.
   */
  async updateSettings(
    organizationId: string,
    userId: string,
    input: {
      name: string;
      currencyCode: string;
      defaultPaymentTermsDays: number;
      version: number;
    },
  ) {
    return this.transaction.runInTransaction(async (tx) => {
      await this.organizationLock.lockOrganization(tx, organizationId);

      const current = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      if (current.version !== input.version) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [
            {
              field: 'version',
              code: ERROR_CODES.STALE_VERSION,
              message: `This organization changed since you opened it (it is now version ${current.version}). Reload and try again.`,
            },
          ],
          'Stale version.',
        );
      }

      if (input.currencyCode !== current.currencyCode) {
        await this.organizationLock.assertCurrencyMutable(tx, organizationId);
      }

      const before = {
        name: current.name,
        currencyCode: current.currencyCode,
        defaultPaymentTermsDays: current.defaultPaymentTermsDays,
        version: current.version,
      };

      const result = await tx.organization.updateMany({
        where: { id: organizationId, version: input.version },
        data: {
          name: input.name,
          currencyCode: input.currencyCode,
          defaultPaymentTermsDays: input.defaultPaymentTermsDays,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [{ field: 'version', code: ERROR_CODES.STALE_VERSION, message: 'Stale version.' }],
          'Stale version.',
        );
      }

      const updated = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          currencyCode: true,
          defaultPaymentTermsDays: true,
          version: true,
        },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.organizationsUpdated,
        recordType: 'organization',
        recordId: organizationId,
        before,
        after: {
          name: updated.name,
          currencyCode: updated.currencyCode,
          defaultPaymentTermsDays: updated.defaultPaymentTermsDays,
          version: updated.version,
        },
      });

      return this.getCurrentSettingsInTx(tx, organizationId, updated);
    });
  }

  /** Build the settings response inside an open transaction after an update. */
  private async getCurrentSettingsInTx(
    tx: TransactionClient,
    organizationId: string,
    organization: {
      id: string;
      name: string;
      currencyCode: string;
      defaultPaymentTermsDays: number;
      version: number;
    },
  ) {
    const modules = await tx.organizationModule.findMany({
      where: { organizationId, moduleKey: { in: [...SWITCHABLE_MODULE_KEYS] } },
      select: { moduleKey: true, enabled: true, version: true },
      orderBy: { moduleKey: 'asc' },
    });
    const currencyLocked = await this.isCurrencyLocked(organizationId);
    return {
      id: organization.id,
      name: organization.name,
      currencyCode: organization.currencyCode,
      defaultPaymentTermsDays: organization.defaultPaymentTermsDays,
      version: organization.version,
      currencyLocked,
      modules: modules.map((module) => ({
        key: module.moduleKey,
        enabled: module.enabled,
        version: module.version,
      })),
    };
  }

  /** True when any sales order, purchase order or invoice exists for the org. */
  private async isCurrencyLocked(organizationId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<{ locked: boolean }[]>(
      `SELECT EXISTS (
        SELECT 1 FROM "sales_orders" AS s WHERE s."organization_id" = $1::uuid
        UNION ALL
        SELECT 1 FROM "purchase_orders" AS p WHERE p."organization_id" = $1::uuid
        UNION ALL
        SELECT 1 FROM "invoices" AS i WHERE i."organization_id" = $1::uuid
        LIMIT 1
      ) AS "locked"`,
      organizationId,
    );
    return rows[0]?.locked ?? false;
  }
}
