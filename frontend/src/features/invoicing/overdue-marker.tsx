import { toCents } from '../../lib/quantity';

export function OverdueMarker({ dueDate, balance }: { readonly dueDate: string; readonly balance: string }) {
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate >= today || toCents(balance) <= 0n) return null;
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
  return <span className="invoice-overdue">{days} days overdue</span>;
}
