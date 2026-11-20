import { Module } from '@nestjs/common';

import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CONTACTS_USAGE_HOOK } from './contacts-usage.hook';
import {
  CompositeContactsUsageProvider,
  InvoicingContactsUsageProvider,
  PurchasingContactsUsageProvider,
} from './contacts-usage.provider';
import { AuditModule } from '../audit/audit.module';
import { PurchasingUsageModule } from '../purchasing/purchasing-usage.module';
import { InvoicingUsageModule } from '../invoicing/invoicing-usage.module';

/**
 * The contacts.
 *
 * The archive check is a seam: the contacts module asks whether a contact is
 * still referenced, and each owning module answers for its own documents - a
 * supplier on an open purchase order or a customer on an open invoice cannot
 * be archived; the refusal names the document. The contacts module reads no
 * purchasing or invoicing table of its own (Constitution Principle VI).
 */
@Module({
  imports: [AuditModule, PurchasingUsageModule, InvoicingUsageModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    PurchasingContactsUsageProvider,
    InvoicingContactsUsageProvider,
    {
      provide: CONTACTS_USAGE_HOOK,
      useClass: CompositeContactsUsageProvider,
    },
  ],
  exports: [ContactsService, CONTACTS_USAGE_HOOK],
})
export class ContactsModule {}
