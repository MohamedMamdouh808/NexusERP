import { useTranslation } from 'react-i18next';

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INVOICING_PERMISSIONS, PAYMENT_PERMISSIONS } from '@nexuserp/shared';
import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
  Toast,
} from '../../components/ui';
import type { Column, ToastTone } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import type { InvoiceLine } from '../../services/catalog-service';
import { useInvoice, useIssueInvoice, useUpdateInvoiceDueDate, useVoidInvoice } from './use-invoicing';
import { describeFailure, isUnknownOutcome } from './errors';
import { OverdueMarker } from './overdue-marker';
import { DocumentTrail } from '../../components/ui/document-trail';

const today = new Date().toISOString().slice(0, 10);
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const session = useSession();
  const canWrite = hasPermission(session, INVOICING_PERMISSIONS.write);
  const canIssue = hasPermission(session, INVOICING_PERMISSIONS.issue);
  const canVoid = hasPermission(session, INVOICING_PERMISSIONS.void);
  const canRecordPayment =
    hasPermission(session, PAYMENT_PERMISSIONS.record) &&
    hasPermission(session, INVOICING_PERMISSIONS.read);
  const query = useInvoice(id);
  const issue = useIssueInvoice();
  const voidAction = useVoidInvoice();
  const updateDate = useUpdateInvoiceDueDate();
  const [issueOpen, setIssueOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [issueKey, setIssueKey] = useState('');
  const [voidKey, setVoidKey] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [dueDateError, setDueDateError] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);
  // An attempt whose outcome was never known keeps its key, so reopening the
  // dialog resumes the SAME attempt instead of risking a second document.
  const issueOutcomeUnknown = useRef(false);
  const voidOutcomeUnknown = useRef(false);
  const invoice = query.data;
  useEffect(() => {
    if (invoice) setDueDate(invoice.dueDate ?? '');
  }, [invoice?.id, invoice?.dueDate]);
  const noticeConsumed = useRef(false);
  useEffect(() => {
    const state = location.state;
    if (noticeConsumed.current || !state || typeof state !== 'object' || !('notice' in state)) {
      return;
    }
    noticeConsumed.current = true;
    setToasts((items) => [
      ...items,
      {
        id: `invoice-created-${Date.now()}`,
        tone: 'success',
        message: String((state as { notice: unknown }).notice),
      },
    ]);
    navigate(location.pathname, { replace: true });
  }, [location.state, location.pathname, navigate]);
  // A list action arrives as ?action=issue|void. It is consumed once: after the
  // dialog opens the parameter is dropped, so a refetch cannot reopen it.
  const actionConsumed = useRef(false);
  useEffect(() => {
    if (!invoice || actionConsumed.current) return;
    const action = params.get('action');
    if (action !== 'issue' && action !== 'void') return;
    actionConsumed.current = true;
    navigate(location.pathname, { replace: true });
    if (action === 'issue' && invoice.status === 'DRAFT') {
      if (issueKey === '' || !issueOutcomeUnknown.current) setIssueKey(newKey());
      setError('');
      setIssueOpen(true);
    }
    if (action === 'void' && ['DRAFT', 'ISSUED'].includes(invoice.status)) {
      if (voidKey === '' || !voidOutcomeUnknown.current) setVoidKey(newKey());
      setReason('');
      setError('');
      setVoidOpen(true);
    }
  }, [params, invoice, issueKey, voidKey, location.pathname, navigate]);

  function openIssue() {
    if (issueKey === '' || !issueOutcomeUnknown.current) setIssueKey(newKey());
    setError('');
    setIssueOpen(true);
  }

  function openVoid() {
    if (voidKey === '' || !voidOutcomeUnknown.current) setVoidKey(newKey());
    setReason('');
    setError('');
    setVoidOpen(true);
  }

  if (query.isPending)
    return (
      <section className="invoice-detail" aria-label={t('invoicing.detail.ariaLabel')}>
        <PageHeader title={t('invoicing.detail.title')} />
        <Card title={t('invoicing.detail.title')}>
          <Skeleton label={t('invoicing.detail.loading')} />
        </Card>
      </section>
    );
  if (query.isError || !invoice)
    return (
      <section className="invoice-detail" aria-label={t('invoicing.detail.ariaLabel')}>
        <PageHeader title={t('invoicing.detail.title')} />
        <Card title={t('invoicing.detail.title')}>
          <ErrorState message={t('invoicing.detail.loadError')} onRetry={() => void query.refetch()} />
        </Card>
      </section>
    );

  const canPay = ['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status);
  const statusLabel = t(`invoicing.status.${invoice.status}`);
  function toast(message: string, tone: ToastTone = 'success') {
    setToasts((items) => [...items, { id: `inv-toast-${Date.now()}`, tone, message }]);
  }
  function issueFailed(failure: unknown) {
    issueOutcomeUnknown.current = isUnknownOutcome(failure);
    setError(
      describeFailure(failure, t('invoicing.detail.issueFailed'), (requestId) =>
        t('invoicing.requestId', { id: requestId }),
      ),
    );
  }
  function voidFailed(failure: unknown) {
    voidOutcomeUnknown.current = isUnknownOutcome(failure);
    setError(
      describeFailure(failure, t('invoicing.detail.voidFailed'), (requestId) =>
        t('invoicing.requestId', { id: requestId }),
      ),
    );
  }
  const lineColumns: Column<InvoiceLine>[] = [
    {
      key: 'productName',
      header: t('invoicing.detail.columns.product'),
      render: (line) => (
        <>
          <span className="doc-number">{line.productSku}</span> — {line.productName}
        </>
      ),
    },
    { key: 'quantity', header: t('invoicing.detail.columns.quantity'), numeric: true },
    {
      key: 'unitPrice',
      header: t('invoicing.detail.columns.unitPrice'),
      numeric: true,
      render: (line) => formatMoneyLocalized(line.unitPrice, currency, 4),
    },
    {
      key: 'lineTotal',
      header: t('invoicing.detail.columns.lineTotal'),
      numeric: true,
      render: (line) => formatMoneyLocalized(line.lineTotal, currency, 2),
    },
  ];
  return (
    <section className="invoice-detail" aria-label={t('invoicing.detail.ariaLabel')}>
      <PageHeader
        title={invoice.number ?? t('invoicing.detail.draftInvoice')}
        description={t('invoicing.detail.description')}
        primaryAction={
          <div className="invoice-header-actions">
            <Badge status={invoice.status}>{statusLabel}</Badge>
            <OverdueMarker dueDate={invoice.dueDate} balance={invoice.balance} />
            {invoice.status === 'DRAFT' && canIssue && (
              <Button variant="primary" onClick={openIssue}>
                {t('invoicing.detail.issue')}
              </Button>
            )}
            {canPay && canRecordPayment && (
              <Button
                variant="primary"
                onClick={() =>
                  navigate(
                    `/invoicing/payments/new?customer=${invoice.customerId}&invoice=${invoice.id}`,
                  )
                }
              >
                {t('invoicing.detail.recordPayment')}
              </Button>
            )}
            {['DRAFT', 'ISSUED'].includes(invoice.status) && canVoid && (
              <Button variant="danger" onClick={openVoid}>
                {t('invoicing.detail.void')}
              </Button>
            )}
            <Button onClick={() => window.print()}>{t('invoicing.detail.print')}</Button>
          </div>
        }
      />
      <div className="print-only invoice-print-header" aria-hidden="true">
        <div className="invoice-print-header__title">{t('invoicing.detail.printHeader')}</div>
        <div className="invoice-print-header__label">{invoice.label}</div>
        <div className="invoice-print-header__meta">
          {t('invoicing.detail.printMeta', {
            number: invoice.number ?? t('invoicing.detail.draftInvoice'),
            status: statusLabel,
            issueDate: invoice.issueDate ?? t('invoicing.detail.notIssuedLower'),
          })}
        </div>
      </div>
      <Card title={t('invoicing.detail.cards.invoiceDetails')}>
        <dl className="invoice-details-grid">
          <dt>{t('invoicing.detail.fields.customer')}</dt>
          <dd>{invoice.customerName}</dd>
          <dt>{t('invoicing.detail.fields.salesOrder')}</dt>
          <dd>
            <Link to={`/sales/${invoice.orderId}`} className="doc-number">
              {invoice.orderNumber}
            </Link>
          </dd>
          <dt>{t('invoicing.detail.fields.issueDate')}</dt>
          <dd>{invoice.issueDate ?? t('invoicing.detail.notIssued')}</dd>
          <dt>{t('invoicing.detail.fields.dueDate')}</dt>
          <dd>
            {invoice.status === 'DRAFT' && canWrite ? (
              <div className="due-date-editor">
                <Input
                  id="invoice-due-date"
                  label={t('invoicing.detail.fields.dueDate')}
                  type="date"
                  min={today}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  error={dueDateError || undefined}
                />
                <Button
                  disabled={updateDate.isPending || dueDate === invoice.dueDate}
                  onClick={() =>
                    updateDate.mutate(
                      { id, dueDate: dueDate || null, version: invoice.version },
                      {
                        onSuccess: () => toast(t('invoicing.detail.dueDateUpdated')),
                        onError: (failure) =>
                          setDueDateError(
                            describeFailure(
                              failure,
                              t('invoicing.detail.dueDateError'),
                              (requestId) => t('invoicing.requestId', { id: requestId }),
                            ),
                          ),
                      },
                    )
                  }
                >
                  {t('invoicing.detail.saveDueDate')}
                </Button>
              </div>
            ) : (
              invoice.dueDate
            )}
          </dd>
        </dl>
      </Card>
      <Card title={t('invoicing.detail.cards.lines')}>
        <DataTable<InvoiceLine>
          columns={lineColumns}
          data={invoice.lines}
          total={invoice.lines.length}
          page={1}
          pageSize={Math.max(invoice.lines.length, 1)}
        />
        <div className="invoice-totals">
          <span>{t('invoicing.detail.total')}</span>
          <strong>{formatMoneyLocalized(invoice.total, currency, 2)}</strong>
          <span>{t('invoicing.detail.paid')}</span>
          <strong>{formatMoneyLocalized(invoice.paid, currency, 2)}</strong>
          <span>{t('invoicing.detail.balanceDue')}</span>
          <strong>{formatMoneyLocalized(invoice.balance, currency, 2)}</strong>
        </div>
      </Card>
      <Card title={t('invoicing.detail.cards.paymentsApplied')}>
        {invoice.paymentsApplied.length === 0 ? (
          <p>{t('invoicing.detail.noPaymentsApplied')}</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('invoicing.payment.columns.payment')}</th>
                  <th>{t('invoicing.payment.columns.date')}</th>
                  <th className="numeric-cell">{t('invoicing.payment.columns.amountAllocated')}</th>
                  <th>{t('invoicing.payment.columns.status')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.paymentsApplied.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td>
                      <Link className="doc-number" to={`/invoicing/payments/${payment.paymentId}`}>
                        {payment.paymentNumber}
                      </Link>
                    </td>
                    <td>{payment.paymentDate}</td>
                    <td className="numeric-cell">{formatMoneyLocalized(payment.amount, currency, 2)}</td>
                    <td>
                      {payment.reversed
                        ? t('invoicing.detail.paymentStatus.REVERSED')
                        : t('invoicing.detail.paymentStatus.RECORDED')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DocumentTrail
        recordType="Invoice"
        recordNumber={invoice.number}
        emptyMessage={t('invoicing.detail.documentTrailEmpty')}
      />
      {invoice.status === 'VOID' && (
        <Card title={t('invoicing.detail.cards.voidRecord')}>
          <p>{invoice.voidReason}</p>
          <p>{t('invoicing.detail.voidedOn', { date: invoice.voidedAt ?? '—' })}</p>
        </Card>
      )}
      {invoice.status !== 'DRAFT' && invoice.status !== 'VOID' && (
        <p className="invoice-permanent">{t('invoicing.detail.invoicePermanent')}</p>
      )}
      <ConfirmDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onConfirm={() =>
          issue.mutate(
            { id, idempotencyKey: issueKey },
            {
              onSuccess: (result) => {
                // The attempt ended with a definite answer: the next open is a
                // new attempt and gets a new key.
                issueOutcomeUnknown.current = false;
                setIssueKey('');
                setIssueOpen(false);
                toast(
                  t('invoicing.detail.issuedToast', {
                    number: result.number ?? t('invoicing.detail.draftInvoice'),
                  }),
                );
                void query.refetch();
              },
              onError: issueFailed,
            },
          )
        }
        title={t('invoicing.detail.issueTitle')}
        description={t('invoicing.detail.issueDescription')}
        actionLabel={t('invoicing.detail.issueActionLabel')}
        loading={issue.isPending}
        error={error}
      />
      <Dialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title={t('invoicing.detail.voidTitle')}
        actions={
          <>
            <Button onClick={() => setVoidOpen(false)}>{t('common.actions.cancel')}</Button>
            <Button
              variant="danger"
              disabled={voidAction.isPending}
              loading={voidAction.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  setError(t('invoicing.detail.reasonRequired'));
                  return;
                }
                voidAction.mutate(
                  { id, reason, idempotencyKey: voidKey },
                  {
                    onSuccess: (result) => {
                      voidOutcomeUnknown.current = false;
                      setVoidKey('');
                      setVoidOpen(false);
                      toast(
                        t('invoicing.detail.voidToast', {
                          number: result.number ?? t('invoicing.detail.draftInvoice'),
                        }),
                      );
                      void query.refetch();
                    },
                    onError: voidFailed,
                  },
                );
              }}
            >
              {t('invoicing.detail.voidActionLabel')}
            </Button>
          </>
        }
      >
        <p>{t('invoicing.detail.voidDescription')}</p>
        <Textarea
          id="invoice-void-reason"
          label={t('invoicing.detail.voidReason')}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={error}
        />
      </Dialog>
      {toasts.map((item) => (
        <Toast
          key={item.id}
          id={item.id}
          tone={item.tone}
          message={item.message}
          onDismiss={() => setToasts((list) => list.filter((toastItem) => toastItem.id !== item.id))}
        />
      ))}
    </section>
  );
}
