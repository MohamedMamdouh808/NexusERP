import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CONTACTS_USAGE_HOOK, DefaultContactsUsageHook } from './contacts-usage.hook';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    {
      provide: CONTACTS_USAGE_HOOK,
      useClass: DefaultContactsUsageHook,
    },
  ],
  exports: [ContactsService, CONTACTS_USAGE_HOOK],
})
export class ContactsModule {}
