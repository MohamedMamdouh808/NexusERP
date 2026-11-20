import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../platform/transaction/transaction.service';

/**
 * The invoicing document numbers: `INV-000001` and `PAY-000001`.
 *
 * The number is allocated INSIDE the transaction that creates the document, so
 * a rolled-back write returns the number instead of leaving a gap the user
 * cannot explain.
 *
 * Two organizations never share a number: the sequence belongs to the
 * organization, and the number is unique within it.
 *
 * The allocation is serialized by a per-organization advisory lock, the same
 * pattern the sales numbers use. The lock is taken BEFORE the sequence row is
 * read, so two first-uses at the same moment cannot both create a row and fork
 * the sequence; the unique constraint on (organization, name) is the second
 * line of defence.
 *
 * `INV-` shares the organization's digits and sequence allocation with `SO-`
 * and `SH-`: it is its own sequence row (kind `invoice`), not a second counter
 * inside the sales row, so the six-digit width and the per-organization scope
 * stay exactly the same as every other document.
 */
export type InvoicingDocumentKind = 'invoice' | 'payment';

/** The prefix and the sequence name of each document kind. */
const DOCUMENT_KINDS: Record<InvoicingDocumentKind, { prefix: string; sequenceName: string }> = {
  invoice: { prefix: 'INV', sequenceName: 'invoice' },
  payment: { prefix: 'PAY', sequenceName: 'payment' },
};

/**
 * Allocates the next number of one document kind for one organization.
 *
 * The returned string is the finished number; the sequence row is updated in
 * the caller's transaction, so it commits and rolls back with the document.
 * Invoice numbers are allocated at issue, payment numbers at creation.
 */
export async function allocateInvoicingNumber(
  tx: TransactionClient,
  organizationId: string,
  kind: InvoicingDocumentKind,
): Promise<string> {
  const { prefix, sequenceName } = DOCUMENT_KINDS[kind];

  // $executeRaw, not $queryRaw: the lock returns nothing, and a result set
  // Prisma cannot read is an error, not a lock.
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${sequenceName}`}))`,
  );

  const existing = await tx.documentSequence.findFirst({
    where: { organizationId, name: sequenceName },
    select: { id: true },
  });

  let currentValue: number;
  if (existing === null) {
    // The first document of this kind for this organization. The unique
    // constraint on (organization, name) makes a second row impossible, so a
    // lost race here is a constraint violation that rolls the transaction back.
    const created = await tx.documentSequence.create({
      data: { organizationId, name: sequenceName, currentValue: 1 },
    });
    currentValue = created.currentValue;
  } else {
    const updated = await tx.documentSequence.update({
      where: { id: existing.id },
      data: { currentValue: { increment: 1 } },
    });
    currentValue = updated.currentValue;
  }

  return `${prefix}-${String(currentValue).padStart(6, '0')}`;
}
