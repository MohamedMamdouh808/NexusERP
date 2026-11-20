import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SalesModule } from '../sales/sales.module';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

/**
 * The invoicing module: operational invoices (never a tax invoice), invoice
 * lines, payments, payment allocations and payment reversals.
 *
 * The module owns its tables. It reads the sales order through the Sales
 * service and the customer through the Contacts service, and it never writes
 * another module's tables (Constitution Principle VI). The other modules ask
 * this feature's usage questions through InvoicingUsageModule, which depends
 * on nothing but the platform - importing the full InvoicingModule from
 * Contacts would be a cycle.
 */
@Module({
  imports: [AuditModule, ContactsModule, OrganizationsModule, SalesModule],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
