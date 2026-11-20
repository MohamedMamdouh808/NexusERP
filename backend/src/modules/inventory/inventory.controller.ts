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
import { RequireModule } from '../../common/guards/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';
import { InventoryService } from './inventory.service';
import { createAdjustmentSchema, type CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { listStockBalancesSchema, type ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { listStockMovementsSchema, type ListStockMovementsDto } from './dto/list-stock-movements.dto';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseStateSchema,
  type CreateWarehouseDto,
  type UpdateWarehouseDto,
  type WarehouseStateDto,
} from './dto/warehouse.dto';

/**
 * The inventory endpoints.
 *
 * Reads need `inventory.read`, warehouse changes need `inventory.write`, and a
 * stock adjustment needs `inventory.adjust`. A record of another organization is
 * answered as "not found" - its existence is not disclosed.
 */
@ApiTags('Inventory')
@Controller()
@UseGuards(ModuleGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('inventory/stock-balances')
  @RequireModule('inventory')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock balances with search, filters, sorting and paging' })
  @ApiResponse({ status: 200, description: 'The matching balances, with the total and its kind' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires inventory.read)' })
  async listBalances(
    @Query(new ZodValidationPipe(listStockBalancesSchema, 'query')) query: ListStockBalancesDto,
  ) {
    return this.service.listBalances(requireOrganizationId(), query);
  }

  @Get('inventory/stock-movements')
  @RequireModule('inventory')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock movements with product, warehouse, type and date filters' })
  @ApiResponse({ status: 200, description: 'The matching movements, with the total count' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires inventory.read)' })
  async listMovements(
    @Query(new ZodValidationPipe(listStockMovementsSchema, 'query')) query: ListStockMovementsDto,
  ) {
    return this.service.listMovements(requireOrganizationId(), query);
  }

  @Post('inventory/adjustments')
  @RequireModule('inventory')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Post a stock adjustment with a reason' })
  @ApiParam({ name: 'Idempotency-Key', description: 'A UUID generated per user action' })
  @ApiResponse({ status: 201, description: 'The posted movement and the new balance' })
  @ApiResponse({ status: 409, description: 'The result would be negative or below the reserved quantity' })
  @ApiResponse({ status: 422, description: 'The key was already used for a different request' })
  async createAdjustment(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createAdjustmentSchema)) body: CreateAdjustmentDto,
  ) {
    return this.service.postAdjustment(
      requireOrganizationId(),
      requireUserId(),
      idempotencyKey ?? '',
      body,
    );
  }

  @Get('warehouses')
  @RequireModule('inventory')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List the organization warehouses' })
  @ApiResponse({ status: 200, description: 'The warehouses, with their default and active state' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires inventory.read)' })
  async listWarehouses() {
    return this.service.listWarehouses(requireOrganizationId());
  }

  @Post('warehouses')
  @RequireModule('inventory')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Create a warehouse' })
  @ApiResponse({ status: 201, description: 'The created warehouse' })
  @ApiResponse({ status: 409, description: 'The name is already used in this organization' })
  async createWarehouse(
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseDto,
  ) {
    return this.service.createWarehouse(requireOrganizationId(), requireUserId(), body);
  }

  @Put('warehouses/:id')
  @RequireModule('inventory')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Rename a warehouse, and make it the default' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'The updated warehouse' })
  @ApiResponse({ status: 409, description: 'The name is taken, or the version is stale' })
  async updateWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseDto,
  ) {
    return this.service.updateWarehouse(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('warehouses/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequireModule('inventory')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Deactivate a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'The deactivated warehouse' })
  @ApiResponse({ status: 409, description: 'It is the default warehouse, or it still holds stock' })
  async deactivateWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(warehouseStateSchema)) body: WarehouseStateDto,
  ) {
    return this.service.deactivateWarehouse(requireOrganizationId(), requireUserId(), id, body);
  }

  @Post('warehouses/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequireModule('inventory')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Reactivate a deactivated warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'The reactivated warehouse' })
  @ApiResponse({ status: 409, description: 'The version is stale' })
  async reactivateWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(warehouseStateSchema)) body: WarehouseStateDto,
  ) {
    return this.service.reactivateWarehouse(requireOrganizationId(), requireUserId(), id, body);
  }
}
