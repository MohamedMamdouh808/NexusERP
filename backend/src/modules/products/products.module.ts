import { Module } from '@nestjs/common';
import {
  ProductCategoriesController,
  ProductsController,
  UnitsOfMeasureController,
} from './products.controller';
import { ProductsService } from './products.service';
import { PRODUCTS_USAGE_HOOK, DefaultProductsUsageHook } from './products-usage.hook';
import { AuditModule } from '../audit/audit.module';

/**
 * The product catalogue.
 *
 * The usage check is a seam: the default provider reports that nothing is in
 * use, and the purchasing, sales and inventory features replace it with one
 * that checks their open documents and reserved stock.
 */
@Module({
  imports: [AuditModule],
  controllers: [ProductsController, ProductCategoriesController, UnitsOfMeasureController],
  providers: [
    ProductsService,
    {
      provide: PRODUCTS_USAGE_HOOK,
      useClass: DefaultProductsUsageHook,
    },
  ],
  exports: [ProductsService, PRODUCTS_USAGE_HOOK],
})
export class ProductsModule {}
