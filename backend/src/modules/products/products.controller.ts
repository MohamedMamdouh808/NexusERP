import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';
import { ProductsService } from './products.service';
import { createProductSchema, type CreateProductDto } from './dto/create-product.dto';
import { updateProductSchema, type UpdateProductDto } from './dto/update-product.dto';
import { listProductsSchema, type ListProductsDto } from './dto/list-products.dto';
import { createCategorySchema, type CreateCategoryDto } from './dto/create-category.dto';
import { createUnitSchema, type CreateUnitDto } from './dto/create-unit.dto';
import { ProductResponseDto } from './dto/product-response.dto';

/**
 * The product catalogue endpoints.
 *
 * Reads need `products.read`, changes need `products.write`, and a record of
 * another organization is answered as "not found" - its existence is not
 * disclosed.
 */
@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @RequirePermission('products.read')
  @ApiOperation({ summary: 'List products with search, filters, sorting and paging' })
  @ApiResponse({ status: 200, description: 'The matching products, with the total count' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.read)' })
  async list(@Query(new ZodValidationPipe(listProductsSchema, 'query')) query: ListProductsDto) {
    return this.service.list(requireOrganizationId(), query);
  }

  @Get(':id')
  @RequirePermission('products.read')
  @ApiOperation({ summary: 'Get a product by id' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'The product', type: ProductResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.read)' })
  @ApiResponse({ status: 404, description: 'Product not found or cross-tenant' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(requireOrganizationId(), id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Create a product' })
  @ApiResponse({ status: 201, description: 'The created product', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.write)' })
  @ApiResponse({ status: 409, description: 'The SKU already exists in this organization' })
  async create(@Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto) {
    return this.service.create(requireOrganizationId(), requireUserId(), dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'The updated product', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.write)' })
  @ApiResponse({ status: 404, description: 'Product not found or cross-tenant' })
  @ApiResponse({ status: 409, description: 'Stale version, or the SKU is taken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    return this.service.update(requireOrganizationId(), requireUserId(), id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Archive a product (never deleted)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'The archived product' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.write)' })
  @ApiResponse({ status: 404, description: 'Product not found or cross-tenant' })
  @ApiResponse({ status: 409, description: 'The product is in use' })
  async archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(requireOrganizationId(), requireUserId(), id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Restore an archived product' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'The restored product' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires products.write)' })
  @ApiResponse({ status: 404, description: 'Product not found or cross-tenant' })
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(requireOrganizationId(), requireUserId(), id);
  }
}

/**
 * The category endpoints. Categories are the vocabulary every product is
 * described in, so they are maintained per organization.
 */
@ApiTags('Product categories')
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @RequirePermission('products.read')
  @ApiOperation({ summary: 'List the organization\'s product categories' })
  async list() {
    return this.service.listCategories(requireOrganizationId());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Create a product category' })
  @ApiResponse({ status: 409, description: 'The name already exists in this organization' })
  async create(@Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto) {
    return this.service.createCategory(requireOrganizationId(), requireUserId(), dto);
  }
}

/**
 * The unit of measure endpoints. Every organization starts with a default set.
 */
@ApiTags('Units of measure')
@Controller('units-of-measure')
export class UnitsOfMeasureController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @RequirePermission('products.read')
  @ApiOperation({ summary: 'List the organization\'s units of measure' })
  async list() {
    return this.service.listUnits(requireOrganizationId());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.write')
  @ApiOperation({ summary: 'Create a unit of measure' })
  @ApiResponse({ status: 409, description: 'The name already exists in this organization' })
  async create(@Body(new ZodValidationPipe(createUnitSchema)) dto: CreateUnitDto) {
    return this.service.createUnit(requireOrganizationId(), requireUserId(), dto);
  }
}
