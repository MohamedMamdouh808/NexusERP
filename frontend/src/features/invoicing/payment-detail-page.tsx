import { useTranslation } from 'react-i18next';

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PAYMENT_PERMISSIONS } from '@nexuserp/shared';
import { PageHeader } from '../../components/shell/page-header';
import { Badge, Button, Card, Dialog, ErrorState, Skeleton, Textarea, Toast } from '../../components/ui';
import type { ToastTone } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import type { PaymentMethod } from '../../services/catalog-service';
import { usePayment, useReversePayment } from './use-invoicing';
import { describeFailure, isUnknownOutcome } from './errors';
import { DocumentTrail } from '../../components/ui/document-trail';

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PaymentDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const session = useSession();
  const canReverse = hasPermission(session, PAYMENT_PERMISSIONS.reverse);
  const query = usePayment(id);
  const reverse = useReversePayment();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [idem, setIdem] = useState('');
  // An attempt whose outcome never reached us keeps its key: reopening resumes
  // the same attempt rather than risking a second reversal attempt.
  const outcomeUnknown = useRef(false);
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);
  const noticeConsumed = useRef(false);
  const methodLabel = (method: PaymentMethod) =>
    method === 'CASH'
      ? t('invoicing.form.methodCash')
      : method === 'BANK_TRANSFER'
        ? t('invoicing.form.methodBankTransfer')
        : method === 'CARD'
          ? t('invoicing.form.methodCard')
          : t('invoicing.form.methodOther');

  useEffect(() => {
    const state = location.state;
    if (noticeConsumed.current || !state || typeof state !== 'object' || !('notice' in state)) {
      return;
    }
    noticeConsumed.current = true;
    setToasts((items) => [
      ...items,
      {
        id: `payment-created-${Date.now()}`,
        tone: 'success',
        message: String((state as { notice: unknown }).notice),
      },
    ]);
    navigate(location.pathname, { replace: true });
  }, [location.state, location.pathname, navigate]);

  function openReverse() {
    if (!canReverse) return;
    if (idem === '' || !outcomeUnknown.current) setIdem(newKey());
    setError('');
    setReason('');
    setOpen(true);
  }

  if (query.isPending)
    return (
      <section aria-label={t('invoicing.payment.ariaLabel')}>
        <PageHeader title={t('invoicing.payment.title')} />
        <Card title={t('invoicing.payment.title')}>
          <Skeleton label={t('invoicing.payment.loading')} />
        </Card>
      </section>
    );
  if (query.isError || !query.data)
    return (
      <section aria-label={t('invoicing.payment.ariaLabel')}>
        <PageHeader title={t('invoicing.payment.title')} />
        <Card title={t('invoicing.payment.title')}>
          <ErrorState message={t('invoicing.payment.loadError')} onRetry={() => void query.refetch()} />
        </Card>
      </section>
    );

  const payment = query.data;
  const statusLabel = t(`invoicing.status.${payment.status}`);
  function toast(message: string) {
    setToasts((items) => [...items, { id: `payment-toast-${Date.now()}`, tone: 'success', message }]);
  }
  function reverseFailed(failure: unknown) {
    outcomeUnknown.current = isUnknownOutcome(failure);
    setError(
      describeFailure(failure, t('invoicing.payment.reverseFailed'), (requestId) =>
        t('invoicing.requestId', { id: requestId }),
      ),
    );
  }

  return (
    <section className="payment-detail" aria-label={t('invoicing.payment.ariaLabel')}>
      <PageHeader
        title={payment.number}
        description={t('invoicing.payment.paymentDetailDescription')}
        primaryAction={
          <div className="invoice-header-actions">
            <Badge status={payment.status}>{statusLabel}</Badge>
            {payment.status === 'RECORDED' && canReverse && (
              <Button variant="danger" onClick={openReverse}>
                {t('invoicing.payment.reversePayment')}
              </Button>
            )}
          </div>
        }
      />
      <Card title={t('invoicing.payment.summaryTitle')}>
        <dl className="invoice-details-grid">
          <dt>{t('invoicing.payment.fields.customer')}</dt>
          <dd>{payment.customerName}</dd>
          <dt>{t('invoicing.payment.fields.date')}</dt>
          <dd>{payment.paymentDate}</dd>
          <dt>{t('invoicing.payment.fields.method')}</dt>
          <dd>{methodLabel(payment.method)}</dd>
          <dt>{t('invoicing.payment.fields.amount')}</dt>
          <dd className="numeric-cell">{formatMoneyLocalized(payment.amount, currency, 2)}</dd>
          <dt>{t('invoicing.payment.fields.reference')}</dt>
          <dd>{payment.reference ?? '—'}</dd>
        </dl>
      </Card>
      <Card title={t('invoicing.payment.allocations')}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('invoicing.payment.columns.invoice')}</th>
                <th className="numeric-cell">{t('invoicing.payment.columns.amountAllocated')}</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((allocation) => (
                <tr key={allocation.invoiceId}>
                  <td>
                    <Link className="doc-number" to={`/invoicing/${allocation.invoiceId}`}>
                      {allocation.invoiceNumber ?? t('invoicing.detail.draftInvoice')}
                    </Link>
                  </td>
                  <td className="numeric-cell">{formatMoneyLocalized(allocation.amount, currency, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DocumentTrail recordType="Payment" recordNumber={payment.number} />
      {payment.status === 'REVERSED' && payment.reversal && (
        <Card title={t('invoicing.payment.reversal')}>
          <p>{payment.reversal.reason}</p>
          <p>
            {t('invoicing.payment.reversedOn', {
              date: payment.reversal.reversedAt.slice(0, 10),
            })}
          </p>
          <p>{t('invoicing.payment.reversalOf', { number: payment.number })}</p>
        </Card>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('invoicing.payment.reverseTitle')}
        actions={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.actions.cancel')}</Button>
            <Button
              variant="danger"
              loading={reverse.isPending}
              disabled={reverse.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  setError(t('invoicing.payment.reversalReasonRequired'));
                  return;
                }
                reverse.mutate(
                  { paymentId: payment.id, reason, idempotencyKey: idem },
                  {
                    onSuccess: (result) => {
                      // A definite answer ends the attempt; the next open is a
                      // new attempt with a new key.
                      outcomeUnknown.current = false;
                      setIdem('');
                      setOpen(false);
                      toast(t('invoicing.payment.reversedToast', { number: result.number }));
                      void query.refetch();
                    },
                    onError: reverseFailed,
                  },
                );
              }}
            >
              {t('invoicing.payment.reversePayment')}
            </Button>
          </>
        }
      >
        <p>{t('invoicing.payment.reverseDescription')}</p>
        <Textarea
          id="reverse-reason"
          label={t('invoicing.payment.reversalReason')}
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
          onDismiss={() => setToasts((items) => items.filter((value) => value.id !== item.id))}
        />
      ))}
    </section>
  );
}
