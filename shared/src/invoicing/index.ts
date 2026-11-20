/**
 * The permissions the invoicing and payments endpoints declare.
 *
 * The codes are the same strings the service guards; these maps exist so the
 * screens can name them without restating the strings by hand. Invoicing and
 * payments are separate modules with separate reads: a member may be allowed
 * to read invoices without being allowed to read payments, and the
 * Record-payment screen needs both `payments.record` and `invoices.read`.
 */
export const INVOICING_PERMISSIONS = {
  read: 'invoices.read',
  write: 'invoices.write',
  issue: 'invoices.issue',
  void: 'invoices.void',
} as const;

export const PAYMENT_PERMISSIONS = {
  read: 'payments.read',
  record: 'payments.record',
  reverse: 'payments.reverse',
} as const;
