import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

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
import { compactQuantity } from '../../lib/quantity';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useSalesOrder,
  useShipSalesOrder,
  useShipments,
} from './use-sales';
import type { Shipment, SalesOrder, SalesOrderLine } from '../../services/catalog-service';
import { useCreateInvoice, useInvoices } from '../invoicing/use-invoicing';
import { DocumentTrail } from '../../components/ui/document-trail';

type LineRow = {
  id: string;
  productSku: string;
  productName: string;
  quantity: string;
  reserved: string;
  unitPrice: string;
  lineTotal: string;
};

/**
 * Reserved is derived from the status, never stored: while CONFIRMED the line
 * quantity is reserved, once shipped the reservation was consumed, and a
 * draft or cancelled order reserves nothing.
 */
function reservedFor(status: SalesOrder['status'], line: SalesOrderLine): string {
  if (status === 'CONFIRMED') return line.quantity;
  return '0.000';
}

function lineRows(order: SalesOrder | undefined): LineRow[] {
  if (order === undefined) return [];
  return order.lines.map((line) => ({
    id: line.id,
    productSku: line.productSku,
    productName: line.productName,
    quantity: line.quantity,
    reserved: reservedFor(order.status, line),
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
  }));
}

export function OrderDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const orderId = id ?? '';

  const { data: order, isPending, isError, error } = useSalesOrder(orderId);
  const confirm = useConfirmSalesOrder();
  const ship = useShipSalesOrder();
  const cancel = useCancelSalesOrder();
  const allInvoices = useInvoices({ page: 1, pageSize: 100 });
  const createInvoice = useCreateInvoice();

  // A notice arrives in navigation state: a created/saved order or an
  // explanation from the edit page's draft-only guard.
  const notice =
    location.state !== null && typeof location.state === 'object' && 'notice' in location.state
      ? String((location.state as { notice: unknown }).notice)
      : undefined;
  const [dismissedNotice, setDismissedNotice] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Refusable mutations show the banner inside the dialog; the key generated
  // at open is reused on retry, so retries never double-reserve or double-ship.
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [shipError, setShipError] = useState<string | undefined>(undefined);
  const [confirmKey, setConfirmKey] = useState('');
  const [shipKey, setShipKey] = useState('');
  const [invoiceKey, setInvoiceKey] = useState('');
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  // Shipment history: one query narrowed by the order number as its search term.
  const { data: shipmentsData } = useShipments({
    search: order?.number,
    page: 1,
    pageSize: 50,
  });
  const shipments: readonly Shipment[] = shipmentsData?.items ?? [];
  const orderInvoice = allInvoices.data?.items.find((invoice) => invoice.orderId === orderId && invoice.status !== 'VOID');

  if (isPending) {
    return (
      <section className="order-detail-page" aria-label="Sales order detail">
        <PageHeader title="Sales order" />
        <Card title="Sales order">
          <Skeleton label="Loading sales order" />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-detail-page" aria-label="Sales order detail">
        <PageHeader title="Sales order" />
        <Card title="Sales order">
          <ErrorState
            message={error instanceof Error ? error.message : 'The sales order could not be loaded.'}
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

  function openConfirm() {
    // The idempotency key is generated when the dialog opens and reused on retry.
    setConfirmKey(`cnf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setConfirmError(undefined);
    setConfirmOpen(true);
  }

  function openShip() {
    setShipKey(`shp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setShipError(undefined);
    setShipOpen(true);
  }

  function handleConfirm() {
    if (order === undefined) return;
    confirm.mutate(
      { orderId: order.id, idempotencyKey: confirmKey },
      {
        onSuccess: (result) => {
          setConfirmOpen(false);
          setConfirmError(undefined);
          pushToast('success', `Sales order ${result.number} confirmed. Stock is reserved.`);
        },
        onError: (mutationError) => {
          // The dialog stays open: the shortage is visible where the action
          // was taken, and the same idempotency key is reused on retry.
          setConfirmError(
            mutationError instanceof Error ? mutationError.message : 'The order could not be confirmed.',
          );
        },
      },
    );
  }

  function handleShipConfirmed() {
    if (order === undefined) return;
    ship.mutate(
      { orderId: order.id, idempotencyKey: shipKey },
      {
        onSuccess: (result) => {
          setShipOpen(false);
          setShipError(undefined);
          pushToast('success', `Shipment ${result.shipmentNumber} shipped. Stock is deducted.`);
        },
        onError: (mutationError) => {
          setShipError(mutationError instanceof Error ? mutationError.message : 'The order could not be shipped.');
        },
      },
    );
  }

  function handleCancel() {
    if (order === undefined) return;
    cancel.mutate(order.id, {
      onSuccess: (result) => {
        setCancelOpen(false);
        pushToast('success', `Sales order ${result.number} cancelled.`);
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
  const canShip = status === 'CONFIRMED';
  const canCancel = status === 'DRAFT' || status === 'CONFIRMED';
  const isShipped = status === 'SHIPPED';
  const showReserved = status === 'CONFIRMED' || isShipped;

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
    { key: 'quantity', header: 'Quantity', numeric: true, render: (row) => <span className="qty">{row.quantity}</span> },
    ...(showReserved
      ? [{ key: 'reserved', header: 'Reserved', numeric: true, render: (row: LineRow) => <span className="qty">{row.reserved}</span> }]
      : []),
    { key: 'unitPrice', header: 'Unit price', numeric: true, render: (row) => <span className="qty">{row.unitPrice}</span> },
    { key: 'lineTotal', header: 'Line total', numeric: true, render: (row) => <span className="qty">{row.lineTotal}</span> },
  ];

  return (
    <section className="order-detail-page" aria-label="Sales order detail">
      {notice !== undefined && !dismissedNotice && (
        <Toast id="page-notice" tone="success" message={notice} onDismiss={() => setDismissedNotice(true)} />
      )}
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}

      <PageHeader
        title={order.number}
        description={`Sales order for ${order.customerName}`}
        secondaryActions={[
          <div className="order-detail-page__actions" key="order-actions">
            {canConfirm && (
              <Button variant="primary" onClick={openConfirm}>
                Confirm
              </Button>
            )}
            {canShip && (
              <Button variant="primary" onClick={openShip}>
                Ship
              </Button>
            )}
            {canEdit && (
              <Button variant="default" onClick={() => navigate(`/sales/${order.id}/edit`)}>
                Edit
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            )}
            {orderInvoice && <Link className="sales-invoice-link" to={`/invoicing/${orderInvoice.id}`}>{orderInvoice.number ?? 'Draft invoice'} · {orderInvoice.status}</Link>}
            {isShipped && !orderInvoice && (
              <Button variant="default" loading={createInvoice.isPending} disabled={createInvoice.isPending} onClick={() => {
                const idempotencyKey = invoiceKey || globalThis.crypto?.randomUUID?.() || `invoice-${Date.now()}`;
                setInvoiceKey(idempotencyKey);
                createInvoice.mutate({ orderId, idempotencyKey }, { onSuccess: (result) => navigate(`/invoicing/${result.id}`, { state: { notice: 'Draft invoice created' } }), onError: () => pushToast('failure', 'Could not create an invoice for this order.') });
              }}>
                Create Invoice
              </Button>
            )}
            <Button variant="default" onClick={() => navigate('/sales')}>
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
          <dt>Customer</dt>
          <dd>{order.customerName}</dd>
          <dt>Warehouse</dt>
          <dd>{order.warehouseName}</dd>
          <dt>Order date</dt>
          <dd>{order.orderDate}</dd>
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

      <Card title="Shipment history">
        {shipments.length === 0 ? (
          <p className="order-detail-page__receipts-empty">No shipments against this order yet.</p>
        ) : (
          <ul className="order-detail-page__receipts">
            {shipments.map((shipment) => (
              <li key={shipment.id}>
                <span className="mono">{shipment.number}</span>
                <span>{shipment.shipmentDate.replace('T', ' ').replace('Z', '')}</span>
                <span>
                  {shipment.lines
                    .map((line) => `${compactQuantity(line.quantity)} × ${line.productSku}`)
                    .join(', ')}
                </span>
                <span>{shipment.user}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="movements__note">Shipments are permanent records.</p>
      </Card>

      <DocumentTrail recordType="Sales order" recordNumber={order.number} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmError(undefined);
        }}
        onConfirm={handleConfirm}
        title="Confirm sales order"
        description="Confirming reserves stock for every line of this order. A confirmed order can no longer be edited or deleted; to change it, cancel it and create a new one."
        actionLabel="Confirm order"
        loading={confirm.isPending}
        error={confirmError}
      />
      <ConfirmDialog
        open={shipOpen}
        onClose={() => {
          setShipOpen(false);
          setShipError(undefined);
        }}
        onConfirm={handleShipConfirmed}
        title="Ship sales order"
        description="Shipping deducts the stock from the warehouse and consumes the reservation, and the shipment becomes permanent: it cannot be edited or deleted."
        actionLabel="Ship order"
        loading={ship.isPending}
        error={shipError}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel sales order"
        description={
          status === 'CONFIRMED'
            ? 'Cancelling releases the stock this order reserved back to the warehouse, and the cancelled order is permanent: it cannot be reopened. It is kept for the audit trail.'
            : 'A cancelled order is permanent: it cannot be reopened, and it is kept for the audit trail.'
        }
        actionLabel="Cancel order"
        destructive
        loading={cancel.isPending}
      />
    </section>
  );
}
