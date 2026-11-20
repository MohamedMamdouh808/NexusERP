import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Skeleton,
  Toast,
} from '../../components/ui';
import type { Column, ToastTone } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { useCancelPurchaseOrder, useConfirmPurchaseOrder, usePurchaseOrder } from './use-purchasing';
import { ReceiveGoodsDialog } from './receive-goods-dialog';
import { DocumentTrail } from '../../components/ui/document-trail';
import type { PurchaseOrder } from '../../services/catalog-service';

type LineRow = {
  id: string;
  productSku: string;
  productName: string;
  quantity: string;
  received: string;
  outstanding: string;
  unitCost: string;
  unitOfMeasure: string;
  lineTotal: string;
};

function lineRows(order: PurchaseOrder | undefined): LineRow[] {
  if (order === undefined) return [];
  return order.lines.map((line) => ({
    id: line.id,
    productSku: line.productSku,
    productName: line.productName,
    quantity: line.quantity,
    received: line.received,
    outstanding: line.outstanding,
    unitCost: line.unitCost,
    unitOfMeasure: line.unitOfMeasure,
    lineTotal: line.lineTotal,
  }));
}

export function OrderDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const orderId = id ?? '';
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  const { data: order, isPending, isError, error } = usePurchaseOrder(orderId);
  const confirm = useConfirmPurchaseOrder();
  const cancel = useCancelPurchaseOrder();

  // A notice arrives in navigation state: a created/saved order or an
  // explanation from the edit page's draft-only guard.
  const notice =
    location.state !== null && typeof location.state === 'object' && 'notice' in location.state
      ? String((location.state as { notice: unknown }).notice)
      : undefined;
  const [dismissedNotice, setDismissedNotice] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveKey, setReceiveKey] = useState('');
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  // The receipt history travels embedded in the order's detail response.
  const receipts = order?.receipts ?? [];

  if (isPending) {
    return (
      <section className="order-detail-page" aria-label={t('purchasing.detail.sectionAria')}>
        <PageHeader title={t('purchasing.detail.title')} />
        <Card title={t('purchasing.detail.title')}>
          <Skeleton label={t('purchasing.detail.loading')} />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-detail-page" aria-label={t('purchasing.detail.sectionAria')}>
        <PageHeader title={t('purchasing.detail.title')} />
        <Card title={t('purchasing.detail.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('purchasing.detail.loadError')}
          />
        </Card>
      </section>
    );
  }

  function pushToast(tone: ToastTone, message: string) {
    setToasts((prev) => [...prev, { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`, tone, message }]);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function openReceive() {
    // The idempotency key is generated when the dialog opens and reused on retry.
    setReceiveKey(`rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setReceiveOpen(true);
  }

  function handleConfirm() {
    if (order === undefined) return;
    confirm.mutate({ id: order.id, version: order.version }, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        pushToast('success', t('purchasing.detail.confirmedToast', { number: result.number }));
      },
      onError: (mutationError) => {
        setConfirmOpen(false);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.detail.confirmFailed'));
      },
    });
  }

  function handleCancel() {
    if (order === undefined) return;
    cancel.mutate({ id: order.id, version: order.version }, {
      onSuccess: (result) => {
        setCancelOpen(false);
        pushToast('success', t('purchasing.detail.cancelledToast', { number: result.number }));
      },
      onError: (mutationError) => {
        setCancelOpen(false);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.detail.cancelFailed'));
      },
    });
  }

  const status = order.status;
  const canEdit = status === 'DRAFT';
  const canConfirm = status === 'DRAFT';
  const canCancel = status === 'DRAFT' || status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED';
  const canReceive = status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED';

  const columns: Column<LineRow>[] = [
    {
      key: 'productSku',
      header: t('purchasing.detail.columns.product'),
      render: (row) => (
        <span>
          <span className="mono">{row.productSku}</span> — {row.productName}
        </span>
      ),
    },
    { key: 'quantity', header: t('purchasing.detail.columns.quantity'), numeric: true, render: (row) => <span className="qty">{row.quantity}</span> },
    { key: 'unitOfMeasure', header: t('purchasing.detail.columns.unit'), render: (row) => row.unitOfMeasure },
    { key: 'received', header: t('purchasing.detail.columns.received'), numeric: true, render: (row) => <span className="qty">{row.received}</span> },
    { key: 'outstanding', header: t('purchasing.detail.columns.outstanding'), numeric: true, render: (row) => <span className="qty">{row.outstanding}</span> },
    { key: 'unitCost', header: t('purchasing.detail.columns.unitCost'), numeric: true, render: (row) => <span className="qty">{row.unitCost}</span> },
    { key: 'lineTotal', header: t('purchasing.detail.columns.lineTotal'), numeric: true, render: (row) => <span className="qty">{row.lineTotal}</span> },
  ];

  return (
    <section className="order-detail-page" aria-label={t('purchasing.detail.sectionAria')}>
      {notice !== undefined && !dismissedNotice && (
        <Toast id="page-notice" tone="success" message={notice} onDismiss={() => setDismissedNotice(true)} />
      )}
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}

      <PageHeader
        title={order.number}
        description={t('purchasing.detail.description', { name: order.supplierName })}
        secondaryActions={[
          <div className="order-detail-page__actions" key="order-actions">
            {canConfirm && (
              <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                {t('purchasing.detail.confirm')}
              </Button>
            )}
            {canReceive && (
              <Button variant="primary" onClick={openReceive}>
                {t('purchasing.detail.receive')}
              </Button>
            )}
            {canEdit && (
              <Button variant="default" onClick={() => navigate(`/purchasing/${order.id}/edit`)}>
                {t('purchasing.detail.edit')}
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                {t('purchasing.detail.cancel')}
              </Button>
            )}
            <Button variant="default" onClick={() => navigate('/purchasing')}>
              {t('purchasing.detail.backToList')}
            </Button>
          </div>,
        ]}
        primaryAction={
          <div className="order-detail-page__status">
            <Badge status={status}>{t(`purchasing.status.${status}`)}</Badge>
          </div>
        }
      />

      <Card title={t('purchasing.detail.cards.details')}>
        <dl className="order-detail-page__details">
          <dt>{t('purchasing.detail.fields.supplier')}</dt>
          <dd>{order.supplierName}</dd>
          <dt>{t('purchasing.detail.fields.warehouse')}</dt>
          <dd>{order.warehouseName}</dd>
          <dt>{t('purchasing.detail.fields.orderDate')}</dt>
          <dd>{order.orderDate}</dd>
          <dt>{t('purchasing.detail.fields.expectedDate')}</dt>
          <dd>{order.expectedDate ?? '—'}</dd>
          <dt>{t('purchasing.detail.fields.notes')}</dt>
          <dd>{order.notes === '' ? '—' : order.notes}</dd>
        </dl>
      </Card>

      <Card title={t('purchasing.detail.cards.lines')}>
        <DataTable<LineRow>
          columns={columns}
          data={lineRows(order)}
          total={order.lines.length}
          page={1}
          pageSize={Math.max(1, order.lines.length)}
          emptyMessage={t('purchasing.detail.linesEmpty')}
        />
        <div className="order-detail-page__total">
          <span>{t('purchasing.detail.total')}</span>
          <strong className="qty">{formatMoneyLocalized(order.total, currency, 2)}</strong>
        </div>
      </Card>

      <Card title={t('purchasing.detail.cards.receiptsHistory')}>
        {receipts.length === 0 ? (
          <p className="order-detail-page__receipts-empty">{t('purchasing.detail.receiptsEmpty')}</p>
        ) : (
          <ul className="order-detail-page__receipts">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <span className="mono">{receipt.number}</span>
                <span>{receipt.receivedAt.replace('T', ' ').replace(/(\.\d+)?Z$/, '')}</span>
                <span>
                  {receipt.lines
                    .map((line) => `${line.quantity} × ${line.productSku}`)
                    .join(', ')}
                </span>
                <span>{receipt.user}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="movements__note">{t('purchasing.receipts.note')}</p>
      </Card>

      <DocumentTrail recordType="Purchase order" recordNumber={order.number} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title={t('purchasing.confirm.title')}
        description={t('purchasing.confirm.description')}
        actionLabel={t('purchasing.confirm.actionLabel')}
        loading={confirm.isPending}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title={t('purchasing.cancel.title')}
        description={t('purchasing.cancel.description')}
        actionLabel={t('purchasing.cancel.actionLabel')}
        destructive
        loading={cancel.isPending}
      />

      {receiveOpen && (
        <ReceiveGoodsDialog
          orderId={order.id}
          idempotencyKey={receiveKey}
          onClose={() => setReceiveOpen(false)}
          onPosted={(grNumber) => pushToast('success', t('purchasing.detail.receiptPostedToast', { number: grNumber }))}
        />
      )}
    </section>
  );
}
