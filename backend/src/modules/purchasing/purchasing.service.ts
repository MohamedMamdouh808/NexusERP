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
import { allocatePurchasingNumber } from './purchasing-number';
import type {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/create-purchase-order.dto';
import type { PurchaseOrderActionDto } from './dto/purchase-order-action.dto';
import type { ReceiveGoodsDto } from './dto/receive-goods.dto';
import type { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import type { ListGoodsReceiptsDto } from './dto/list-goods-receipts.dto';
import {
  toDateString,
  type GoodsReceiptDetail,
  type GoodsReceiptRow,
  type OrderProgress,
  type PurchaseOrderActionResponse,
  type PurchaseOrderLineResponse,
  type PurchaseOrderResponse,
  type PurchaseOrderRow,
  type ReceiveGoodsResponse,
} from './dto/purchase-order-response.dto';

/**
 * The purchase orders.
 *
 * Every method is scoped to one organization: the tenant enters through the
 * request context and is applied to every query, so a record of another
 * organization is answered as "not found" rather than shown.
 *
 * The numbers are exact: quantities and costs are stored as `NUMERIC(14,3)`
 * and `NUMERIC(14,4)`, the line total is rounded half-up to two decimals and
 * the order total is the sum of the ALREADY-ROUNDED line totals. Nothing here
 * rounds twice and nothing here uses a JavaScript float.
 *
 * The state machine is server-side: DRAFT → CONFIRMED → (PARTIALLY_RECEIVED)
 * → RECEIVED, and DRAFT/CONFIRMED → CANCELLED. Every change carries the
 * version the caller read, and a stale version is refused rather than applied.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly contacts: ContactsService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly organizationLock: OrganizationLockService,
  ) {}

  // ---------------------------------------------------------------------
  // The order lifecycle
  // ---------------------------------------------------------------------

  /**
   * Creates a draft.
   *
   * The number is allocated inside this transaction, so a rolled-back create
   * returns the number instead of leaving a gap. The lines may be empty: a
   * draft with a header and no lines has a total of 0.00.
   */
  async createOrder(
    organizationId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponse> {
    const expectedCurrency = await this.organizationLock.getCurrency(organizationId);
    return this.transaction.runInTransaction(async (tx) => {
      // Lock the organization row so a concurrent settings currency change or
      // module toggle serializes with this first document (FR-010, FR-011, FR-018).
      await this.organizationLock.lockOrganization(tx, organizationId);
      await this.organizationLock.assertModuleEnabled(tx, organizationId, 'purchasing');
      await this.organizationLock.assertCurrencyUnchanged(tx, organizationId, expectedCurrency);

      const supplier = await this.contacts.assertSupplierSelectableForOrder(
        tx,
        organizationId,
        dto.supplierId,
      );
      const warehouse = await this.inventory.assertActiveWarehouseForOrder(
        tx,
        organizationId,
        dto.warehouseId,
      );

      const lines = await this.buildLines(tx, organizationId, dto.lines);

      const number = await allocatePurchasingNumber(tx, organizationId, 'purchase_order');

      const order = await tx.purchaseOrder.create({
        data: {
          organizationId,
          number,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          status: 'DRAFT',
          orderDate: new Date(`${dto.orderDate}T00:00:00.000Z`),
          expectedDate:
            dto.expectedDate === undefined || dto.expectedDate === null
              ? null
              : new Date(`${dto.expectedDate}T00:00:00.000Z`),
          notes: dto.notes ?? '',
          total: sumMoney(lines.map((line) => line.lineTotal)),
          version: 1,
          createdById: userId,
        },
      });

      if (lines.length > 0) {
        await tx.purchaseOrderLine.createMany({
          data: lines.map((line) => ({
            organizationId,
            purchaseOrderId: order.id,
            productId: line.productId,
            quantityOrdered: line.quantity,
            quantityReceived: new Prisma.Decimal(0),
            unitCost: line.unitCost,
            unitOfMeasure: line.unitOfMeasure,
            lineTotal: line.lineTotal,
          })),
        });
      }

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.purchaseOrdersCreated,
        recordType: 'purchase_order',
        recordId: order.id,
        after: {
          number: order.number,
          status: order.status,
          total: order.total.toFixed(2),
          lines: lines.length,
        },
      });

      const stored = await this.readLines(organizationId, order.id);
      return this.orderResponse(order, stored, supplier, warehouse);
    });
  }

  /**
   * Edits a draft.
   *
   * The lines are replaced, the totals are recalculated and the version is
   * incremented - all in one transaction, with the audit entry beside them.
   * A confirmed order is not editable: the user cancels it and creates a new
   * one.
   */
  async updateOrder(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.lockOrder(tx, organizationId, id);

      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      if (existing.status !== 'DRAFT') {
        throw invalidTransition(existing.status, 'edit');
      }

      const supplier = await this.contacts.assertSupplierSelectableForOrder(
        tx,
        organizationId,
        dto.supplierId,
      );
      const warehouse = await this.inventory.assertActiveWarehouseForOrder(
        tx,
        organizationId,
        dto.warehouseId,
      );

      const lines = await this.buildLines(tx, organizationId, dto.lines);

      // A draft has no receipts, so its lines can be replaced outright.
      await tx.purchaseOrderLine.deleteMany({
        where: { organizationId, purchaseOrderId: existing.id },
      });
      if (lines.length > 0) {
        await tx.purchaseOrderLine.createMany({
          data: lines.map((line) => ({
            organizationId,
            purchaseOrderId: existing.id,
            productId: line.productId,
            quantityOrdered: line.quantity,
            quantityReceived: new Prisma.Decimal(0),
            unitCost: line.unitCost,
            unitOfMeasure: line.unitOfMeasure,
            lineTotal: line.lineTotal,
          })),
        });
      }

      const order = await tx.purchaseOrder.update({
        where: { organizationId_id: { organizationId, id: existing.id } },
        data: {
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          orderDate: new Date(`${dto.orderDate}T00:00:00.000Z`),
          expectedDate:
            dto.expectedDate === undefined || dto.expectedDate === null
              ? null
              : new Date(`${dto.expectedDate}T00:00:00.000Z`),
          notes: dto.notes ?? '',
          total: sumMoney(lines.map((line) => line.lineTotal)),
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.purchaseOrdersUpdated,
        recordType: 'purchase_order',
        recordId: order.id,
        before: { status: existing.status, version: existing.version },
        after: { status: order.status, version: order.version, total: order.total.toFixed(2) },
      });

      const stored = await this.readLines(organizationId, order.id);
      return this.orderResponse(order, stored, supplier, warehouse);
    });
  }

  /**
   * Confirms a draft.
   *
   * A draft with no lines cannot be confirmed: there would be nothing to
   * receive against it.
   */
  async confirmOrder(
    organizationId: string,
    userId: string,
    id: string,
    dto: PurchaseOrderActionDto,
  ): Promise<PurchaseOrderActionResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.lockOrder(tx, organizationId, id);

      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      if (existing.status !== 'DRAFT') {
        throw invalidTransition(existing.status, 'confirm');
      }

      const lineCount = await tx.purchaseOrderLine.count({
        where: { organizationId, purchaseOrderId: existing.id },
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

      const order = await tx.purchaseOrder.update({
        where: { organizationId_id: { organizationId, id: existing.id } },
        data: { status: 'CONFIRMED', version: { increment: 1 } },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.purchaseOrdersConfirmed,
        recordType: 'purchase_order',
        recordId: order.id,
        before: { status: existing.status, version: existing.version },
        after: { status: order.status, version: order.version },
      });

      return {
        id: order.id,
        number: order.number,
        status: order.status,
        version: order.version,
      };
    });
  }

  /**
   * Cancels an order.
   *
   * An order with receipts cannot be cancelled: the goods arrived against it,
   * and a cancellation would contradict the receipt history. Cancelling it
   * would also leave the received quantities on a cancelled order, which the
   * invariant forbids.
   */
  async cancelOrder(
    organizationId: string,
    userId: string,
    id: string,
    dto: PurchaseOrderActionDto,
  ): Promise<PurchaseOrderActionResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await this.lockOrder(tx, organizationId, id);

      if (existing.version !== dto.version) {
        throw staleVersion(existing.version);
      }
      if (existing.status !== 'DRAFT' && existing.status !== 'CONFIRMED') {
        throw invalidTransition(existing.status, 'cancel');
      }

      const receipts = await tx.goodsReceipt.count({
        where: { organizationId, purchaseOrderId: existing.id },
      });
      if (receipts > 0) {
        throw new AppException(
          ERROR_CODES.ORDER_HAS_RECEIPTS,
          [
            {
              field: 'status',
              code: 'ORDER_HAS_RECEIPTS',
              message: `This order has ${receipts} goods receipt(s) against it and cannot be cancelled.`,
            },
          ],
          'This order has goods receipts against it and cannot be cancelled.',
        );
      }

      const order = await tx.purchaseOrder.update({
        where: { organizationId_id: { organizationId, id: existing.id } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.purchaseOrdersCancelled,
        recordType: 'purchase_order',
        recordId: order.id,
        before: { status: existing.status, version: existing.version },
        after: { status: order.status, version: order.version },
      });

      return {
        id: order.id,
        number: order.number,
        status: order.status,
        version: order.version,
      };
    });
  }

  // ---------------------------------------------------------------------
  // Receiving goods
  // ---------------------------------------------------------------------

  /**
   * Posts a goods receipt.
   *
   * This is the write that turns a purchase order into real stock, so it is
   * ONE transaction: the receipt, its lines, the RECEIPT movements, the stock,
   * the received quantities, the order's status, the audit entry and the
   * idempotency claim all commit - or roll back - together.
   *
   * The locks are taken in a fixed order - the order row, then its lines in
   * ascending line id, then the stock movements in ascending product id - so
   * two receipts at the same moment cannot deadlock each other, and so the
   * outstanding quantity a receipt reads is the one the other receipt left.
   *
   * The request does not carry the order version: the order lock, the status
   * check and the per-line outstanding guard are what make it safe.
   */
  async postReceipt(
    organizationId: string,
    userId: string,
    orderId: string,
    idempotencyKey: string,
    dto: ReceiveGoodsDto,
  ): Promise<ReceiveGoodsResponse> {
    const endpoint = `/purchase-orders/${orderId}/receipts`;

    const outcome = await this.idempotency.runOnce(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx) => {
        // 1. The order, locked. Everything below reads what this lock
        //    protects.
        const order = await this.lockOrder(tx, organizationId, orderId);
        if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_RECEIVED') {
          throw invalidTransition(order.status, 'received against');
        }

        // 2. The destination warehouse must still take stock.
        await this.inventory.assertActiveWarehouseForOrder(
          tx,
          organizationId,
          order.warehouseId,
        );

        // 3. The order's lines, locked in ascending line id.
        const orderLines = await this.lockOrderLines(tx, organizationId, orderId);
        const lineById = new Map(orderLines.map((line) => [line.id, line]));

        // 4. Match every entry to a line of THIS order and to that line's
        //    product, and refuse anything that does not belong.
        const requested = new Map<string, Prisma.Decimal>();
        for (const entry of dto.lines) {
          if (requested.has(entry.lineId)) {
            throw receiptRefusal(
              'lines',
              'DUPLICATE_LINE',
              'The same purchase order line appears twice in this receipt.',
            );
          }
          const line = lineById.get(entry.lineId);
          if (line === undefined) {
            throw receiptRefusal(
              'lines',
              'UNKNOWN_LINE',
              'This purchase order line is not on the order being received.',
            );
          }
          if (line.productId !== entry.productId) {
            throw receiptRefusal(
              'lines',
              'PRODUCT_MISMATCH',
              'This product does not match the purchase order line it names.',
            );
          }
          requested.set(entry.lineId, new Prisma.Decimal(entry.quantity === '' ? '0' : entry.quantity));
        }

        // 5. Only positive quantities become receipt lines, and none of them
        //    may exceed what is still outstanding.
        const positive = [...requested.entries()].filter(([, quantity]) => quantity.gt(0));
        if (positive.length === 0) {
          throw receiptRefusal(
            'lines',
            'NOTHING_RECEIVED',
            'Enter a quantity above zero for at least one line.',
          );
        }

        for (const [lineId, quantity] of positive) {
          const line = lineById.get(lineId)!;
          const outstanding = line.quantityOrdered.minus(line.quantityReceived);
          if (quantity.gt(outstanding)) {
            throw new AppException(
              ERROR_CODES.OVER_RECEIPT,
              [
                {
                  field: 'lines',
                  code: 'OVER_RECEIPT',
                  message: `Only ${outstanding.toFixed(3)} of ${line.productSku} is still outstanding.`,
                },
              ],
              `Only ${outstanding.toFixed(3)} of ${line.productSku} is still outstanding.`,
            );
          }
        }

        // 6. The receipt and its number.
        const number = await allocatePurchasingNumber(tx, organizationId, 'goods_receipt');
        const receipt = await tx.goodsReceipt.create({
          data: {
            organizationId,
            number,
            purchaseOrderId: order.id,
            receivedById: userId,
          },
        });

        await tx.goodsReceiptLine.createMany({
          data: positive.map(([lineId, quantity]) => {
            const line = lineById.get(lineId)!;
            return {
              organizationId,
              goodsReceiptId: receipt.id,
              purchaseOrderLineId: line.id,
              productId: line.productId,
              quantity,
              unitCost: line.unitCost,
              unitOfMeasure: line.unitOfMeasure,
            };
          }),
        });

        // 7. The stock effect, in ascending product id so two receipts never
        //    take the same locks in a different order.
        const byProduct = [...positive].sort((left, right) =>
          lineById.get(left[0])!.productId.localeCompare(lineById.get(right[0])!.productId),
        );
        for (const [lineId, quantity] of byProduct) {
          const line = lineById.get(lineId)!;
          await this.inventory.postReceiptMovement({
            tx,
            organizationId,
            userId,
            warehouseId: order.warehouseId,
            productId: line.productId,
            quantity,
            receiptId: receipt.id,
            receiptNumber: number,
          });
        }

        // 8. The received quantities and the order's status.
        let allReceived = true;
        for (const [lineId, quantity] of positive) {
          const line = lineById.get(lineId)!;
          const received = line.quantityReceived.plus(quantity);
          await tx.purchaseOrderLine.update({
            where: { organizationId_id: { organizationId, id: line.id } },
            data: { quantityReceived: received },
          });
          if (received.lt(line.quantityOrdered)) allReceived = false;
        }
        for (const line of orderLines) {
          if (!requested.has(line.id)) {
            const outstanding = line.quantityOrdered.minus(line.quantityReceived);
            if (outstanding.gt(0)) allReceived = false;
          }
        }

        const status = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
        const updatedOrder = await tx.purchaseOrder.update({
          where: { organizationId_id: { organizationId, id: order.id } },
          data: { status, version: { increment: 1 } },
        });

        // 9. The audit entry, in the same transaction.
        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.goodsReceiptsPosted,
          recordType: 'goods_receipt',
          recordId: receipt.id,
          before: { orderStatus: order.status, orderVersion: order.version },
          after: {
            number,
            orderStatus: status,
            orderVersion: updatedOrder.version,
            lines: positive.length,
          },
        });

        return {
          status: 201,
          body: {
            receipt: {
              id: receipt.id,
              number,
              receivedAt: receipt.receivedAt.toISOString(),
            },
            order: {
              id: updatedOrder.id,
              number: updatedOrder.number,
              status: updatedOrder.status,
              version: updatedOrder.version,
            },
          },
        };
      },
    );

    return outcome.body;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  /**
   * The organization's purchase orders.
   *
   * One query answers the page: the order, the supplier and the warehouse it
   * names, and the progress summary computed from its lines. The progress is
   * a QUANTITY summary when every line shares one unit of measure and a LINE
   * COUNT summary when they do not - a quantity sum across different units
   * would be a meaningless number.
   */
  async listOrders(organizationId: string, query: ListPurchaseOrdersDto) {
    const client = this.transaction.getClient();
    const search = query.search === undefined ? undefined : escapeLike(query.search);
    // One status or several: the filter answers "which statuses" as one
    // question, so the query asks the database the same way.
    const status = query.status && query.status.length > 0 ? query.status : null;

    const rows = await client.$queryRaw<
      {
        id: string;
        number: string;
        supplierId: string;
        supplierName: string;
        warehouseId: string;
        warehouseName: string;
        status: string;
        orderDate: string;
        total: string;
        version: number;
        receivedTotal: string | null;
        orderedTotal: string | null;
        unitCount: number | null;
        unitOfMeasure: string | null;
        lineCount: number | null;
        fullyReceivedLineCount: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        o."id"::text AS "id",
        o."number",
        o."supplier_id"::text AS "supplierId",
        c."name" AS "supplierName",
        o."warehouse_id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        o."status",
        o."order_date"::text AS "orderDate",
        o."total"::text AS "total",
        o."version",
        l."received"::text AS "receivedTotal",
        l."ordered"::text AS "orderedTotal",
        l."units"::int AS "unitCount",
        l."unit_of_measure" AS "unitOfMeasure",
        l."line_count"::int AS "lineCount",
        l."fully_received"::int AS "fullyReceivedLineCount"
      FROM "purchase_orders" o
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."supplier_id"
      JOIN "warehouses" w
        ON w."organization_id" = o."organization_id" AND w."id" = o."warehouse_id"
      LEFT JOIN LATERAL (
        SELECT
          SUM(ol."quantity_received") AS "received",
          SUM(ol."quantity_ordered") AS "ordered",
          COUNT(DISTINCT ol."unit_of_measure") AS "units",
          MIN(ol."unit_of_measure") AS "unit_of_measure",
          COUNT(*) AS "line_count",
          COUNT(*) FILTER (WHERE ol."quantity_received" = ol."quantity_ordered") AS "fully_received"
        FROM "purchase_order_lines" ol
        WHERE ol."organization_id" = o."organization_id"
          AND ol."purchase_order_id" = o."id"
      ) l ON true
      WHERE o."organization_id" = ${organizationId}::uuid
        AND (${status}::text[] IS NULL OR o."status" = ANY(${status}::text[]))
        AND (
          ${search}::text IS NULL
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
      ORDER BY ${Prisma.raw(orderSortColumn(query.sortBy))} ${Prisma.raw(
        query.sortOrder === 'desc' ? 'DESC' : 'ASC',
      )}, o."number" ASC, o."id" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);

    const totalRows = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "purchase_orders" o
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."supplier_id"
      WHERE o."organization_id" = ${organizationId}::uuid
        AND (${status}::text[] IS NULL OR o."status" = ANY(${status}::text[]))
        AND (
          ${search}::text IS NULL
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
        )
    `);
    const total = totalRows[0]?.count ?? 0;

    const items = rows.map((row) => this.orderRow(row));

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * The organization's goods receipts.
   *
   * One row per receipt, never one row per receipt line: the total counts
   * receipts, and the interface says so. The aggregate quantity is present
   * only when every line of the receipt shares one unit of measure; otherwise
   * the row carries the line count alone, because a sum across different
   * units would be a meaningless number.
   */
  async listReceipts(organizationId: string, query: ListGoodsReceiptsDto) {
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
        supplierId: string;
        supplierName: string;
        warehouseId: string;
        warehouseName: string;
        receivedAt: Date;
        user: string;
        lineCount: number;
        receivedTotal: string | null;
        unitCount: number | null;
        unitOfMeasure: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        r."id"::text AS "id",
        r."number",
        o."id"::text AS "orderId",
        o."number" AS "orderNumber",
        c."id"::text AS "supplierId",
        c."name" AS "supplierName",
        w."id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        r."received_at" AS "receivedAt",
        u."email" AS "user",
        l."line_count"::int AS "lineCount",
        l."received"::text AS "receivedTotal",
        l."units"::int AS "unitCount",
        l."unit_of_measure" AS "unitOfMeasure"
      FROM "goods_receipts" r
      JOIN "purchase_orders" o
        ON o."organization_id" = r."organization_id" AND o."id" = r."purchase_order_id"
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."supplier_id"
      JOIN "warehouses" w
        ON w."organization_id" = o."organization_id" AND w."id" = o."warehouse_id"
      JOIN "users" u ON u."id" = r."received_by"
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS "line_count",
          SUM(gl."quantity") AS "received",
          COUNT(DISTINCT gl."unit_of_measure") AS "units",
          MIN(gl."unit_of_measure") AS "unit_of_measure"
        FROM "goods_receipt_lines" gl
        WHERE gl."organization_id" = r."organization_id"
          AND gl."goods_receipt_id" = r."id"
      ) l ON true
      WHERE r."organization_id" = ${organizationId}::uuid
        AND (${startDate}::date IS NULL OR r."received_at"::date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR r."received_at"::date <= ${endDate}::date)
        AND (
          ${search}::text IS NULL
          OR r."number" ILIKE ${search}
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
          OR EXISTS (
            SELECT 1
            FROM "goods_receipt_lines" gl2
            JOIN "products" p
              ON p."organization_id" = gl2."organization_id" AND p."id" = gl2."product_id"
            WHERE gl2."organization_id" = r."organization_id"
              AND gl2."goods_receipt_id" = r."id"
              AND (p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
          )
        )
      ORDER BY ${Prisma.raw(receiptSortColumn(query.sortBy))} ${Prisma.raw(
        query.sortOrder === 'desc' ? 'DESC' : 'ASC',
      )}, r."number" ASC, r."id" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `);

    const totalRows = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "goods_receipts" r
      JOIN "purchase_orders" o
        ON o."organization_id" = r."organization_id" AND o."id" = r."purchase_order_id"
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."supplier_id"
      WHERE r."organization_id" = ${organizationId}::uuid
        AND (${startDate}::date IS NULL OR r."received_at"::date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR r."received_at"::date <= ${endDate}::date)
        AND (
          ${search}::text IS NULL
          OR r."number" ILIKE ${search}
          OR o."number" ILIKE ${search}
          OR c."name" ILIKE ${search}
          OR EXISTS (
            SELECT 1
            FROM "goods_receipt_lines" gl2
            JOIN "products" p
              ON p."organization_id" = gl2."organization_id" AND p."id" = gl2."product_id"
            WHERE gl2."organization_id" = r."organization_id"
              AND gl2."goods_receipt_id" = r."id"
              AND (p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
          )
        )
    `);
    const total = totalRows[0]?.count ?? 0;

    const items: GoodsReceiptRow[] = rows.map((row) => {
      // The aggregate is shown only when every line of the receipt shares one
      // unit of measure; otherwise the row carries the line count alone.
      const uniform = row.lineCount > 0 && row.unitCount === 1;
      return {
        id: row.id,
        number: row.number,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        receivedAt: row.receivedAt.toISOString(),
        user: row.user,
        lineCount: row.lineCount,
        ...(uniform
          ? { receivedTotal: row.receivedTotal!, unitOfMeasure: row.unitOfMeasure! }
          : {}),
      };
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** One order with its lines and its receipt history. */
  async findOrder(
    organizationId: string,
    id: string,
  ): Promise<PurchaseOrderResponse> {
    const order = await this.readOrder(organizationId, id);
    const lines = await this.readLines(organizationId, order.id);
    const receipts = await this.readReceiptHistory(organizationId, order.id);

    return {
      id: order.id,
      number: order.number,
      supplierId: order.supplierId,
      supplierName: order.supplier.name,
      warehouseId: order.warehouseId,
      warehouseName: order.warehouse.name,
      status: order.status,
      orderDate: toDateString(order.orderDate),
      expectedDate: order.expectedDate === null ? null : toDateString(order.expectedDate),
      notes: order.notes,
      lines: lines.map((line) => this.lineResponse(line)),
      total: order.total.toFixed(2),
      version: order.version,
      receipts,
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * The order row, locked for the writers.
   *
   * The order row is the single serialization point for every write to one
   * order: two receipts, a receipt and a cancel, or two edits all wait here,
   * so the quantities they read cannot be the ones the other one changed.
   */
  private async lockOrder(
    tx: TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    number: string;
    status: string;
    version: number;
    supplierId: string;
    warehouseId: string;
  }> {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "purchase_orders"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "id" = ${id}::uuid
      FOR UPDATE
    `);

    if (locked.length === 0) {
      throw new NotFoundException('Purchase order not found.');
    }

    const order = await tx.purchaseOrder.findFirst({
      where: { organizationId, id },
      select: { id: true, number: true, status: true, version: true, supplierId: true, warehouseId: true },
    });
    if (order === null) {
      throw new NotFoundException('Purchase order not found.');
    }
    return order;
  }

  /**
   * The order's lines, locked in ascending line id.
   *
   * The order row is locked first, so every writer of one order takes the
   * same locks in the same order: the order, then its lines by id, then the
   * stock movements by product.
   */
  private async lockOrderLines(
    tx: TransactionClient,
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<
    {
      id: string;
      productId: string;
      productSku: string;
      quantityOrdered: Prisma.Decimal;
      quantityReceived: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      unitOfMeasure: string;
    }[]
  > {
    const rows = await tx.$queryRaw<
      {
        id: string;
        product_id: string;
        product_sku: string;
        quantity_ordered: Prisma.Decimal;
        quantity_received: Prisma.Decimal;
        unit_cost: Prisma.Decimal;
        unit_of_measure: string;
      }[]
    >(Prisma.sql`
      SELECT l."id", l."product_id", p."sku" AS "product_sku",
             l."quantity_ordered", l."quantity_received",
             l."unit_cost", l."unit_of_measure"
      FROM "purchase_order_lines" l
      JOIN "products" p
        ON p."organization_id" = l."organization_id"
       AND p."id" = l."product_id"
      WHERE l."organization_id" = ${organizationId}::uuid
        AND l."purchase_order_id" = ${purchaseOrderId}::uuid
      ORDER BY l."id"
      FOR UPDATE OF l
    `);

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productSku: row.product_sku,
      quantityOrdered: row.quantity_ordered,
      quantityReceived: row.quantity_received,
      unitCost: row.unit_cost,
      unitOfMeasure: row.unit_of_measure,
    }));
  }

  /**
   * One order row, with the progress summary.
   *
   * The progress is a QUANTITY summary when every line of the order shares
   * one unit of measure, a LINE COUNT summary when the units differ, and
   * absent for a draft - a draft has nothing received yet, and "0 of 100"
   * would be a progress that never happened.
   */
  private orderRow(row: {
    id: string;
    number: string;
    supplierId: string;
    supplierName: string;
    warehouseId: string;
    warehouseName: string;
    status: string;
    orderDate: string;
    total: string;
    version: number;
    receivedTotal: string | null;
    orderedTotal: string | null;
    unitCount: number | null;
    unitOfMeasure: string | null;
    lineCount: number | null;
    fullyReceivedLineCount: number | null;
  }): PurchaseOrderRow {
    let progress: OrderProgress;
    if (row.status === 'DRAFT') {
      progress = { kind: 'NONE' };
    } else if (row.unitCount === 1 && row.receivedTotal !== null) {
      progress = {
        kind: 'QUANTITY',
        receivedTotal: row.receivedTotal,
        orderedTotal: row.orderedTotal ?? '0.000',
        unitOfMeasure: row.unitOfMeasure ?? '',
      };
    } else {
      progress = {
        kind: 'LINES',
        fullyReceivedLineCount: row.fullyReceivedLineCount ?? 0,
        lineCount: row.lineCount ?? 0,
      };
    }

    return {
      id: row.id,
      number: row.number,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      status: row.status,
      orderDate: row.orderDate,
      total: row.total,
      version: row.version,
      progress,
    };
  }

  /** The order row, with the names the interface shows. */
  private async readOrder(organizationId: string, id: string) {
    const order = await this.transaction.getClient().purchaseOrder.findFirst({
      where: { organizationId, id },
      include: {
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    if (order === null) {
      throw new NotFoundException('Purchase order not found.');
    }
    return order;
  }

  /** The order's lines, with the product names the interface shows. */
  private async readLines(organizationId: string, purchaseOrderId: string) {
    return this.transaction.getClient().$queryRaw<
      {
        id: string;
        productId: string;
        productSku: string;
        productName: string;
        quantityOrdered: Prisma.Decimal;
        quantityReceived: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        unitOfMeasure: string;
        lineTotal: Prisma.Decimal;
      }[]
    >(Prisma.sql`
      SELECT
        l."id"::text AS "id",
        l."product_id"::text AS "productId",
        p."sku" AS "productSku",
        p."name" AS "productName",
        l."quantity_ordered" AS "quantityOrdered",
        l."quantity_received" AS "quantityReceived",
        l."unit_cost" AS "unitCost",
        l."unit_of_measure" AS "unitOfMeasure",
        l."line_total" AS "lineTotal"
      FROM "purchase_order_lines" l
      JOIN "products" p
        ON p."organization_id" = l."organization_id" AND p."id" = l."product_id"
      WHERE l."organization_id" = ${organizationId}::uuid
        AND l."purchase_order_id" = ${purchaseOrderId}::uuid
      ORDER BY l."created_at" ASC, l."id" ASC
    `);
  }

  /**
   * The order's receipt history, newest first, with every line.
   *
   * The lines are listed with their product, their received quantity, their
   * unit of measure and the order line they fulfil, so the history answers
   * "what arrived, against what" without the user having to reconstruct it.
   */
  private async readReceiptHistory(
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<GoodsReceiptDetail[]> {
    const client = this.transaction.getClient();

    const receipts = await client.$queryRaw<
      {
        id: string;
        number: string;
        orderId: string;
        orderNumber: string;
        supplierId: string;
        supplierName: string;
        warehouseId: string;
        warehouseName: string;
        receivedAt: Date;
        user: string;
      }[]
    >(Prisma.sql`
      SELECT
        r."id"::text AS "id",
        r."number",
        r."purchase_order_id"::text AS "orderId",
        o."number" AS "orderNumber",
        c."id"::text AS "supplierId",
        c."name" AS "supplierName",
        w."id"::text AS "warehouseId",
        w."name" AS "warehouseName",
        r."received_at" AS "receivedAt",
        u."email" AS "user"
      FROM "goods_receipts" r
      JOIN "purchase_orders" o
        ON o."organization_id" = r."organization_id" AND o."id" = r."purchase_order_id"
      JOIN "contacts" c
        ON c."organization_id" = o."organization_id" AND c."id" = o."supplier_id"
      JOIN "warehouses" w
        ON w."organization_id" = o."organization_id" AND w."id" = o."warehouse_id"
      JOIN "users" u ON u."id" = r."received_by"
      WHERE r."organization_id" = ${organizationId}::uuid
        AND r."purchase_order_id" = ${purchaseOrderId}::uuid
      ORDER BY r."received_at" DESC, r."number" DESC
    `);

    if (receipts.length === 0) return [];

    const lines = await client.$queryRaw<
      {
        goodsReceiptId: string;
        lineId: string;
        orderLineId: string;
        productId: string;
        productSku: string;
        productName: string;
        quantity: string;
        unitCost: string;
        unitOfMeasure: string;
      }[]
    >(Prisma.sql`
      SELECT
        gl."goods_receipt_id"::text AS "goodsReceiptId",
        gl."id"::text AS "lineId",
        gl."purchase_order_line_id"::text AS "orderLineId",
        gl."product_id"::text AS "productId",
        p."sku" AS "productSku",
        p."name" AS "productName",
        gl."quantity"::text AS "quantity",
        gl."unit_cost"::text AS "unitCost",
        gl."unit_of_measure" AS "unitOfMeasure"
      FROM "goods_receipt_lines" gl
      JOIN "products" p
        ON p."organization_id" = gl."organization_id" AND p."id" = gl."product_id"
      WHERE gl."organization_id" = ${organizationId}::uuid
        AND gl."goods_receipt_id" IN (${Prisma.join(
          receipts.map((receipt) => Prisma.sql`${receipt.id}::uuid`),
        )})
      ORDER BY gl."created_at" ASC
    `);

    const linesByReceipt = new Map<string, typeof lines>();
    for (const line of lines) {
      const existing = linesByReceipt.get(line.goodsReceiptId);
      if (existing === undefined) {
        linesByReceipt.set(line.goodsReceiptId, [line]);
      } else {
        existing.push(line);
      }
    }

    return receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      orderId: receipt.orderId,
      orderNumber: receipt.orderNumber,
      supplierId: receipt.supplierId,
      supplierName: receipt.supplierName,
      warehouseId: receipt.warehouseId,
      warehouseName: receipt.warehouseName,
      receivedAt: receipt.receivedAt.toISOString(),
      user: receipt.user,
      lines: (linesByReceipt.get(receipt.id) ?? []).map((line) => ({
        lineId: line.lineId,
        orderLineId: line.orderLineId,
        productId: line.productId,
        productSku: line.productSku,
        productName: line.productName,
        quantity: line.quantity,
        unitCost: line.unitCost,
        unitOfMeasure: line.unitOfMeasure,
      })),
    }));
  }

  /**
   * Builds the order's lines.
   *
   * The products are locked and checked by the Products module, which owns
   * them; one product may appear at most once on an order; the line total is
   * the rounded quantity times the unit cost, and the unit of measure is
   * captured from the product.
   */
  private async buildLines(
    tx: TransactionClient,
    organizationId: string,
    inputs: readonly { productId: string; quantity: string; unitCost: string }[],
  ): Promise<
    {
      productId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      unitOfMeasure: string;
      lineTotal: Prisma.Decimal;
    }[]
  > {
    const seen = new Set<string>();
    for (const input of inputs) {
      if (seen.has(input.productId)) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [
            {
              field: 'lines',
              code: 'DUPLICATE_PRODUCT',
              message: 'A product appears at most once on a purchase order.',
            },
          ],
          'A product appears at most once on a purchase order.',
        );
      }
      seen.add(input.productId);
    }

    const products = await this.products.assertSelectableForOrder(
      tx,
      organizationId,
      inputs.map((input) => input.productId),
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    return inputs.map((input) => {
      const product = byId.get(input.productId);
      const quantity = new Prisma.Decimal(input.quantity);
      const unitCost = new Prisma.Decimal(input.unitCost);
      const lineTotal = quantity.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      return {
        productId: input.productId,
        quantity,
        unitCost,
        unitOfMeasure: product?.unitOfMeasure ?? '',
        lineTotal,
      };
    });
  }

  /** The order as the interface receives it. */
  private orderResponse(
    order: {
      id: string;
      number: string;
      supplierId: string;
      warehouseId: string;
      status: string;
      orderDate: Date;
      expectedDate: Date | null;
      notes: string;
      total: Prisma.Decimal;
      version: number;
    },
    lines: {
      id: string;
      productId: string;
      productSku: string;
      productName: string;
      quantityOrdered: Prisma.Decimal;
      quantityReceived: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      unitOfMeasure: string;
      lineTotal: Prisma.Decimal;
    }[],
    supplier: { id: string; name: string },
    warehouse: { id: string; name: string },
  ): PurchaseOrderResponse {
    return {
      id: order.id,
      number: order.number,
      supplierId: order.supplierId,
      supplierName: supplier.name,
      warehouseId: order.warehouseId,
      warehouseName: warehouse.name,
      status: order.status,
      orderDate: toDateString(order.orderDate),
      expectedDate: order.expectedDate === null ? null : toDateString(order.expectedDate),
      notes: order.notes,
      lines: lines.map((line) => this.lineResponse(line)),
      total: order.total.toFixed(2),
      version: order.version,
    };
  }

  /** One stored line as the interface receives it. */
  private lineResponse(line: {
    id: string;
    productId: string;
    productSku: string;
    productName: string;
    quantityOrdered: Prisma.Decimal;
    quantityReceived: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    unitOfMeasure: string;
    lineTotal: Prisma.Decimal;
  }): PurchaseOrderLineResponse {
    const outstanding = line.quantityOrdered.minus(line.quantityReceived);
    return {
      id: line.id,
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      quantity: line.quantityOrdered.toFixed(3),
      received: line.quantityReceived.toFixed(3),
      outstanding: outstanding.toFixed(3),
      unitCost: line.unitCost.toFixed(4),
      unitOfMeasure: line.unitOfMeasure,
      lineTotal: line.lineTotal.toFixed(2),
    };
  }
}

/** The sum of already-rounded line totals. Never a re-rounded product. */
function sumMoney(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

/** A search term is matched literally: the wildcards are escaped. */
function escapeLike(term: string): string {
  return `%${term.replace(/([\\%_])/g, '\\$1')}%`;
}

/** The sort column of the orders list, as SQL. The caller only chooses the key. */
function orderSortColumn(sortBy: string): string {
  switch (sortBy) {
    case 'supplier':
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

/** The sort column of the receipts list, as SQL. The caller only chooses the key. */
function receiptSortColumn(sortBy: string): string {
  switch (sortBy) {
    case 'number':
      return 'r."number"';
    case 'orderNumber':
      return 'o."number"';
    case 'supplier':
      return 'c."name"';
    case 'receivedAt':
    default:
      return 'r."received_at"';
  }
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

/** A receipt request that names something that does not belong on the order. */
function receiptRefusal(field: string, code: string, message: string): AppException {
  return new AppException(
    ERROR_CODES.VALIDATION_ERROR,
    [{ field, code, message }],
    message,
  );
}
