import { Module } from '@nestjs/common';

import { InvoicingUsageService } from './invoicing-usage.service';

/**
 * The reverse answers: which open invoice references this customer.
 *
 * This module is deliberately tiny and depends on nothing but the platform,
 * so that the Contacts module can ask it for the archive check without a
 * circular import (Contacts is imported by Invoicing for the payment
 * customer validation, so an import in the other direction would be a cycle -
 * which the constitution forbids).
 */
@Module({
  providers: [InvoicingUsageService],
  exports: [InvoicingUsageService],
})
export class InvoicingUsageModule {}
