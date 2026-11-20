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

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';
import { PurchasingModule } from '../../common/guards/purchasing-module.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { PurchasingService } from './purchasing.service';
import {
  createPurchaseOrderSchema,
  type CreatePurchaseOrderDto,
  updatePurchaseOrderSchema,
  type UpdatePurchaseOrderDto,
} from './dto/create-purchase-order.dto';
import {
  purchaseOrderActionSchema,
  type PurchaseOrderActionDto,
} from './dto/purchase-order-action.dto';
import { receiveGoodsSchema, type ReceiveGoodsDto } from './dto/receive-goods.dto';
import {
  listPurchaseOrdersSchema,
  type ListPurchaseOrdersDto,
} from './dto/list-purchase-orders.dto';
import {
  listGoodsReceiptsSchema,
  type ListGoodsReceiptsDto,
} from './dto/list-goods-receipts.dto';

/**
 * The purchase order endpoints.
 *
 * Reads need `purchasing.read` and the order writes need `purchasing.write`.
 * A record of another organization is answered as "not found" - its existence
 * is not disclosed.
 *
 * Every endpoint also declares the Purchasing module gate, the one place
 * where the module-disabled check will live when the Organization settings
 * feature arrives.
 */
@ApiTags('Purchasing')
@Controller()
@UseGuards(ModuleGuard)
export class PurchasingController {
  constructor(private readonly service: PurchasingService) {}

  @Get('purchase-orders')
  @PurchasingModule()
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'List purchase orders with search, filters, sorting and paging' })
  @ApiResponse({ status: 200, description: 'The matching orders, with the progress summary and the total' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires purchasing.read)' })
  async listOrders(
    @Query(new ZodValidationPipe(listPurchaseOrdersSchema, 'query')) query: ListPurchaseOrdersDto,
  ) {
    return this.service.listOrders(requireOrganizationId(), query);
  }

  @Get('goods-receipts')
  @PurchasingModule()
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'List goods receipts, one row per receipt' })
  @ApiResponse({ status: 200, description: 'The matching receipts, with the total count of receipts' })
  @ApiResponse({ status: 400, description: 'The date range ends before it starts' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires purchasing.read)' })
  async listReceipts(
    @Query(new ZodValidationPipe(listGoodsReceiptsSchema, 'query')) query: ListGoodsReceiptsDto,
  ) {
    return this.service.listReceipts(requireOrganizationId(), query);
  }

  @Get('purchase-orders/:id')
  @PurchasingModule()
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'Read one purchase order with its lines and its receipt history' })
  @ApiParam({ name: 'id', description: 'Purchase order UUID' })
  @ApiResponse({ status: 200, description: 'The order, its lines and its receipts' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires purchasing.read)' })
  @ApiResponse({ status: 404, description: 'Not found, including another organization\'s order' })
  async findOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOrder(requireOrganizationId(), id);
  }

  @Post('purchase-orders')
  @PurchasingModule()
  @RequirePermission('purchasing.write')
  @ApiOperation({ summary: 'Create a purchase order as a draft' })
  @ApiResponse({ status: 201, description: 'The created draft' })
  @ApiResponse({ status: 400, description: 'The content does not belong on an order' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires purchasing.write)' })
  async createOrder(
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderDto,
  ) {
    return this.service.createOrder(requireOrganizationId(), requireUserId(), body);
  }

  @Put('purchase-orders/:id')
  @PurchasingModule()
  @RequirePermission('purchasing.write')
  @ApiOperation({ summary: 'Edit a draft purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order UUID' })
  @ApiResponse({ status: 200, description: 'The updated draft' })
  @ApiResponse({ status: 409, description: 'The order is not a draft, or the version is stale' })
  async updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: UpdatePurchaseOrderDto,
  ) {
    return this.service.updateOrder(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('purchase-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @PurchasingModule()
  @RequirePermission('purchasing.write')
  @ApiOperation({ summary: 'Confirm a draft purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order UUID' })
  @ApiResponse({ status: 200, description: 'The confirmed order' })
  @ApiResponse({ status: 400, description: 'The draft has no lines' })
  @ApiResponse({ status: 409, description: 'The order is not a draft, or the version is stale' })
  async confirmOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(purchaseOrderActionSchema)) body: PurchaseOrderActionDto,
  ) {
    return this.service.confirmOrder(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('purchase-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @PurchasingModule()
  @RequirePermission('purchasing.write')
  @ApiOperation({ summary: 'Cancel a purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order UUID' })
  @ApiResponse({ status: 200, description: 'The cancelled order' })
  @ApiResponse({ status: 409, description: 'The order has receipts, or the version is stale' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(purchaseOrderActionSchema)) body: PurchaseOrderActionDto,
  ) {
    return this.service.cancelOrder(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('purchase-orders/:id/receipts')
  @PurchasingModule()
  @RequirePermission('inventory.receive')
  @ApiOperation({ summary: 'Post a goods receipt against a purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order UUID' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A key generated per user action' })
  @ApiResponse({ status: 201, description: 'The posted receipt and the resulting order' })
  @ApiResponse({ status: 400, description: 'Nothing was received, or a quantity is above the outstanding one' })
  @ApiResponse({ status: 409, description: 'The order cannot be received against' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async postReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(receiveGoodsSchema)) body: ReceiveGoodsDto,
  ) {
    return this.service.postReceipt(
      requireOrganizationId(),
      requireUserId(),
      id,
      idempotencyKey ?? '',
      body,
    );
  }
}
