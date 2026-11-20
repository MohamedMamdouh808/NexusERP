import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../platform/transaction/transaction.service';

/**
 * The sales document numbers: `SO-000001` and `SH-000001`.
 *
 * The number is allocated INSIDE the transaction that creates the document, so
 * a rolled-back write returns the number instead of leaving a gap the user
 * cannot explain.
 *
 * Two organizations never share a number: the sequence belongs to the
 * organization, and the number is unique within it.
 *
 * The allocation is serialized by a per-organization advisory lock, the same
 * pattern the inventory adjustment uses. The lock is taken BEFORE the sequence
 * row is read, so two first-uses at the same moment cannot both create a row
 * and fork the sequence; the unique constraint on (organization, name) is the
 * second line of defence.
 */
export type SalesDocumentKind = 'sales_order' | 'shipment';

/** The prefix and the sequence name of each document kind. */
const DOCUMENT_KINDS: Record<SalesDocumentKind, { prefix: string; sequenceName: string }> = {
  sales_order: { prefix: 'SO', sequenceName: 'sales_order' },
  shipment: { prefix: 'SH', sequenceName: 'shipment' },
};

/**
 * Allocates the next number of one document kind for one organization.
 *
 * The returned string is the finished number; the sequence row is updated in
 * the caller's transaction, so it commits and rolls back with the document.
 */
export async function allocateSalesNumber(
  tx: TransactionClient,
  organizationId: string,
  kind: SalesDocumentKind,
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
