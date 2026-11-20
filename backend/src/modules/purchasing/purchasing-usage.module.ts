import { Module } from '@nestjs/common';

import { PurchasingUsageService } from './purchasing-usage.service';

/**
 * The reverse answers: which open purchase order references this product,
 * supplier or warehouse.
 *
 * This module is deliberately tiny and depends on nothing but the platform, so
 * that the Inventory module and the Contacts module can ask it without a
 * circular import. The Purchasing module itself depends on the Inventory
 * service (a receipt posts a movement), so an import in the other direction
 * would be a cycle - which the constitution forbids.
 */
@Module({
  providers: [PurchasingUsageService],
  exports: [PurchasingUsageService],
})
export class PurchasingUsageModule {}
