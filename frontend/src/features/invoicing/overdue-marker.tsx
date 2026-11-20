import { useTranslation } from 'react-i18next';

import { toCents } from '../../lib/quantity';

export function OverdueMarker({ dueDate, balance }: { readonly dueDate: string | null; readonly balance: string }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate === null || dueDate >= today || toCents(balance) <= 0n) return null;
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
  return <span className="invoice-overdue">{t('invoicing.overdueMarker.daysOverdue', { count: days })}</span>;
}
