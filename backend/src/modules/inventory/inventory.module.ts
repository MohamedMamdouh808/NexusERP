import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ModuleGuard } from '../../common/guards/module.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PRODUCTS_USAGE_HOOK } from '../products/products-usage.hook';
import { PurchasingUsageModule } from '../purchasing/purchasing-usage.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LowStockRule } from './low-stock.rule';
import { InventoryProductsUsageProvider } from './products-usage.provider';

/**
 * The inventory: warehouses, stock balances, the movement ledger and the
 * adjustments that change stock.
 *
 * The module owns its tables. It answers the products module's archive check
 * through the existing usage seam rather than letting the products module
 * read the stock tables - and it asks the purchasing module whether a product
 * or a warehouse is still on an open order, so an open order never points at
 * a retired record.
 */
@Module({
  imports: [AuditModule, PurchasingUsageModule, OrganizationsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    LowStockRule,
    ModuleGuard,
    {
      provide: PRODUCTS_USAGE_HOOK,
      useClass: InventoryProductsUsageProvider,
    },
  ],
  exports: [InventoryService, LowStockRule, PRODUCTS_USAGE_HOOK],
})
export class InventoryModule {}
