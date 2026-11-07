import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import { formatMoneyGrouped } from '../../lib/format';
import { sumMoney } from '../../lib/quantity';

type ActionItem = {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly to: string;
  readonly severity: 'high' | 'medium' | 'low';
};

export interface ActionCenterProps {
  readonly showEmpty?: boolean;
}

export function ActionCenter({ showEmpty = true }: ActionCenterProps) {
  const overdue = useQuery({ queryKey: ['action-center', 'overdue-invoices'], queryFn: () => sampleCatalogService.listInvoices({ overdueOnly: true, page: 1, pageSize: 5, sort: 'dueDate', direction: 'asc' }) });
  const drafts = useQuery({ queryKey: ['action-center', 'draft-invoices'], queryFn: () => sampleCatalogService.listInvoices({ status: 'DRAFT', page: 1, pageSize: 5, sort: 'dueDate', direction: 'asc' }) });
  const partials = useQuery({ queryKey: ['action-center', 'partially-paid-invoices'], queryFn: () => sampleCatalogService.listInvoices({ status: 'PARTIALLY_PAID', page: 1, pageSize: 5, sort: 'dueDate', direction: 'asc' }) });
  const confirmedSales = useQuery({ queryKey: ['action-center', 'confirmed-sales'], queryFn: () => sampleCatalogService.listSalesOrders({ status: 'CONFIRMED', page: 1, pageSize: 5, sort: 'orderDate', direction: 'asc' }) });

  const overdueBalance = overdue.data?.items.length ? sumMoney(...overdue.data.items.map((invoice) => invoice.balance)) : '0.00';
  const partialBalance = partials.data?.items.length ? sumMoney(...partials.data.items.map((invoice) => invoice.balance)) : '0.00';
  const actions: ActionItem[] = [];
  if (overdue.data && overdue.data.total > 0) actions.push({ key: 'overdue', label: `${overdue.data.total} invoice${overdue.data.total === 1 ? '' : 's'} overdue`, detail: `Collect USD ${formatMoneyGrouped(overdueBalance)}`, to: '/invoicing?overdue=1', severity: 'high' });
  if (drafts.data && drafts.data.total > 0) actions.push({ key: 'draft-inv', label: `${drafts.data.total} draft invoice${drafts.data.total === 1 ? '' : 's'} waiting to be issued`, detail: 'Review, verify and issue to start the payment clock.', to: '/invoicing', severity: 'medium' });
  if (partials.data && partials.data.total > 0) actions.push({ key: 'partial', label: `${partials.data.total} balance${partials.data.total === 1 ? '' : 's'} partially paid`, detail: `Open balance USD ${formatMoneyGrouped(partialBalance)}`, to: '/invoicing', severity: 'medium' });
  if (confirmedSales.data && confirmedSales.data.total > 0) actions.push({ key: 'confirmed-sales', label: `${confirmedSales.data.total} confirmed order${confirmedSales.data.total === 1 ? '' : 's'} waiting to ship`, detail: 'Reserve, pick and ship the order to release the hold.', to: '/sales', severity: 'low' });

  if (actions.length === 0 && !showEmpty) return null;
  return (
    <Card title="Needs attention" description="Ranked action items derived from this organization’s records" className="action-center">
      {overdue.isPending || drafts.isPending || partials.isPending || confirmedSales.isPending ? (
        <p className="action-center__loading" role="status">Checking records…</p>
      ) : actions.length === 0 ? (
        <p className="action-center__caught-up"><strong>All clear.</strong> No overdue invoices, pending issues or partially paid balances right now.</p>
      ) : (
        <ul className="action-center__list">
          {actions.map((action) => (
            <li key={action.key}>
              <Link className="action-center__item" to={action.to} data-severity={action.severity}>
                <span className="action-center__item-title">{action.label}</span>
                <span className="action-center__item-detail">{action.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
