import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { INVOICING_PERMISSIONS, PAYMENT_PERMISSIONS } from '@nexuserp/shared';
import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  KebabMenu,
  Select,
  Skeleton,
  TabStrip,
} from '../../components/ui';
import type { Column, TabDefinition } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import type {
  InvoiceRow,
  InvoiceSortField,
  InvoiceStatus,
  PaymentMethod,
  PaymentRow,
  PaymentSortField,
} from '../../services/catalog-service';
import { SavedViews } from '../../components/ui/saved-views';
import { describeFailure } from './errors';
import { OverdueMarker } from './overdue-marker';
import { useCreateInvoice, useInvoices, useInvoicableOrders, usePayments } from './use-invoicing';

const PAGE_SIZE = 10;

const paymentMethods: readonly PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

export function InvoicingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.startsWith('/invoicing/payments') ? 'payments' : 'invoices';
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const session = useSession();
  const canWriteInvoices = hasPermission(session, INVOICING_PERMISSIONS.write);
  const canIssue = hasPermission(session, INVOICING_PERMISSIONS.issue);
  const canVoid = hasPermission(session, INVOICING_PERMISSIONS.void);
  // Recording a payment needs the payment itself AND the invoice balances the
  // allocation is chosen from; the form states the same pair.
  const canRecordPayment =
    hasPermission(session, PAYMENT_PERMISSIONS.record) &&
    hasPermission(session, INVOICING_PERMISSIONS.read);
  const tabs: readonly TabDefinition[] = [
    { key: 'invoices', label: t('invoicing.page.tabs.invoices'), path: '/invoicing' },
    { key: 'payments', label: t('invoicing.page.tabs.payments'), path: '/invoicing/payments' },
  ];
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [overdue, setOverdue] = useState(() => params.get('overdue') === '1');
  const [invoicePage, setInvoicePage] = useState(1);
  // Sorting is per tab: the invoice list opens newest-first while the payments
  // list opens on the money's arrival date. One shared state would carry a
  // column from the other list, which is not a column this one may sort by.
  const [invoiceSort, setInvoiceSort] = useState<InvoiceSortField>('createdAt');
  const [invoiceDirection, setInvoiceDirection] = useState<'asc' | 'desc'>('desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [payStatus, setPayStatus] = useState<'active' | 'reversed' | ''>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentSort, setPaymentSort] = useState<PaymentSortField>('paymentDate');
  const [paymentDirection, setPaymentDirection] = useState<'asc' | 'desc'>('desc');

  const invoiceQuery = useInvoices({
    search,
    status: status === '' ? undefined : status,
    overdue,
    page: invoicePage,
    pageSize: PAGE_SIZE,
    sortBy: invoiceSort,
    sortOrder: invoiceDirection,
  });
  const paymentQuery = usePayments({
    search,
    status: payStatus === '' ? undefined : payStatus,
    method: payMethod === '' ? undefined : payMethod,
    dateFrom: startDate || undefined,
    dateTo: endDate || undefined,
    page: paymentPage,
    pageSize: PAGE_SIZE,
    sortBy: paymentSort,
    sortOrder: paymentDirection,
  });
  const invoiceViewState = { search, status, overdue } as const;
  const paymentViewState = { search, payStatus, payMethod, startDate, endDate } as const;
  const restoreInvoiceView = (view: typeof invoiceViewState) => {
    setSearch(view.search);
    setStatus(view.status);
    setOverdue(view.overdue);
    setInvoicePage(1);
    setParams(view.overdue ? { overdue: '1' } : {}, { replace: true });
  };
  const restorePaymentView = (view: typeof paymentViewState) => {
    setSearch(view.search);
    setPayStatus(view.payStatus);
    setPayMethod(view.payMethod);
    setStartDate(view.startDate);
    setEndDate(view.endDate);
    setPaymentPage(1);
  };
  const invoiceStatusLabel = (value: string) => (value === '' ? '' : t(`invoicing.status.${value}`));
  const payStatusLabel = (value: string) =>
    value === ''
      ? ''
      : value === 'active'
        ? t('invoicing.status.RECORDED')
        : t('invoicing.status.REVERSED');
  const paymentMethodLabel = (method: PaymentMethod) =>
    method === 'CASH'
      ? t('invoicing.form.methodCash')
      : method === 'BANK_TRANSFER'
        ? t('invoicing.form.methodBankTransfer')
        : method === 'CARD'
          ? t('invoicing.form.methodCard')
          : t('invoicing.form.methodOther');
  const invoiceViewName = (view: typeof invoiceViewState) =>
    [
      view.overdue ? t('invoicing.savedView.overdue') : '',
      invoiceStatusLabel(view.status),
      view.search,
    ]
      .filter(Boolean)
      .join(' · ') || t('invoicing.savedView.savedView');
  const paymentViewName = (view: typeof paymentViewState) =>
    [
      payStatusLabel(view.payStatus),
      view.payMethod === '' ? '' : paymentMethodLabel(view.payMethod),
      view.search,
      view.startDate && t('invoicing.savedView.from', { date: view.startDate }),
      view.endDate && t('invoicing.savedView.to', { date: view.endDate }),
    ]
      .filter(Boolean)
      .join(' · ') || t('invoicing.savedView.savedView');
  const orders = useInvoicableOrders();
  const create = useCreateInvoice();

  function selectTab(tab: string) {
    navigate(tabs.find((item) => item.key === tab)?.path ?? '/invoicing');
  }

  function startCreate() {
    if (!canWriteInvoices) return;
    setCreateError('');
    setCreateOpen(true);
  }

  function startRecordPayment(customerId?: string, invoiceId?: string) {
    if (!canRecordPayment) return;
    const query = customerId === undefined ? '' : `?customer=${customerId}${invoiceId === undefined ? '' : `&invoice=${invoiceId}`}`;
    navigate(`/invoicing/payments/new${query}`);
  }

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: t('invoicing.invoices.columns.number'),
      sortable: true,
      render: (row) =>
        row.number === null ? (
          <span title={t('invoicing.detail.draftInvoice')}>—</span>
        ) : (
          <Link className="doc-number" to={`/invoicing/${row.id}`}>
            {row.number}
          </Link>
        ),
    },
    { key: 'customerName', header: t('invoicing.invoices.columns.customer'), sortable: true },
    {
      key: 'orderNumber',
      header: t('invoicing.invoices.columns.order'),
      render: (row) => (
        <Link className="doc-number" to={`/sales/${row.orderId}`}>
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('invoicing.invoices.columns.status'),
      sortable: true,
      render: (row) => (
        <>
          <Badge status={row.status}>{t(`invoicing.status.${row.status}`)}</Badge>{' '}
          <OverdueMarker dueDate={row.dueDate} balance={row.balance} />
        </>
      ),
    },
    {
      key: 'issueDate',
      header: t('invoicing.invoices.columns.issueDate'),
      sortable: true,
      render: (row) => row.issueDate ?? '—',
    },
    { key: 'dueDate', header: t('invoicing.invoices.columns.dueDate'), sortable: true },
    {
      key: 'total',
      header: t('invoicing.invoices.columns.total'),
      numeric: true,
      render: (row) => formatMoneyLocalized(row.total, currency, 2),
    },
    {
      key: 'balance',
      header: t('invoicing.invoices.columns.balance'),
      numeric: true,
      render: (row) => formatMoneyLocalized(row.balance, currency, 2),
    },
    {
      key: 'actions',
      header: t('invoicing.invoices.columns.actions'),
      render: (row) => (
        <KebabMenu
          label={t('invoicing.invoices.actionsFor', {
            number: row.number ?? t('invoicing.detail.draftInvoice'),
          })}
          entries={[
            {
              kind: 'item',
              id: 'view',
              label: t('invoicing.invoices.view'),
              onSelect: () => navigate(`/invoicing/${row.id}`),
            },
            ...(row.status === 'DRAFT' && canIssue
              ? [
                  {
                    kind: 'item' as const,
                    id: 'issue',
                    label: t('invoicing.invoices.issue'),
                    onSelect: () => navigate(`/invoicing/${row.id}?action=issue`),
                  },
                ]
              : []),
            ...(['ISSUED', 'PARTIALLY_PAID'].includes(row.status) && canRecordPayment
              ? [
                  {
                    kind: 'item' as const,
                    id: 'payment',
                    label: t('invoicing.invoices.recordPayment'),
                    onSelect: () => startRecordPayment(row.customerId, row.id),
                  },
                ]
              : []),
            ...(['DRAFT', 'ISSUED'].includes(row.status) && canVoid
              ? [
                  {
                    kind: 'item' as const,
                    id: 'void',
                    label: t('invoicing.invoices.void'),
                    onSelect: () => navigate(`/invoicing/${row.id}?action=void`),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];
  const paymentColumns: Column<PaymentRow>[] = [
    {
      key: 'number',
      header: t('invoicing.invoices.paymentsSection.columns.number'),
      sortable: true,
      render: (row) => (
        <Link className="doc-number" to={`/invoicing/payments/${row.id}`}>
          {row.number}
        </Link>
      ),
    },
    {
      key: 'customerName',
      header: t('invoicing.invoices.paymentsSection.columns.customer'),
      sortable: true,
    },
    {
      key: 'paymentDate',
      header: t('invoicing.invoices.paymentsSection.columns.date'),
      sortable: true,
    },
    {
      key: 'method',
      header: t('invoicing.invoices.paymentsSection.columns.method'),
      sortable: true,
      render: (row) => paymentMethodLabel(row.method),
    },
    {
      key: 'amount',
      header: t('invoicing.invoices.paymentsSection.columns.amount'),
      numeric: true,
      render: (row) => formatMoneyLocalized(row.amount, currency, 2),
    },
    {
      key: 'status',
      header: t('invoicing.invoices.paymentsSection.columns.status'),
      sortable: true,
      render: (row) => (
        <>
          <Badge status={row.status}>{t(`invoicing.status.${row.status}`)}</Badge>
          {row.reversedAt !== null && (
            <span className="payment-reversed-on">
              {t('invoicing.invoices.paymentsSection.reversedOn', {
                date: row.reversedAt.slice(0, 10),
              })}
            </span>
          )}
        </>
      ),
    },
  ];

  // The list call returns the selection's outstanding and overdue figures with
  // the rows, from ONE snapshot; they cover every row the filters select, not
  // the page shown, and they are never summed here.
  const outstanding = invoiceQuery.data?.outstanding ?? '0.00';
  const overdueTotal = invoiceQuery.data?.overdue ?? '0.00';
  const figuresReady = invoiceQuery.data !== undefined;
  const filterParts = [
    search.trim() === '' ? '' : t('invoicing.page.filters.search', { term: search }),
    status === '' ? '' : t('invoicing.page.filters.status', { status: invoiceStatusLabel(status) }),
    overdue ? t('invoicing.page.filters.overdue') : '',
  ].filter(Boolean);
  const filterNote =
    filterParts.length === 0
      ? null
      : t('invoicing.page.figuresFiltered', { filters: filterParts.join(' · ') });
  const createReason = !canWriteInvoices
    ? t('invoicing.page.noWritePermission')
    : !orders.isPending && (orders.data?.length ?? 0) === 0
      ? t('invoicing.page.noInvoicableOrders')
      : undefined;
  const recordReason =
    hasPermission(session, PAYMENT_PERMISSIONS.record)
      ? t('invoicing.page.noInvoiceReadPermission')
      : t('invoicing.page.noRecordPermission');

  return (
    <section className="invoicing-page" aria-label={t('invoicing.page.sectionAria')}>
      <PageHeader
        title={t('invoicing.page.title')}
        description={t('invoicing.page.description')}
        primaryAction={
          active === 'invoices' ? (
            <Button
              variant="primary"
              aria-label={t('invoicing.page.createInvoice')}
              disabled={!canWriteInvoices || orders.isPending || (orders.data?.length ?? 0) === 0}
              reason={createReason}
              onClick={startCreate}
            >
              {t('invoicing.page.createInvoice')}
            </Button>
          ) : (
            <Button
              variant="primary"
              aria-label={t('invoicing.page.recordPayment')}
              disabled={!canRecordPayment}
              reason={canRecordPayment ? undefined : recordReason}
              onClick={() => startRecordPayment()}
            >
              {t('invoicing.page.recordPayment')}
            </Button>
          )
        }
      />
      <Card className="invoicing-card">
        <TabStrip tabs={tabs} activeKey={active} onSelect={selectTab} />
        {active === 'invoices' ? (
          <>
            {figuresReady && (
              <div className="invoice-metrics">
                <div>
                  <span>{t('invoicing.page.metrics.outstandingSelection')}</span>
                  <strong className="numeric-cell">
                    {formatMoneyLocalized(outstanding, currency, 2)}
                  </strong>
                </div>
                <div>
                  <span>{t('invoicing.page.metrics.overdueSelection')}</span>
                  <strong className="numeric-cell">
                    {formatMoneyLocalized(overdueTotal, currency, 2)}
                  </strong>
                </div>
              </div>
            )}
            {figuresReady && filterNote !== null && <p className="invoice-filter-note">{filterNote}</p>}
            <div className="invoice-toolbar">
              <Input
                id="invoice-search"
                label={t('invoicing.invoices.search')}
                value={search}
                onChange={(event) => {
                  setInvoicePage(1);
                  setSearch(event.target.value);
                }}
                placeholder={t('invoicing.invoices.searchPlaceholder')}
              />
              <Select
                id="invoice-status"
                label={t('invoicing.invoices.status')}
                value={status}
                onChange={(event) => {
                  setInvoicePage(1);
                  setStatus(event.target.value as InvoiceStatus | '');
                }}
                options={['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'].map((value) => ({
                  value,
                  label: t(`invoicing.status.${value}`),
                }))}
                placeholder={t('invoicing.invoices.allStatuses')}
              />
              <label className="invoice-toggle">
                <input
                  type="checkbox"
                  checked={overdue}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setInvoicePage(1);
                    setOverdue(checked);
                    setParams(checked ? { overdue: '1' } : {}, { replace: true });
                  }}
                />{' '}
                {t('invoicing.invoices.overdueOnly')}
              </label>
              <SavedViews
                storageKey="nexuserp-invoice-views"
                current={invoiceViewState}
                nameFor={invoiceViewName}
                onSelect={restoreInvoiceView}
              />
            </div>
            {invoiceQuery.isError ? (
              <ErrorState
                message={t('invoicing.invoices.loading')}
                onRetry={() => void invoiceQuery.refetch()}
              />
            ) : invoiceQuery.data?.total === 0 ? (
              <EmptyState
                title={
                  search || status || overdue
                    ? t('invoicing.invoices.empty.filteredTitle')
                    : t('invoicing.invoices.empty.title')
                }
                description={
                  search || status || overdue
                    ? t('invoicing.invoices.empty.filteredDescription')
                    : t('invoicing.invoices.empty.description')
                }
                actionLabel={
                  search || status || overdue ? t('invoicing.invoices.empty.clearFilters') : undefined
                }
                onAction={
                  search || status || overdue
                    ? () => {
                        setSearch('');
                        setStatus('');
                        setOverdue(false);
                        setInvoicePage(1);
                      }
                    : undefined
                }
              />
            ) : (
              <DataTable<InvoiceRow>
                className="invoices-table"
                columns={invoiceColumns}
                data={invoiceQuery.data?.items ?? []}
                total={invoiceQuery.data?.total ?? 0}
                page={invoicePage}
                pageSize={PAGE_SIZE}
                loading={invoiceQuery.isPending}
                sortColumn={invoiceSort}
                sortDirection={invoiceDirection}
                onSortChange={(column, direction) => {
                  const keys: readonly InvoiceSortField[] = ['number', 'status', 'issueDate', 'dueDate', 'createdAt', 'customerName'];
                  if (keys.includes(column as InvoiceSortField)) setInvoiceSort(column as InvoiceSortField);
                  setInvoiceDirection(direction);
                }}
                onPageChange={setInvoicePage}
              />
            )}
          </>
        ) : (
          <>
            <div className="invoice-toolbar">
              <Input
                id="payment-search"
                label={t('invoicing.invoices.paymentsSection.search')}
                value={search}
                onChange={(event) => {
                  setPaymentPage(1);
                  setSearch(event.target.value);
                }}
                placeholder={t('invoicing.invoices.paymentsSection.searchPlaceholder')}
              />
              <Select
                id="payment-status"
                label={t('invoicing.invoices.paymentsSection.status')}
                value={payStatus}
                onChange={(event) => {
                  setPaymentPage(1);
                  setPayStatus(event.target.value as 'active' | 'reversed' | '');
                }}
                options={['active', 'reversed'].map((value) => ({
                  value,
                  label: payStatusLabel(value),
                }))}
                placeholder={t('invoicing.invoices.paymentsSection.allStatuses')}
              />
              <Select
                id="payment-method"
                label={t('invoicing.invoices.paymentsSection.method')}
                value={payMethod}
                onChange={(event) => {
                  setPaymentPage(1);
                  setPayMethod(event.target.value as PaymentMethod | '');
                }}
                options={paymentMethods.map((value) => ({
                  value,
                  label: paymentMethodLabel(value),
                }))}
                placeholder={t('invoicing.invoices.paymentsSection.allMethods')}
              />
              <Input
                id="payment-start"
                label={t('invoicing.invoices.paymentsSection.from')}
                type="date"
                value={startDate}
                onChange={(event) => {
                  setPaymentPage(1);
                  setStartDate(event.target.value);
                }}
              />
              <Input
                id="payment-end"
                label={t('invoicing.invoices.paymentsSection.to')}
                type="date"
                value={endDate}
                onChange={(event) => {
                  setPaymentPage(1);
                  setEndDate(event.target.value);
                }}
              />
              <SavedViews
                storageKey="nexuserp-payment-views"
                current={paymentViewState}
                nameFor={paymentViewName}
                onSelect={restorePaymentView}
              />
            </div>
            {startDate && endDate && endDate < startDate && (
              <p className="form-error" role="alert">
                {t('invoicing.invoices.paymentsSection.endOnOrAfterStart')}
              </p>
            )}
            {paymentQuery.isError ? (
              <ErrorState
                message={t('invoicing.invoices.paymentsSection.loading')}
                onRetry={() => void paymentQuery.refetch()}
              />
            ) : paymentQuery.data?.total === 0 ? (
              (() => {
                const filtered =
                  search !== '' || payStatus !== '' || payMethod !== '' || startDate !== '' || endDate !== '';
                return (
                  <EmptyState
                    title={
                      filtered
                        ? t('invoicing.invoices.paymentsSection.empty.filteredTitle')
                        : t('invoicing.invoices.paymentsSection.empty.title')
                    }
                    description={
                      filtered
                        ? t('invoicing.invoices.paymentsSection.empty.filteredDescription')
                        : t('invoicing.invoices.paymentsSection.empty.description')
                    }
                    actionLabel={
                      filtered
                        ? t('invoicing.invoices.paymentsSection.empty.clearFilters')
                        : undefined
                    }
                    onAction={
                      filtered
                        ? () => {
                            setSearch('');
                            setPayStatus('');
                            setPayMethod('');
                            setStartDate('');
                            setEndDate('');
                            setPaymentPage(1);
                          }
                        : undefined
                    }
                  />
                );
              })()
            ) : (
              <DataTable<PaymentRow>
                columns={paymentColumns}
                data={paymentQuery.data?.items ?? []}
                total={paymentQuery.data?.total ?? 0}
                page={paymentPage}
                pageSize={PAGE_SIZE}
                loading={paymentQuery.isPending}
                sortColumn={paymentSort}
                sortDirection={paymentDirection}
                onSortChange={(column, direction) => {
                  const keys: readonly PaymentSortField[] = ['number', 'paymentDate', 'customerName', 'method', 'status'];
                  if (keys.includes(column as PaymentSortField)) setPaymentSort(column as PaymentSortField);
                  setPaymentDirection(direction);
                }}
                onPageChange={setPaymentPage}
              />
            )}
          </>
        )}
      </Card>
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('invoicing.page.createInvoiceDialogTitle')}
        actions={<Button onClick={() => setCreateOpen(false)}>{t('common.actions.close')}</Button>}
      >
        <p>{t('invoicing.page.selectOrderPrompt')}</p>
        {orders.isPending ? (
          <Skeleton label={t('invoicing.page.loadingOrders')} />
        ) : (orders.data ?? []).length === 0 ? (
          <p>{t('invoicing.page.noShippedOrdersWaiting')}</p>
        ) : (
          <div className="invoicable-orders">
            {orders.data?.map((order) => (
              <button
                key={order.orderId}
                type="button"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    { orderId: order.orderId },
                    {
                      onSuccess: (result) => {
                        setCreateOpen(false);
                        navigate(`/invoicing/${result.id}`, {
                          state: { notice: t('invoicing.page.createDraftToast') },
                        });
                      },
                      onError: (failure) =>
                        setCreateError(
                          describeFailure(
                            failure,
                            t('invoicing.page.createDraftError'),
                            (id) => t('invoicing.requestId', { id }),
                          ),
                        ),
                    },
                  )
                }
              >
                <span className="doc-number">{order.orderNumber}</span>
                <span>{order.customerName}</span>
                <span>{formatMoneyLocalized(order.total, currency, 2)}</span>
              </button>
            ))}
          </div>
        )}
        {createError !== '' && (
          <p className="form-error" role="alert">
            {createError}
          </p>
        )}
      </Dialog>
    </section>
  );
}
