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
import { SalesModule } from '../../common/guards/sales-module.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { SalesService } from './sales.service';
import {
  createSalesOrderSchema,
  type CreateSalesOrderDto,
  updateSalesOrderSchema,
  type UpdateSalesOrderDto,
} from './dto/create-sales-order.dto';
import {
  salesOrderActionSchema,
  type SalesOrderActionDto,
} from './dto/sales-order-action.dto';
import {
  listSalesOrdersSchema,
  type ListSalesOrdersDto,
} from './dto/list-sales-orders.dto';
import {
  listShipmentsSchema,
  type ListShipmentsDto,
} from './dto/list-shipments.dto';
import { shipSalesOrderSchema } from './dto/ship-sales-order.dto';

/**
 * The sales order endpoints.
 *
 * Reads need `sales.read` and the order writes need `sales.write`.
 * Confirming, cancelling and shipping need an `Idempotency-Key` header.
 * A record of another organization is answered as "not found" - its existence
 * is not disclosed.
 *
 * Every endpoint also declares the Sales module gate, the one place where the
 * module-disabled check will live when the Organization settings feature
 * arrives.
 */
@ApiTags('Sales')
@Controller()
@UseGuards(ModuleGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post('sales-orders')
  @HttpCode(HttpStatus.CREATED)
  @SalesModule()
  @RequirePermission('sales.write')
  @ApiOperation({ summary: 'Create a sales order draft' })
  @ApiResponse({ status: 201, description: 'The created draft' })
  @ApiResponse({ status: 400, description: 'The content does not belong on an order' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s customer, product or warehouse' })
  async createOrder(
    @Body(new ZodValidationPipe(createSalesOrderSchema)) body: CreateSalesOrderDto,
  ) {
    return this.service.createOrder(requireOrganizationId(), requireUserId(), body);
  }

  @Put('sales-orders/:id')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.write')
  @ApiOperation({ summary: 'Update a draft sales order' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiResponse({ status: 200, description: 'The updated draft' })
  @ApiResponse({ status: 400, description: 'The content does not belong on an order' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  @ApiResponse({ status: 409, description: 'The order is not a draft, or the version is stale' })
  async updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSalesOrderSchema)) body: UpdateSalesOrderDto,
  ) {
    return this.service.updateOrder(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('sales-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.write')
  @ApiOperation({ summary: 'Confirm a draft sales order, reserving stock' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 200, description: 'The confirmed order' })
  @ApiResponse({ status: 400, description: 'The draft has no lines' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  @ApiResponse({ status: 409, description: 'The order is not a draft, the version is stale, or stock is insufficient' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async confirmOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(salesOrderActionSchema)) body: SalesOrderActionDto,
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
    return this.service.confirmOrder(requireOrganizationId(), requireUserId(), id, idempotencyKey, body);
  }

  @Post('sales-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.write')
  @ApiOperation({ summary: 'Cancel a sales order, releasing its reservations' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 200, description: 'The cancelled order' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.write)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  @ApiResponse({ status: 409, description: 'The order has shipped, or the version is stale' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(salesOrderActionSchema)) body: SalesOrderActionDto,
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
    return this.service.cancelOrder(requireOrganizationId(), requireUserId(), id, idempotencyKey, body);
  }

  @Post('sales-orders/:id/shipments')
  @HttpCode(HttpStatus.CREATED)
  @SalesModule()
  @RequirePermission('inventory.ship')
  @ApiOperation({ summary: 'Ship a confirmed sales order, deducting stock' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 201, description: 'The shipment and the shipped order' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires inventory.ship)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  @ApiResponse({ status: 409, description: 'The order is not a confirmed order with an active reservation per line, or the shipment was already posted' })
  @ApiResponse({ status: 400, description: 'The draft has no lines' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async shipOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(shipSalesOrderSchema)) _body: Record<string, never>,
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
    return this.service.shipOrder(requireOrganizationId(), requireUserId(), id, idempotencyKey);
  }

  @Get('sales-orders')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.read')
  @ApiOperation({ summary: 'List the organization\'s sales orders' })
  @ApiResponse({ status: 200, description: 'A page of sales orders and the whole-selection total' })
  @ApiResponse({ status: 400, description: 'An unknown sort key, or a malformed query' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.read)' })
  async listSalesOrders(
    @Query(new ZodValidationPipe(listSalesOrdersSchema, 'query')) query: ListSalesOrdersDto,
  ) {
    return this.service.listSalesOrders(requireOrganizationId(), query);
  }

  @Get('sales-orders/:id')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.read')
  @ApiOperation({ summary: 'Read one sales order with its lines and shipment history' })
  @ApiParam({ name: 'id', description: 'Sales order UUID' })
  @ApiResponse({ status: 200, description: 'The sales order, its lines and its shipment history' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.read)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  async getSalesOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSalesOrderDetail(requireOrganizationId(), id);
  }

  @Get('shipments')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.read')
  @ApiOperation({ summary: 'List the organization\'s shipments' })
  @ApiResponse({ status: 200, description: 'A page of shipments and the whole-selection total' })
  @ApiResponse({ status: 400, description: 'An unknown sort key, a malformed or inverted date range' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.read)' })
  async listShipments(
    @Query(new ZodValidationPipe(listShipmentsSchema, 'query')) query: ListShipmentsDto,
  ) {
    return this.service.listShipments(requireOrganizationId(), query);
  }

  @Get('shipments/:id')
  @HttpCode(HttpStatus.OK)
  @SalesModule()
  @RequirePermission('sales.read')
  @ApiOperation({ summary: 'Read one shipment with its lines' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({ status: 200, description: 'The shipment and its lines' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires sales.read)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s shipment' })
  async getShipment(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getShipmentDetail(requireOrganizationId(), id);
  }
}
