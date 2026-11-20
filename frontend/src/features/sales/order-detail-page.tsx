import { useTranslation } from 'react-i18next';

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
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { compactQuantity } from '../../lib/quantity';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useSalesOrder,
  useShipSalesOrder,
} from './use-sales';
import type { SalesOrder, SalesOrderLine } from '../../services/catalog-service';
import { INVENTORY_PERMISSIONS, INVOICING_PERMISSIONS, SALES_PERMISSIONS } from '@nexuserp/shared';
import { hasPermission, useSession } from '../../services/auth-session';
import { useCreateInvoice, useInvoiceForOrder } from '../invoicing/use-invoicing';
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
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  const { data: order, isPending, isError, error } = useSalesOrder(orderId);
  const confirm = useConfirmSalesOrder();
  const ship = useShipSalesOrder();
  const cancel = useCancelSalesOrder();
  // The order's non-void invoice, if it already has one. The query is keyed by
  // this order and is only used by the SHIPPED action below.
  const invoiceForOrder = useInvoiceForOrder(orderId);
  const createInvoice = useCreateInvoice();
  const session = useSession();
  // What the member may do: writes are sales.write, the shipment is a stock
  // movement and declares inventory.ship, and the invoice is an invoicing write.
  const canWrite = hasPermission(session, SALES_PERMISSIONS.write);
  const mayShip = hasPermission(session, INVENTORY_PERMISSIONS.ship);
  const canInvoice = hasPermission(session, INVOICING_PERMISSIONS.write);

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
  const [cancelKey, setCancelKey] = useState('');
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  // Shipment history: the order detail carries it, newest first.
  const shipments = order?.shipments ?? [];

  if (isPending) {
    return (
      <section className="order-detail-page" aria-label={t('sales.detail.sectionAria')}>
        <PageHeader title={t('sales.detail.title')} />
        <Card title={t('sales.detail.title')}>
          <Skeleton label={t('sales.detail.loading')} />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-detail-page" aria-label={t('sales.detail.sectionAria')}>
        <PageHeader title={t('sales.detail.title')} />
        <Card title={t('sales.detail.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('sales.detail.loadError')}
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

  function openCancel() {
    // The cancel dialog follows the same rule: one key per open dialog.
    setCancelKey(`cnc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setCancelOpen(true);
  }

  function handleConfirm() {
    if (order === undefined) return;
    confirm.mutate(
      { orderId: order.id, idempotencyKey: confirmKey, version: order.version },
      {
        onSuccess: (result) => {
          setConfirmOpen(false);
          setConfirmError(undefined);
          pushToast('success', t('sales.detail.confirmedToast', { number: result.number }));
        },
        onError: (mutationError) => {
          // The dialog stays open: the shortage is visible where the action
          // was taken, and the same idempotency key is reused on retry.
          setConfirmError(
            mutationError instanceof Error ? mutationError.message : t('sales.detail.confirmFailed'),
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
          pushToast('success', t('sales.detail.shippedToast', { number: result.shipment.number }));
        },
        onError: (mutationError) => {
          setShipError(mutationError instanceof Error ? mutationError.message : t('sales.detail.shipFailed'));
        },
      },
    );
  }

  function handleCancel() {
    if (order === undefined) return;
    cancel.mutate(
      { orderId: order.id, idempotencyKey: cancelKey, version: order.version },
      {
        onSuccess: (result) => {
          setCancelOpen(false);
          pushToast('success', t('sales.detail.cancelledToast', { number: result.number }));
        },
        onError: (mutationError) => {
          setCancelOpen(false);
          pushToast('failure', mutationError instanceof Error ? mutationError.message : t('sales.detail.cancelFailed'));
        },
      },
    );
  }

  function handleCreateInvoice() {
    if (order === undefined) return;
    createInvoice.mutate(
      { orderId: order.id },
      {
        onSuccess: (result) => {
          navigate(`/invoicing/${result.id}`, {
            state: { notice: t('sales.detail.draftCreatedToast') },
          });
        },
        onError: (mutationError) => {
          // The server stays the authority: a stale SHIPPED read, a duplicate
          // invoice or a missing permission is shown where the action was
          // taken, with the message the service sent.
          pushToast(
            'failure',
            mutationError instanceof Error
              ? mutationError.message
              : t('sales.detail.invoiceCreateFailed'),
          );
        },
      },
    );
  }

  const status = order.status;
  const canEdit = status === 'DRAFT' && canWrite;
  const canConfirm = status === 'DRAFT' && canWrite;
  const canShip = status === 'CONFIRMED' && mayShip;
  const canCancel = (status === 'DRAFT' || status === 'CONFIRMED') && canWrite;
  const isShipped = status === 'SHIPPED';
  const showReserved = status === 'CONFIRMED' || isShipped;

  const columns: Column<LineRow>[] = [
    {
      key: 'productSku',
      header: t('sales.detail.columns.product'),
      render: (row) => (
        <span>
          <span className="mono">{row.productSku}</span> — {row.productName}
        </span>
      ),
    },
    { key: 'quantity', header: t('sales.detail.columns.quantity'), numeric: true, render: (row) => <span className="qty">{row.quantity}</span> },
    ...(showReserved
      ? [{ key: 'reserved', header: t('sales.detail.columns.reserved'), numeric: true, render: (row: LineRow) => <span className="qty">{row.reserved}</span> }]
      : []),
    { key: 'unitPrice', header: t('sales.detail.columns.unitPrice'), numeric: true, render: (row) => <span className="qty">{row.unitPrice}</span> },
    { key: 'lineTotal', header: t('sales.detail.columns.lineTotal'), numeric: true, render: (row) => <span className="qty">{row.lineTotal}</span> },
  ];

  return (
    <section className="order-detail-page" aria-label={t('sales.detail.sectionAria')}>
      {notice !== undefined && !dismissedNotice && (
        <Toast id="page-notice" tone="success" message={notice} onDismiss={() => setDismissedNotice(true)} />
      )}
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}

      <PageHeader
        title={order.number}
        description={t('sales.detail.description', { name: order.customerName })}
        secondaryActions={[
          <div className="order-detail-page__actions" key="order-actions">
            {canConfirm && (
              <Button variant="primary" onClick={openConfirm}>
                {t('sales.detail.confirm')}
              </Button>
            )}
            {canShip && (
              <Button variant="primary" onClick={openShip}>
                {t('sales.detail.ship')}
              </Button>
            )}
            {canEdit && (
              <Button variant="default" onClick={() => navigate(`/sales/${order.id}/edit`)}>
                {t('sales.detail.edit')}
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={openCancel}>
                {t('sales.detail.cancel')}
              </Button>
            )}
            {/* The invoice is the next step once the order has shipped. When a
                non-void invoice already exists, the action becomes a link to
                it instead of offering a second one. */}
            {isShipped && (
              <span className="order-detail-page__invoice-action">
                {invoiceForOrder.data ? (
                  <Link className="doc-number" to={`/invoicing/${invoiceForOrder.data.id}`}>
                    {t('sales.detail.viewInvoice', {
                      number:
                        invoiceForOrder.data.number ?? t('invoicing.detail.draftInvoice'),
                    })}
                  </Link>
                ) : (
                  <Button
                    variant="default"
                    disabled={!canInvoice || invoiceForOrder.isPending || createInvoice.isPending}
                    reason={!canInvoice ? t('sales.detail.noInvoicePermission') : undefined}
                    onClick={handleCreateInvoice}
                  >
                    {t('sales.detail.createInvoice')}
                  </Button>
                )}
              </span>
            )}
            <Button variant="default" onClick={() => navigate('/sales')}>
              {t('sales.detail.backToList')}
            </Button>
          </div>,
        ]}
        primaryAction={
          <div className="order-detail-page__status">
            <Badge status={status}>{t(`sales.status.${status}`)}</Badge>
          </div>
        }
      />

      <Card title={t('sales.detail.cards.details')}>
        <dl className="order-detail-page__details">
          <dt>{t('sales.detail.fields.customer')}</dt>
          <dd>{order.customerName}</dd>
          <dt>{t('sales.detail.fields.warehouse')}</dt>
          <dd>{order.warehouseName}</dd>
          <dt>{t('sales.detail.fields.orderDate')}</dt>
          <dd>{order.orderDate}</dd>
          <dt>{t('sales.detail.fields.notes')}</dt>
          <dd>{order.notes === '' ? '—' : order.notes}</dd>
        </dl>
      </Card>

      <Card title={t('sales.detail.cards.lines')}>
        <DataTable<LineRow>
          columns={columns}
          data={lineRows(order)}
          total={order.lines.length}
          page={1}
          pageSize={Math.max(1, order.lines.length)}
          emptyMessage={t('sales.detail.linesEmpty')}
        />
        <div className="order-detail-page__total">
          <span>{t('sales.detail.total')}</span>
          <strong className="qty">{formatMoneyLocalized(order.total, currency, 2)}</strong>
        </div>
      </Card>

      <Card title={t('sales.detail.cards.shipmentsHistory')}>
        {shipments.length === 0 ? (
          <p className="order-detail-page__receipts-empty">{t('sales.detail.shipmentsEmpty')}</p>
        ) : (
          <ul className="order-detail-page__receipts">
            {shipments.map((shipment) => (
              <li key={shipment.id}>
                <span className="mono">{shipment.number}</span>
                <span>{shipment.shippedAt.replace('T', ' ').replace('Z', '')}</span>
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
        <p className="movements__note">{t('sales.shipments.note')}</p>
      </Card>

      <DocumentTrail recordType="Sales order" recordNumber={order.number} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmError(undefined);
        }}
        onConfirm={handleConfirm}
        title={t('sales.confirm.title')}
        description={t('sales.confirm.description')}
        actionLabel={t('sales.confirm.actionLabel')}
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
        title={t('sales.ship.title')}
        description={t('sales.ship.description')}
        actionLabel={t('sales.ship.actionLabel')}
        loading={ship.isPending}
        error={shipError}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title={t('sales.cancel.title')}
        description={
          status === 'CONFIRMED'
            ? t('sales.cancel.descriptionReserved')
            : t('sales.cancel.description')
        }
        actionLabel={t('sales.cancel.actionLabel')}
        destructive
        loading={cancel.isPending}
      />
    </section>
  );
}
