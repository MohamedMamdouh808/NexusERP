import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequireModule } from '../../common/guards/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import {
  requireOrganizationId,
} from '../../common/logging/request-context';
import { ReportsService } from './reports.service';
import {
  stockOnHandQuerySchema,
  stockMovementsQuerySchema,
  outstandingInvoicesQuerySchema,
  documentStatusesQuerySchema,
  type StockOnHandQuery,
  type StockMovementsQuery,
  type OutstandingInvoicesQuery,
  type DocumentStatusesQuery,
} from './dto/reports.dto';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';

@Controller('reports')
@UseGuards(ModuleGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('stock-on-hand')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async stockOnHand(@Query(new ZodValidationPipe(stockOnHandQuerySchema)) q: StockOnHandQuery) {
    return this.service.stockOnHand(requireOrganizationId(), q);
  }

  @Get('stock-movements')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async stockMovements(@Query(new ZodValidationPipe(stockMovementsQuerySchema)) q: StockMovementsQuery) {
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.stockMovements(requireOrganizationId(), q);
  }

  @Get('outstanding-invoices')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async outstandingInvoices(@Query(new ZodValidationPipe(outstandingInvoicesQuerySchema)) q: OutstandingInvoicesQuery) {
    if (q.dueFrom && q.dueTo && new Date(q.dueTo) < new Date(q.dueFrom)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'dueTo', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.outstandingInvoices(requireOrganizationId(), q);
  }

  @Get('document-statuses')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async documentStatuses(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: DocumentStatusesQuery) {
    return this.service.documentStatuses(requireOrganizationId(), q);
  }

  @Get('kpi-summary')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async kpiSummary(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    return this.service.kpiSummary(requireOrganizationId(), q);
  }

  @Get('sales-over-time')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async salesOverTime(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.salesOverTime(requireOrganizationId(), q);
  }

  @Get('purchases-over-time')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async purchasesOverTime(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.purchasesOverTime(requireOrganizationId(), q);
  }

  @Get('payments-received-over-time')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async paymentsReceivedOverTime(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.paymentsReceivedOverTime(requireOrganizationId(), q);
  }

  @Get('top-products')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async topProducts(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    return this.service.topProducts(requireOrganizationId(), q);
  }

  @Get('sales-by-category')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async salesByCategory(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    if (q.start && q.end && new Date(q.end) < new Date(q.start)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, [{ field: 'end', code: 'VALIDATION_ERROR', message: 'End date may not be before start date.' }]);
    }
    return this.service.salesByCategory(requireOrganizationId(), q);
  }

  @Get('top-customers')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async topCustomers(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    return this.service.topCustomers(requireOrganizationId(), q);
  }

  @Get('documents-by-status')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async documentsByStatus(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    return this.service.documentStatuses(requireOrganizationId(), q);
  }

  @Get('receivables-aging')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async receivablesAging() {
    return this.service.receivablesAging(requireOrganizationId());
  }

  @Get('stock-health')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async stockHealth() {
    return this.service.stockHealth(requireOrganizationId());
  }

  @Get('stock-movements-over-time')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async stockMovementsOverTime(@Query(new ZodValidationPipe(documentStatusesQuerySchema)) q: any) {
    return this.service.stockMovementsOverTime(requireOrganizationId(), q);
  }

  @Get('stock-reconciliation')
  @RequireModule('reports')
  @RequirePermission('reports.read')
  async stockReconciliation() {
    return this.service.stockReconciliation(requireOrganizationId());
  }
}