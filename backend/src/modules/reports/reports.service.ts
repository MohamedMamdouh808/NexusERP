import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { LOW_STOCK_VIEW } from '../inventory/low-stock.rule';
import { ListStockMovementsDto } from '../inventory/dto/list-stock-movements.dto';

/**
 * The change between a figure and the same figure for the preceding period.
 *
 * Exact: the two decimal strings are subtracted as scaled integers, never as
 * JavaScript floats, so money keeps its two decimals. The change is null when
 * the previous figure is zero - there is no honest percentage or difference
 * to state against nothing.
 */
function changeOf(value: string, previousValue: string): string | null {
  const scale = Math.max(decimalScale(value), decimalScale(previousValue));
  const current = scaled(value, scale);
  const previous = scaled(previousValue, scale);
  if (previous === 0n) return null;
  const difference = current - previous;
  const negative = difference < 0n;
  const digits = (negative ? -difference : difference).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

function decimalScale(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

function scaled(value: string, scale: number): bigint {
  const dot = value.indexOf('.');
  const whole = dot === -1 ? value : value.slice(0, dot);
  const fraction = dot === -1 ? '' : value.slice(dot + 1).padEnd(scale, '0').slice(0, scale);
  return BigInt(`${whole || '0'}${fraction}`);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private async readTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '10s'`);
      return fn(tx);
    });
  }

  // ---------- Stock on hand ----------
  async stockOnHand(organizationId: string, q: any) {
    return this.readTx(async (tx) => {
      const search = q.search ? `%${String(q.search).replace(/[%_\\]/g, '\\$&')}%` : null;
      const rows = await tx.$queryRaw(Prisma.sql`
        SELECT
          sb."product_id"::text AS "productId",
          p."sku" AS "productSku",
          p."name" AS "productName",
          p."is_archived" AS "isArchived",
          sb."warehouse_id"::text AS "warehouseId",
          w."name" AS "warehouseName",
          p."unit_id"::text AS "unitOfMeasureId",
          u."abbreviation" AS "unitOfMeasure",
          sb."on_hand"::text AS "onHand",
          sb."reserved"::text AS "reserved",
          (sb."on_hand" - sb."reserved")::text AS "available"
        FROM "stock_balances" sb
        JOIN "products" p ON p."organization_id" = sb."organization_id" AND p."id" = sb."product_id"
        JOIN "warehouses" w ON w."organization_id" = sb."organization_id" AND w."id" = sb."warehouse_id"
        JOIN "units_of_measure" u ON u."organization_id" = sb."organization_id" AND u."id" = p."unit_id"
        WHERE sb."organization_id" = ${organizationId}::uuid
          AND (${q.warehouseId}::uuid IS NULL OR sb."warehouse_id" = ${q.warehouseId}::uuid)
          AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
          AND (${q.includeArchived}::boolean = true OR p."is_archived" = false OR sb."on_hand" <> 0 OR sb."reserved" <> 0)
        ORDER BY p."name" ASC, w."name" ASC
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}
      `);
      const totalRows = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::bigint AS "count"
        FROM "stock_balances" sb
        JOIN "products" p ON p."organization_id" = sb."organization_id" AND p."id" = sb."product_id"
        WHERE sb."organization_id" = ${organizationId}::uuid
          AND (${q.warehouseId}::uuid IS NULL OR sb."warehouse_id" = ${q.warehouseId}::uuid)
          AND (${search}::text IS NULL OR p."sku" ILIKE ${search} OR p."name" ILIKE ${search})
          AND (${q.includeArchived}::boolean = true OR p."is_archived" = false OR sb."on_hand" <> 0 OR sb."reserved" <> 0)
      `);
      // totals: only when all rows share one unit of measure
      const units = new Set(rows.map((r: any) => r.unitOfMeasure));
      let totals: any;
      if (rows.length === 0) {
        totals = { onHand: '0.000', reserved: '0.000', available: '0.000' };
      } else if (units.size === 1) {
        const onHand = rows.reduce((a: number, r: any) => a + Number(r.onHand), 0);
        const reserved = rows.reduce((a: number, r: any) => a + Number(r.reserved), 0);
        const available = rows.reduce((a: number, r: any) => a + Number(r.available), 0);
        totals = { onHand: onHand.toFixed(3), reserved: reserved.toFixed(3), available: available.toFixed(3) };
      } else {
        totals = { rowCount: rows.length };
      }
      return { items: rows, total: Number(totalRows[0]?.count ?? 0), page: q.page, pageSize: q.pageSize, totals };
    });
  }

  // ---------- Stock movements (delegate) ----------
  async stockMovements(organizationId: string, q: any) {
    const query: ListStockMovementsDto = {
      productId: q.productId,
      warehouseId: q.warehouseId,
      type: q.type,
      search: undefined,
      sortBy: q.sort === 'quantity' ? 'quantity' : q.sort === 'type' ? 'type' : 'createdAt',
      sortOrder: q.direction === 'asc' ? 'asc' : 'desc',
      startDate: q.start,
      endDate: q.end,
      page: q.page,
      pageSize: q.pageSize,
    } as any;
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new (require('../../common/errors/all-exceptions.filter').AppException)(
        require('@nexuserp/shared').ERROR_CODES.VALIDATION_ERROR,
        [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }],
      );
    }
    return this.inventory.listMovements(organizationId, query);
  }

  // ---------- Outstanding invoices ----------
  async outstandingInvoices(organizationId: string, q: any) {
    return this.readTx(async (tx) => {
      if (q.dueFrom && q.dueTo && new Date(q.dueTo) < new Date(q.dueFrom)) {
        throw new (require('../../common/errors/all-exceptions.filter').AppException)(
          require('@nexuserp/shared').ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'dueTo', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }],
        );
      }
      const search = q.search ? `%${String(q.search).replace(/[%_\\]/g, '\\$&')}%` : null;
      const rows = await tx.$queryRaw(Prisma.sql`
        SELECT
          i."id"::text AS "invoiceId",
          i."number",
          c."id"::text AS "customerId",
          c."name" AS "customerName",
          i."issue_date"::text AS "issueDate",
          i."due_date"::text AS "dueDate",
          i."total"::text AS "total",
          (i."total" - ib."balance")::text AS "paid",
          ib."balance"::text AS "balance",
          (CURRENT_DATE - i."due_date")::int AS "daysOverdue"
        FROM "invoices" i
        JOIN "invoice_balances" ib ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        JOIN "contacts" c ON c."organization_id" = i."organization_id" AND c."id" = i."customer_id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND i."status" IN ('ISSUED','PARTIALLY_PAID')
          AND ib."balance" > 0
          AND (${search}::text IS NULL OR c."name" ILIKE ${search})
          AND (${q.overdueOnly}::boolean = false OR i."due_date" < CURRENT_DATE)
          AND (${q.dueFrom}::text IS NULL OR i."due_date" >= ${q.dueFrom}::date)
          AND (${q.dueTo}::text IS NULL OR i."due_date" <= ${q.dueTo}::date)
        ORDER BY i."due_date" ASC
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}
      `);
      const totalRows = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::bigint AS "count"
        FROM "invoices" i
        JOIN "invoice_balances" ib ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        JOIN "contacts" c ON c."organization_id" = i."organization_id" AND c."id" = i."customer_id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND i."status" IN ('ISSUED','PARTIALLY_PAID')
          AND ib."balance" > 0
          AND (${search}::text IS NULL OR c."name" ILIKE ${search})
          AND (${q.overdueOnly}::boolean = false OR i."due_date" < CURRENT_DATE)
          AND (${q.dueFrom}::text IS NULL OR i."due_date" >= ${q.dueFrom}::date)
          AND (${q.dueTo}::text IS NULL OR i."due_date" <= ${q.dueTo}::date)
      `);
      const totals = await tx.$queryRaw(Prisma.sql`
        SELECT
          COALESCE(SUM(i."total"),0)::text AS "total",
          COALESCE(SUM(i."total" - ib."balance"),0)::text AS "paid",
          COALESCE(SUM(ib."balance"),0)::text AS "balance"
        FROM "invoices" i
        JOIN "invoice_balances" ib ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        JOIN "contacts" c ON c."organization_id" = i."organization_id" AND c."id" = i."customer_id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND i."status" IN ('ISSUED','PARTIALLY_PAID')
          AND ib."balance" > 0
          AND (${search}::text IS NULL OR c."name" ILIKE ${search})
          AND (${q.overdueOnly}::boolean = false OR i."due_date" < CURRENT_DATE)
          AND (${q.dueFrom}::text IS NULL OR i."due_date" >= ${q.dueFrom}::date)
          AND (${q.dueTo}::text IS NULL OR i."due_date" <= ${q.dueTo}::date)
      `);
      const aging = await tx.$queryRaw(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE i."due_date" >= CURRENT_DATE)::int AS "currentCount",
          COALESCE(SUM(ib."balance") FILTER (WHERE i."due_date" >= CURRENT_DATE),0)::text AS "currentBalance",
          COUNT(*) FILTER (WHERE i."due_date" < CURRENT_DATE AND i."due_date" >= CURRENT_DATE - 30)::int AS "d1_30Count",
          COALESCE(SUM(ib."balance") FILTER (WHERE i."due_date" < CURRENT_DATE AND i."due_date" >= CURRENT_DATE - 30),0)::text AS "d1_30Balance",
          COUNT(*) FILTER (WHERE i."due_date" < CURRENT_DATE - 30 AND i."due_date" >= CURRENT_DATE - 60)::int AS "d31_60Count",
          COALESCE(SUM(ib."balance") FILTER (WHERE i."due_date" < CURRENT_DATE - 30 AND i."due_date" >= CURRENT_DATE - 60),0)::text AS "d31_60Balance",
          COUNT(*) FILTER (WHERE i."due_date" < CURRENT_DATE - 60 AND i."due_date" >= CURRENT_DATE - 90)::int AS "d61_90Count",
          COALESCE(SUM(ib."balance") FILTER (WHERE i."due_date" < CURRENT_DATE - 60 AND i."due_date" >= CURRENT_DATE - 90),0)::text AS "d61_90Balance",
          COUNT(*) FILTER (WHERE i."due_date" < CURRENT_DATE - 90)::int AS "over90Count",
          COALESCE(SUM(ib."balance") FILTER (WHERE i."due_date" < CURRENT_DATE - 90),0)::text AS "over90Balance"
        FROM "invoices" i
        JOIN "invoice_balances" ib ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        JOIN "contacts" c ON c."organization_id" = i."organization_id" AND c."id" = i."customer_id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND i."status" IN ('ISSUED','PARTIALLY_PAID')
          AND ib."balance" > 0
          AND (${search}::text IS NULL OR c."name" ILIKE ${search})
          AND (${q.overdueOnly}::boolean = false OR i."due_date" < CURRENT_DATE)
          AND (${q.dueFrom}::text IS NULL OR i."due_date" >= ${q.dueFrom}::date)
          AND (${q.dueTo}::text IS NULL OR i."due_date" <= ${q.dueTo}::date)
      `);
      const a = aging[0] ?? {};
      return {
        items: rows,
        total: Number(totalRows[0]?.count ?? 0),
        page: q.page,
        pageSize: q.pageSize,
        totals: totals[0] ?? { total: '0', paid: '0', balance: '0' },
        aging: {
          current: { count: a.currentCount ?? 0, balance: a.currentBalance ?? '0' },
          d1_30: { count: a.d1_30Count ?? 0, balance: a.d1_30Balance ?? '0' },
          d31_60: { count: a.d31_60Count ?? 0, balance: a.d31_60Balance ?? '0' },
          d61_90: { count: a.d61_90Count ?? 0, balance: a.d61_90Balance ?? '0' },
          over90: { count: a.over90Count ?? 0, balance: a.over90Balance ?? '0' },
        },
      };
    });
  }

  // ---------- Document statuses ----------
  async documentStatuses(organizationId: string, q: any) {
    if (new Date(q.end) < new Date(q.start)) {
      throw new (require('../../common/errors/all-exceptions.filter').AppException)(
        require('@nexuserp/shared').ERROR_CODES.VALIDATION_ERROR,
        [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }],
      );
    }
    return this.readTx(async (tx) => {
      const po = await tx.$queryRaw(Prisma.sql`
        SELECT status, count(*)::int AS "count", COALESCE(SUM(total),0)::text AS "totalAmount"
        FROM "purchase_orders" WHERE "organization_id" = ${organizationId}::uuid AND "created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
        GROUP BY status
      `);
      const so = await tx.$queryRaw(Prisma.sql`
        SELECT status, count(*)::int AS "count", COALESCE(SUM(total),0)::text AS "totalAmount"
        FROM "sales_orders" WHERE "organization_id" = ${organizationId}::uuid AND "created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
        GROUP BY status
      `);
      const inv = await tx.$queryRaw(Prisma.sql`
        SELECT status, count(*)::int AS "count", COALESCE(SUM(total),0)::text AS "totalAmount"
        FROM "invoices" WHERE "organization_id" = ${organizationId}::uuid AND "created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
        GROUP BY status
      `);
      const pay = await tx.$queryRaw(Prisma.sql`
        SELECT
          CASE WHEN EXISTS (SELECT 1 FROM "payment_reversals" pr WHERE pr."organization_id" = p."organization_id" AND pr."payment_id" = p."id") THEN 'REVERSED' ELSE 'RECORDED' END AS "status",
          count(*)::int AS "count",
          COALESCE(SUM(p."amount"),0)::text AS "totalAmount"
        FROM "payments" p
        WHERE p."organization_id" = ${organizationId}::uuid AND p."created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
        GROUP BY 1
      `);
      const ship = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::bigint AS "count" FROM "shipments"
        WHERE "organization_id" = ${organizationId}::uuid AND "created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
      `);
      const gr = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::bigint AS "count" FROM "goods_receipts"
        WHERE "organization_id" = ${organizationId}::uuid AND "created_at"::date BETWEEN ${q.start}::date AND ${q.end}::date
      `);
      const toObj = (rows: any[]) => {
        const o: Record<string, { count: number; totalAmount: string }> = {};
        for (const r of rows) o[r.status] = { count: r.count, totalAmount: r.totalAmount };
        return o;
      };
      return {
        purchaseOrders: toObj(po),
        salesOrders: toObj(so),
        invoices: toObj(inv),
        payments: toObj(pay),
        shipments: Number(ship[0]?.count ?? 0),
        goodsReceipts: Number(gr[0]?.count ?? 0),
        dateRange: { start: q.start, end: q.end },
      };
    });
  }

  // ---------- Analytics (feature 016) ----------
  private granularity(start: string, end: string): 'day' | 'week' | 'month' {
    const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
    if (days <= 31) return 'day';
    if (days <= 120) return 'week';
    return 'month';
  }

  private bucketSource(start: string, end: string, granularity: 'day' | 'week' | 'month'): string {
    if (granularity === 'day') return `generate_series('${start}'::date, '${end}'::date, interval '1 day') AS g(bucket)`;
    if (granularity === 'week') return `generate_series('${start}'::date, '${end}'::date, interval '1 week') AS g(bucket)`;
    return `generate_series(date_trunc('month', '${start}'::date), date_trunc('month', '${end}'::date), interval '1 month') AS g(bucket)`;
  }

  private assertDates(q: any) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(q.start) || !re.test(q.end)) throw new Error('Date must be YYYY-MM-DD');
    if (new Date(q.end) < new Date(q.start)) throw new Error('End date may not be before start date');
    const days = Math.round((new Date(q.end).getTime() - new Date(q.start).getTime()) / 86400000) + 1;
    if (days > 400) throw new Error('Range may not exceed 400 days');
  }

  private async txRead<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '10s'`);
      return fn(tx);
    });
  }

  async kpiSummary(organizationId: string, q: any) {
    this.assertDates(q);
    return this.txRead(async (tx) => {
      const start = q.start, end = q.end;
      const prev = new Date(start); prev.setUTCDate(prev.getUTCDate() - 1);
      const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
      const prevStart = new Date(start); prevStart.setUTCDate(prevStart.getUTCDate() - days);
      const prevEnd = new Date(prev);
      const s = (d: Date) => d.toISOString().slice(0, 10);
      const from = s(new Date(start)), to = s(new Date(end));
      const prevFrom = s(prevStart), prevTo = s(prevEnd);

      // One snapshot: every figure below is read in this transaction.
      const periodRows = await tx.$queryRawUnsafe(`
        WITH cur AS (
          SELECT
            (SELECT COALESCE(SUM(total),0)::text FROM invoices WHERE organization_id = $1::uuid AND issue_date BETWEEN $2::date AND $3::date AND status IN ('ISSUED','PARTIALLY_PAID','PAID')) AS "salesTotal",
            (SELECT count(*)::int FROM invoices WHERE organization_id = $1::uuid AND issue_date BETWEEN $2::date AND $3::date AND status IN ('ISSUED','PARTIALLY_PAID','PAID')) AS "invoiceCount",
            (SELECT COALESCE(SUM(total),0)::text FROM purchase_orders WHERE organization_id = $1::uuid AND order_date BETWEEN $2::date AND $3::date AND status IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED')) AS "purchasesTotal",
            (SELECT count(*)::int FROM purchase_orders WHERE organization_id = $1::uuid AND order_date BETWEEN $2::date AND $3::date AND status IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED')) AS "purchaseOrderCount",
            (SELECT COALESCE(SUM(p.amount),0)::text FROM payments p WHERE p.organization_id = $1::uuid AND p.payment_date BETWEEN $2::date AND $3::date AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.organization_id = p.organization_id AND pr.payment_id = p.id)) AS "paymentsReceived",
            (SELECT count(*)::int FROM sales_orders WHERE organization_id = $1::uuid AND created_at::date BETWEEN $2::date AND $3::date) AS "salesOrderCount",
            (SELECT count(*)::int FROM purchase_orders WHERE organization_id = $1::uuid AND created_at::date BETWEEN $2::date AND $3::date) AS "purchaseOrderCreatedCount"
        ), prv AS (
          SELECT
            (SELECT COALESCE(SUM(total),0)::text FROM invoices WHERE organization_id = $1::uuid AND issue_date BETWEEN $4::date AND $5::date AND status IN ('ISSUED','PARTIALLY_PAID','PAID')) AS "salesTotal",
            (SELECT count(*)::int FROM invoices WHERE organization_id = $1::uuid AND issue_date BETWEEN $4::date AND $5::date AND status IN ('ISSUED','PARTIALLY_PAID','PAID')) AS "invoiceCount",
            (SELECT COALESCE(SUM(total),0)::text FROM purchase_orders WHERE organization_id = $1::uuid AND order_date BETWEEN $4::date AND $5::date AND status IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED')) AS "purchasesTotal",
            (SELECT count(*)::int FROM purchase_orders WHERE organization_id = $1::uuid AND order_date BETWEEN $4::date AND $5::date AND status IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED')) AS "purchaseOrderCount",
            (SELECT COALESCE(SUM(p.amount),0)::text FROM payments p WHERE p.organization_id = $1::uuid AND p.payment_date BETWEEN $4::date AND $5::date AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.organization_id = p.organization_id AND pr.payment_id = p.id)) AS "paymentsReceived",
            (SELECT count(*)::int FROM sales_orders WHERE organization_id = $1::uuid AND created_at::date BETWEEN $4::date AND $5::date) AS "salesOrderCount",
            (SELECT count(*)::int FROM purchase_orders WHERE organization_id = $1::uuid AND created_at::date BETWEEN $4::date AND $5::date) AS "purchaseOrderCreatedCount"
        )
        SELECT
          cur."salesTotal" AS "salesTotal", prv."salesTotal" AS "salesPrevious",
          cur."invoiceCount" AS "invoiceCount", prv."invoiceCount" AS "invoiceCountPrevious",
          cur."purchasesTotal" AS "purchasesTotal", prv."purchasesTotal" AS "purchasesPrevious",
          cur."purchaseOrderCount" AS "purchaseOrderCount", prv."purchaseOrderCount" AS "purchaseOrderCountPrevious",
          cur."paymentsReceived" AS "paymentsReceived", prv."paymentsReceived" AS "paymentsPrevious",
          cur."salesOrderCount" AS "salesOrderCount", prv."salesOrderCount" AS "salesOrderCountPrevious",
          cur."purchaseOrderCreatedCount" AS "purchaseOrderCreatedCount", prv."purchaseOrderCreatedCount" AS "purchaseOrderCreatedCountPrevious"
        FROM cur CROSS JOIN prv
      `, organizationId, from, to, prevFrom, prevTo);

      // Outstanding and overdue as of today: the shared invoice_balances definition.
      const receivables = await tx.$queryRawUnsafe(`
        SELECT
          COALESCE(SUM(ib.balance),0)::text AS "outstanding",
          COUNT(*) FILTER (WHERE ib.balance > 0)::int AS "outstandingInvoiceCount",
          COALESCE(SUM(ib.balance) FILTER (WHERE ib.is_overdue = true),0)::text AS "overdue",
          COUNT(*) FILTER (WHERE ib.is_overdue = true)::int AS "overdueInvoiceCount"
        FROM invoice_balances ib
        JOIN invoices i ON i.organization_id = ib.organization_id AND i.id = ib.invoice_id
        WHERE ib.organization_id = $1::uuid AND i.status IN ('ISSUED','PARTIALLY_PAID') AND ib.balance > 0
      `, organizationId);

      // Stock health: the shared low-stock view, stated once by the Inventory module.
      const stock = await tx.$queryRawUnsafe(`
        SELECT
          COUNT(*) FILTER (WHERE ls."status" = 'LOW_STOCK')::int AS "lowStockProductCount",
          COUNT(*) FILTER (WHERE ls."status" = 'OUT_OF_STOCK')::int AS "outOfStockProductCount"
        FROM "${LOW_STOCK_VIEW}" ls
        WHERE ls."organization_id" = $1::uuid
      `, organizationId);

      const cur = periodRows[0] ?? {};
      const rec = receivables[0] ?? {};
      const st = stock[0] ?? {};

      const money = (key: string, label: string, value: string, previousValue: string) => ({
        key,
        label,
        value,
        unit: 'money',
        previousValue,
        change: changeOf(value, previousValue),
      });
      const count = (key: string, label: string, value: number, previousValue: number) => ({
        key,
        label,
        value: String(value),
        unit: 'count',
        previousValue: String(previousValue),
        change: changeOf(String(value), String(previousValue)),
      });

      return {
        filters: { start: from, end: to },
        asOf: new Date().toISOString(),
        kpis: [
          money('salesTotal', 'Sales', cur.salesTotal ?? '0', cur.salesPrevious ?? '0'),
          count('invoiceCount', 'Invoices issued', cur.invoiceCount ?? 0, cur.invoiceCountPrevious ?? 0),
          money('purchasesTotal', 'Purchases', cur.purchasesTotal ?? '0', cur.purchasesPrevious ?? '0'),
          count('purchaseOrderCount', 'Purchase orders', cur.purchaseOrderCount ?? 0, cur.purchaseOrderCountPrevious ?? 0),
          money('paymentsReceived', 'Payments received', cur.paymentsReceived ?? '0', cur.paymentsPrevious ?? '0'),
          count('salesOrderCount', 'Sales orders created', cur.salesOrderCount ?? 0, cur.salesOrderCountPrevious ?? 0),
          count('purchaseOrderCreatedCount', 'Purchase orders created', cur.purchaseOrderCreatedCount ?? 0, cur.purchaseOrderCreatedCountPrevious ?? 0),
          count('lowStockProductCount', 'Products low stock', st.lowStockProductCount ?? 0, st.lowStockProductCount ?? 0),
          count('outOfStockProductCount', 'Products out of stock', st.outOfStockProductCount ?? 0, st.outOfStockProductCount ?? 0),
          { key: 'outstanding', label: 'Outstanding receivables', value: rec.outstanding ?? '0', unit: 'money', asOf: 'today' },
          { key: 'outstandingInvoiceCount', label: 'Outstanding invoices', value: String(rec.outstandingInvoiceCount ?? 0), unit: 'count', asOf: 'today' },
          { key: 'overdue', label: 'Overdue receivables', value: rec.overdue ?? '0', unit: 'money', asOf: 'today' },
          { key: 'overdueInvoiceCount', label: 'Overdue invoices', value: String(rec.overdueInvoiceCount ?? 0), unit: 'count', asOf: 'today' },
        ],
      };
    });
  }

  async salesOverTime(organizationId: string, q: any) {
    this.assertDates(q);
    return this.txRead(async (tx) => {
      const g = this.granularity(q.start, q.end);
      const rows = await tx.$queryRawUnsafe(`
        SELECT g.bucket::text AS label, COALESCE(SUM(i.total),0)::text AS value, COUNT(i.id)::int AS count
        FROM ${this.bucketSource(q.start, q.end, g)}
        LEFT JOIN invoices i ON i.issue_date = g.bucket AND i.organization_id = $1::uuid AND i.status IN ('ISSUED','PARTIALLY_PAID','PAID')
        GROUP BY g.bucket ORDER BY g.bucket
      `, organizationId);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), granularity: g, buckets: rows };
    });
  }

  async purchasesOverTime(organizationId: string, q: any) {
    this.assertDates(q);
    return this.txRead(async (tx) => {
      const g = this.granularity(q.start, q.end);
      const rows = await tx.$queryRawUnsafe(`
        SELECT g.bucket::text AS label, COALESCE(SUM(p.total),0)::text AS value, COUNT(p.id)::int AS count
        FROM ${this.bucketSource(q.start, q.end, g)}
        LEFT JOIN purchase_orders p ON p.order_date = g.bucket AND p.organization_id = $1::uuid AND p.status IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED')
        GROUP BY g.bucket ORDER BY g.bucket
      `, organizationId);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), granularity: g, buckets: rows };
    });
  }

  async paymentsReceivedOverTime(organizationId: string, q: any) {
    this.assertDates(q);
    return this.txRead(async (tx) => {
      const g = this.granularity(q.start, q.end);
      const rows = await tx.$queryRawUnsafe(`
        SELECT g.bucket::text AS label, COALESCE(SUM(p.amount),0)::text AS value, COUNT(p.id)::int AS count
        FROM ${this.bucketSource(q.start, q.end, g)}
        LEFT JOIN payments p ON p.payment_date = g.bucket AND p.organization_id = $1::uuid
          AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.organization_id = p.organization_id AND pr.payment_id = p.id)
        GROUP BY g.bucket ORDER BY g.bucket
      `, organizationId);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), granularity: g, buckets: rows };
    });
  }

  async topProducts(organizationId: string, q: any) {
    this.assertDates(q);
    return this.txRead(async (tx) => {
      const rows = await tx.$queryRawUnsafe(`
        SELECT l.product_id::text AS "productId", p.name AS "productName", p.sku,
               COALESCE(SUM(l.line_total),0)::text AS revenue, COALESCE(SUM(l.quantity),0)::text AS quantity, u.abbreviation AS unit
        FROM invoice_lines l
        JOIN invoices i ON i.organization_id = l.organization_id AND i.id = l.invoice_id
        JOIN products p ON p.organization_id = l.organization_id AND p.id = l.product_id
        LEFT JOIN units_of_measure u ON u.organization_id = p.organization_id AND u.id = p."unitId"
        WHERE i.organization_id = $1::uuid AND i.issue_date BETWEEN $2::date AND $3::date AND i.status IN ('ISSUED','PARTIALLY_PAID','PAID')
        GROUP BY l.product_id, p.name, p.sku, u.abbreviation ORDER BY revenue DESC LIMIT 10
      `, organizationId, q.start, q.end);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), rows };
    });
  }

  async topCustomers(organizationId: string, q: any) {
    return this.txRead(async (tx) => {
      const rows = await tx.$queryRawUnsafe(`
        SELECT c.id::text AS "customerId", c.name AS "customerName", COALESCE(SUM(i.total),0)::text AS total
        FROM invoices i
        JOIN contacts c ON c.organization_id = i.organization_id AND c.id = i.customer_id
        WHERE i.organization_id = $1::uuid AND i.issue_date BETWEEN $2::date AND $3::date AND i.status IN ('ISSUED','PARTIALLY_PAID','PAID')
        GROUP BY c.id, c.name ORDER BY total DESC LIMIT 10
      `, organizationId, q.start, q.end);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), rows };
    });
  }

  async receivablesAging(organizationId: string) {
    const r = await this.outstandingInvoices(organizationId, { page: 1, pageSize: 100, search: null, overdueOnly: false, dueFrom: null, dueTo: null });
    return { filters: { start: null, end: null }, asOf: new Date().toISOString(), aging: r.aging };
  }

  async stockHealth(organizationId: string) {
    return this.txRead(async (tx) => {
      const col = await tx.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='reorder_level'`);
      const hasReorder = col.length > 0;
      const counts = { inStock: 0, lowStock: 0, outOfStock: 0 };
      const rowsWithLevel = await tx.$queryRawUnsafe(`SELECT p.id, p.name, p.sku, (sb.on_hand - sb.reserved)::text AS available${hasReorder ? ', p.reorder_level::text AS threshold' : ''} FROM products p JOIN stock_balances sb ON sb.organization_id = p.organization_id AND sb.product_id = p.id WHERE p.organization_id = $1::uuid AND p.is_archived = false`, organizationId);
      for (const r of rowsWithLevel) {
        const avail = Number(r.available);
        const threshold = hasReorder ? Number(r.threshold) : 0;
        if (avail <= 0) counts.outOfStock++;
        else if (hasReorder && avail <= threshold) counts.lowStock++;
        else counts.inStock++;
      }
      const lowStockProducts = (rowsWithLevel as any[])
        .filter((r: any) => { const a = Number(r.available); const t = hasReorder ? Number(r.threshold) : 0; return a > 0 && hasReorder && a <= t; })
        .sort((a: any, b: any) => Number(a.available) - Number(b.available))
        .slice(0, 10);
      return { asOf: new Date().toISOString(), ...counts, lowStockProducts };
    });
  }

  async stockMovementsOverTime(organizationId: string, q: any) {
    return this.txRead(async (tx) => {
      const g = this.granularity(q.start, q.end);
      const rows = await tx.$queryRawUnsafe(`
        SELECT g.bucket::text AS label,
               COUNT(*) FILTER (WHERE m.type IN ('RECEIPT','goods_receipt'))::int AS "receiptCount",
               COUNT(*) FILTER (WHERE m.type IN ('ISSUE','SHIPMENT'))::int AS "shipmentCount",
               COUNT(*) FILTER (WHERE m.type = 'ADJUSTMENT')::int AS "adjustmentCount"
        FROM ${this.bucketSource(q.start, q.end, g)}
        LEFT JOIN stock_movements m ON m.created_at::date = g.bucket AND m.organization_id = $1::uuid
        GROUP BY g.bucket ORDER BY g.bucket
      `, organizationId);
      return { filters: { start: q.start, end: q.end }, asOf: new Date().toISOString(), granularity: g, buckets: rows };
    });
  }

  // ---------- Stock reconciliation ----------
  async stockReconciliation(organizationId: string) {
    return this.readTx(async (tx) => {
      const rows = await tx.$queryRaw(Prisma.sql`
        WITH mov AS (
          SELECT "organization_id", "warehouse_id", "product_id",
                 COALESCE(SUM("quantity_delta"),0) AS "movementSum"
          FROM "stock_movements"
          WHERE "organization_id" = ${organizationId}::uuid
          GROUP BY "organization_id", "warehouse_id", "product_id"
        ),
        res AS (
          SELECT "organization_id", "warehouse_id", "product_id",
                 COALESCE(SUM("quantity"),0) AS "reservationSum"
          FROM "stock_reservations"
          WHERE "organization_id" = ${organizationId}::uuid AND "status" = 'ACTIVE'
          GROUP BY "organization_id", "warehouse_id", "product_id"
        )
        SELECT
          sb."warehouse_id"::text AS "warehouseId",
          w."name" AS "warehouseName",
          sb."product_id"::text AS "productId",
          p."name" AS "productName",
          p."unit_id"::text AS "unitOfMeasureId",
          u."abbreviation" AS "unitOfMeasure",
          sb."on_hand"::text AS "onHand",
          COALESCE(mov."movementSum",0)::text AS "movementSum",
          sb."reserved"::text AS "reserved",
          COALESCE(res."reservationSum",0)::text AS "reservationSum"
        FROM "stock_balances" sb
        JOIN "products" p ON p."organization_id" = sb."organization_id" AND p."id" = sb."product_id"
        JOIN "warehouses" w ON w."organization_id" = sb."organization_id" AND w."id" = sb."warehouse_id"
        JOIN "units_of_measure" u ON u."organization_id" = sb."organization_id" AND u."id" = p."unit_id"
        LEFT JOIN mov ON mov."organization_id" = sb."organization_id" AND mov."warehouse_id" = sb."warehouse_id" AND mov."product_id" = sb."product_id"
        LEFT JOIN res ON res."organization_id" = sb."organization_id" AND res."warehouse_id" = sb."warehouse_id" AND res."product_id" = sb."product_id"
        WHERE sb."organization_id" = ${organizationId}::uuid
          AND (
            sb."on_hand" <> COALESCE(mov."movementSum", 0)
            OR sb."reserved" <> COALESCE(res."reservationSum", 0)
            OR sb."reserved" > sb."on_hand"
          )
      `);
      const items = rows.map((r: any) => {
        const kinds: string[] = [];
        if (Number(r.onHand) !== Number(r.movementSum)) kinds.push('onHandMismatch');
        if (Number(r.reserved) !== Number(r.reservationSum)) kinds.push('reservedMismatch');
        if (Number(r.reserved) > Number(r.onHand)) kinds.push('reservedExceedsOnHand');
        return { ...r, kinds };
      });
      return { items, total: items.length, checkedAt: new Date().toISOString() };
    });
  }

}
