import { Module } from '@nestjs/common';

import {
  ProductCategoriesController,
  ProductsController,
  UnitsOfMeasureController,
} from './products.controller';
import { ProductsService } from './products.service';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';

/**
 * The product catalogue.
 *
 * The usage check is a seam: the products module asks whether a product is
 * still referenced, and the inventory feature answers it - a product with
 * reserved stock cannot be archived. The products module reads no stock table
 * of its own (Constitution Principle VI).
 */
@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [ProductsController, ProductCategoriesController, UnitsOfMeasureController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
