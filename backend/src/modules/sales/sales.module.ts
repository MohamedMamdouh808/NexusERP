import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProductsModule } from '../products/products.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

/**
 * The sales module: sales orders, order lines, stock reservations,
 * shipments and shipment lines.
 *
 * The module owns its tables. It asks the Contacts, Products and Inventory
 * modules to validate and lock the records it references, and it asks the
 * Inventory service to post the stock effect of a shipment - it never writes
 * another module's tables (Constitution Principle VI).
 */
@Module({
  imports: [AuditModule, ContactsModule, ProductsModule, InventoryModule, OrganizationsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
