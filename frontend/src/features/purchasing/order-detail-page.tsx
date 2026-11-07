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
import { formatMoneyGrouped } from '../../lib/format';
import { useCancelPurchaseOrder, useConfirmPurchaseOrder, useGoodsReceipts, usePurchaseOrder } from './use-purchasing';
import { ReceiveGoodsDialog } from './receive-goods-dialog';
import { DocumentTrail } from '../../components/ui/document-trail';
import type { GoodsReceipt, PurchaseOrder } from '../../services/catalog-service';

type LineRow = {
  id: string;
  productSku: string;
  productName: string;
  quantity: string;
  received: string;
  outstanding: string;
  unitCost: string;
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
    lineTotal: line.lineTotal,
  }));
}

export function OrderDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const orderId = id ?? '';

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

  // Receipts history: one query narrowed by the order number as its search term.
  const { data: receiptsData } = useGoodsReceipts({
    search: order?.number,
    page: 1,
    pageSize: 50,
  });
  const receipts: readonly GoodsReceipt[] = receiptsData?.items ?? [];

  if (isPending) {
    return (
      <section className="order-detail-page" aria-label="Purchase order detail">
        <PageHeader title="Purchase order" />
        <Card title="Purchase order">
          <Skeleton label="Loading purchase order" />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-detail-page" aria-label="Purchase order detail">
        <PageHeader title="Purchase order" />
        <Card title="Purchase order">
          <ErrorState
            message={error instanceof Error ? error.message : 'The purchase order could not be loaded.'}
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
    confirm.mutate(order.id, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        pushToast('success', `Purchase order ${result.number} confirmed.`);
      },
      onError: (mutationError) => {
        setConfirmOpen(false);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be confirmed.');
      },
    });
  }

  function handleCancel() {
    if (order === undefined) return;
    cancel.mutate(order.id, {
      onSuccess: (result) => {
        setCancelOpen(false);
        pushToast('success', `Purchase order ${result.number} cancelled.`);
      },
      onError: (mutationError) => {
        setCancelOpen(false);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be cancelled.');
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
      header: 'Product',
      render: (row) => (
        <span>
          <span className="mono">{row.productSku}</span> — {row.productName}
        </span>
      ),
    },
    { key: 'quantity', header: 'Ordered', numeric: true, render: (row) => <span className="qty">{row.quantity}</span> },
    { key: 'received', header: 'Received', numeric: true, render: (row) => <span className="qty">{row.received}</span> },
    { key: 'outstanding', header: 'Outstanding', numeric: true, render: (row) => <span className="qty">{row.outstanding}</span> },
    { key: 'unitCost', header: 'Unit cost', numeric: true, render: (row) => <span className="qty">{row.unitCost}</span> },
    { key: 'lineTotal', header: 'Line total', numeric: true, render: (row) => <span className="qty">{row.lineTotal}</span> },
  ];

  return (
    <section className="order-detail-page" aria-label="Purchase order detail">
      {notice !== undefined && !dismissedNotice && (
        <Toast id="page-notice" tone="success" message={notice} onDismiss={() => setDismissedNotice(true)} />
      )}
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}

      <PageHeader
        title={order.number}
        description={`Purchase order from ${order.supplierName}`}
        secondaryActions={[
          <div className="order-detail-page__actions" key="order-actions">
            {canConfirm && (
              <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                Confirm
              </Button>
            )}
            {canReceive && (
              <Button variant="primary" onClick={openReceive}>
                Receive goods
              </Button>
            )}
            {canEdit && (
              <Button variant="default" onClick={() => navigate(`/purchasing/${order.id}/edit`)}>
                Edit
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            )}
            <Button variant="default" onClick={() => navigate('/purchasing')}>
              Back to list
            </Button>
          </div>,
        ]}
        primaryAction={
          <div className="order-detail-page__status">
            <Badge status={status}>{status}</Badge>
          </div>
        }
      />

      <Card title="Order details">
        <dl className="order-detail-page__details">
          <dt>Supplier</dt>
          <dd>{order.supplierName}</dd>
          <dt>Warehouse</dt>
          <dd>{order.warehouseName}</dd>
          <dt>Order date</dt>
          <dd>{order.orderDate}</dd>
          <dt>Expected date</dt>
          <dd>{order.expectedDate ?? '—'}</dd>
          <dt>Notes</dt>
          <dd>{order.notes === '' ? '—' : order.notes}</dd>
        </dl>
      </Card>

      <Card title="Lines">
        <DataTable<LineRow>
          columns={columns}
          data={lineRows(order)}
          total={order.lines.length}
          page={1}
          pageSize={Math.max(1, order.lines.length)}
          emptyMessage="This order has no lines."
        />
        <div className="order-detail-page__total">
          <span>Order total</span>
          <strong className="qty">{formatMoneyGrouped(order.total)}</strong>
        </div>
      </Card>

      <Card title="Receipts history">
        {receipts.length === 0 ? (
          <p className="order-detail-page__receipts-empty">No goods receipts against this order yet.</p>
        ) : (
          <ul className="order-detail-page__receipts">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <span className="mono">{receipt.number}</span>
                <span>{receipt.receiptDate.replace('T', ' ').replace('Z', '')}</span>
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
        <p className="movements__note">Receipts are permanent records.</p>
      </Card>

      <DocumentTrail recordType="Purchase order" recordNumber={order.number} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Confirm purchase order"
        description="Confirming locks this order. A confirmed order can no longer be edited or deleted; to change it, cancel it and create a new one."
        actionLabel="Confirm order"
        loading={confirm.isPending}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel purchase order"
        description="A cancelled order is permanent: it can no longer receive goods and cannot be reopened, and it is kept for the audit trail. An order that already has receipts cannot be cancelled."
        actionLabel="Cancel order"
        destructive
        loading={cancel.isPending}
      />

      {receiveOpen && (
        <ReceiveGoodsDialog
          orderId={order.id}
          idempotencyKey={receiveKey}
          onClose={() => setReceiveOpen(false)}
          onPosted={(grNumber) => pushToast('success', `Goods receipt ${grNumber} posted.`)}
        />
      )}
    </section>
  );
}
