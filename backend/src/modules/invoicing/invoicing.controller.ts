import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';
import { InvoicingModule } from '../../common/guards/invoicing-module.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { InvoicingService } from './invoicing.service';
import { createInvoiceSchema, type CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  listInvoicesSchema,
  listOpenInvoicesSchema,
  type ListInvoicesDto,
  type ListOpenInvoicesDto,
} from './dto/list-invoices.dto';
import { listPaymentsSchema, type ListPaymentsDto } from './dto/list-payments.dto';
import { updateInvoiceSchema, type UpdateInvoiceDto } from './dto/update-invoice.dto';
import { issueInvoiceSchema, type IssueInvoiceDto } from './dto/issue-invoice.dto';
import { voidInvoiceSchema, type VoidInvoiceDto } from './dto/void-invoice.dto';
import { recordPaymentSchema, type RecordPaymentDto } from './dto/record-payment.dto';
import { reversePaymentSchema, type ReversePaymentDto } from './dto/reverse-payment.dto';

/**
 * The invoicing and payments endpoints.
 *
 * Reads need `invoices.read`/`payments.read`; the writes need the matching
 * permission of the action, and issue, void, record and reverse additionally
 * require an `Idempotency-Key` header. A record of another organization is
 * answered as "not found" - its existence is not disclosed.
 *
 * Every endpoint declares the Invoicing module gate (via `@InvoicingModule()`
 * on the route), the one place where the module-disabled check will live when
 * the Organization settings feature arrives. The endpoints arrive with the
 * user stories; the guard wiring is complete here so a route added later
 * cannot forget it.
 */
@ApiTags('Invoicing')
@Controller()
@UseGuards(SessionGuard, ModuleGuard)
export class InvoicingController {
  constructor(private readonly service: InvoicingService) {}

  @Post('sales-orders/:id/invoices')
  @HttpCode(HttpStatus.CREATED)
  @InvoicingModule()
  @RequirePermission('invoices.write')
  @ApiOperation({ summary: 'Create the draft invoice of a shipped sales order' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiResponse({ status: 201, description: 'The created draft invoice' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  @ApiResponse({ status: 409, description: 'The order is not shipped, or it already has a non-void invoice' })
  async createInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) _body: CreateInvoiceDto,
  ) {
    return this.service.createInvoice(requireOrganizationId(), requireUserId(), id);
  }

  @Get('invoices')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.read')
  @ApiOperation({ summary: 'List the organization\'s invoices with their selection figures' })
  @ApiResponse({ status: 200, description: 'A page of invoices, the whole-selection total, outstanding and overdue' })
  @ApiResponse({ status: 400, description: 'An unknown sort key, or a malformed query' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.read)' })
  async listInvoices(
    @Query(new ZodValidationPipe(listInvoicesSchema, 'query')) query: ListInvoicesDto,
  ) {
    return this.service.listInvoices(requireOrganizationId(), query);
  }

  @Get('invoices/open')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.read')
  @ApiOperation({ summary: 'List one customer\'s open invoices for the Record payment screen' })
  @ApiResponse({ status: 200, description: 'ISSUED or PARTIALLY_PAID invoices with a balance above zero' })
  @ApiResponse({ status: 400, description: 'The customer id is missing or malformed' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.read)' })
  @ApiResponse({ status: 404, description: 'The customer is not in this organization' })
  async listOpenInvoices(
    @Query(new ZodValidationPipe(listOpenInvoicesSchema, 'query')) query: ListOpenInvoicesDto,
  ) {
    return this.service.listOpenInvoices(requireOrganizationId(), query.customerId);
  }

  @Get('invoices/:id')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.read')
  @ApiOperation({ summary: 'Read one invoice with its lines, allocations and void trail' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'The invoice' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.read)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s invoice' })
  async getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getInvoiceDetail(requireOrganizationId(), id);
  }

  @Put('invoices/:id')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.write')
  @ApiOperation({ summary: 'Update a draft invoice\'s due date' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'The updated draft' })
  @ApiResponse({ status: 400, description: 'The due date precedes the creation date' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s invoice' })
  @ApiResponse({ status: 409, description: 'The invoice is not a draft, or the version is stale' })
  async updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) body: UpdateInvoiceDto,
  ) {
    return this.service.updateInvoiceDraft(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('invoices/:id/issue')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.issue')
  @ApiOperation({ summary: 'Issue a draft invoice, allocating its INV- number' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 200, description: 'The issued invoice' })
  @ApiResponse({ status: 400, description: 'The due date precedes the issue date, or the key is missing' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.issue)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s invoice' })
  @ApiResponse({ status: 409, description: 'The invoice is not a draft' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async issueInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(issueInvoiceSchema)) body: IssueInvoiceDto,
  ) {
    if (!idempotencyKey) {
      throw new AppException(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        [
          {
            field: 'Idempotency-Key',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'This request must carry an Idempotency-Key header.',
          },
        ],
        'This request must carry an Idempotency-Key header.',
      );
    }
    return this.service.issueInvoice(requireOrganizationId(), requireUserId(), id, body, idempotencyKey);
  }

  @Post('invoices/:id/void')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('invoices.void')
  @ApiOperation({ summary: 'Void an invoice, freeing its order for re-invoicing' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 200, description: 'The voided invoice' })
  @ApiResponse({ status: 400, description: 'The reason is missing' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires invoices.void)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s invoice' })
  @ApiResponse({ status: 409, description: 'The invoice has active payments, or is already void' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(voidInvoiceSchema)) body: VoidInvoiceDto,
  ) {
    if (!idempotencyKey) {
      throw new AppException(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        [
          {
            field: 'Idempotency-Key',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'This request must carry an Idempotency-Key header.',
          },
        ],
        'This request must carry an Idempotency-Key header.',
      );
    }
    return this.service.voidInvoice(requireOrganizationId(), requireUserId(), id, body, idempotencyKey);
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  @InvoicingModule()
  @RequirePermission('payments.record')
  @ApiOperation({ summary: 'Record a payment and allocate it across open invoices' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 201, description: 'The recorded payment with its allocations' })
  @ApiResponse({
    status: 400,
    description: 'A bad amount or date, allocations that do not sum to the amount, a duplicate invoice, or an allocation above the balance',
  })
  @ApiResponse({ status: 403, description: 'Forbidden (requires payments.record)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s invoice' })
  @ApiResponse({ status: 409, description: 'An invoice is not payable, or its balance changed since it was read' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async recordPayment(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentDto,
  ) {
    if (!idempotencyKey) {
      throw new AppException(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        [
          {
            field: 'Idempotency-Key',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'This request must carry an Idempotency-Key header.',
          },
        ],
        'This request must carry an Idempotency-Key header.',
      );
    }
    return this.service.recordPayment(requireOrganizationId(), requireUserId(), body, idempotencyKey);
  }

  @Get('payments')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'List the organization\'s payments with their derived status' })
  @ApiResponse({ status: 200, description: 'A page of payments and the whole-selection total' })
  @ApiResponse({ status: 400, description: 'An unknown sort key, an unknown method, or an inverted date range' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires payments.read)' })
  async listPayments(
    @Query(new ZodValidationPipe(listPaymentsSchema, 'query')) query: ListPaymentsDto,
  ) {
    return this.service.listPayments(requireOrganizationId(), query);
  }

  @Get('payments/:id')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'Read one payment with its allocations and its reversal block' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'The payment' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires payments.read)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s payment' })
  async getPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPaymentDetail(requireOrganizationId(), id);
  }

  @Post('payments/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @InvoicingModule()
  @RequirePermission('payments.reverse')
  @ApiOperation({ summary: 'Reverse a payment with a compensating, auditable record' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 200, description: 'The payment detail with status REVERSED' })
  @ApiResponse({ status: 400, description: 'The reason is missing, or the key is missing' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires payments.reverse)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s payment' })
  @ApiResponse({ status: 409, description: 'The payment has already been reversed' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async reversePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: ReversePaymentDto,
  ) {
    if (!idempotencyKey) {
      throw new AppException(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        [
          {
            field: 'Idempotency-Key',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'This request must carry an Idempotency-Key header.',
          },
        ],
        'This request must carry an Idempotency-Key header.',
      );
    }
    return this.service.reversePayment(requireOrganizationId(), requireUserId(), id, body, idempotencyKey);
  }
}
