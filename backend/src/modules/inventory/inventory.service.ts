import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { PurchasingUsageService } from '../purchasing/purchasing-usage.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { ListStockMovementsDto } from './dto/list-stock-movements.dto';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseStateDto,
} from './dto/warehouse.dto';
import { LOW_STOCK_PREDICATE, LOW_STOCK_VIEW } from './low-stock.rule';

/**
 * The inventory: warehouses, stock balances, the movement ledger and the
 * adjustments that change stock.
 *
 * Every method is scoped to one organization: the tenant enters through the
 * request context and is applied to every query, so a record of another
 * organization is answered as "not found" rather than shown.
 *
 * Quantities are exact: they are stored as NUMERIC(14,3), they travel as
 * strings, and every arithmetic step happens inside the database. Nothing here
 * adds two quantities in JavaScript.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly purchasingUsage: PurchasingUsageService,
  ) {}

  // ---------------------------------------------------------------------
  // Stock balances
  // ---------------------------------------------------------------------

  /**
   * The balances of the organization.
   *
   * Three selections share one endpoint and one row shape:
   *   - the default: the balance rows themselves;
   *   - low-stock-only: the products the low-stock rule selects, at product
   *     level, each with the organization's default warehouse and the totals;
   *   - archived-with-stock: the archived products that still hold stock.
   *
   * The total says which of the two it counts, so a client never has to guess.
   */
  async listBalances(organizationId: string, query: ListStockBalancesDto) {
    const client = this.transaction.getClient();
    const search = query.search === undefined ? undefined : escapeLike(query.search);
    const lowStockOnly = query.lowStockOnly === true;
    const archivedOnly = query.status === 'archivedWithStock';

    const rows = lowStockOnly
      ? await this.productLevelBalances(client, organizationId, search, query)
      : archivedOnly
        ? await this.archivedBalances(client, organizationId, search, query)
        : await this.balanceRows(client, organizationId, search, query);

    // The total counts the WHOLE selection, not the page: a pager given the
    // page's own length cannot tell whether a next page exists. The count
    // answers the same filters the rows answered.
    const total = lowStockOnly
      ? await this.lowStockCount(client, organizationId, search)
      : archivedOnly
        ? await this.archivedCount(client, organizationId, search)
        : await this.balanceRowsCount(client, organizationId, search, query.warehouseId);

    const lowStockCount = await this.lowStockCount(client, organizationId, search);

    return {
      items: rows,
      total,
      totalKind: lowStockOnly || archivedOnly ? ('products' as const) : ('rows' as const),
      lowStockCount,
    };
  }

  /** The balance rows: one per warehouse and product that holds stock. */
  private async balanceRows(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
    query: ListStockBalancesDto,
  ) {
    const direction = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumn = balanceSortColumn(query.sortBy, 'b', 'p', 'w');
    const rows = await client.$queryRaw<BalanceRow[]>(Prisma.sql`
      SELECT
        b."organization_id"::text AS "organizationId",
        b."product_id"::text AS "productId",
        p."sku",
        p."name" AS "productName",
        b."warehouse_id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        b."on_hand"::text AS "onHand",
        b."reserved"::text AS "reserved",
        (b."on_hand" - b."reserved")::text AS "available",
        p."is_archived" AS "archived",
        ls."status" AS "status",
        true AS "hasStockRow"
      FROM "stock_balances" b
      JOIN "products" p
        ON p."organization_id" = b."organization_id" AND p."id" = b."product_id"
      JOIN "warehouses" w
        ON w."organization_id" = b."organization_id" AND w."id" = b."warehouse_id"
      LEFT JOIN "${Prisma.raw(LOW_STOCK_VIEW)}" ls
        ON ls."organization_id" = b."organization_id" AND ls."product_id" = b."product_id"
      WHERE b."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = false
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
        AND (${query.warehouseId}::uuid IS NULL OR b."warehouse_id" = ${query.warehouseId}::uuid)
      ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(direction)},
               p."sku" ASC, w."name" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);
    return rows;
  }

  /**
   * The low-stock selection, at product level.
   *
   * The status comes from the one low-stock rule (the view); the totals are
   * the same quantities the rule sums, over the active warehouses. A product
   * with no movements has no balance row and shows zero - it is still in the
   * selection, which is the whole point of the rule.
   */
  private async productLevelBalances(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
    query: ListStockBalancesDto,
  ) {
    const direction = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumn = balanceSortColumn(query.sortBy, 'p', 'p', 'dw');
    const rows = await client.$queryRaw<BalanceRow[]>(Prisma.sql`
      SELECT
        p."organization_id"::text AS "organizationId",
        p."id"::text AS "productId",
        p."sku",
        p."name" AS "productName",
        dw."id"::text AS "warehouseId",
        dw."name" AS "warehouseName",
        COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."on_hand" ELSE 0 END), 0)::numeric(14,3)::text AS "onHand",
        COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."reserved" ELSE 0 END), 0)::numeric(14,3)::text AS "reserved",
        ls."total_available"::text AS "available",
        p."is_archived" AS "archived",
        ls."status" AS "status",
        (COUNT(b."warehouse_id") > 0) AS "hasStockRow"
      FROM "products" p
      JOIN "${Prisma.raw(LOW_STOCK_VIEW)}" ls
        ON ls."organization_id" = p."organization_id" AND ls."product_id" = p."id"
      LEFT JOIN "warehouses" dw
        ON dw."organization_id" = p."organization_id" AND dw."is_default" AND dw."is_active"
      LEFT JOIN "stock_balances" b
        ON b."organization_id" = p."organization_id" AND b."product_id" = p."id"
      LEFT JOIN "warehouses" w
        ON w."organization_id" = b."organization_id" AND w."id" = b."warehouse_id" AND w."is_active"
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = false
        -- The rule decides what is low; this query only reports it.
        AND ${LOW_STOCK_PREDICATE}
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
      GROUP BY p."organization_id", p."id", p."sku", p."name", dw."id", dw."name",
               ls."total_available", ls."status"
      ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(direction)},
               p."sku" ASC, dw."name" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);
    return rows;
  }

  /**
   * The archived products that still hold stock.
   *
   * The archived ones are hidden from the default list on purpose - a
   * discontinued product is not part of the working stock - but their leftover
   * stock must still be visible and correctable, so this selection exists and
   * the interface points at it.
   */
  private async archivedBalances(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
    query: ListStockBalancesDto,
  ) {
    const direction = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumn = balanceSortColumn(query.sortBy, 'p', 'p', 'dw');
    const rows = await client.$queryRaw<BalanceRow[]>(Prisma.sql`
      SELECT
        p."organization_id"::text AS "organizationId",
        p."id"::text AS "productId",
        p."sku",
        p."name" AS "productName",
        dw."id"::text AS "warehouseId",
        dw."name" AS "warehouseName",
        COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."on_hand" ELSE 0 END), 0)::numeric(14,3)::text AS "onHand",
        COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."reserved" ELSE 0 END), 0)::numeric(14,3)::text AS "reserved",
        (COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."on_hand" ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."reserved" ELSE 0 END), 0))::numeric(14,3)::text AS "available",
        p."is_archived" AS "archived",
        NULL::text AS "status",
        (COUNT(b."warehouse_id") > 0) AS "hasStockRow"
      FROM "products" p
      LEFT JOIN "warehouses" dw
        ON dw."organization_id" = p."organization_id" AND dw."is_default" AND dw."is_active"
      LEFT JOIN "stock_balances" b
        ON b."organization_id" = p."organization_id" AND b."product_id" = p."id"
      LEFT JOIN "warehouses" w
        ON w."organization_id" = b."organization_id" AND w."id" = b."warehouse_id" AND w."is_active"
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = true
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
      GROUP BY p."organization_id", p."id", p."sku", p."name", dw."id", dw."name"
      HAVING COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."on_hand" ELSE 0 END), 0) > 0
      ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(direction)},
               p."sku" ASC, dw."name" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);
    return rows;
  }

  /**
   * How many products the low-stock rule selects, under the same search.
   *
   * This is also the low-stock selection's total: the count and the filter come
   * from the one rule, so they can never disagree.
   */
  private async lowStockCount(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
  ): Promise<number> {
    const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM "products" p
      JOIN "${Prisma.raw(LOW_STOCK_VIEW)}" ls
        ON ls."organization_id" = p."organization_id" AND ls."product_id" = p."id"
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = false
        -- The same rule the list reads, so the count and the list agree.
        AND ${LOW_STOCK_PREDICATE}
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /** How many balance rows the default selection holds, under the same filters. */
  private async balanceRowsCount(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
    warehouseId: string | undefined,
  ): Promise<number> {
    const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM "stock_balances" b
      JOIN "products" p
        ON p."organization_id" = b."organization_id" AND p."id" = b."product_id"
      WHERE b."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = false
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
        AND (${warehouseId}::uuid IS NULL OR b."warehouse_id" = ${warehouseId}::uuid)
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /** How many archived products still hold stock, under the same search. */
  private async archivedCount(
    client: TransactionClient,
    organizationId: string,
    search: string | undefined,
  ): Promise<number> {
    const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM "products" p
      LEFT JOIN "stock_balances" b
        ON b."organization_id" = p."organization_id" AND b."product_id" = p."id"
      LEFT JOIN "warehouses" w
        ON w."organization_id" = b."organization_id" AND w."id" = b."warehouse_id" AND w."is_active"
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."is_archived" = true
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
      GROUP BY p."id"
      HAVING COALESCE(SUM(CASE WHEN w."id" IS NOT NULL THEN b."on_hand" ELSE 0 END), 0) > 0
    `);
    return rows.length;
  }

  // ---------------------------------------------------------------------
  // Stock movements
  // ---------------------------------------------------------------------

  /** The movement ledger of the organization. */
  async listMovements(organizationId: string, query: ListStockMovementsDto) {
    const client = this.transaction.getClient();
    const search = query.search === undefined ? undefined : escapeLike(query.search);
    const direction = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumn = movementSortColumn(query.sortBy);

    const rows = await client.$queryRaw<MovementRow[]>(Prisma.sql`
      SELECT
        m."id"::text AS "id",
        m."created_at" AS "createdAt",
        m."type" AS "type",
        m."quantity_delta"::text AS "quantityDelta",
        m."reason" AS "reason",
        m."note" AS "note",
        m."source_type" AS "sourceType",
        m."source_id"::text AS "sourceId",
        m."source_number" AS "sourceNumber",
        p."id"::text AS "productId",
        p."sku",
        p."name" AS "productName",
        p."is_archived" AS "archived",
        w."id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        m."user_id"::text AS "userId"
      FROM "stock_movements" m
      JOIN "products" p
        ON p."organization_id" = m."organization_id" AND p."id" = m."product_id"
      JOIN "warehouses" w
        ON w."organization_id" = m."organization_id" AND w."id" = m."warehouse_id"
      WHERE m."organization_id" = ${organizationId}::uuid
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
        AND (${query.productId}::uuid IS NULL OR m."product_id" = ${query.productId}::uuid)
        AND (${query.warehouseId}::uuid IS NULL OR m."warehouse_id" = ${query.warehouseId}::uuid)
        AND (${query.type}::text IS NULL OR m."type" = ${query.type})
        AND (${query.startDate}::text IS NULL OR m."created_at" >= ${query.startDate}::date)
        AND (${query.endDate}::text IS NULL OR m."created_at" < (${query.endDate}::date + 1))
      ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(direction)},
               p."sku" ASC, w."name" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);

    const totals = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM "stock_movements" m
      JOIN "products" p
        ON p."organization_id" = m."organization_id" AND p."id" = m."product_id"
      WHERE m."organization_id" = ${organizationId}::uuid
        AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
        AND (${query.productId}::uuid IS NULL OR m."product_id" = ${query.productId}::uuid)
        AND (${query.warehouseId}::uuid IS NULL OR m."warehouse_id" = ${query.warehouseId}::uuid)
        AND (${query.type}::text IS NULL OR m."type" = ${query.type})
        AND (${query.startDate}::text IS NULL OR m."created_at" >= ${query.startDate}::date)
        AND (${query.endDate}::text IS NULL OR m."created_at" < (${query.endDate}::date + 1))
    `);

    return { items: rows, total: Number(totals[0]?.count ?? 0) };
  }

  // ---------------------------------------------------------------------
  // Warehouses
  // ---------------------------------------------------------------------

  /** The organization's warehouses. */
  async listWarehouses(organizationId: string) {
    const warehouses = await this.transaction.getClient().warehouse.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return {
      items: warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        isActive: warehouse.isActive,
        isDefault: warehouse.isDefault,
        version: warehouse.version,
      })),
      total: warehouses.length,
    };
  }

  /** Creates a warehouse. The name is unique inside the organization. */
  async createWarehouse(organizationId: string, userId: string, dto: CreateWarehouseDto) {
    const name = dto.name.trim();

    return this.transaction.runInTransaction(async (tx) => {
      await this.assertNameFree(tx, organizationId, name, null);
      if (dto.isDefault) {
        await this.clearDefault(tx, organizationId);
      }
      const warehouse = await tx.warehouse.create({
        data: { organizationId, name, isDefault: dto.isDefault, isActive: true, version: 1 },
      });
      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.warehousesCreated,
        recordType: 'warehouse',
        recordId: warehouse.id,
        after: this.warehouseValues(warehouse),
      });
      return this.warehouseResponse(warehouse);
    });
  }

  /**
   * Renames a warehouse, and may make it the default.
   *
   * The version the caller read travels with the change: a change prepared
   * against an older version is refused rather than overwriting someone else's
   * work.
   */
  async updateWarehouse(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateWarehouseDto,
  ) {
    const name = dto.name.trim();

    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.findWarehouse(tx, organizationId, id);
      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      await this.assertNameFree(tx, organizationId, name, id);

      if (dto.isDefault && !existing.isDefault) {
        await this.clearDefault(tx, organizationId);
      } else if (!dto.isDefault && existing.isDefault) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          [
            {
              field: 'isDefault',
              code: 'LAST_DEFAULT_WAREHOUSE',
              message: 'The organization must keep one default warehouse.',
            },
          ],
          'The organization must keep one default warehouse.',
        );
      }

      // The update itself is guarded by the version: a writer whose version
      // check raced with another commit changes no row and is refused here,
      // at the database, rather than overwriting the other writer's work.
      const warehouse = await this.updateWarehouseRow(
        tx,
        organizationId,
        id,
        { name, isDefault: dto.isDefault },
        dto.version,
      );

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.warehousesUpdated,
        recordType: 'warehouse',
        recordId: warehouse.id,
        before: this.warehouseValues(existing),
        after: this.warehouseValues(warehouse),
      });

      return this.warehouseResponse(warehouse);
    });
  }

  /**
   * Deactivates a warehouse.
   *
   * The organization's default warehouse cannot be deactivated, and neither can
   * one that still holds stock: both refusals protect an organization from a
   * place it can no longer see its stock in.
   */
  async deactivateWarehouse(
    organizationId: string,
    userId: string,
    id: string,
    dto: WarehouseStateDto,
  ) {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.findWarehouse(tx, organizationId, id);
      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      if (existing.isDefault) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          [
            {
              field: 'isDefault',
              code: 'DEFAULT_WAREHOUSE',
              message: 'The default warehouse cannot be deactivated.',
            },
          ],
          'The default warehouse cannot be deactivated.',
        );
      }
      const held = await tx.stockBalance.aggregate({
        where: { organizationId, warehouseId: id },
        _sum: { onHand: true, reserved: true },
      });
      const onHand = held._sum.onHand ?? new Prisma.Decimal(0);
      const reserved = held._sum.reserved ?? new Prisma.Decimal(0);
      if (!onHand.isZero() || !reserved.isZero()) {
        throw new AppException(
          ERROR_CODES.WAREHOUSE_IN_USE,
          [
            {
              field: 'warehouseId',
              code: 'WAREHOUSE_IN_USE',
              message: 'This warehouse still holds stock and cannot be deactivated.',
            },
          ],
          'This warehouse still holds stock and cannot be deactivated.',
        );
      }

      // A warehouse that an open purchase order still sends goods to cannot
      // be deactivated: the receipt would arrive in a place the organization
      // has closed. The refusal names the order so the user can resolve it.
      const openOrder = await this.purchasingUsage.findOpenOrderForWarehouse(
        organizationId,
        id,
      );
      if (openOrder !== null) {
        throw new AppException(
          ERROR_CODES.WAREHOUSE_IN_USE,
          [
            {
              field: 'warehouseId',
              code: 'WAREHOUSE_IN_USE',
              message: `This warehouse is the destination of the open purchase order ${openOrder.orderNumber}.`,
            },
          ],
          `This warehouse is the destination of the open purchase order ${openOrder.orderNumber}.`,
        );
      }

      const warehouse = await this.updateWarehouseRow(tx, organizationId, id, { isActive: false }, dto.version);

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.warehousesDeactivated,
        recordType: 'warehouse',
        recordId: warehouse.id,
        before: this.warehouseValues(existing),
        after: this.warehouseValues(warehouse),
      });

      return this.warehouseResponse(warehouse);
    });
  }

  /** Reactivates a deactivated warehouse. */
  async reactivateWarehouse(
    organizationId: string,
    userId: string,
    id: string,
    dto: WarehouseStateDto,
  ) {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.findWarehouse(tx, organizationId, id);
      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      const warehouse = await this.updateWarehouseRow(tx, organizationId, id, { isActive: true }, dto.version);
      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.warehousesReactivated,
        recordType: 'warehouse',
        recordId: warehouse.id,
        before: this.warehouseValues(existing),
        after: this.warehouseValues(warehouse),
      });
      return this.warehouseResponse(warehouse);
    });
  }

  // ---------------------------------------------------------------------
  // Adjustments
  // ---------------------------------------------------------------------

  /**
   * Posts a stock adjustment.
   *
   * Everything that happens here happens in ONE transaction: the idempotency
   * claim, the balance change, the movement, the audit entry and the stored
   * response. A failure of any part leaves no balance change.
   *
   * The balance is changed by ONE guarded statement: the new quantity is
   * computed by the database, and the guard (never below zero, never below
   * reserved) is part of the same statement. A refusal is therefore a fact
   * about the database, not a check that could race with another writer.
   */
  async postAdjustment(
    organizationId: string,
    userId: string,
    idempotencyKey: string,
    dto: CreateAdjustmentDto,
  ) {
    const endpoint = '/inventory/adjustments';

    const outcome = await this.idempotency.runOnce(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx) => {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: dto.warehouseId, organizationId },
          select: { id: true, name: true, isActive: true },
        });
        if (warehouse === null) {
          throw new NotFoundException('Warehouse not found.');
        }
        if (!warehouse.isActive) {
          throw new AppException(
            ERROR_CODES.INACTIVE_WAREHOUSE,
            [
              {
                field: 'warehouseId',
                code: 'INACTIVE_WAREHOUSE',
                message: 'This warehouse is deactivated and takes no stock.',
              },
            ],
            'This warehouse is deactivated and takes no stock.',
          );
        }

        const product = await tx.product.findFirst({
          where: { id: dto.productId, organizationId },
          select: { id: true, name: true, sku: true, isArchived: true },
        });
        if (product === null) {
          throw new NotFoundException('Product not found.');
        }

        const quantity = new Prisma.Decimal(dto.quantity.trim());

        // An archived product may be written OFF, but never topped up: the
        // order is restored first.
        if (product.isArchived && quantity.gt(0)) {
          throw new AppException(
            ERROR_CODES.PRODUCT_ARCHIVED,
            [
              {
                field: 'productId',
                code: 'PRODUCT_ARCHIVED',
                message: 'Restore the product before adding stock.',
              },
            ],
            'Restore the product before adding stock.',
          );
        }

        const before = await this.readBalance(tx, organizationId, dto.warehouseId, dto.productId);

        // The document number is allocated BEFORE the balance is changed, so
        // every adjustment of the organization takes the same locks in the same
        // order (the organization, then the balance) and two adjustments
        // posted at the same moment cannot deadlock each other.
        const sourceNumber = await this.allocateAdjustmentNumber(tx, organizationId);

        // The one guarded statement: it creates the balance when it is missing
        // and changes it when it is there, and it refuses the write when the
        // result would be negative or below the reserved quantity.
        //
        // The inserted quantity is clamped at zero on purpose. The database
        // checks the constraints of the PROPOSED row before it resolves the
        // conflict, so a negative quantity in the VALUES clause would fail the
        // "on hand is never negative" constraint even when the row exists and
        // the update would have been legal. The clamp keeps the proposed row
        // legal; the version in the RETURNING clause then says whether the
        // row was CREATED (version 1) or CHANGED (version 2 or more), and a
        // row created for a negative quantity is refused and rolled back, so
        // nothing is left behind.
        const affected = await tx.$queryRaw<
          { on_hand: Prisma.Decimal; reserved: Prisma.Decimal; version: number }[]
        >(Prisma.sql`
          INSERT INTO "stock_balances"
            ("organization_id", "warehouse_id", "product_id", "on_hand", "reserved", "version", "created_at", "updated_at")
          VALUES
            (${organizationId}::uuid, ${dto.warehouseId}::uuid, ${dto.productId}::uuid, GREATEST(${quantity}, 0), 0, 1, now(), now())
          ON CONFLICT ("organization_id", "warehouse_id", "product_id") DO UPDATE
            SET "on_hand" = "stock_balances"."on_hand" + ${quantity},
                "reserved" = "stock_balances"."reserved",
                "version" = "stock_balances"."version" + 1,
                "updated_at" = now()
            WHERE "stock_balances"."on_hand" + ${quantity} >= 0
              AND "stock_balances"."on_hand" + ${quantity} >= "stock_balances"."reserved"
          RETURNING "on_hand", "reserved", "version"
        `);

        const changed = affected[0];
        if (changed === undefined) {
          throw insufficientStock();
        }

        // The row was CREATED for a quantity that cannot be held: there was no
        // stock to take away. The refusal rolls the transaction back, so the
        // row is not left behind either.
        if (changed.version === 1 && quantity.lt(0)) {
          throw insufficientStock();
        }

        const movement = await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: dto.productId,
            type: 'ADJUSTMENT',
            quantityDelta: quantity,
            reason: dto.reason,
            note: dto.note ?? null,
            sourceType: 'ADJUSTMENT',
            sourceId: null,
            sourceNumber,
            userId,
          },
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.stockAdjusted,
          recordType: 'stock_movement',
          recordId: movement.id,
          before: {
            onHand: before?.onHand ?? '0.000',
            reserved: before?.reserved ?? '0.000',
          },
          after: {
            onHand: affected[0]?.on_hand.toFixed(3) ?? '0.000',
            reserved: affected[0]?.reserved.toFixed(3) ?? '0.000',
          },
          reasonCode: dto.reason,
        });

        const after = await this.readBalance(tx, organizationId, dto.warehouseId, dto.productId);

        return {
          status: 201,
          body: {
            movement: {
              id: movement.id,
              sourceNumber,
              quantityDelta: quantity.toFixed(3),
              type: 'ADJUSTMENT',
            },
            balance: {
              warehouseId: dto.warehouseId,
              productId: dto.productId,
              onHand: after?.onHand ?? '0.000',
              reserved: after?.reserved ?? '0.000',
              available: after
                ? new Prisma.Decimal(after.onHand).minus(new Prisma.Decimal(after.reserved)).toFixed(3)
                : '0.000',
            },
          },
        };
      },
    );

    return outcome.body;
  }

  /**
   * The names of the given warehouses.
   *
   * Another module needs the name of a warehouse to show it next to one of
   * its own records. It asks the module that owns the warehouses rather than
   * reading the table (Constitution Principle VI).
   */
  async findWarehouseNames(organizationId: string, ids: readonly string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    return this.transaction.getClient().warehouse.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true, name: true },
    });
  }

  // ---------------------------------------------------------------------
  // Receipts (called by the Purchasing module)
  // ---------------------------------------------------------------------

  /**
   * Asserts that a warehouse may receive goods for a purchase order.
   *
   * The warehouse must exist in THIS organization and must be active: goods
   * cannot arrive in a place the organization has closed.
   *
   * The row is locked with FOR SHARE while the receipt is written, so a
   * deactivation waits for the receipt to commit instead of slipping between
   * the check and the write.
   */
  async assertActiveWarehouseForOrder(
    tx: TransactionClient,
    organizationId: string,
    warehouseId: string,
  ): Promise<{ id: string; name: string }> {
    const rows = await tx.$queryRaw<
      { id: string; name: string; is_active: boolean }[]
    >(Prisma.sql`
      SELECT "id", "name", "is_active"
      FROM "warehouses"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "id" = ${warehouseId}::uuid
      FOR SHARE
    `);

    const warehouse = rows[0];
    if (warehouse === undefined) {
      throw new NotFoundException('Warehouse not found.');
    }
    if (!warehouse.is_active) {
      throw new AppException(
        ERROR_CODES.INACTIVE_WAREHOUSE,
        [
          {
            field: 'warehouseId',
            code: 'INACTIVE_WAREHOUSE',
            message: 'This warehouse is deactivated and takes no stock.',
          },
        ],
        'This warehouse is deactivated and takes no stock.',
      );
    }

    return { id: warehouse.id, name: warehouse.name };
  }

  /**
   * Posts the stock effect of one received line.
   *
   * Purchasing calls this INSIDE its own receipt transaction, so the receipt,
   * its lines, the movement and the balance all commit - or roll back - as one
   * unit. Purchasing never writes the movement or the balance itself: the
   * Inventory module owns those tables (Constitution Principle VI).
   *
   * The movement is a RECEIPT: it names the receipt that produced it, so the
   * ledger can be traced back to the document that justified it. The audit
   * entry is the Purchasing module's: it records the receipt, not this one
   * stock line.
   */
  async postReceiptMovement(params: {
    tx: TransactionClient;
    organizationId: string;
    userId: string;
    warehouseId: string;
    productId: string;
    quantity: Prisma.Decimal;
    receiptId: string;
    receiptNumber: string;
  }): Promise<{ movementId: string; onHandBefore: string; onHandAfter: string }> {
    const { tx, organizationId, userId, warehouseId, productId, quantity, receiptId, receiptNumber } =
      params;

    if (quantity.lte(0)) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        [
          {
            field: 'quantity',
            code: 'QUANTITY_NOT_POSITIVE',
            message: 'A received quantity must be greater than zero.',
          },
        ],
        'A received quantity must be greater than zero.',
      );
    }

    const before = await this.readBalance(tx, organizationId, warehouseId, productId);

    // The same guarded upsert the adjustment uses: the row is created when it
    // is missing and changed when it is there, and the database evaluates the
    // guard. A receipt only ever adds, so the guard is the reserved quantity:
    // the on-hand quantity may never fall below what is reserved.
    const affected = await tx.$queryRaw<
      { on_hand: Prisma.Decimal; reserved: Prisma.Decimal }[]
    >(Prisma.sql`
      INSERT INTO "stock_balances"
        ("organization_id", "warehouse_id", "product_id", "on_hand", "reserved", "version", "created_at", "updated_at")
      VALUES
        (${organizationId}::uuid, ${warehouseId}::uuid, ${productId}::uuid, ${quantity}, 0, 1, now(), now())
      ON CONFLICT ("organization_id", "warehouse_id", "product_id") DO UPDATE
        SET "on_hand" = "stock_balances"."on_hand" + ${quantity},
            "reserved" = "stock_balances"."reserved",
            "version" = "stock_balances"."version" + 1,
            "updated_at" = now()
      WHERE "stock_balances"."on_hand" + ${quantity} >= "stock_balances"."reserved"
      RETURNING "on_hand", "reserved"
    `);

    const changed = affected[0];
    if (changed === undefined) {
      throw new AppException(
        ERROR_CODES.INSUFFICIENT_STOCK,
        [
          {
            field: 'productId',
            code: 'INSUFFICIENT_STOCK',
            message: 'This receipt would take the stock below the reserved quantity.',
          },
        ],
        'This receipt would take the stock below the reserved quantity.',
      );
    }

    const movement = await tx.stockMovement.create({
      data: {
        organizationId,
        warehouseId,
        productId,
        type: 'RECEIPT',
        quantityDelta: quantity,
        reason: null,
        note: null,
        sourceType: 'RECEIPT',
        sourceId: receiptId,
        sourceNumber: receiptNumber,
        userId,
      },
    });

    const after = await this.readBalance(tx, organizationId, warehouseId, productId);

    return {
      movementId: movement.id,
      onHandBefore: before?.onHand ?? '0.000',
      onHandAfter: after?.onHand ?? changed.on_hand.toFixed(3),
    };
  }

  // ---------------------------------------------------------------------
  // Shipments
  // ---------------------------------------------------------------------

  /**
   * Posts the stock effect of one shipped line.
   *
   * Sales calls this INSIDE its own shipment transaction, so the shipment,
   * its lines, the movement and the balance all commit - or roll back - as one
   * unit. Sales never writes the movement or the balance itself: the
   * Inventory module owns those tables (Constitution Principle VI).
   *
   * The movement is a SHIPMENT: it names the shipment that produced it, so the
   * ledger can be traced back to the document that justified it. The audit
   * entry is the Sales module's: it records the shipment, not this one stock
   * line.
   *
   * The balance DECREASES: on_hand and reserved both fall by the shipped
   * quantity. The conditional update guards both sides: on_hand may never fall
   * below zero, and reserved may never fall below zero.
   */
  async postShipmentMovement(params: {
    tx: TransactionClient;
    organizationId: string;
    userId: string;
    warehouseId: string;
    productId: string;
    quantity: Prisma.Decimal;
    shipmentId: string;
    shipmentNumber: string;
  }): Promise<{ movementId: string; onHandBefore: string; onHandAfter: string }> {
    const { tx, organizationId, userId, warehouseId, productId, quantity, shipmentId, shipmentNumber } =
      params;

    if (quantity.lte(0)) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        [
          {
            field: 'quantity',
            code: 'QUANTITY_NOT_POSITIVE',
            message: 'A shipped quantity must be greater than zero.',
          },
        ],
        'A shipped quantity must be greater than zero.',
      );
    }

    const before = await this.readBalance(tx, organizationId, warehouseId, productId);

    // The guarded UPDATE: the row must already exist (there must be stock to
    // ship), and the guard keeps on_hand at or above zero and reserved at or
    // above zero. If no row matches or the guard fails, nothing changes and we
    // refuse with INSUFFICIENT_STOCK.
    const affected = await tx.$queryRaw<
      { on_hand: Prisma.Decimal; reserved: Prisma.Decimal }[]
    >(Prisma.sql`
      UPDATE "stock_balances"
      SET "on_hand" = "stock_balances"."on_hand" - ${quantity},
          "reserved" = "stock_balances"."reserved" - ${quantity},
          "version" = "stock_balances"."version" + 1,
          "updated_at" = now()
      WHERE "organization_id" = ${organizationId}::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${productId}::uuid
        AND "stock_balances"."on_hand" - ${quantity} >= 0
        AND "stock_balances"."reserved" - ${quantity} >= 0
      RETURNING "on_hand", "reserved"
    `);

    const changed = affected[0];
    if (changed === undefined) {
      throw new AppException(
        ERROR_CODES.INSUFFICIENT_STOCK,
        [
          {
            field: 'productId',
            code: 'INSUFFICIENT_STOCK',
            message: 'This shipment would take the stock below zero or below the reserved quantity.',
          },
        ],
        'This shipment would take the stock below zero or below the reserved quantity.',
      );
    }

    const movement = await tx.stockMovement.create({
      data: {
        organizationId,
        warehouseId,
        productId,
        type: 'SHIPMENT',
        quantityDelta: quantity.negated(),
        reason: null,
        note: null,
        sourceType: 'SHIPMENT',
        sourceId: shipmentId,
        sourceNumber: shipmentNumber,
        userId,
      },
    });

    return {
      movementId: movement.id,
      onHandBefore: before?.onHand ?? '0.000',
      onHandAfter: changed.on_hand.toFixed(3),
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /** The balance of one product in one warehouse, or null when there is none. */
  private async readBalance(
    tx: TransactionClient,
    organizationId: string,
    warehouseId: string,
    productId: string,
  ): Promise<{ onHand: string; reserved: string } | null> {
    const rows = await tx.$queryRaw<{ onHand: string; reserved: string }[]>(Prisma.sql`
      SELECT "on_hand"::text AS "onHand", "reserved"::text AS "reserved"
      FROM "stock_balances"
      WHERE "organization_id" = ${organizationId}::uuid::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${productId}::uuid
    `);
    return rows[0] ?? null;
  }

  /**
   * The document number of an adjustment, from the organization's sequence.
   *
   * The sequence is shared by every adjustment of the organization, so the
   * allocations are serialized with an ADVISORY lock rather than with a row
   * lock: a row lock on the organization row would collide with the key-share
   * locks the foreign keys take on that same row, and two adjustments would
   * deadlock each other. The advisory lock touches nothing else, so it waits
   * for nothing but another numbering.
   *
   * The number is `ADJ-` and five digits: `ADJ-00001`.
   */
  private async allocateAdjustmentNumber(
    tx: TransactionClient,
    organizationId: string,
  ): Promise<string> {
    // $executeRaw, not $queryRaw: the lock returns nothing, and a result set
    // Prisma cannot read is an error, not a lock.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:adjustment`}))`,
    );

    const existing = await tx.documentSequence.findFirst({
      where: { organizationId, name: 'adjustment' },
      select: { id: true },
    });

    const currentValue = existing
      ? (
          await tx.documentSequence.update({
            where: { id: existing.id },
            data: { currentValue: { increment: 1 } },
          })
        ).currentValue
      : (
          await tx.documentSequence.create({
            data: { organizationId, name: 'adjustment', currentValue: 1 },
          })
        ).currentValue;

    return `ADJ-${String(currentValue).padStart(5, '0')}`;
  }

  /** A warehouse of this organization, or "not found". */
  private async findWarehouse(tx: TransactionClient, organizationId: string, id: string) {
    const warehouse = await tx.warehouse.findFirst({ where: { id, organizationId } });
    if (warehouse === null) {
      throw new NotFoundException('Warehouse not found.');
    }
    return warehouse;
  }

  /**
   * The one guarded row change: it matches the row only while its version is
   * still the one the caller read. A racing writer's commit changes the
   * version, the statement then affects no row, and the caller is refused with
   * the version that actually stands.
   */
  private async updateWarehouseRow(
    tx: TransactionClient,
    organizationId: string,
    id: string,
    data: { name?: string; isDefault?: boolean; isActive?: boolean },
    expectedVersion: number,
  ) {
    const affected = await tx.warehouse.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (affected.count === 0) {
      // The row exists (findWarehouse established that): the version moved.
      const current = await tx.warehouse.findUniqueOrThrow({ where: { id } });
      throw staleVersion(current.version);
    }
    return tx.warehouse.findUniqueOrThrow({ where: { id } });
  }

  /** The name must be free in this organization, whatever its case. */
  private async assertNameFree(
    tx: TransactionClient,
    organizationId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const existing = await tx.warehouse.findFirst({
      where: {
        organizationId,
        id: exceptId === null ? undefined : { not: exceptId },
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (existing !== null) {
      throw new AppException(
        ERROR_CODES.DUPLICATE_RECORD,
        [
          {
            field: 'name',
            code: 'DUPLICATE',
            message: `A warehouse named "${existing.name}" already exists.`,
          },
        ],
        `A warehouse named "${existing.name}" already exists.`,
      );
    }
  }

  /** Demotes the organization's default warehouse. */
  private async clearDefault(tx: TransactionClient, organizationId: string): Promise<void> {
    await tx.warehouse.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false, version: { increment: 1 } },
    });
  }

  private warehouseValues(warehouse: {
    id: string;
    name: string;
    isActive: boolean;
    isDefault: boolean;
    version: number;
  }) {
    return {
      id: warehouse.id,
      name: warehouse.name,
      isActive: warehouse.isActive,
      isDefault: warehouse.isDefault,
      version: warehouse.version,
    };
  }

  private warehouseResponse(warehouse: {
    id: string;
    name: string;
    isActive: boolean;
    isDefault: boolean;
    version: number;
  }) {
    return this.warehouseValues(warehouse);
  }
}

export interface BalanceRow {
  organizationId: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  onHand: string;
  reserved: string;
  available: string;
  archived: boolean;
  status: string | null;
  hasStockRow: boolean;
}

export interface MovementRow {
  id: string;
  createdAt: Date;
  type: string;
  quantityDelta: string;
  reason: string | null;
  note: string | null;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  productId: string;
  sku: string;
  productName: string;
  archived: boolean;
  warehouseId: string;
  warehouseName: string;
  userId: string | null;
}

/** A search term is matched literally: the wildcards are escaped. */
function escapeLike(term: string): string {
  return `%${term.replace(/([\\%_])/g, '\\$1')}%`;
}

/** The sort column, as SQL. The caller only chooses the key. */
function balanceSortColumn(
  sortBy: string,
  balanceAlias: string,
  productAlias: string,
  warehouseAlias: string,
): string {
  switch (sortBy) {
    case 'product':
      return `${productAlias}."name"`;
    case 'warehouse':
      return `${warehouseAlias}."name"`;
    case 'onHand':
      return `${balanceAlias}."on_hand"`;
    case 'available':
      return `(${balanceAlias}."on_hand" - ${balanceAlias}."reserved")`;
    case 'sku':
    default:
      return `${productAlias}."sku"`;
  }
}

function movementSortColumn(sortBy: string): string {
  switch (sortBy) {
    case 'product':
      return 'p."name"';
    case 'warehouse':
      return 'w."name"';
    case 'quantity':
      return 'm."quantity_delta"';
    case 'createdAt':
    default:
      return 'm."created_at"';
  }
}

function staleVersion(current: number): AppException {
  return new AppException(
    ERROR_CODES.STALE_VERSION,
    [
      {
        field: 'version',
        code: 'STALE_VERSION',
        message: `This warehouse has changed since you opened it (it is now version ${current}). Reload it and try again.`,
      },
    ],
    'This warehouse changed since you opened it. Reload it and try again.',
  );
}

/** The refusal of a change that the stock cannot carry. */
function insufficientStock(): AppException {
  return new AppException(
    ERROR_CODES.INSUFFICIENT_STOCK,
    [
      {
        field: 'quantity',
        code: 'INSUFFICIENT_STOCK',
        message: 'This adjustment would take the stock below zero or below the reserved quantity.',
      },
    ],
    'This adjustment would take the stock below zero or below the reserved quantity.',
  );
}
