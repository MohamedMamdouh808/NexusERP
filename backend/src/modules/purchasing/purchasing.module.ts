import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProductsModule } from '../products/products.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { PurchasingUsageModule } from './purchasing-usage.module';

/**
 * The purchasing module: purchase orders, order lines, goods receipts and
 * receipt lines.
 *
 * The module owns its tables. It asks the Contacts, Products and Inventory
 * modules to validate and lock the records it references, and it asks the
 * Inventory service to post the stock effect of a receipt - it never writes
 * another module's tables (Constitution Principle VI).
 *
 * The usage answers travel the other way through `PurchasingUsageModule`, a
 * dependency-light module that reads only the purchasing tables. It exists
 * so that the Inventory module can ask "is this warehouse on an open order?"
 * without importing this module and creating a cycle.
 */
@Module({
  imports: [AuditModule, ContactsModule, ProductsModule, InventoryModule, OrganizationsModule, PurchasingUsageModule],
  controllers: [PurchasingController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
