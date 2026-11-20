import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { FALLBACK_CURRENCY } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import { isModuleEnabled } from '../../components/shell/module-availability';
import { listAuditEntries } from '../../services/audit-client';
import { listContacts } from '../../services/contacts-client';
import { listInvoices } from '../../services/invoicing-client';
import { listProducts } from '../../services/products-client';
import { listPurchaseOrders } from '../../services/purchasing-client';
import {
  getDocumentsByStatus,
  getKpiSummary,
  getReceivablesAging,
  getSalesOverTime,
  getStockReconciliation,
} from '../../services/reports-client';
import { listSalesOrders } from '../../services/sales-client';
import { listStockBalances } from '../../services/inventory-client';

/**
 * The dashboard's widget registry.
 *
 * A widget is requested only when the member may see it: the permission comes
 * from `/auth/me`, and a widget the member may not see is never mounted, so
 * no request is issued and no 403 can appear.
 *
 * The load happens in two batches. The first batch is the eight requests the
 * page shows above the fold (four analytics, four attention lists); they are
 * dispatched together, in parallel. The deferred batch (reconciliation, recent
 * activity, the checklist's own counts) is dispatched right afterwards, also in
 * parallel, and never waits for the first batch - so no widget's request waits
 * for another's.
 */

export interface DashboardRange {
  readonly start: string;
  readonly end: string;
}

/** A calendar month as a stable `YYYY-MM` key, used as the period selection. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The most recent months, newest first, for the period picker. */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))));
}

/** A whole calendar month; the current month stops at today, past months at their last day. */
export function monthRange(key: string, now: Date = new Date()): DashboardRange {
  const [year, month] = key.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const end =
    key === monthKey(now) && last.getUTCDate() > now.getUTCDate()
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : last;
  return { start: first.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** The current calendar month in UTC, from the first of the month to today. */
export function currentMonthRange(now: Date = new Date()): DashboardRange {
  return monthRange(monthKey(now), now);
}

export function useDashboardWidgets(selectedMonth: string = monthKey()) {
  const { t } = useTranslation();
  const session = useSession();
  const range = monthRange(selectedMonth);
  const signedIn = session.status === 'signed-in';
  const can = (permission: string) => signedIn && hasPermission(session, permission);
  const mod = (key: string) => signedIn && isModuleEnabled(session, key);

  // A widget is requested only when the member may see it AND its module is on.
  const canReports = can('reports.read') && mod('reports');
  const canInvoices = can('invoices.read') && mod('invoicing');
  const canSales = can('sales.read') && mod('sales');
  const canPurchasing = can('purchasing.read') && mod('purchasing');
  const canInventory = can('inventory.read') && mod('inventory');
  const canProducts = can('products.read');
  const canContacts = can('contacts.read');
  const canAudit = can('audit.read');

  // --- First batch: analytics ------------------------------------------------
  const kpis = useQuery({
    queryKey: ['dashboard', 'kpis', range.start, range.end],
    queryFn: () => getKpiSummary(range.start, range.end),
    enabled: canReports,
  });

  const salesOverTime = useQuery({
    queryKey: ['dashboard', 'sales-over-time', range.start, range.end],
    queryFn: () => getSalesOverTime(range.start, range.end),
    enabled: canReports,
  });

  const documentsByStatus = useQuery({
    queryKey: ['dashboard', 'documents-by-status', range.start, range.end],
    queryFn: () => getDocumentsByStatus(range.start, range.end),
    enabled: canReports,
  });

  const receivablesAging = useQuery({
    queryKey: ['dashboard', 'receivables-aging'],
    queryFn: () => getReceivablesAging(),
    enabled: canReports,
  });

  // --- First batch: attention lists -----------------------------------------
  const overdueInvoices = useQuery({
    queryKey: ['dashboard', 'overdue-invoices'],
    queryFn: async () => {
      const result = await listInvoices({ overdue: true, page: 1, pageSize: 5, sortBy: 'dueDate', sortOrder: 'asc' });
      return result.ok ? result.data : null;
    },
    enabled: canInvoices,
  });

  const confirmedSalesOrders = useQuery({
    queryKey: ['dashboard', 'confirmed-sales-orders'],
    queryFn: async () => {
      const result = await listSalesOrders({ status: 'CONFIRMED', page: 1, pageSize: 5, sortBy: 'orderDate', sortOrder: 'asc' });
      return result.ok ? result.data : null;
    },
    enabled: canSales,
  });

  const purchaseOrdersAwaitingReceipt = useQuery({
    queryKey: ['dashboard', 'purchase-orders-awaiting-receipt'],
    queryFn: async () => {
      const result = await listPurchaseOrders({
        status: ['CONFIRMED', 'PARTIALLY_RECEIVED'],
        page: 1,
        pageSize: 5,
        sortBy: 'orderDate',
        sortOrder: 'asc',
      });
      return result.ok ? result.data : null;
    },
    enabled: canPurchasing,
  });

  const lowStockProducts = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: async () => {
      const result = await listStockBalances({ lowStockOnly: true, page: 1, pageSize: 5 });
      return result.ok ? result.data : null;
    },
    enabled: canInventory,
  });

  // --- Deferred batch --------------------------------------------------------
  const reconciliation = useQuery({
    queryKey: ['dashboard', 'reconciliation'],
    queryFn: () => getStockReconciliation(),
    enabled: canReports,
  });

  const recentActivity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: async () => {
      const result = await listAuditEntries({ page: 1, pageSize: 8 });
      return result.ok ? result.data : null;
    },
    enabled: canAudit,
  });

  // The checklist counts only the steps the member may read, and only asks
  // for the first row: it needs the total, not the rows.
  const checklistProducts = useQuery({
    queryKey: ['dashboard', 'checklist-products'],
    queryFn: async () => {
      const result = await listProducts({ page: 1, pageSize: 1 });
      return result.ok ? result.data.total : null;
    },
    enabled: canProducts,
  });

  const checklistContacts = useQuery({
    queryKey: ['dashboard', 'checklist-contacts'],
    queryFn: async () => {
      const result = await listContacts({ page: 1, pageSize: 1 });
      return result.ok ? result.data.total : null;
    },
    enabled: canContacts,
  });

  const checklistStock = useQuery({
    queryKey: ['dashboard', 'checklist-stock'],
    queryFn: async () => {
      const result = await listStockBalances({ page: 1, pageSize: 1 });
      return result.ok ? result.data.total : null;
    },
    enabled: canInventory,
  });

  const memberName = signedIn ? session.membership.name || session.user.email : '';
  const organizationName = signedIn ? session.organization.name : '';
  const currency = signedIn ? session.organization.currencyCode : FALLBACK_CURRENCY;

  const hasAnyWidget =
    canReports ||
    canInvoices ||
    canSales ||
    canPurchasing ||
    canInventory ||
    canAudit;

  return {
    range,
    memberName,
    organizationName,
    currency,
    hasAnyWidget,
    permissions: {
      reports: canReports,
      invoices: canInvoices,
      sales: canSales,
      purchasing: canPurchasing,
      inventory: canInventory,
      products: canProducts,
      contacts: canContacts,
      audit: canAudit,
    },
    kpis,
    salesOverTime,
    documentsByStatus,
    receivablesAging,
    overdueInvoices,
    confirmedSalesOrders,
    purchaseOrdersAwaitingReceipt,
    lowStockProducts,
    reconciliation,
    recentActivity,
    checklist: { products: checklistProducts, contacts: checklistContacts, stock: checklistStock },
    labels: {
      definition: t('dashboard.widget.definition'),
      asOf: t('dashboard.widget.asOf'),
    },
  };
}

/**
 * The count behind the shell's Overview badge. It reads the queries the
 * dashboard already ran - the sidebar never issues a request of its own, so a
 * member who has not opened the page sees no badge and pays no extra traffic.
 */
export function useCachedAttentionCount(): number {
  const useCachedTotal = (name: string): number => {
    const query = useQuery<{ total: number } | null>({
      queryKey: ['dashboard', name],
      queryFn: async () => null,
      enabled: false,
    });
    return query.data?.total ?? 0;
  };
  return (
    useCachedTotal('overdue-invoices') +
    useCachedTotal('confirmed-sales-orders') +
    useCachedTotal('purchase-orders-awaiting-receipt') +
    useCachedTotal('low-stock')
  );
}
