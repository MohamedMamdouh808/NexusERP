import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import type { TransactionClient } from '../../platform/transaction/transaction.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';

/**
 * The shared locking and assertion helpers that serialize organization settings
 * changes with document creation (FR-010, FR-018).
 *
 * Every helper runs inside `TransactionService.runInTransaction` so it shares
 * the caller's Prisma client and transaction. `lockOrganization` takes a
 * `SELECT ... FOR UPDATE` row lock on the organization, which is the same lock
 * document-creation services take before writing - so a settings currency change
 * and a first-document creation can never both win (FR-011).
 */
@Injectable()
export class OrganizationLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Take a row lock on the organization so concurrent settings changes and
   * document creation serialize on the same organization row.
   */
  async lockOrganization(tx: TransactionClient, organizationId: string): Promise<void> {
    await tx.$queryRawUnsafe(
      `SELECT id FROM "organizations" WHERE "id" = $1::uuid FOR UPDATE`,
      organizationId,
    );
  }

  /**
   * Fail closed when the organization has no module-availability row for the key.
   * A missing row means the workspace is incomplete; never treat it as enabled.
   */
  async assertModuleEnabled(
    tx: TransactionClient,
    organizationId: string,
    key: string,
  ): Promise<void> {
    const module = await tx.organizationModule.findUnique({
      where: { organizationId_moduleKey: { organizationId, moduleKey: key } },
    });
    if (!module || !module.enabled) {
      throw new AppException(
        ERROR_CODES.MODULE_DISABLED,
        [
          {
            field: 'module',
            code: ERROR_CODES.MODULE_DISABLED,
            message: 'This module is not enabled for your organization.',
          },
        ],
        'This module is not enabled for your organization.',
      );
    }
  }

  /**
   * Refuse a currency change once any document exists for the organization.
   * Runs under the organization row lock; the database trigger is the backstop.
   */
  async assertCurrencyMutable(tx: TransactionClient, organizationId: string): Promise<void> {
    if (await this.hasDocument(tx, organizationId)) {
      throw new AppException(
        ERROR_CODES.CURRENCY_LOCKED,
        [
          {
            field: 'currencyCode',
            code: ERROR_CODES.CURRENCY_LOCKED,
            message: 'The currency is locked once orders or invoices exist.',
          },
        ],
        'The currency is locked once orders or invoices exist.',
      );
    }
  }

  /**
   * Refuse a document whose organization currency changed while it waited on the
   * row lock. Captured before the transaction and compared under the lock, this
   * makes a currency change and a first document mutually exclusive (FR-011).
   */
  async assertCurrencyUnchanged(
    tx: TransactionClient,
    organizationId: string,
    expectedCurrency: string,
  ): Promise<void> {
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { currencyCode: true },
    });
    if (organization.currencyCode !== expectedCurrency) {
      throw new AppException(
        ERROR_CODES.CONFLICT,
        [
          {
            field: 'currencyCode',
            code: ERROR_CODES.CONFLICT,
            message: 'The organization currency changed while this document was being created. Retry.',
          },
        ],
        'The organization currency changed while this document was being created.',
      );
    }
  }

  /** The organization's current currency, read before a document-creation transaction. */
  async getCurrency(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { currencyCode: true },
    });
    return organization.currencyCode;
  }

  /** The enabled switchable module keys for the organization, within a transaction. */
  async getEnabledModuleKeys(tx: TransactionClient, organizationId: string): Promise<string[]> {
    const rows = await tx.organizationModule.findMany({
      where: { organizationId, enabled: true },
      select: { moduleKey: true },
      orderBy: { moduleKey: 'asc' },
    });
    return rows.map((row) => row.moduleKey);
  }

  private async hasDocument(tx: TransactionClient, organizationId: string): Promise<boolean> {
    const rows = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
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
