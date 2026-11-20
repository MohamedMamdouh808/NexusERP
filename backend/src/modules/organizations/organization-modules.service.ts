import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationLockService } from './organization-lock.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ALWAYS_ON_MODULE_KEYS,
  MODULE_DEPENDENCIES,
  MODULE_DEPENDENTS,
  isSwitchableModule,
  type ModuleKey,
} from '@nexuserp/shared';

/** Status sets that make a module "in use" (FR-017). */
const OPEN_STATUSES: Record<string, readonly string[]> = {
  purchasing: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'],
  sales: ['DRAFT', 'CONFIRMED'],
  invoicing: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'],
};

@Injectable()
export class OrganizationModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly organizationLock: OrganizationLockService,
  ) {}

  /** Switchable module rows plus implicit always-on entries (FR-012, FR-013). */
  async listModules(organizationId: string) {
    const rows = await this.prisma.organizationModule.findMany({
      where: { organizationId },
      select: {
        moduleKey: true,
        enabled: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { moduleKey: 'asc' },
    });
    const switchable = rows
      .filter((row) => isSwitchableModule(row.moduleKey))
      .map((row) => ({
        key: row.moduleKey,
        enabled: row.enabled,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        locked: false,
      }));
    const alwaysOn = ALWAYS_ON_MODULE_KEYS.map((key) => ({
      key,
      enabled: true,
      version: 1,
      createdAt: null,
      updatedAt: null,
      locked: true,
    }));
    return { modules: [...switchable, ...alwaysOn] };
  }

  /**
   * Toggle a module with version check, dependency and in-use checks, and a
   * same-transaction audit entry (FR-015..FR-019). Never deletes data.
   */
  async toggleModule(
    organizationId: string,
    userId: string,
    key: string,
    input: { enabled: boolean; version: number },
  ) {
    if (!isSwitchableModule(key)) {
      throw new AppException(
        ERROR_CODES.NOT_FOUND,
        [{ field: 'key', code: ERROR_CODES.NOT_FOUND, message: 'Unknown module.' }],
        'Module not found.',
      );
    }
    const moduleKey = key;

    return this.transaction.runInTransaction(async (tx) => {
      await this.organizationLock.lockOrganization(tx, organizationId);

      const row = await tx.organizationModule.findUnique({
        where: { organizationId_moduleKey: { organizationId, moduleKey } },
      });
      if (!row) {
        throw new AppException(
          ERROR_CODES.NOT_FOUND,
          [{ field: 'key', code: ERROR_CODES.NOT_FOUND, message: 'Module availability not found.' }],
          'Module not found.',
        );
      }
      if (row.version !== input.version) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [
            {
              field: 'version',
              code: ERROR_CODES.STALE_VERSION,
              message: `This module changed since you opened it (it is now version ${row.version}). Reload and try again.`,
            },
          ],
          'Stale version.',
        );
      }

      if (input.enabled) {
        await this.assertRequirementsEnabled(tx, organizationId, moduleKey);
      } else {
        await this.assertNoEnabledDependents(tx, organizationId, moduleKey);
        await this.assertNoOpenDocuments(tx, organizationId, moduleKey);
      }

      const after = input.enabled ? 1 : 0;
      const before = row.enabled ? 1 : 0;
      const result = await tx.organizationModule.updateMany({
        where: {
          organizationId,
          moduleKey,
          version: input.version,
        },
        data: { enabled: input.enabled, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [{ field: 'version', code: ERROR_CODES.STALE_VERSION, message: 'Stale version.' }],
          'Stale version.',
        );
      }

      const updated = await tx.organizationModule.findUniqueOrThrow({
        where: { organizationId_moduleKey: { organizationId, moduleKey } },
        select: { enabled: true, version: true },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.organizationsModuleToggled,
        recordType: 'organization_module',
        recordId: organizationId,
        before: { module: moduleKey, enabled: before === 1, version: row.version },
        after: { module: moduleKey, enabled: after === 1, version: updated.version },
      });

      return { key: moduleKey, enabled: updated.enabled, version: updated.version };
    });
  }

  private async assertRequirementsEnabled(
    tx: TransactionClient,
    organizationId: string,
    key: ModuleKey,
  ): Promise<void> {
    const requirement = MODULE_DEPENDENCIES.get(key);
    if (!requirement) return;
    const row = await tx.organizationModule.findUnique({
      where: { organizationId_moduleKey: { organizationId, moduleKey: requirement } },
      select: { enabled: true },
    });
    if (!row?.enabled) {
      throw new AppException(
        ERROR_CODES.MODULE_DEPENDENCY,
        [
          {
            field: 'module',
            code: ERROR_CODES.MODULE_DEPENDENCY,
            message: `${key} requires ${requirement}. Switch ${requirement} on first.`,
          },
        ],
        'A required module is turned off.',
      );
    }
  }

  private async assertNoEnabledDependents(
    tx: TransactionClient,
    organizationId: string,
    key: ModuleKey,
  ): Promise<void> {
    const dependents = MODULE_DEPENDENTS.get(key) ?? [];
    if (dependents.length === 0) return;
    const enabled = await tx.organizationModule.findMany({
      where: { organizationId, moduleKey: { in: [...dependents] }, enabled: true },
      select: { moduleKey: true },
    });
    if (enabled.length > 0) {
      const names = enabled.map((row) => row.moduleKey).join(', ');
      throw new AppException(
        ERROR_CODES.MODULE_DEPENDENCY,
        [
          {
            field: 'module',
            code: ERROR_CODES.MODULE_DEPENDENCY,
            message: `${names} require ${key}. Switch ${names} off first.`,
          },
        ],
        'Other enabled modules depend on this module.',
      );
    }
  }

  private async assertNoOpenDocuments(
    tx: TransactionClient,
    organizationId: string,
    key: ModuleKey,
  ): Promise<void> {
    const details = await this.countOpenDocuments(tx, organizationId, key);
    if (details.length === 0) return;
    throw new AppException(
      ERROR_CODES.MODULE_IN_USE,
      details,
      'This module has open documents and cannot be turned off.',
    );
  }

  private async countOpenDocuments(
    tx: TransactionClient,
    organizationId: string,
    key: ModuleKey,
  ) {
    const out: { field: string; code: string; message: string }[] = [];
    if (key === 'purchasing') {
      const count = await tx.purchaseOrder.count({
        where: { organizationId, status: { in: [...(OPEN_STATUSES.purchasing ?? [])] } },
      });
      if (count > 0) out.push({ field: 'purchaseOrders', code: 'MODULE_IN_USE', message: `${count} open purchase orders.` });
    } else if (key === 'sales') {
      const count = await tx.salesOrder.count({
        where: { organizationId, status: { in: [...(OPEN_STATUSES.sales ?? [])] } },
      });
      if (count > 0) out.push({ field: 'salesOrders', code: 'MODULE_IN_USE', message: `${count} open sales orders.` });
    } else if (key === 'invoicing') {
      const count = await tx.invoice.count({
        where: { organizationId, status: { in: [...(OPEN_STATUSES.invoicing ?? [])] } },
      });
      if (count > 0) out.push({ field: 'invoices', code: 'MODULE_IN_USE', message: `${count} open invoices.` });
    } else if (key === 'inventory') {
      const count = await tx.stockReservation.count({ where: { organizationId, status: 'ACTIVE' } });
      if (count > 0) out.push({ field: 'reservations', code: 'MODULE_IN_USE', message: `${count} active stock reservations.` });
    }
    return out;
  }
}
