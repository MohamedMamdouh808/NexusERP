import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS, ERROR_CODES, type ErrorDetail } from '@nexuserp/shared';

import { AppException } from '../../common/errors/all-exceptions.filter';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SalesService } from '../sales/sales.service';
import { OrganizationLockService } from '../../modules/organizations/organization-lock.service';
import { allocateInvoicingNumber } from './invoice-number';
import {
  INVOICE_LABEL,
  toDateString,
  type InvoiceDetailResponse,
  type InvoiceLineResponse,
  type InvoicePageResponse,
  type InvoiceRowResponse,
  type OpenInvoiceResponse,
  type PaymentAppliedResponse,
} from './dto/invoice-response.dto';
import type { ListInvoicesDto } from './dto/list-invoices.dto';
import type { ListPaymentsDto } from './dto/list-payments.dto';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto';
import type { IssueInvoiceDto } from './dto/issue-invoice.dto';
import type { VoidInvoiceDto } from './dto/void-invoice.dto';
import type { RecordPaymentDto } from './dto/record-payment.dto';
import type { ReversePaymentDto } from './dto/reverse-payment.dto';
import type {
  PaymentAllocationResponse,
  PaymentDetailResponse,
  PaymentPageResponse,
  PaymentRowResponse,
} from './dto/payment-response.dto';

/**
 * Operational invoices and payments.
 *
 * An invoice is born from a SHIPPED sales order and copies its lines verbatim:
 * quantities, unit prices and the already-rounded line totals. Only a draft is
 * editable (the due date), and only until it is issued; issuing allocates the
 * `INV-` number and makes the header immutable. Voiding keeps the document in
 * history and frees its order for re-invoicing.
 *
 * The totals and balances are never computed by a client. `paid` and `balance`
 * come from the `invoice_balances` view - the one definition of the rule -
 * so the list, the detail and the record-payment screen cannot drift apart.
 *
 * A payment is written in ONE transaction together with its allocations, the
 * status moves of the invoices it settles, the audit entry and the stored
 * idempotency response. The invoices are locked in ascending `id` order and
 * every balance is recomputed under the lock, so two payments can never
 * over-allocate an invoice: the loser is refused 409 `BALANCE_CHANGED` with
 * the balance as it stands now. A reporting failure at any step leaves no
 * payment, no allocation, no status change and no key record.
 *
 * Every record of another organization is answered as "not found": a tenant
 * never learns that another tenant's invoice exists.
 */
@Injectable()
export class InvoicingService {
  constructor(
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly sales: SalesService,
    private readonly contacts: ContactsService,
    private readonly organizations: OrganizationsService,
    private readonly organizationLock: OrganizationLockService,
  ) {}

  // -----------------------------------------------------------------------
  // Invoices
  // -----------------------------------------------------------------------

  /**
   * Creates the DRAFT invoice of a shipped sales order.
   *
   * Not idempotent on purpose: a duplicate create is refused 409
   * INVOICE_ALREADY_EXISTS instead of replayed. The order is read through the
   * Sales service inside the transaction, so a client holding only
   * `invoices.write` can create without sales permissions; an order that does
   * not exist in this organization is "not found", and one not yet shipped is
   * 409 INVALID_STATE_TRANSITION.
   */
  async createInvoice(
    organizationId: string,
    userId: string,
    orderId: string,
  ): Promise<InvoiceDetailResponse> {
    const expectedCurrency = await this.organizationLock.getCurrency(organizationId);
    return this.transaction.runInTransaction(async (tx) => {
      // Lock the organization row so a concurrent settings currency change or
      // module toggle serializes with this first document (FR-010, FR-011, FR-018).
      await this.organizationLock.lockOrganization(tx, organizationId);
      await this.organizationLock.assertModuleEnabled(tx, organizationId, 'invoicing');
      await this.organizationLock.assertCurrencyUnchanged(tx, organizationId, expectedCurrency);

      const order = await this.sales.readShippedOrderForInvoice(tx, organizationId, orderId);

      const existing = await tx.invoice.findFirst({
        where: { organizationId, salesOrderId: order.id, status: { not: 'VOID' } },
        select: { id: true },
      });
      if (existing !== null) {
        throw invoiceAlreadyExists();
      }

      let invoice: InvoiceRowState;
      try {
        invoice = await tx.invoice.create({
          data: {
            organizationId,
            salesOrderId: order.id,
            customerId: order.customerId,
            status: 'DRAFT',
            total: order.total,
            version: 1,
            createdById: userId,
          },
          select: INVOICE_ROW_SELECT,
        });
      } catch (error) {
        // The partial unique index (one non-void invoice per order) is the
        // final arbiter: a simultaneous create loses here rather than
        // duplicating the invoice.
        if (isUniqueViolation(error)) throw invoiceAlreadyExists();
        throw error;
      }

      await tx.invoiceLine.createMany({
        data: order.lines.map((line, index) => ({
          organizationId,
          invoiceId: invoice.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          sequence: index,
        })),
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.invoicesCreated,
        recordType: 'invoice',
        recordId: invoice.id,
        after: {
          number: null,
          status: invoice.status,
          customerId: order.customerId,
          total: invoice.total.toFixed(2),
          lines: order.lines.length,
        },
      });

      return this.invoiceDetail(tx, organizationId, invoice);
    });
  }

  /** The full invoice: lines, derived balances, allocations and void trail. */
  async getInvoiceDetail(organizationId: string, id: string): Promise<InvoiceDetailResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { organizationId_id: { organizationId, id } },
        select: INVOICE_ROW_SELECT,
      });
      if (invoice === null) {
        throw new NotFoundException('Invoice not found.');
      }
      return this.invoiceDetail(tx, organizationId, invoice);
    });
  }

  /**
   * The organization's invoices: search, filters, sort, page.
   *
   * ONE statement, one snapshot: the filtered selection, its whole-selection
   * figures and the requested page are read together, so a payment landing
   * between two reads could never make the rows and the totals disagree.
   * `outstanding` sums the balances of ISSUED and PARTIALLY_PAID invoices;
   * `overdue` is the part of that figure due before today (UTC). The row
   * balances, like the detail's, come from `invoice_balances` - the one
   * definition of the rule - so the list and the detail cannot drift apart.
   */
  async listInvoices(organizationId: string, query: ListInvoicesDto): Promise<InvoicePageResponse> {
    const client = this.transaction.getClient();
    const search =
      query.search === undefined || query.search === '' ? undefined : escapeLike(query.search);
    const status = query.status ?? null;
    const overdue = query.overdue ?? null;
    const direction = Prisma.raw(query.sortOrder === 'asc' ? 'ASC' : 'DESC');
    const sortKey = Prisma.raw(invoiceSortKey(query.sortBy));

    const rows = await client.$queryRaw<
      { total: number; outstanding: unknown; overdue: unknown; items: RawInvoiceRow[] | null }[]
    >(Prisma.sql`
      WITH "filtered" AS (
        SELECT
          i."id",
          i."number",
          i."sales_order_id"::text AS "orderId",
          so."number" AS "orderNumber",
          i."customer_id"::text AS "customerId",
          c."name" AS "customerName",
          i."status",
          i."issue_date"::text AS "issueDate",
          i."due_date"::text AS "dueDate",
          i."total"::text AS "total",
          ib."balance"::text AS "balance",
          ib."is_overdue" AS "isOverdue",
          i."version",
          ${INVOICE_LABEL} AS "label",
          ib."balance" AS "balanceValue",
          ${sortKey} AS "sortKey"
        FROM "invoices" i
        JOIN "sales_orders" so
          ON so."organization_id" = i."organization_id" AND so."id" = i."sales_order_id"
        JOIN "contacts" c
          ON c."organization_id" = i."organization_id" AND c."id" = i."customer_id"
        JOIN "invoice_balances" ib
          ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND (${status}::text IS NULL OR i."status" = ${status})
          AND (${query.orderId ?? null}::uuid IS NULL OR i."sales_order_id" = ${query.orderId ?? null}::uuid)
          AND (${overdue}::boolean IS NULL OR ib."is_overdue" = ${overdue})
          AND (
            ${search}::text IS NULL
            OR i."number" ILIKE ${search}
            OR c."name" ILIKE ${search}
          )
      ),
      "totals" AS (
        SELECT
          count(*)::int AS "total",
          COALESCE(
            sum(f."balanceValue") FILTER (WHERE f."status" IN ('ISSUED', 'PARTIALLY_PAID')),
            0
          ) AS "outstanding",
          COALESCE(
            sum(f."balanceValue") FILTER (
              WHERE f."status" IN ('ISSUED', 'PARTIALLY_PAID') AND f."isOverdue"
            ),
            0
          ) AS "overdue"
        FROM "filtered" f
      ),
      "page" AS (
        SELECT * FROM "filtered"
        ORDER BY "sortKey" ${direction} NULLS LAST, "id" ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      )
      SELECT
        t."total",
        t."outstanding"::text AS "outstanding",
        t."overdue"::text AS "overdue",
        COALESCE(
          (
            SELECT jsonb_agg(
              to_jsonb(p) - 'sortKey' - 'balanceValue'
              ORDER BY p."sortKey" ${direction} NULLS LAST, p."id" ASC
            )
            FROM "page" p
          ),
          '[]'::jsonb
        ) AS "items"
      FROM "totals" t
    `);

    const row = rows[0];
    return {
      items: (row?.items ?? []) as unknown as InvoiceRowResponse[],
      total: Number(row?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
      outstanding: new Prisma.Decimal(String(row?.outstanding ?? 0)).toFixed(2),
      overdue: new Prisma.Decimal(String(row?.overdue ?? 0)).toFixed(2),
    };
  }

  /**
   * The open invoices of one customer: ISSUED or PARTIALLY_PAID with a balance
   * above zero. The customer must belong to the caller's organization; another
   * organization's customer is answered as "not found". Read in one
   * transaction so the ownership check and the rows come from one snapshot.
   */
  async listOpenInvoices(organizationId: string, customerId: string): Promise<OpenInvoiceResponse[]> {
    return this.transaction.runInTransaction(async (tx) => {
      const customer = await tx.contact.findUnique({
        where: { organizationId_id: { organizationId, id: customerId } },
        select: { id: true },
      });
      if (customer === null) {
        throw new NotFoundException('Customer not found.');
      }

      return tx.$queryRaw<RawOpenInvoiceRow[]>(Prisma.sql`
        SELECT
          i."id"::text AS "id",
          i."number",
          i."due_date"::text AS "dueDate",
          i."total"::text AS "total",
          ib."balance"::text AS "balance",
          ib."is_overdue" AS "isOverdue"
        FROM "invoices" i
        JOIN "invoice_balances" ib
          ON ib."organization_id" = i."organization_id" AND ib."invoice_id" = i."id"
        WHERE i."organization_id" = ${organizationId}::uuid
          AND i."customer_id" = ${customerId}::uuid
          AND i."status" IN ('ISSUED', 'PARTIALLY_PAID')
          AND ib."balance" > 0
        ORDER BY i."due_date" ASC, i."number" ASC
      `);
    });
  }

  /**
   * Updates the due date of a DRAFT invoice.
   *
   * The only editable field is `dueDate`; lines belong to the order they were
   * copied from. A due date before the creation date is refused 400 naming the
   * field, and a stale version is refused 409 STALE_VERSION rather than
   * overwriting a change the caller has not seen.
   */
  async updateInvoiceDraft(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceDetailResponse> {
    return this.transaction.runInTransaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, organizationId, id);

      if (invoice.version !== dto.version) {
        throw staleVersion(invoice.version);
      }
      if (invoice.status !== 'DRAFT') {
        throw invalidTransition(invoice.status, 'edited');
      }

      if (dto.dueDate !== null && dto.dueDate < toDateString(invoice.createdAt)!) {
        throw dueDateBeforeCreation();
      }

      const updated = await tx.invoice.update({
        where: { organizationId_id: { organizationId, id } },
        data: {
          dueDate: dto.dueDate === null ? null : parseDate(dto.dueDate),
          version: { increment: 1 },
        },
        select: INVOICE_ROW_SELECT,
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.invoicesUpdated,
        recordType: 'invoice',
        recordId: id,
        before: { dueDate: toDateString(invoice.dueDate), version: invoice.version },
        after: { dueDate: dto.dueDate, version: updated.version },
      });

      return this.invoiceDetail(tx, organizationId, updated);
    });
  }

  /**
   * Issues a DRAFT invoice.
   *
   * The transaction locks the invoice, allocates the `INV-` number, stamps
   * today (UTC) as the issue date and resolves the due date: the request value
   * first, else the draft's kept due date, else the issue date plus the
   * organization's default payment terms. A due date that precedes the issue
   * date is refused 400 naming the field. The stored response is replayed for
   * the same Idempotency-Key and body; the same key with another body is 422.
   */
  async issueInvoice(
    organizationId: string,
    userId: string,
    id: string,
    dto: IssueInvoiceDto,
    idempotencyKey: string,
  ): Promise<InvoiceDetailResponse> {
    const endpoint = `/invoices/${id}/issue`;
    const outcome = await this.idempotency.runOnce<InvoiceDetailResponse>(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx) => {
        const invoice = await this.lockInvoice(tx, organizationId, id);

        if (invoice.status !== 'DRAFT') {
          throw invalidTransition(invoice.status, 'issued');
        }

        const issueDate = todayUtc();
        const dueDate = await this.resolveIssueDueDate(organizationId, invoice, dto, issueDate);
        const number = await allocateInvoicingNumber(tx, organizationId, 'invoice');

        const updated = await tx.invoice.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            number,
            status: 'ISSUED',
            issueDate,
            dueDate,
            version: { increment: 1 },
          },
          select: INVOICE_ROW_SELECT,
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.invoicesIssued,
          recordType: 'invoice',
          recordId: id,
          before: { status: invoice.status, number: invoice.number, version: invoice.version },
          after: {
            status: updated.status,
            number: updated.number,
            issueDate: toDateString(updated.issueDate),
            dueDate: toDateString(updated.dueDate),
            version: updated.version,
          },
        });

        return {
          status: 200,
          body: await this.invoiceDetail(tx, organizationId, updated),
        };
      },
    );

    return outcome.body;
  }

  /**
   * Voids an invoice.
   *
   * A DRAFT voids freely; an ISSUED invoice voids only while it has no active
   * allocation. An invoice whose payments have been reversed has no active
   * allocation left and may be voided. PARTIALLY_PAID and PAID invoices are
   * refused 409 INVOICE_HAS_PAYMENTS with the instruction to reverse the
   * payments first. VOID is terminal.
   */
  async voidInvoice(
    organizationId: string,
    userId: string,
    id: string,
    dto: VoidInvoiceDto,
    idempotencyKey: string,
  ): Promise<InvoiceDetailResponse> {
    const endpoint = `/invoices/${id}/void`;
    const outcome = await this.idempotency.runOnce<InvoiceDetailResponse>(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx) => {
        const invoice = await this.lockInvoice(tx, organizationId, id);

        if (invoice.status === 'VOID') {
          throw invalidTransition(invoice.status, 'voided');
        }
        if (invoice.status === 'PARTIALLY_PAID' || invoice.status === 'PAID') {
          throw invoiceHasPayments();
        }
        if (invoice.status === 'ISSUED' && (await this.activeAllocationCount(tx, organizationId, id)) > 0) {
          throw invoiceHasPayments();
        }

        const updated = await tx.invoice.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            status: 'VOID',
            voidReason: dto.reason,
            voidedAt: new Date(),
            voidedById: userId,
            version: { increment: 1 },
          },
          select: INVOICE_ROW_SELECT,
        });

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.invoicesVoided,
          recordType: 'invoice',
          recordId: id,
          before: { status: invoice.status, version: invoice.version },
          after: {
            status: updated.status,
            voidReason: updated.voidReason,
            version: updated.version,
          },
        });

        return {
          status: 200,
          body: await this.invoiceDetail(tx, organizationId, updated),
        };
      },
    );

    return outcome.body;
  }

  // -----------------------------------------------------------------------
  // Payments
  // -----------------------------------------------------------------------

  /**
   * Records a payment and allocates it across the customer's invoices.
   *
   * Validated inside the transaction:
   * - `amount` above zero and the allocations summing to it EXACTLY (no
   *   overpayment, no unallocated remainder);
   * - `paymentDate` not in the future (UTC);
   * - each allocation above zero, to a distinct invoice;
   * - every invoice in this organization and of this customer, ISSUED or
   *   PARTIALLY_PAID;
   * - the invoices locked in ascending `id` order and each balance recomputed
   *   under the lock from the allocations of non-reversed payments.
   *
   * A balance different from the `expectedBalance` the caller read is refused
   * 409 BALANCE_CHANGED with `{ invoiceId, currentBalance }`; a matching
   * balance exceeded by its allocation is 400 OVER_ALLOCATION. Neither writes
   * anything. The payment, its allocations, the status moves (PARTIALLY_PAID,
   * or PAID at exactly zero), the audit entry and the idempotency response
   * commit together.
   */
  async recordPayment(
    organizationId: string,
    userId: string,
    dto: RecordPaymentDto,
    idempotencyKey: string,
  ): Promise<PaymentDetailResponse> {
    const outcome = await this.idempotency.runOnce<PaymentDetailResponse>(
      { organizationId, endpoint: '/payments', key: idempotencyKey, body: dto },
      async (tx) => {
        const amount = new Prisma.Decimal(dto.amount);
        if (amount.lessThanOrEqualTo(new Prisma.Decimal(0))) {
          throw validationError('amount', 'AMOUNT_NOT_POSITIVE', 'The payment amount must be greater than zero.');
        }

        const paymentDate = parseDate(dto.paymentDate);
        if (paymentDate.getTime() > todayUtc().getTime()) {
          throw validationError(
            'paymentDate',
            'PAYMENT_DATE_IN_FUTURE',
            'The payment date may not be in the future.',
          );
        }

        for (const allocation of dto.allocations) {
          if (new Prisma.Decimal(allocation.amount).lessThanOrEqualTo(new Prisma.Decimal(0))) {
            throw validationError(
              'allocations',
              'ALLOCATION_NOT_POSITIVE',
              'Each allocation must be greater than zero.',
            );
          }
        }

        // The Zod schema already refuses these; the service stays the authority.
        const allocatedSum = dto.allocations.reduce(
          (sum, allocation) => sum.plus(new Prisma.Decimal(allocation.amount)),
          new Prisma.Decimal(0),
        );
        if (!allocatedSum.equals(amount)) {
          throw allocationSumMismatch();
        }
        const invoiceIds = [...new Set(dto.allocations.map((allocation) => allocation.invoiceId))];
        if (invoiceIds.length !== dto.allocations.length) {
          throw duplicateAllocationInvoice();
        }

        const [customer] = await this.contacts.findNames(organizationId, [dto.customerId]);
        if (customer === undefined) {
          throw new NotFoundException('Customer not found.');
        }

        // Locking in ascending id order is what keeps two payments from
        // deadlocking and guarantees the second one reads the first one's
        // committed allocations. The lock is taken before any balance is read.
        const sortedInvoiceIds = [...invoiceIds].sort();
        const invoices = new Map<string, InvoiceRowState>();
        for (const invoiceId of sortedInvoiceIds) {
          invoices.set(invoiceId, await this.lockInvoice(tx, organizationId, invoiceId));
        }

        const verified: { invoiceId: string; amount: Prisma.Decimal }[] = [];
        for (const allocation of dto.allocations) {
          const invoice = invoices.get(allocation.invoiceId)!;

          if (invoice.customerId !== dto.customerId) {
            throw invalidTransition(invoice.status, 'paid');
          }
          if (invoice.status !== 'ISSUED' && invoice.status !== 'PARTIALLY_PAID') {
            throw invalidTransition(invoice.status, 'paid');
          }

          const balance = await this.readBalance(tx, organizationId, invoice.id);
          const currentBalance = balance.balance.toFixed(2);
          if (!new Prisma.Decimal(allocation.expectedBalance).equals(balance.balance)) {
            throw balanceChanged(invoice.id, currentBalance);
          }
          const allocationAmount = new Prisma.Decimal(allocation.amount);
          if (allocationAmount.greaterThan(balance.balance)) {
            throw overAllocation(invoice.id, currentBalance);
          }
          verified.push({ invoiceId: invoice.id, amount: allocationAmount });
        }

        const number = await allocateInvoicingNumber(tx, organizationId, 'payment');
        const payment = await tx.payment.create({
          data: {
            organizationId,
            number,
            customerId: dto.customerId,
            amount,
            paymentDate,
            method: dto.method,
            reference: dto.reference ?? null,
            recordedById: userId,
          },
          select: { id: true, number: true, amount: true },
        });

        await tx.paymentAllocation.createMany({
          data: verified.map((allocation) => ({
            organizationId,
            paymentId: payment.id,
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          })),
        });

        // The status follows the recomputed balance: PAID only at exactly zero.
        for (const allocation of verified) {
          const balance = await this.readBalance(tx, organizationId, allocation.invoiceId);
          await tx.invoice.update({
            where: { organizationId_id: { organizationId, id: allocation.invoiceId } },
            data: {
              status: balance.balance.isZero() ? 'PAID' : 'PARTIALLY_PAID',
              version: { increment: 1 },
            },
          });
        }

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.paymentsRecorded,
          recordType: 'payment',
          recordId: payment.id,
          after: {
            number: payment.number,
            amount: payment.amount.toFixed(2),
            customerId: dto.customerId,
            method: dto.method,
            allocations: verified.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: allocation.amount.toFixed(2),
            })),
          },
        });

        return {
          status: 201,
          body: await this.paymentDetail(tx, organizationId, payment.id),
        };
      },
    );

    return outcome.body;
  }

  /** One payment with its allocations and its reversal block. */
  async getPaymentDetail(organizationId: string, id: string): Promise<PaymentDetailResponse> {
    return this.transaction.runInTransaction((tx) => this.paymentDetail(tx, organizationId, id));
  }

  /**
   * The organization's payments: search, derived-status and method filters, a
   * date range, sort and page.
   *
   * There is no stored payment status. `RECORDED`/`REVERSED` is derived from
   * one LEFT JOIN to `payment_reversals`, and the same join drives the filter,
   * the sort key and the rows, so a filtered page and its total can never
   * disagree. The date range bounds `payment_date` inclusively.
   */
  async listPayments(organizationId: string, query: ListPaymentsDto): Promise<PaymentPageResponse> {
    const client = this.transaction.getClient();
    const search =
      query.search === undefined || query.search === '' ? undefined : escapeLike(query.search);
    const dateFrom = query.dateFrom ?? null;
    const dateTo = query.dateTo ?? null;
    const direction = Prisma.raw(query.sortOrder === 'asc' ? 'ASC' : 'DESC');
    const sortKey = Prisma.raw(paymentSortKey(query.sortBy));

    const rows = await client.$queryRaw<
      { total: number; items: RawPaymentRow[] | null }[]
    >(Prisma.sql`
      WITH "filtered" AS (
        SELECT
          p."id",
          p."number",
          p."customer_id"::text AS "customerId",
          c."name" AS "customerName",
          p."amount"::text AS "amount",
          p."payment_date"::text AS "paymentDate",
          p."method",
          p."reference",
          CASE WHEN r."id" IS NULL THEN 'RECORDED' ELSE 'REVERSED' END AS "status",
          r."reversed_at" AS "reversedAt",
          p."recorded_at" AS "recordedAt",
          ${sortKey} AS "sortKey"
        FROM "payments" p
        JOIN "contacts" c
          ON c."organization_id" = p."organization_id" AND c."id" = p."customer_id"
        LEFT JOIN "payment_reversals" r
          ON r."organization_id" = p."organization_id" AND r."payment_id" = p."id"
        WHERE p."organization_id" = ${organizationId}::uuid
          AND (
            ${query.status}::text = 'all'
            OR (${query.status}::text = 'active' AND r."id" IS NULL)
            OR (${query.status}::text = 'reversed' AND r."id" IS NOT NULL)
          )
          AND (${query.method}::text = 'all' OR p."method" = ${query.method})
          AND (${dateFrom}::date IS NULL OR p."payment_date" >= ${dateFrom}::date)
          AND (${dateTo}::date IS NULL OR p."payment_date" <= ${dateTo}::date)
          AND (
            ${search}::text IS NULL
            OR p."number" ILIKE ${search}
            OR c."name" ILIKE ${search}
          )
      ),
      "page" AS (
        SELECT * FROM "filtered"
        ORDER BY "sortKey" ${direction} NULLS LAST, "id" ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      )
      SELECT
        (SELECT count(*)::int FROM "filtered") AS "total",
        COALESCE(
          (
            SELECT jsonb_agg(
              to_jsonb(p) - 'sortKey'
              ORDER BY p."sortKey" ${direction} NULLS LAST, p."id" ASC
            )
            FROM "page" p
          ),
          '[]'::jsonb
        ) AS "items"
    `);

    const row = rows[0];
    const items = ((row?.items ?? []) as unknown as RawPaymentRow[]).map(
      (item): PaymentRowResponse => ({
        ...item,
        reversedAt: item.reversedAt === null ? null : new Date(item.reversedAt).toISOString(),
        recordedAt: new Date(item.recordedAt).toISOString(),
      }),
    );
    return {
      items,
      total: Number(row?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Reverses a payment with a compensating record.
   *
   * The payment row and its allocations are never changed: a
   * `payment_reversals` row is appended, and what changes is what COUNTS. The
   * affected invoices are locked in ascending `id` order - the same order the
   * recording path takes, so the two can never deadlock - the reversal row is
   * written, and each invoice's status is recomputed from its remaining active
   * allocations under the lock:
   *
   * - zero balance -> PAID (only at exactly zero);
   * - some allocation left -> PARTIALLY_PAID;
   * - no allocation left -> ISSUED.
   *
   * A second reversal of the same payment is refused 409: the reversal row is
   * the one mark that the payment no longer counts. The reversal, the status
   * moves, the audit entry and the stored idempotency response commit together
   * or not at all.
   */
  async reversePayment(
    organizationId: string,
    userId: string,
    id: string,
    dto: ReversePaymentDto,
    idempotencyKey: string,
  ): Promise<PaymentDetailResponse> {
    const endpoint = `/payments/${id}/reverse`;
    const outcome = await this.idempotency.runOnce<PaymentDetailResponse>(
      { organizationId, endpoint, key: idempotencyKey, body: dto },
      async (tx) => {
        // Locking the payment serializes two simultaneous reversals: the loser
        // waits, then sees the winner's committed reversal row and is refused.
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id"
          FROM "payments"
          WHERE "organization_id" = ${organizationId}::uuid
            AND "id" = ${id}::uuid
          FOR UPDATE
        `);
        if (locked.length === 0) {
          throw new NotFoundException('Payment not found.');
        }

        const payment = await tx.payment.findUniqueOrThrow({
          where: { organizationId_id: { organizationId, id } },
          select: {
            id: true,
            number: true,
            amount: true,
            reversal: { select: { id: true } },
            allocations: { select: { invoiceId: true } },
          },
        });
        if (payment.reversal !== null) {
          throw paymentAlreadyReversed();
        }

        const invoiceIds = [...new Set(payment.allocations.map((allocation) => allocation.invoiceId))].sort();
        const invoices: InvoiceRowState[] = [];
        for (const invoiceId of invoiceIds) {
          invoices.push(await this.lockInvoice(tx, organizationId, invoiceId));
        }

        // Written BEFORE the balances are read: inside this transaction the
        // reversal already counts, so the view excludes the payment being
        // reversed without a second, hand-written subtraction.
        await tx.paymentReversal.create({
          data: {
            organizationId,
            paymentId: payment.id,
            reason: dto.reason,
            reversedById: userId,
          },
        });

        const affectedInvoices: { invoiceId: string; status: string }[] = [];
        for (const invoice of invoices) {
          const balance = await this.readBalance(tx, organizationId, invoice.id);
          const status = balance.balance.isZero()
            ? 'PAID'
            : balance.allocated.greaterThan(0)
              ? 'PARTIALLY_PAID'
              : 'ISSUED';
          if (status !== invoice.status) {
            await tx.invoice.update({
              where: { organizationId_id: { organizationId, id: invoice.id } },
              data: { status, version: { increment: 1 } },
            });
          }
          affectedInvoices.push({ invoiceId: invoice.id, status });
        }

        await this.audit.record({
          organizationId,
          userId,
          action: AUDIT_ACTIONS.paymentsReversed,
          recordType: 'payment',
          recordId: payment.id,
          before: { number: payment.number, amount: payment.amount.toFixed(2), status: 'RECORDED' },
          after: {
            number: payment.number,
            status: 'REVERSED',
            reason: dto.reason,
            affectedInvoices,
          },
        });

        return {
          status: 200,
          body: await this.paymentDetail(tx, organizationId, payment.id),
        };
      },
    );

    return outcome.body;
  }

  // -----------------------------------------------------------------------
  // Reading helpers
  // -----------------------------------------------------------------------

  /** Locks one invoice FOR UPDATE and returns its state. A missing one is 404. */
  private async lockInvoice(
    tx: TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<InvoiceRowState> {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "invoices"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "id" = ${id}::uuid
      FOR UPDATE
    `);
    if (locked.length === 0) {
      throw new NotFoundException('Invoice not found.');
    }
    return tx.invoice.findUniqueOrThrow({
      where: { organizationId_id: { organizationId, id } },
      select: INVOICE_ROW_SELECT,
    });
  }

  /**
   * The derived figures of one invoice, from the one shared definition.
   *
   * `paid` is the sum of allocations of payments with no reversal; `balance`
   * is `total - paid`; `isOverdue` is derived at read time and never stored.
   */
  private async readBalance(
    tx: TransactionClient,
    organizationId: string,
    invoiceId: string,
  ): Promise<{ total: Prisma.Decimal; allocated: Prisma.Decimal; balance: Prisma.Decimal; isOverdue: boolean }> {
    const rows = await tx.$queryRaw<
      { total: unknown; allocated: unknown; balance: unknown; is_overdue: boolean }[]
    >(Prisma.sql`
      SELECT "total", "allocated", "balance", "is_overdue"
      FROM "invoice_balances"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "invoice_id" = ${invoiceId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException('Invoice not found.');
    }
    return {
      total: new Prisma.Decimal(String(row.total)),
      allocated: new Prisma.Decimal(String(row.allocated)),
      balance: new Prisma.Decimal(String(row.balance)),
      isOverdue: row.is_overdue,
    };
  }

  /** How many of the invoice's allocations belong to payments with no reversal. */
  private async activeAllocationCount(
    tx: TransactionClient,
    organizationId: string,
    invoiceId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ active: number | bigint }[]>(Prisma.sql`
      SELECT count(*)::int AS "active"
      FROM "payment_allocations" a
      LEFT JOIN "payment_reversals" r
        ON r."organization_id" = a."organization_id"
       AND r."payment_id" = a."payment_id"
      WHERE a."organization_id" = ${organizationId}::uuid
        AND a."invoice_id" = ${invoiceId}::uuid
        AND r."id" IS NULL
    `);
    return Number(rows[0]?.active ?? 0);
  }

  /** Builds the full invoice payload from its row. Joins the ambient transaction. */
  private async invoiceDetail(
    tx: TransactionClient,
    organizationId: string,
    invoice: InvoiceRowState,
  ): Promise<InvoiceDetailResponse> {
    const [orderNumbers, names, lines, allocations, balance] = await Promise.all([
      this.sales.readOrderNumbers(tx, organizationId, [invoice.salesOrderId]),
      this.contacts.findNames(organizationId, [invoice.customerId]),
      // Lines carry the order's source order in `sequence`: created_at is the
      // transaction timestamp for every line of one invoice, and sorting the
      // ties by id would order them by random UUID.
      tx.invoiceLine.findMany({
        where: { organizationId, invoiceId: invoice.id },
        orderBy: [{ sequence: 'asc' }],
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: { select: { sku: true, name: true } },
        },
      }),
      tx.paymentAllocation.findMany({
        where: { organizationId, invoiceId: invoice.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          paymentId: true,
          amount: true,
          payment: {
            select: {
              number: true,
              paymentDate: true,
              reversal: { select: { id: true } },
            },
          },
        },
      }),
      this.readBalance(tx, organizationId, invoice.id),
    ]);

    return {
      id: invoice.id,
      number: invoice.number,
      orderId: invoice.salesOrderId,
      orderNumber: orderNumbers.get(invoice.salesOrderId) ?? '',
      customerId: invoice.customerId,
      customerName: names[0]?.name ?? '',
      status: invoice.status,
      issueDate: toDateString(invoice.issueDate),
      dueDate: toDateString(invoice.dueDate),
      lines: lines.map(
        (line): InvoiceLineResponse => ({
          id: line.id,
          productId: line.productId,
          productSku: line.product.sku,
          productName: line.product.name,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(4),
          lineTotal: line.lineTotal.toFixed(2),
        }),
      ),
      total: invoice.total.toFixed(2),
      paid: balance.allocated.toFixed(2),
      balance: balance.balance.toFixed(2),
      isOverdue: balance.isOverdue,
      voidReason: invoice.voidReason,
      voidedAt: invoice.voidedAt?.toISOString() ?? null,
      voidedBy: invoice.voidedById,
      version: invoice.version,
      label: INVOICE_LABEL,
      paymentsApplied: allocations.map(
        (allocation): PaymentAppliedResponse => ({
          allocationId: allocation.id,
          paymentId: allocation.paymentId,
          paymentNumber: allocation.payment.number,
          paymentDate: toDateString(allocation.payment.paymentDate)!,
          amount: allocation.amount.toFixed(2),
          reversed: allocation.payment.reversal !== null,
        }),
      ),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }

  /** Builds the full payment payload from its row. Joins the ambient transaction. */
  private async paymentDetail(
    tx: TransactionClient,
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentDetailResponse> {
    const payment = await tx.payment.findUnique({
      where: { organizationId_id: { organizationId, id: paymentId } },
      select: {
        id: true,
        number: true,
        customerId: true,
        amount: true,
        paymentDate: true,
        method: true,
        reference: true,
        recordedById: true,
        recordedAt: true,
        reversal: { select: { reason: true, reversedAt: true, reversedById: true } },
        allocations: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            invoiceId: true,
            amount: true,
            invoice: { select: { number: true } },
          },
        },
      },
    });
    if (payment === null) {
      throw new NotFoundException('Payment not found.');
    }

    const [customer] = await this.contacts.findNames(organizationId, [payment.customerId]);

    return {
      id: payment.id,
      number: payment.number,
      customerId: payment.customerId,
      customerName: customer?.name ?? '',
      amount: payment.amount.toFixed(2),
      paymentDate: toDateString(payment.paymentDate)!,
      method: payment.method,
      reference: payment.reference,
      status: payment.reversal === null ? 'RECORDED' : 'REVERSED',
      allocations: payment.allocations.map(
        (allocation): PaymentAllocationResponse => ({
          id: allocation.id,
          invoiceId: allocation.invoiceId,
          invoiceNumber: allocation.invoice.number,
          amount: allocation.amount.toFixed(2),
          reversed: payment.reversal !== null,
        }),
      ),
      reversal:
        payment.reversal === null
          ? null
          : {
              reason: payment.reversal.reason,
              reversedAt: payment.reversal.reversedAt.toISOString(),
              reversedBy: payment.reversal.reversedById,
            },
      recordedBy: payment.recordedById,
      recordedAt: payment.recordedAt.toISOString(),
    };
  }

  /**
   * Resolves the due date at issue (research D-004).
   *
   * The request value wins; otherwise the due date the draft kept is carried
   * in; otherwise the issue date plus the organization's default terms.
   * Either explicit value must not precede the issue date.
   */
  private async resolveIssueDueDate(
    organizationId: string,
    invoice: InvoiceRowState,
    dto: IssueInvoiceDto,
    issueDate: Date,
  ): Promise<Date> {
    if (dto.dueDate !== undefined) {
      const requested = parseDate(dto.dueDate);
      if (requested.getTime() < issueDate.getTime()) {
        throw dueDateBeforeIssue();
      }
      return requested;
    }
    if (invoice.dueDate !== null) {
      if (invoice.dueDate.getTime() < issueDate.getTime()) {
        throw dueDateBeforeIssue();
      }
      return invoice.dueDate;
    }
    const terms = await this.organizations.getDefaultPaymentTermsDays(organizationId);
    return addDays(issueDate, terms);
  }
}

// -------------------------------------------------------------------------
// The invoice row, as every write and read of this service needs it
// -------------------------------------------------------------------------

interface InvoiceRowState {
  readonly id: string;
  readonly number: string | null;
  readonly salesOrderId: string;
  readonly customerId: string;
  readonly status: string;
  readonly issueDate: Date | null;
  readonly dueDate: Date | null;
  readonly total: Prisma.Decimal;
  readonly voidReason: string | null;
  readonly voidedAt: Date | null;
  readonly voidedById: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const INVOICE_ROW_SELECT = {
  id: true,
  number: true,
  salesOrderId: true,
  customerId: true,
  status: true,
  issueDate: true,
  dueDate: true,
  total: true,
  voidReason: true,
  voidedAt: true,
  voidedById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * A list row exactly as `to_jsonb` hands it back. The aliases in the list
 * statement are already the response keys; the two payment timestamps come
 * back as JSON strings and are normalized to ISO 8601 in the service.
 */
type RawInvoiceRow = InvoiceRowResponse;
type RawOpenInvoiceRow = OpenInvoiceResponse;
type RawPaymentRow = Omit<PaymentRowResponse, 'reversedAt' | 'recordedAt'> & {
  readonly reversedAt: string | null;
  readonly recordedAt: string;
};

// -------------------------------------------------------------------------
// List queries: the caller chooses a KEY, never a column
// -------------------------------------------------------------------------

/** The invoice list sort column, as SQL. */
function invoiceSortKey(sortBy: ListInvoicesDto['sortBy']): string {
  switch (sortBy) {
    case 'number':
      return 'i."number"';
    case 'status':
      return 'i."status"';
    case 'issueDate':
      return 'i."issue_date"';
    case 'dueDate':
      return 'i."due_date"';
    case 'customerName':
      return 'c."name"';
    case 'createdAt':
    default:
      return 'i."created_at"';
  }
}

/** The payment list sort key, as SQL. `status` is the derived reversal state. */
function paymentSortKey(sortBy: ListPaymentsDto['sortBy']): string {
  switch (sortBy) {
    case 'number':
      return 'p."number"';
    case 'customerName':
      return 'c."name"';
    case 'method':
      return 'p."method"';
    case 'status':
      return `CASE WHEN r."id" IS NULL THEN 'RECORDED' ELSE 'REVERSED' END`;
    case 'paymentDate':
    default:
      return 'p."payment_date"';
  }
}

/** Turns a search term into an ILIKE pattern with `%`, `_` and `\` literal. */
function escapeLike(term: string): string {
  return `%${term.replace(/([\\%_])/g, '\\$1')}%`;
}

// -------------------------------------------------------------------------
// Dates
// -------------------------------------------------------------------------

/** A calendar date (`YYYY-MM-DD`) as midnight UTC, the way the column holds it. */
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today as midnight UTC - the issue date and the overdue boundary. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// -------------------------------------------------------------------------
// Refusals
// -------------------------------------------------------------------------

function validationError(field: string, code: string, message: string): AppException {
  return new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field, code, message }], message);
}

function invoiceAlreadyExists(): AppException {
  return new AppException(
    ERROR_CODES.INVOICE_ALREADY_EXISTS,
    [
      {
        field: 'salesOrderId',
        code: 'INVOICE_ALREADY_EXISTS',
        message: 'This order already has an invoice. Void it before creating another.',
      },
    ],
    'This order already has an invoice. Void it before creating another.',
  );
}

function paymentAlreadyReversed(): AppException {
  return new AppException(
    ERROR_CODES.INVALID_STATE_TRANSITION,
    [
      {
        field: 'status',
        code: 'INVALID_STATE_TRANSITION',
        message: 'This payment has already been reversed.',
      },
    ],
    'This payment has already been reversed.',
  );
}

function invoiceHasPayments(): AppException {
  return new AppException(
    ERROR_CODES.INVOICE_HAS_PAYMENTS,
    [
      {
        field: 'status',
        code: 'INVOICE_HAS_PAYMENTS',
        message: 'This invoice has payments against it. Reverse the payments first.',
      },
    ],
    'This invoice has payments against it. Reverse the payments first.',
  );
}

function dueDateBeforeCreation(): AppException {
  return new AppException(
    ERROR_CODES.VALIDATION_ERROR,
    [
      {
        field: 'dueDate',
        code: 'DUE_DATE_BEFORE_CREATION',
        message: 'The due date may not precede the invoice creation date.',
      },
    ],
    'The due date may not precede the invoice creation date.',
  );
}

function dueDateBeforeIssue(): AppException {
  return new AppException(
    ERROR_CODES.VALIDATION_ERROR,
    [
      {
        field: 'dueDate',
        code: 'DUE_DATE_BEFORE_ISSUE',
        message: 'The due date may not precede the issue date.',
      },
    ],
    'The due date may not precede the issue date.',
  );
}

function staleVersion(current: number): AppException {
  return new AppException(
    ERROR_CODES.STALE_VERSION,
    [
      {
        field: 'version',
        code: 'STALE_VERSION',
        message: `This invoice has changed since you opened it (it is now version ${current}). Reload it and try again.`,
      },
    ],
    'This invoice changed since you opened it. Reload it and try again.',
  );
}

function invalidTransition(status: string, action: string): AppException {
  return new AppException(
    ERROR_CODES.INVALID_STATE_TRANSITION,
    [
      {
        field: 'status',
        code: 'INVALID_STATE_TRANSITION',
        message: `A ${status} invoice cannot be ${action}.`,
      },
    ],
    'This action is not available while the invoice is in its current state.',
  );
}

function balanceChanged(invoiceId: string, currentBalance: string): AppException {
  // The contract names the invoice and its current balance in the details so
  // the screen can tell the user which row to reload; the shared detail shape
  // stays three fields, so the two domain keys are carried as an extension.
  const detail: ErrorDetail & { invoiceId: string; currentBalance: string } = {
    field: 'allocations',
    code: 'BALANCE_CHANGED',
    message: `The balance of this invoice changed since you read it (it is now ${currentBalance}). Reload and try again.`,
    invoiceId,
    currentBalance,
  };
  return new AppException(
    ERROR_CODES.BALANCE_CHANGED,
    [detail],
    'An invoice balance changed since you opened it. Reload and try again.',
  );
}

function overAllocation(invoiceId: string, currentBalance: string): AppException {
  const detail: ErrorDetail & { invoiceId: string; currentBalance: string } = {
    field: 'allocations',
    code: 'OVER_ALLOCATION',
    message: `The allocation exceeds the invoice balance of ${currentBalance}.`,
    invoiceId,
    currentBalance,
  };
  return new AppException(
    ERROR_CODES.OVER_ALLOCATION,
    [detail],
    'An allocation exceeds the invoice balance.',
  );
}

function allocationSumMismatch(): AppException {
  return new AppException(
    ERROR_CODES.VALIDATION_ERROR,
    [
      {
        field: 'allocations',
        code: 'ALLOCATION_SUM_MISMATCH',
        message: 'The allocations must equal the payment amount exactly.',
      },
    ],
    'The allocations must equal the payment amount exactly.',
  );
}

function duplicateAllocationInvoice(): AppException {
  return new AppException(
    ERROR_CODES.VALIDATION_ERROR,
    [
      {
        field: 'allocations',
        code: 'DUPLICATE_ALLOCATION_INVOICE',
        message: 'A payment allocates to each invoice at most once.',
      },
    ],
    'A payment allocates to each invoice at most once.',
  );
}

/** Prisma's unique-violation code: the partial index or a composite key refused a duplicate. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
