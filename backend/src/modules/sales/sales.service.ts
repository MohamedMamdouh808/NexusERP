import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';

import { AppException } from '../../common/errors/all-exceptions.filter';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { OrganizationLockService } from '../../modules/organizations/organization-lock.service';
import { allocateSalesNumber } from './sales-number';
import type {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
} from './dto/create-sales-order.dto';
import type { SalesOrderActionDto } from './dto/sales-order-action.dto';
import type { ListSalesOrdersDto } from './dto/list-sales-orders.dto';
import type { ListShipmentsDto } from './dto/list-shipments.dto';
import {
  type SalesOrderActionResponse,
  type SalesOrderDetailResponse,
  type SalesOrderResponse,
  type SalesOrderRow,
  type ShipmentDetailResponse,
  type ShipmentRowResponse,
  toDateString,
} from './dto/sales-order-response.dto';
import type { ShipmentResponse } from './dto/shipment-response.dto';

/**
 * The sales orders, reservations and shipments.
 *
 * Every method is scoped to one organization: the tenant enters through the
 * request context and is applied to every query, so a record of another
 * organization is answered as "not found" rather than shown.
 *
 * The numbers are exact: quantities and prices are stored as `NUMERIC(14,3)`
 * and `NUMERIC(14,4)`, the line total is rounded half-up to two decimals and
 * the order total is the sum of the ALREADY-ROUNDED line totals. Nothing here
 * rounds twice and nothing here uses a JavaScript float.
 *
 * The state machine is server-side: DRAFT �+' CONFIRMED �+' SHIPPED, and
 * DRAFT/CONFIRMED �+' CANCELLED. Every change carries the version the caller
 * read, and a stale version is refused rather than applied.
 *
 * Confirmation is ALL OR NOTHING: if any line is short of stock, nothing is
 * reserved for any line, and the refusal names every short product with its
 * available and required quantity. The locks are taken in a fixed order - the
 * order row, then the stock-balance rows in ascending product id - so two
 * concurrent confirmations cannot deadlock.
 */
/** The order an invoice is copied from: the header and the lines, verbatim. */
export interface InvoiceableOrder {
  readonly id: string;
  readonly customerId: string;
  readonly status: string;
  readonly total: Prisma.Decimal;
  readonly lines: readonly {
    readonly productId: string;
    readonly quantity: Prisma.Decimal;
    readonly unitPrice: Prisma.Decimal;
    readonly lineTotal: Prisma.Decimal;
  }[];
}

@Injectable()
export class SalesService {
  constructor(
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly contacts: ContactsService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly organizationLock: OrganizationLockService,
  ) {}

  // -----------------------------------------------------------------------
  // The order lifecycle
  // -----------------------------------------------------------------------

  async createOrder(
    organizationId: string,
    userId: string,
    dto: CreateSalesOrderDto,
  ): Promise<SalesOrderResponse> {
    const expectedCurrency = await this.organizationLock.getCurrency(organizationId);
    return this.transaction.runInTransaction(async (tx) => {
      // Lock the organization row so a concurrent settings currency change or
      // module toggle serializes with this first document (FR-010, FR-011, FR-018).
      await this.organizationLock.lockOrganization(tx, organizationId);
      await this.organizationLock.assertModuleEnabled(tx, organizationId, 'sales');
      await this.organizationLock.assertCurrencyUnchanged(tx, organizationId, expectedCurrency);

      const customer = await this.contacts.assertCustomerSelectableForOrder(
        tx,
        organizationId,
        dto.customerId,
      );
      const warehouse = await this.inventory.assertActiveWarehouseForOrder(
        tx,
        organizationId,
        dto.warehouseId,
      );

      const lines = await this.buildLines(tx, organizationId, dto.lines);

      const number = await allocateSalesNumber(tx, organizationId, 'sales_order');

      const order = await tx.salesOrder.create({
        data: {
          organizationId,
          number,
          customerId: customer.id,
          warehouseId: warehouse.id,
          status: 'DRAFT',
          orderDate: new Date(`${dto.orderDate}T00:00:00.000Z`),
          notes: dto.notes ?? '',
          total: sumMoney(lines.map((line) => line.lineTotal)),
          version: 1,
          createdById: userId,
        },
      });

      if (lines.length > 0) {
        await tx.salesOrderLine.createMany({
          data: lines.map((line) => ({
            organizationId,
            salesOrderId: order.id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
      }

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.salesOrdersCreated,
        recordType: 'sales_order',
        recordId: order.id,
        after: {
          number: order.number,
          status: order.status,
          total: order.total.toFixed(2),
          lines: lines.length,
        },
      });

      const stored = await tx.salesOrderLine.findMany({
        where: { organizationId, salesOrderId: order.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: { select: { sku: true, name: true } },
        },
      });

      return {
        id: order.id,
        number: order.number,
        customerId: customer.id,
        customerName: customer.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        status: order.status,
        orderDate: dto.orderDate,
        notes: order.notes,
        lines: stored.map((line) => ({
          id: line.id,
          productId: line.productId,
          productSku: line.product.sku,
          productName: line.product.name,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(4),
          lineTotal: line.lineTotal.toFixed(2),
        })),
        total: order.total.toFixed(2),
        version: order.version,
      };
    });
  }

  async updateOrder(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateSalesOrderDto,
  ): Promise<SalesOrderResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.lockOrder(tx, organizationId, id);

      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      if (existing.status !== 'DRAFT') {
        throw invalidTransition(existing.status, 'edit');
      }

      const customer = await this.contacts.assertCustomerSelectableForOrder(
        tx,
        organizationId,
        dto.customerId,
      );
      const warehouse = await this.inventory.assertActiveWarehouseForOrder(
        tx,
        organizationId,
        dto.warehouseId,
      );

      const lines = await this.buildLines(tx, organizationId, dto.lines);

      await tx.salesOrderLine.deleteMany({
        where: { organizationId, salesOrderId: existing.id },
      });
      if (lines.length > 0) {
        await tx.salesOrderLine.createMany({
          data: lines.map((line) => ({
            organizationId,
            salesOrderId: existing.id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
      }

      const order = await tx.salesOrder.update({
        where: { organizationId_id: { organizationId, id: existing.id } },
        data: {
          customerId: customer.id,
          warehouseId: warehouse.id,
          orderDate: new Date(`${dto.orderDate}T00:00:00.000Z`),
          notes: dto.notes ?? '',
          total: sumMoney(lines.map((line) => line.lineTotal)),
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.salesOrdersUpdated,
        recordType: 'sales_order',
        recordId: order.id,
        before: { status: existing.status, version: existing.version },
        after: { status: order.status, version: order.version, total: order.total.toFixed(2) },
      });

      const stored = await tx.salesOrderLine.findMany({
        where: { organizationId, salesOrderId: order.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: { select: { sku: true, name: true } },
        },
      });

      return {
        id: order.id,
        number: order.number,
        customerId: customer.id,
        customerName: customer.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        status: order.status,
        orderDate: dto.orderDate,
        notes: order.notes,
        lines: stored.map((line) => ({
          id: line.id,
          productId: line.productId,
          productSku: line.product.sku,
          productName: line.product.name,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(4),
          lineTotal: line.lineTotal.toFixed(2),
        })),
        total: order.total.toFixed(2),
        version: order.version,
      };
    });
  }

  async confirmOrder(
    organizationId: string,
    userId: string,
    id: string,
    idempotencyKey: string,
    dto: SalesOrderActionDto,
  ): Promise<SalesOrderActionResponse> {
    const endpoint = `/sales-orders/${id}/confirm`;
    const outcome = await this.idempotency.runOnce(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx): Promise<{ status: number; body: SalesOrderActionResponse }> => {
        // Lock the organization row and assert the inventory module is on before
        // creating active stock reservations (FR-010, FR-018).
        await this.organizationLock.lockOrganization(tx, organizationId);
        await this.organizationLock.assertModuleEnabled(tx, organizationId, 'inventory');

        const order = await this.lockOrder(tx, organizationId, id);

        if (order.version !== dto.version) {
          throw staleVersion(order.version);
        }
        if (order.status !== 'DRAFT') {
          throw invalidTransition(order.status, 'confirm');
        }

        const lineCount = await tx.salesOrderLine.count({
          where: { organizationId, salesOrderId: order.id },
        });
        if (lineCount === 0) {
          throw new AppException(
            ERROR_CODES.VALIDATION_ERROR,
            [
              {
                field: 'lines',
                code: 'NO_LINES',
                message: 'Add at least one line before confirming this order.',
              },
            ],
            'Add at least one line before confirming this order.',
          );
        }

        const orderLines = await this.lockOrderLines(tx, organizationId, order.id);
        const byProductId = new Map(orderLines.map((line) => [line.productId, line]));

        const productIds = Array.from(byProductId.keys()).sort();
        await this.lockBalances(tx, organizationId, productIds);

        const short: Array<{
          productId: string;
          productName: string;
          available: string;
          required: string;
        }> = [];

        for (const productId of productIds) {
          const line = byProductId.get(productId)!;
          const reserved = await this.reservedForBalance(
            tx,
            organizationId,
            order.warehouseId,
            productId,
          );
          const onHand = await this.onHandForBalance(
            tx,
            organizationId,
            order.warehouseId,
            productId,
          );
          const available = new Prisma.Decimal(onHand).minus(new Prisma.Decimal(reserved));
          if (available.lessThan(line.quantity)) {
            short.push({
              productId,
              productName: line.productName,
              available: available.toFixed(3),
              required: line.quantity.toFixed(3),
            });
          }
        }

        if (short.length > 0) {
          throw new AppException(
            ERROR_CODES.INSUFFICIENT_STOCK,
            short.map((s) => ({
              field: 'lines',
              code: ERROR_CODES.INSUFFICIENT_STOCK,
              message: `${s.productName}: available ${s.available}, required ${s.required}.`,
            })),
            short
              .map((s) => `${s.productName}: available ${s.available}, required ${s.required}.`)
              .join(' '),
          );
        }

        for (const productId of productIds) {
          const line = byProductId.get(productId)!;
          await tx.stockReservation.create({
            data: {
              organizationId,
              salesOrderLineId: line.id,
              warehouseId: order.warehouseId,
              productId,
              quantity: line.quantity,
              status: 'ACTIVE',
            },
          });
          await tx.$executeRaw(
            Prisma.sql`
              UPDATE "stock_balances"
              SET "reserved" = "stock_balances"."reserved" + ${line.quantity},
                  "version" = "stock_balances"."version" + 1,
                  "updated_at" = now()
              WHERE "organization_id" = ${organizationId}::uuid
                AND "warehouse_id" = ${order.warehouseId}::uuid
                AND "product_id" = ${productId}::uuid
            `,
          );
        }

        const orderResult = await tx.salesOrder.update({
          where: { organizationId_id: { organizationId, id: order.id } },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.salesOrdersConfirmed,
          recordType: 'sales_order',
          recordId: orderResult.id,
          before: { status: order.status, version: order.version },
          after: { status: orderResult.status, version: orderResult.version },
        });

        return {
          status: 200,
          body: {
            id: orderResult.id,
            number: orderResult.number,
            status: orderResult.status,
            version: orderResult.version,
          },
        };
      },
    );

    return outcome.body;
  }

  async cancelOrder(
    organizationId: string,
    userId: string,
    id: string,
    idempotencyKey: string,
    dto: SalesOrderActionDto,
  ): Promise<SalesOrderActionResponse> {
    const endpoint = `/sales-orders/${id}/cancel`;
    const outcome = await this.idempotency.runOnce(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx): Promise<{ status: number; body: SalesOrderActionResponse }> => {
        const order = await this.lockOrder(tx, organizationId, id);

        if (order.version !== dto.version) {
          throw staleVersion(order.version);
        }

        const status = order.status as string;
        if (status === 'SHIPPED') {
          throw new AppException(
            ERROR_CODES.ORDER_SHIPPED,
            [
              {
                field: 'status',
                code: ERROR_CODES.ORDER_SHIPPED,
                message: 'This order has already shipped and cannot be cancelled.',
              },
            ],
            'This order has already shipped and cannot be cancelled.',
          );
        }

        if (status !== 'DRAFT' && status !== 'CONFIRMED') {
          throw invalidTransition(status, 'cancel');
        }

        if (status === 'CONFIRMED') {
          const orderLines = await tx.salesOrderLine.findMany({
            where: { organizationId, salesOrderId: order.id },
            select: { id: true },
          });
          const orderLineIds = orderLines.map((line) => line.id);
          const reservations = await tx.stockReservation.findMany({
            where: {
              organizationId,
              salesOrderLineId: { in: orderLineIds },
              status: 'ACTIVE',
            },
          });
          for (const reservation of reservations) {
            await tx.stockReservation.update({
              where: { id: reservation.id },
              data: { status: 'RELEASED' },
            });
            await tx.$executeRaw(
              Prisma.sql`
                UPDATE "stock_balances"
                SET "reserved" = "stock_balances"."reserved" - ${reservation.quantity},
                    "version" = "stock_balances"."version" + 1,
                    "updated_at" = now()
                WHERE "organization_id" = ${organizationId}::uuid
                  AND "warehouse_id" = ${reservation.warehouseId}::uuid
                  AND "product_id" = ${reservation.productId}::uuid
              `,
            );
          }
        }

        const orderResult = await tx.salesOrder.update({
          where: { organizationId_id: { organizationId, id: order.id } },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.salesOrdersCancelled,
          recordType: 'sales_order',
          recordId: orderResult.id,
          before: { status: order.status, version: order.version },
          after: { status: orderResult.status, version: orderResult.version },
        });

        return {
          status: 200,
          body: {
            id: orderResult.id,
            number: orderResult.number,
            status: orderResult.status,
            version: orderResult.version,
          },
        };
      },
    );

    return outcome.body;
  }

  async shipOrder(
    organizationId: string,
    userId: string,
    id: string,
    idempotencyKey: string,
  ): Promise<ShipmentResponse> {
    const endpoint = `/sales-orders/${id}/shipments`;
    const outcome = await this.idempotency.runOnce(
      { organizationId, endpoint, key: idempotencyKey, body: {} },
      async (tx): Promise<{ status: number; body: ShipmentResponse }> => {
        const order = await this.lockOrder(tx, organizationId, id);

        if (order.status !== 'CONFIRMED') {
          throw invalidTransition(order.status, 'ship');
        }

        const orderLines = await this.lockOrderLines(tx, organizationId, order.id);
        if (orderLines.length === 0) {
          // A confirmed order always carries at least one line; this guards the
          // unreachable shape rather than the reachable one.
          throw invalidTransition(order.status, 'ship');
        }

        // Require an ACTIVE reservation for every line before any shipment
        // exists; a CONFIRMED order without one is not shippable.
        const lineIds = orderLines.map((line) => line.id);
        const reservations = await tx.stockReservation.findMany({
          where: {
            organizationId,
            salesOrderLineId: { in: lineIds },
            status: 'ACTIVE',
          },
          select: { id: true, salesOrderLineId: true },
        });
        const byLineId = new Map(reservations.map((reservation) => [reservation.salesOrderLineId, reservation]));
        if (byLineId.size !== orderLines.length) {
          throw invalidTransition('CONFIRMED', 'ship');
        }

        const productIds = Array.from(new Set(orderLines.map((line) => line.productId))).sort();
        await this.lockBalances(tx, organizationId, productIds);

        const number = await allocateSalesNumber(tx, organizationId, 'shipment');
        const shipment = await tx.shipment.create({
          data: { organizationId, number, salesOrderId: order.id, shippedById: userId },
        });

        for (const line of orderLines) {
          const reservation = byLineId.get(line.id)!;

          // The movement deducts both on-hand and reserved and posts the
          // SHIPMENT movement; the guarded update refuses a take below zero.
          await this.inventory.postShipmentMovement({
            tx,
            organizationId,
            userId,
            warehouseId: order.warehouseId,
            productId: line.productId,
            quantity: line.quantity,
            shipmentId: shipment.id,
            shipmentNumber: shipment.number,
          });

          await tx.shipmentLine.create({
            data: {
              organizationId,
              shipmentId: shipment.id,
              salesOrderLineId: line.id,
              productId: line.productId,
              quantity: line.quantity,
            },
          });

          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { status: 'CONSUMED' },
          });
        }

        const orderResult = await tx.salesOrder.update({
          where: { organizationId_id: { organizationId, id: order.id } },
          data: { status: 'SHIPPED', version: { increment: 1 } },
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.shipmentsPosted,
          recordType: 'shipment',
          recordId: shipment.id,
          before: { status: order.status, version: order.version },
          after: { status: orderResult.status, version: orderResult.version, shipmentNumber: shipment.number },
        });

        return {
          status: 201,
          body: {
            shipment: {
              id: shipment.id,
              number: shipment.number,
              shippedAt: shipment.shippedAt.toISOString(),
            },
            order: {
              id: orderResult.id,
              number: orderResult.number,
              status: orderResult.status,
              version: orderResult.version,
            },
          },
        };
      },
    );

    return outcome.body;
  }

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  /**
   * The organization's sales orders.
   *
   * The page is one query: the order, the customer and the warehouse it
   * names. The total counts the whole filtered selection, not the page.
   */
  async listSalesOrders(organizationId: string, query: ListSalesOrdersDto) {
    const client = this.transaction.getClient();
    const search = query.search === undefined ? undefined : escapeLike(query.search);
    const status = query.status ?? null;

    const rows = await client.$queryRaw<
      {
        id: string;
        number: string;
        customerId: string;
        customerName: string;
        warehouseId: string;
        warehouseName: string;
        status: string;
        orderDate: string;
        total: string;
        version: number;
      }[]
    >(Prisma.sql`
      SELECT
        o."id"::text AS "id",
        o."number",
        o."customer_id"::text AS "customerId",
        c."name" AS "customerName",
        o."warehouse_id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        o."status",
        o."order_date"::text AS "orderDate",
        o."total"::text AS "total",
        o."version"
      FROM "sales_orders" o
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."customer_id"
      JOIN "warehouses" w
        ON w."organization_id" = o."organization_id" AND w."id" = o."warehouse_id"
      WHERE o."organization_id" = ${organizationId}::uuid
        AND (${status}::text IS NULL OR o."status" = ${status})
        AND (
          ${search}::text IS NULL
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
      ORDER BY ${Prisma.raw(salesOrderSortColumn(query.sortBy))} ${Prisma.raw(
        query.sortOrder === 'desc' ? 'DESC' : 'ASC',
      )}, o."number" ASC, o."id" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);

    const totalRows = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "sales_orders" o
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."customer_id"
      WHERE o."organization_id" = ${organizationId}::uuid
        AND (${status}::text IS NULL OR o."status" = ${status})
        AND (
          ${search}::text IS NULL
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
    `);
    const total = totalRows[0]?.count ?? 0;

    return {
      items: rows.map(
        (row): SalesOrderRow => ({
          id: row.id,
          number: row.number,
          customerId: row.customerId,
          customerName: row.customerName,
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          status: row.status,
          orderDate: toDateString(row.orderDate),
          total: new Prisma.Decimal(row.total).toFixed(2),
          version: row.version,
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** One sales order with its lines and its shipment history (newest first). */
  async getSalesOrderDetail(organizationId: string, id: string): Promise<SalesOrderDetailResponse> {
    const client = this.transaction.getClient();
    const order = await client.salesOrder.findUnique({
      where: { organizationId_id: { organizationId, id } },
      select: {
        id: true,
        number: true,
        customerId: true,
        warehouseId: true,
        status: true,
        orderDate: true,
        notes: true,
        total: true,
        version: true,
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    if (order === null) {
      throw new NotFoundException('Sales order not found.');
    }

    const lines = await client.salesOrderLine.findMany({
      where: { organizationId, salesOrderId: order.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        lineTotal: true,
        product: { select: { sku: true, name: true } },
      },
    });

    const shipments = await client.shipment.findMany({
      where: { organizationId, salesOrderId: order.id },
      orderBy: [{ shippedAt: 'desc' }, { number: 'desc' }],
      select: {
        id: true,
        number: true,
        shippedAt: true,
        shippedBy: { select: { email: true } },
        lines: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            salesOrderLineId: true,
            productId: true,
            quantity: true,
            product: { select: { sku: true, name: true } },
          },
        },
      },
    });

    return {
      id: order.id,
      number: order.number,
      customerId: order.customerId,
      customerName: order.customer.name,
      warehouseId: order.warehouseId,
      warehouseName: order.warehouse.name,
      status: order.status,
      orderDate: toDateString(order.orderDate),
      notes: order.notes,
      lines: lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productSku: line.product.sku,
        productName: line.product.name,
        quantity: line.quantity.toFixed(3),
        unitPrice: line.unitPrice.toFixed(4),
        lineTotal: line.lineTotal.toFixed(2),
      })),
      total: order.total.toFixed(2),
      version: order.version,
      shipments: shipments.map(
        (shipment): ShipmentDetailResponse => ({
          id: shipment.id,
          number: shipment.number,
          orderId: order.id,
          orderNumber: order.number,
          customerId: order.customerId,
          customerName: order.customer.name,
          warehouseId: order.warehouseId,
          warehouseName: order.warehouse.name,
          shippedAt: shipment.shippedAt.toISOString(),
          user: shipment.shippedBy.email,
          lines: shipment.lines.map((line) => ({
            lineId: line.id,
            orderLineId: line.salesOrderLineId,
            productId: line.productId,
            productSku: line.product.sku,
            productName: line.product.name,
            quantity: line.quantity.toFixed(3),
          })),
        }),
      ),
    };
  }

  /**
   * The organization's shipments.
   *
   * One row per shipment, never one row per shipment line: the total counts
   * shipments, and the interface says so.
   */
  async listShipments(organizationId: string, query: ListShipmentsDto) {
    const client = this.transaction.getClient();
    const search = query.search === undefined ? undefined : escapeLike(query.search);
    const startDate = query.startDate === undefined ? null : query.startDate;
    const endDate = query.endDate === undefined ? null : query.endDate;

    const rows = await client.$queryRaw<
      {
        id: string;
        number: string;
        orderId: string;
        orderNumber: string;
        customerId: string;
        customerName: string;
        warehouseId: string;
        warehouseName: string;
        shippedAt: Date;
        user: string;
        lineCount: number;
      }[]
    >(Prisma.sql`
      SELECT
        s."id"::text AS "id",
        s."number",
        o."id"::text AS "orderId",
        o."number" AS "orderNumber",
        o."customer_id"::text AS "customerId",
        c."name" AS "customerName",
        o."warehouse_id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        s."shipped_at" AS "shippedAt",
        u."email" AS "user",
        l."line_count"::int AS "lineCount"
      FROM "shipments" s
      JOIN "sales_orders" o
        ON o."organization_id" = s."organization_id" AND o."id" = s."sales_order_id"
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."customer_id"
      JOIN "warehouses" w
        ON w."organization_id" = o."organization_id" AND w."id" = o."warehouse_id"
      JOIN "users" u ON u."id" = s."shipped_by"
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS "line_count"
        FROM "shipment_lines" sl
        WHERE sl."organization_id" = s."organization_id"
          AND sl."shipment_id" = s."id"
      ) l ON true
      WHERE s."organization_id" = ${organizationId}::uuid
        AND (${startDate}::date IS NULL OR s."shipped_at"::date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR s."shipped_at"::date <= ${endDate}::date)
        AND (
          ${search}::text IS NULL
          OR s."number" ILIKE ${search}
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
      ORDER BY ${Prisma.raw(shipmentSortColumn(query.sortBy))} ${Prisma.raw(
        query.sortOrder === 'asc' ? 'ASC' : 'DESC',
      )}, s."number" ASC, s."id" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);

    const totalRows = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "shipments" s
      JOIN "sales_orders" o
        ON o."organization_id" = s."organization_id" AND o."id" = s."sales_order_id"
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."customer_id"
      WHERE s."organization_id" = ${organizationId}::uuid
        AND (${startDate}::date IS NULL OR s."shipped_at"::date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR s."shipped_at"::date <= ${endDate}::date)
        AND (
          ${search}::text IS NULL
          OR s."number" ILIKE ${search}
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
    `);
    const total = totalRows[0]?.count ?? 0;

    return {
      items: rows.map(
        (row): ShipmentRowResponse => ({
          id: row.id,
          number: row.number,
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          customerId: row.customerId,
          customerName: row.customerName,
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          shippedAt: row.shippedAt.toISOString(),
          user: row.user,
          lineCount: row.lineCount,
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** One shipment with its lines; another organization's shipment is not found. */
  async getShipmentDetail(
    organizationId: string,
    id: string,
  ): Promise<ShipmentDetailResponse> {
    const client = this.transaction.getClient();
    const shipment = await client.shipment.findUnique({
      where: { organizationId_id: { organizationId, id } },
      select: {
        id: true,
        number: true,
        salesOrderId: true,
        shippedAt: true,
        shippedBy: { select: { email: true } },
        salesOrder: {
          select: {
            number: true,
            customerId: true,
            warehouseId: true,
            customer: { select: { name: true } },
            warehouse: { select: { name: true } },
          },
        },
        lines: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            salesOrderLineId: true,
            productId: true,
            quantity: true,
            product: { select: { sku: true, name: true } },
          },
        },
      },
    });
    if (shipment === null) {
      throw new NotFoundException('Shipment not found.');
    }

    return {
      id: shipment.id,
      number: shipment.number,
      orderId: shipment.salesOrderId,
      orderNumber: shipment.salesOrder.number,
      customerId: shipment.salesOrder.customerId,
      customerName: shipment.salesOrder.customer.name,
      warehouseId: shipment.salesOrder.warehouseId,
      warehouseName: shipment.salesOrder.warehouse.name,
      shippedAt: shipment.shippedAt.toISOString(),
      user: shipment.shippedBy.email,
      lines: shipment.lines.map((line) => ({
        lineId: line.id,
        orderLineId: line.salesOrderLineId,
        productId: line.productId,
        productSku: line.product.sku,
        productName: line.product.name,
        quantity: line.quantity.toFixed(3),
      })),
    };
  }

  // -----------------------------------------------------------------------
  // Locking helpers
  // -----------------------------------------------------------------------

  private async lockOrder(
    tx: TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    number: string;
    status: string;
    version: number;
    customerId: string;
    warehouseId: string;
  }> {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "sales_orders"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "id" = ${id}::uuid
        FOR UPDATE
    `);

    if (locked.length === 0) {
      throw new NotFoundException('Sales order not found.');
    }

    const row = await tx.salesOrder.findUniqueOrThrow({
      where: { organizationId_id: { organizationId, id } },
      select: {
        id: true,
        number: true,
        status: true,
        version: true,
        customerId: true,
        warehouseId: true,
      },
    });

    return {
      id: row.id,
      number: row.number,
      status: row.status,
      version: row.version,
      customerId: row.customerId,
      warehouseId: row.warehouseId,
    };
  }

  private async lockOrderLines(
    tx: TransactionClient,
    organizationId: string,
    salesOrderId: string,
  ): Promise<{
    id: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
  }[]> {
    const rows = await tx.$queryRaw<{
      id: string;
      product_id: string;
      product_sku: string;
      product_name: string;
      quantity: Prisma.Decimal;
      unit_price: Prisma.Decimal;
    }[]>(Prisma.sql`
      SELECT l."id", l."product_id", p."sku" AS "product_sku", p."name" AS "product_name", l."quantity", l."unit_price"
      FROM "sales_order_lines" l
      JOIN "products" p
        ON p."organization_id" = l."organization_id"
       AND p."id" = l."product_id"
      WHERE l."organization_id" = ${organizationId}::uuid
        AND l."sales_order_id" = ${salesOrderId}::uuid
      ORDER BY p."id"
      FOR SHARE OF l
    `);

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productSku: row.product_sku,
      productName: row.product_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
    }));
  }

  private async lockBalances(
    tx: TransactionClient,
    organizationId: string,
    productIds: readonly string[],
  ): Promise<void> {
    if (productIds.length === 0) return;

    await tx.$queryRaw(
      Prisma.sql`
        SELECT "organization_id"
        FROM "stock_balances"
        WHERE "organization_id" = ${organizationId}::uuid
          AND "product_id" IN (${Prisma.join(
            productIds.map((id) => Prisma.sql`${id}::uuid`),
          )})
        FOR UPDATE
      `,
    );
  }

  // -----------------------------------------------------------------------
  // Line building
  // -----------------------------------------------------------------------

  private async buildLines(
    tx: TransactionClient,
    organizationId: string,
    inputs: readonly { productId: string; quantity: string; unitPrice: string }[],
  ): Promise<{
    productId: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    productName: string;
  }[]> {
    const seen = new Set<string>();
    for (const input of inputs) {
      if (seen.has(input.productId)) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [
            {
              field: 'lines',
              code: 'DUPLICATE',
              message: 'A product appears at most once on a sales order.',
            },
          ],
          'A product appears at most once on a sales order.',
        );
      }
      seen.add(input.productId);
    }

    const products = await this.products.assertSelectableForSale(
      tx,
      organizationId,
      inputs.map((input) => input.productId),
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    return inputs.map((input) => {
      const product = byId.get(input.productId)!;
      const quantity = new Prisma.Decimal(input.quantity);
      const unitPrice = new Prisma.Decimal(input.unitPrice);
      const lineTotal = quantity.mul(unitPrice).toDecimalPlaces(2);

      return {
        productId: input.productId,
        quantity,
        unitPrice,
        lineTotal,
        productName: product.name,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Balance helpers
  // -----------------------------------------------------------------------

  private async reservedForBalance(
    tx: TransactionClient,
    organizationId: string,
    warehouseId: string,
    productId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ reserved: string }[]>(Prisma.sql`
      SELECT "reserved"::text AS "reserved"
      FROM "stock_balances"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${productId}::uuid
    `);
    return rows[0]?.reserved ?? '0';
  }

  private async onHandForBalance(
    tx: TransactionClient,
    organizationId: string,
    warehouseId: string,
    productId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ on_hand: string }[]>(Prisma.sql`
      SELECT "on_hand"::text AS "on_hand"
      FROM "stock_balances"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${productId}::uuid
    `);
    return rows[0]?.on_hand ?? '0';
  }

  // -----------------------------------------------------------------------
  // The invoicing seam: the shipped order an invoice may be created from
  // -----------------------------------------------------------------------

  /**
   * The shipped order an invoice may be created from, read inside the caller's
   * transaction.
   *
   * The order of another organization, or no order at all, is answered as
   * "not found" - its existence is not disclosed. An order that is not SHIPPED
   * is 409 INVALID_STATE_TRANSITION: a draft has no price to bill and a
   * confirmed order has not left the warehouse yet.
   *
   * The lines come back with their already-rounded prices and totals; the
   * invoice copies them verbatim. Only the Sales module may read its own
   * tables - Invoicing asks here and never writes them (Principle VI).
   */
  async readShippedOrderForInvoice(
    tx: TransactionClient,
    organizationId: string,
    orderId: string,
  ): Promise<InvoiceableOrder> {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, organizationId },
      select: {
        id: true,
        customerId: true,
        status: true,
        total: true,
        lines: {
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (order === null) {
      throw new NotFoundException('Sales order not found.');
    }
    if (order.status !== 'SHIPPED') {
      throw invalidTransition(order.status, 'invoiced');
    }
    return order;
  }

  /**
   * The numbers of the given orders, keyed by order id.
   *
   * Invoicing echoes the order number on its own rows for traceability and
   * asks here for it rather than reading the sales table (Principle VI). A
   * missing id is simply absent from the result; the invoice's foreign key
   * already guarantees the order exists.
   */
  async readOrderNumbers(
    tx: TransactionClient,
    organizationId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(orderIds)];
    if (unique.length === 0) return new Map();
    const rows = await tx.salesOrder.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true, number: true },
    });
    return new Map(rows.map((row) => [row.id, row.number]));
  }
}

/** Adds exact decimals: the order total is the sum of the rounded line totals. */
function sumMoney(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

/** A stale version is refused rather than applied. */
/** The sort column of the orders list, as SQL. The caller only chooses the key. */
function salesOrderSortColumn(sortBy: string): string {
  switch (sortBy) {
    case 'customer':
      return 'c."name"';
    case 'status':
      return 'o."status"';
    case 'orderDate':
      return 'o."order_date"';
    case 'total':
      return 'o."total"';
    case 'number':
    default:
      return 'o."number"';
  }
}

/** The sort column of the shipments list, as SQL. The caller only chooses the key. */
function shipmentSortColumn(sortBy: string): string {
  switch (sortBy) {
    case 'number':
      return 's."number"';
    case 'orderNumber':
      return 'o."number"';
    case 'customer':
      return 'c."name"';
    case 'shippedAt':
    default:
      return 's."shipped_at"';
  }
}

function escapeLike(term: string): string {
  return `%${term.replace(/([\\%_])/g, '\\$1')}%`;
}

function staleVersion(current: number): AppException {
  return new AppException(
    ERROR_CODES.STALE_VERSION,
    [
      {
        field: 'version',
        code: 'STALE_VERSION',
        message: `This order has changed since you opened it (it is now version ${current}). Reload it and try again.`,
      },
    ],
    'This order changed since you opened it. Reload it and try again.',
  );
}

/** The action is not available in the current status. */
function invalidTransition(status: string, action: string): AppException {
  return new AppException(
    ERROR_CODES.INVALID_STATE_TRANSITION,
    [
      {
        field: 'status',
        code: 'INVALID_STATE_TRANSITION',
        message: `A ${status} order cannot be ${action}.`,
      },
    ],
    'This action is not available while the order is in its current state.',
  );
}
