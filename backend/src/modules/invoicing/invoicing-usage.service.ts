import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * The invoicing module's answers to the other modules' "is this still in
 * use?" questions.
 *
 * Archiving a customer while an open invoice still names them would leave the
 * invoice pointing at a customer the organization can no longer choose. The
 * other modules ask here instead of reading the invoicing tables themselves:
 * the tables stay inside the module that owns them (Constitution Principle
 * VI), and the answer has one definition rather than one per caller.
 *
 * This service is deliberately dependency-light - it reads only the invoices
 * table - so any module can import InvoicingUsageModule without creating a
 * cycle.
 *
 * An invoice is OPEN while it can still change hands or be paid: DRAFT,
 * ISSUED or PARTIALLY_PAID. A PAID invoice is closed - nothing of it can be
 * changed anymore - and a VOID invoice never existed for the customer's
 * ledger. Both keep their history and block nothing.
 */
export const OPEN_INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'] as const;

/** The invoice that blocks a change, and what the user needs to resolve it. */
export interface OpenInvoiceReference {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly invoiceStatus: string;
}

@Injectable()
export class InvoicingUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** How many open invoices name this customer. Zero means "not in use". */
  async countOpenInvoicesForCustomer(organizationId: string, contactId: string): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        organizationId,
        customerId: contactId,
        status: { in: [...OPEN_INVOICE_STATUSES] },
      },
    });
  }

  /**
   * The customer's oldest open invoice, for the archive refusal message. The
   * oldest is the one the user is most likely to remember; the number, when
   * the invoice has been issued, names it precisely.
   */
  async findOpenInvoiceForCustomer(
    organizationId: string,
    contactId: string,
  ): Promise<OpenInvoiceReference | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        customerId: contactId,
        status: { in: [...OPEN_INVOICE_STATUSES] },
      },
      select: {
        id: true,
        number: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (invoice === null) {
      return null;
    }
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoiceStatus: invoice.status,
    };
  }
}
