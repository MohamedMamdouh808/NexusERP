import { useQuery } from '@tanstack/react-query';
import { SampleDataBanner } from '../../components/ui/sample-data-banner';
import { PageHeader } from '../../components/shell/page-header';
import { Badge, Card, DataTable, ErrorState, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import { formatMoneyGrouped } from '../../lib/format';
import { compareQuantities, sumMoney } from '../../lib/quantity';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { Invoice, StockBalance } from '../../services/catalog-service';
import { useDashboard } from '../overview/use-dashboard';

export function ReportsPage() {
  const dashboard = useDashboard('this-month');
  const invoices = useQuery({ queryKey: ['reports', 'invoices'], queryFn: () => sampleCatalogService.listInvoices({ page: 1, pageSize: 100, sort: 'dueDate', direction: 'asc' }) });
  const stock = useQuery({ queryKey: ['reports', 'stock'], queryFn: () => sampleCatalogService.listStockBalances({ page: 1, pageSize: 100, sort: 'productName', direction: 'asc' }) });
  const invoiceRows = invoices.data?.items ?? [];
  const overdue = invoiceRows.filter((invoice) => invoice.balance !== '0.00' && invoice.dueDate < new Date().toISOString().slice(0, 10));
  const overdueBalance = sumMoney(...overdue.map((invoice) => invoice.balance));
  const lowStock = (stock.data?.items ?? []).filter((item) => item.reorderLevel !== null && compareQuantities(item.available, item.reorderLevel) <= 0);
  const stockColumns: Column<StockBalance>[] = [{ key: 'productSku', header: 'SKU' }, { key: 'productName', header: 'Product' }, { key: 'warehouseName', header: 'Warehouse' }, { key: 'available', header: 'Available', numeric: true }, { key: 'reorderLevel', header: 'Reorder level', numeric: true }];
  const invoiceColumns: Column<Invoice>[] = [{ key: 'number', header: 'Invoice' }, { key: 'customerName', header: 'Customer' }, { key: 'dueDate', header: 'Due date' }, { key: 'balance', header: 'Balance', numeric: true, render: (invoice) => formatMoneyGrouped(invoice.balance) }];
  const loading = dashboard.isPending || invoices.isPending || stock.isPending;
  const failed = dashboard.isError || invoices.isError || stock.isError;
  return <section className="reports-page"><PageHeader title="Reports" description="Sales, inventory, and accounts receivable summaries."/><SampleDataBanner moduleKey="reports" />
    {failed ? <ErrorState message="Reports could not be loaded." onRetry={() => { void dashboard.refetch(); void invoices.refetch(); void stock.refetch(); }}/> : loading ? <Card title="Reports"><Skeleton label="Loading reports"/></Card> : <>
      <div className="report-kpis"><Card title="Sales this month"><strong>{formatMoneyGrouped(dashboard.data!.sales.value)}</strong></Card><Card title="Active sales orders"><strong>{dashboard.data!.activeOrders.value}</strong><span>Confirmed orders not yet shipped</span></Card><Card title="Low stock items"><strong>{lowStock.length}</strong><span>At or below reorder level</span></Card><Card title="Outstanding invoices"><strong>{formatMoneyGrouped(dashboard.data!.outstandingInvoices.value)}</strong><span>{formatMoneyGrouped(overdueBalance)} overdue</span></Card></div>
      <Card title="Sales order status"><div className="report-status-list">{dashboard.data!.ordersByStatus.map((entry) => <div key={entry.status}><Badge status={entry.status}>{entry.status}</Badge><strong>{entry.count}</strong></div>)}</div></Card>
      <Card title="Stock at reorder level" description={`${lowStock.length} product and warehouse balances need attention.`}><DataTable<StockBalance> columns={stockColumns} data={lowStock} total={lowStock.length} page={1} pageSize={100}/></Card>
      <Card title="Open invoice balances" description={`${invoiceRows.filter((invoice) => ['ISSUED','PARTIALLY_PAID'].includes(invoice.status)).length} invoices have an outstanding balance.`}><DataTable<Invoice> columns={invoiceColumns} data={invoiceRows.filter((invoice) => ['ISSUED','PARTIALLY_PAID'].includes(invoice.status))} total={invoiceRows.filter((invoice) => ['ISSUED','PARTIALLY_PAID'].includes(invoice.status)).length} page={1} pageSize={100}/></Card>
    </>}
  </section>;
}
