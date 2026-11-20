import { Injectable } from '@nestjs/common';

import { InvoicingUsageService } from '../invoicing/invoicing-usage.service';
import { PurchasingUsageService } from '../purchasing/purchasing-usage.service';
import { type ContactsUsageHook } from './contacts-usage.hook';

/**
 * The purchasing answer to the contacts archive check.
 *
 * A supplier that an open purchase order still names cannot be archived: the
 * order would point at a supplier the organization can no longer choose. The
 * refusal names the order, so the user can resolve it.
 *
 * The contacts module asks through the seam and never reads the purchasing
 * tables (Constitution Principle VI).
 */
@Injectable()
export class PurchasingContactsUsageProvider implements ContactsUsageHook {
  constructor(private readonly purchasing: PurchasingUsageService) {}

  async isInUse(organizationId: string, contactId: string) {
    const order = await this.purchasing.findOpenOrderForSupplier(organizationId, contactId);
    if (order === null) {
      return { inUse: false };
    }
    return {
      inUse: true,
      reason: `This supplier is used by the open purchase order ${order.orderNumber}.`,
    };
  }
}

/**
 * The invoicing answer to the same question, for customers.
 *
 * A customer an open invoice still names cannot be archived: the invoice would
 * point at a customer the organization can no longer choose, and an open
 * invoice can still be paid. The refusal names the invoice.
 *
 * An issued or partly paid invoice carries its INV- number, which is what the
 * user recognises. A draft has no number yet, so the refusal names the draft
 * by id and tells the user what to do: issue it to assign the number, or void
 * it. A PAID invoice is closed and a VOID invoice never existed for the
 * customer's ledger; both keep their history and block nothing.
 */
@Injectable()
export class InvoicingContactsUsageProvider implements ContactsUsageHook {
  constructor(private readonly invoicing: InvoicingUsageService) {}

  async isInUse(organizationId: string, contactId: string) {
    const invoice = await this.invoicing.findOpenInvoiceForCustomer(organizationId, contactId);
    if (invoice === null) {
      return { inUse: false };
    }
    const name =
      invoice.invoiceNumber === null
        ? `draft invoice ${invoice.invoiceId}`
        : `invoice ${invoice.invoiceNumber}`;
    return {
      inUse: true,
      reason: `This customer is used by the open ${name}.`,
    };
  }
}

/**
 * The answer the contacts archive check asks for: every module's usage check,
 * in module order, with the first "in use" winning. The contacts module reads
 * no purchasing or invoicing table of its own (Constitution Principle VI).
 */
@Injectable()
export class CompositeContactsUsageProvider implements ContactsUsageHook {
  constructor(
    private readonly purchasing: PurchasingContactsUsageProvider,
    private readonly invoicing: InvoicingContactsUsageProvider,
  ) {}

  async isInUse(organizationId: string, contactId: string) {
    const purchasing = await this.purchasing.isInUse(organizationId, contactId);
    if (purchasing.inUse) {
      return purchasing;
    }
    const invoicing = await this.invoicing.isInUse(organizationId, contactId);
    if (invoicing.inUse) {
      return invoicing;
    }
    return { inUse: false };
  }
}
