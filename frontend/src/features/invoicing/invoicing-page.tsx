import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Badge, Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, KebabMenu, Select, TabStrip, Toast } from '../../components/ui';
import type { Column, TabDefinition } from '../../components/ui';
import { formatMoneyGrouped } from '../../lib/format';
import { toCents, centsToString } from '../../lib/quantity';
import type { Invoice, Payment } from '../../services/catalog-service';
import { useCreateInvoice, useInvoices, useInvoicableOrders, usePayments } from './use-invoicing';
import { SavedViews } from '../../components/ui/saved-views';
import { OverdueMarker } from './overdue-marker';

const tabs: readonly TabDefinition[] = [{ key: 'invoices', label: 'Invoices', path: '/invoicing' }, { key: 'payments', label: 'Payments', path: '/invoicing/payments' }];
const key = () => globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random()}`;

export function InvoicingPage() {
  const navigate = useNavigate(); const location = useLocation(); const active = location.pathname.startsWith('/invoicing/payments') ? 'payments' : 'invoices';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [overdue, setOverdue] = useState(() => params.get('overdue') === '1'); const [page, setPage] = useState(1); const [sort, setSort] = useState('number'); const [direction, setDirection] = useState<'asc' | 'desc'>('desc'); const [createOpen, setCreateOpen] = useState(false); const [createKey, setCreateKey] = useState(''); const [toast, setToast] = useState('');
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [payStatus, setPayStatus] = useState('');
  const invoiceQuery = useInvoices({ search, status: status as Invoice['status'] | undefined, overdueOnly: overdue, page, pageSize: 10, sort, direction });
  const paymentQuery = usePayments({ search, status: payStatus as Payment['status'] | undefined, startDate: startDate || undefined, endDate: endDate || undefined, page, pageSize: 10, sort, direction });
  const invoiceViewState = { search, status, overdue } as const;
  const paymentViewState = { search, payStatus, startDate, endDate } as const;
  const restoreInvoiceView = (view: typeof invoiceViewState) => { setSearch(view.search); setStatus(view.status); setOverdue(view.overdue); setParams(view.overdue ? { overdue: '1' } : {}, { replace: true }); };
  const restorePaymentView = (view: typeof paymentViewState) => { setSearch(view.search); setPayStatus(view.payStatus); setStartDate(view.startDate); setEndDate(view.endDate); };
  const invoiceViewName = (view: typeof invoiceViewState) => [view.overdue ? 'Overdue' : '', view.status, view.search].filter(Boolean).join(' · ') || 'Saved view';
  const paymentViewName = (view: typeof paymentViewState) => [view.payStatus, view.search, view.startDate && `from ${view.startDate}`, view.endDate && `to ${view.endDate}`].filter(Boolean).join(' · ') || 'Saved view';
  // The view toolbar is specific to the active workspace tab.
  const orders = useInvoicableOrders(); const create = useCreateInvoice();
  function selectTab(tab: string) { navigate(tabs.find((t) => t.key === tab)?.path ?? '/invoicing'); }
  function startCreate() { setCreateKey(key()); setCreateOpen(true); }
  const invoiceColumns: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice', sortable: true, render: (row) => row.number === null ? <span title="Draft, not numbered yet">—</span> : <Link className="doc-number" to={`/invoicing/${row.id}`}>{row.number}</Link> },
    { key: 'customerName', header: 'Customer', sortable: true },
    { key: 'orderNumber', header: 'Order', render: (row) => <Link className="doc-number" to={`/sales/${row.orderId}`}>{row.orderNumber}</Link> },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <><Badge status={row.status}>{row.status}</Badge> <OverdueMarker dueDate={row.dueDate} balance={row.balance} /></> },
    { key: 'issueDate', header: 'Issue date', sortable: true, render: (row) => row.issueDate ?? '—' },
    { key: 'dueDate', header: 'Due date', sortable: true },
    ...(['total', 'paid', 'balance'] as const).map((field) => ({ key: field, header: field === 'total' ? 'Total' : field === 'paid' ? 'Paid' : 'Balance', numeric: true, sortable: true, render: (row: Invoice) => formatMoneyGrouped(row[field]) })),
    { key: 'actions', header: 'Actions', render: (row) => <KebabMenu label={`Actions for ${row.number ?? 'draft invoice'}`} entries={[{ kind: 'item', id: 'view', label: 'View', onSelect: () => navigate(`/invoicing/${row.id}`) }, ...(row.status === 'DRAFT' ? [{ kind: 'item' as const, id: 'issue', label: 'Issue', onSelect: () => navigate(`/invoicing/${row.id}?action=issue`) }] : []), ...(['ISSUED','PARTIALLY_PAID'].includes(row.status) ? [{ kind: 'item' as const, id: 'payment', label: 'Record payment', onSelect: () => navigate(`/invoicing/payments/new?customer=${row.customerId}&invoice=${row.id}`) }] : []), ...(['DRAFT','ISSUED'].includes(row.status) ? [{ kind: 'item' as const, id: 'void', label: 'Void', onSelect: () => navigate(`/invoicing/${row.id}?action=void`) }] : [])]} /> },
  ];
  const paymentColumns: Column<Payment>[] = [
    { key: 'number', header: 'Payment', sortable: true, render: (row) => <Link className="doc-number" to={`/invoicing/payments/${row.id}`}>{row.number}</Link> },
    { key: 'customerName', header: 'Customer', sortable: true }, { key: 'date', header: 'Date', sortable: true }, { key: 'method', header: 'Method', sortable: true },
    { key: 'amount', header: 'Amount', numeric: true, sortable: true, render: (row) => formatMoneyGrouped(row.amount) },
    { key: 'allocations', header: 'Invoices', render: (row) => String(row.allocations.length) },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <Badge status={row.status}>{row.status}</Badge> },
  ];
  const summaryQuery = useInvoices({ page: 1, pageSize: 100 });
  const totalBalance = summaryQuery.data?.items.filter((row) => ['ISSUED','PARTIALLY_PAID'].includes(row.status)).reduce((sum, row) => sum + toCents(row.balance), 0n) ?? 0n;
  const overdueBalance = summaryQuery.data?.items.filter((row) => ['ISSUED','PARTIALLY_PAID'].includes(row.status) && row.dueDate < new Date().toISOString().slice(0,10) && toCents(row.balance) > 0n).reduce((sum, row) => sum + toCents(row.balance), 0n) ?? 0n;
  return <section className="invoicing-page" aria-label="Invoicing">
    <PageHeader title="Invoicing" description="Customer invoices and their payment records." primaryAction={active === 'invoices' ? <Button variant="primary" disabled={orders.isPending || !orders.data?.length} reason={!orders.isPending && !orders.data?.length ? 'No shipped orders are waiting for an invoice' : undefined} onClick={startCreate}>Create Invoice</Button> : <Button variant="primary" onClick={() => navigate('/invoicing/payments/new')}>Record Payment</Button>} />
    <Card className="invoicing-card"><TabStrip tabs={tabs} activeKey={active} onSelect={selectTab} />
      {active === 'invoices' ? <>
        <div className="sample-banner">Sample data</div>
        <div className="invoice-metrics"><div><span>Outstanding balance</span><strong className="numeric-cell">{formatMoneyGrouped(centsToString(totalBalance))}</strong></div><div><span>Overdue balance</span><strong className="numeric-cell">{formatMoneyGrouped(centsToString(overdueBalance))}</strong></div></div>
        <div className="invoice-toolbar"><Input id="invoice-search" label="Search invoices" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Invoice number or customer" /><Select id="invoice-status" label="Status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={['DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID'].map((v) => ({ value: v, label: v }))} placeholder="All statuses" /><label className="invoice-toggle"><input type="checkbox" checked={overdue} onChange={(e) => { const checked = e.target.checked; setPage(1); setOverdue(checked); setParams(checked ? { overdue: '1' } : {}, { replace: true }); }} /> Overdue only</label><SavedViews storageKey="nexuserp-invoice-views" current={invoiceViewState} nameFor={invoiceViewName} onSelect={restoreInvoiceView} /></div>
        {invoiceQuery.isError ? <ErrorState message="Invoices could not be loaded." onRetry={() => void invoiceQuery.refetch()} /> : invoiceQuery.data?.total === 0 ? <EmptyState title={search || status || overdue ? 'No invoices match these filters' : 'No invoices yet'} description={search || status || overdue ? 'Clear filters to see all invoices.' : 'Invoices are created from shipped sales orders.'} actionLabel={search || status || overdue ? 'Clear filters' : undefined} onAction={search || status || overdue ? () => { setSearch(''); setStatus(''); setOverdue(false); } : undefined} /> : <DataTable<Invoice> className="invoices-table" columns={invoiceColumns} data={invoiceQuery.data?.items ?? []} total={invoiceQuery.data?.total ?? 0} page={page} pageSize={10} loading={invoiceQuery.isPending} sortColumn={sort} sortDirection={direction} onSortChange={(column, dir) => { setSort(column); setDirection(dir); }} onPageChange={setPage} />}
      </> : <>
        <div className="sample-banner">Sample data</div><div className="invoice-toolbar"><Input id="payment-search" label="Search payments" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Payment number or customer" /><Select id="payment-status" label="Status" value={payStatus} onChange={(e) => { setPage(1); setPayStatus(e.target.value); }} options={['RECORDED','REVERSED'].map((v) => ({ value: v, label: v }))} placeholder="All statuses" /><Input id="payment-start" label="From" type="date" value={startDate} onChange={(e) => { setPage(1); setStartDate(e.target.value); }} /><Input id="payment-end" label="To" type="date" value={endDate} onChange={(e) => { setPage(1); setEndDate(e.target.value); }} /><SavedViews storageKey="nexuserp-payment-views" current={paymentViewState} nameFor={paymentViewName} onSelect={restorePaymentView} /></div>
        {startDate && endDate && endDate < startDate && <p className="form-error" role="alert">End date must be on or after the start date.</p>}
        {paymentQuery.isError ? <ErrorState message="Payments could not be loaded." onRetry={() => void paymentQuery.refetch()} /> : paymentQuery.data?.total === 0 ? (() => { const filtered = search !== '' || payStatus !== '' || startDate !== '' || endDate !== ''; return <EmptyState title={filtered ? 'No payments match these filters' : 'No payments recorded yet'} description={filtered ? 'Clear the filters to see every payment.' : 'Payments are permanent records. Record the first payment from an issued invoice balance.'} actionLabel={filtered ? 'Clear filters' : undefined} onAction={filtered ? () => { setSearch(''); setPayStatus(''); setStartDate(''); setEndDate(''); } : undefined} />; })() : <DataTable<Payment> columns={paymentColumns} data={paymentQuery.data?.items ?? []} total={paymentQuery.data?.total ?? 0} page={page} pageSize={10} loading={paymentQuery.isPending} sortColumn={sort} sortDirection={direction} onSortChange={(column, dir) => { setSort(column); setDirection(dir); }} onPageChange={setPage} />}
      </>}
    </Card>
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create invoice" actions={<Button onClick={() => setCreateOpen(false)}>Close</Button>}>
      <p>Select a shipped sales order to create a draft invoice.</p>{orders.isPending ? <p>Loading eligible orders…</p> : (orders.data ?? []).length === 0 ? <p>No shipped orders are waiting for an invoice.</p> : <div className="invoicable-orders">{orders.data?.map((order) => <button key={order.orderId} type="button" disabled={create.isPending} onClick={() => create.mutate({ orderId: order.orderId, idempotencyKey: createKey }, { onSuccess: (result) => { setCreateOpen(false); navigate(`/invoicing/${result.id}`, { state: { notice: 'Draft invoice created' } }); }, onError: () => setToast('Could not create the draft invoice. Retry using the same action.') })}><span className="doc-number">{order.orderNumber}</span><span>{order.customerName}</span><span>{formatMoneyGrouped(order.total)}</span></button>)}</div>}
    </Dialog>{toast && <Toast id="invoicing-error" tone="failure" message={toast} onDismiss={() => setToast('')} />}
  </section>;
}
