import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  KebabMenu,
  Select,
  Skeleton,
  Toast,
} from '../../components/ui';
import type { Column, ToastTone } from '../../components/ui';
import { compactQuantity } from '../../lib/quantity';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { useCancelPurchaseOrder, useConfirmPurchaseOrder, usePurchaseOrders } from './use-purchasing';
import { ReceiveGoodsDialog } from './receive-goods-dialog';
import type { OrderProgress, PurchaseOrderSortField, PurchaseOrderStatus } from '../../services/catalog-service';

const STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

type OrderRow = {
  id: string;
  number: string;
  supplierName: string;
  warehouseName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  progress: OrderProgress;
  total: string;
  version: number;
};

/**
 * The progress cell, rendered from the server's own summary. The interface
 * never re-adds line quantities: the service computes the figures and the
 * screen shows them verbatim. A draft carries no progress at all.
 */
function progressText(progress: OrderProgress, t: TFunction): string {
  switch (progress.kind) {
    case 'QUANTITY':
      return t('purchasing.orders.progressQuantity', {
        received: compactQuantity(progress.receivedTotal),
        ordered: compactQuantity(progress.orderedTotal),
        unit: progress.unitOfMeasure,
      });
    case 'LINES':
      return t('purchasing.orders.progressLines', {
        received: progress.fullyReceivedLineCount,
        total: progress.lineCount,
      });
    case 'NONE':
      return '—';
  }
}

export function OrdersTab() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sort, setSort] = useState<PurchaseOrderSortField>('number');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  // Local toasts: the shell has no toast provider, so pages render Toast rows (see the gallery pattern).
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; number: string; version: number } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string; version: number } | null>(null);
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [receiveKey, setReceiveKey] = useState('');

  const { data, isPending, isError, error, refetch } = usePurchaseOrders({
    search,
    status: (status as PurchaseOrderStatus) || undefined,
    page,
    pageSize,
    sortBy: sort,
    sortOrder: direction,
  });
  const confirmMutation = useConfirmPurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();

  const orders = data?.items ?? [];
  const total = data?.total ?? 0;

  function pushToast(tone: ToastTone, message: string) {
    setToasts((prev) => [...prev, { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`, tone, message }]);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function openReceive(orderId: string) {
    // The idempotency key is generated when the dialog opens and reused on any
    // retry while it stays open, so a double click posts one receipt.
    setReceiveKey(`rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setReceiveOrderId(orderId);
  }

  function handleConfirm() {
    if (confirmTarget === null) return;
    confirmMutation.mutate({ id: confirmTarget.id, version: confirmTarget.version }, {
      onSuccess: (result) => {
        setConfirmTarget(null);
        pushToast('success', t('purchasing.detail.confirmedToast', { number: result.number }));
      },
      onError: (mutationError) => {
        setConfirmTarget(null);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.detail.confirmFailed'));
      },
    });
  }

  function handleCancelConfirmed() {
    if (cancelTarget === null) return;
    cancelMutation.mutate({ id: cancelTarget.id, version: cancelTarget.version }, {
      onSuccess: (result) => {
        setCancelTarget(null);
        pushToast('success', t('purchasing.detail.cancelledToast', { number: result.number }));
      },
      onError: (mutationError) => {
        setCancelTarget(null);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.detail.cancelFailed'));
      },
    });
  }

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: t('purchasing.orders.columns.poNumber'),
        sortable: true,
        render: (row) => (
          <a href={`/purchasing/${row.id}`} className="inventory-product-link">
            <span className="mono">{row.number}</span>
          </a>
        ),
      },
      { key: 'supplier', header: t('purchasing.orders.columns.supplier'), sortable: true, render: (row) => row.supplierName },
      { key: 'warehouseName', header: t('purchasing.orders.columns.warehouse') },
      {
        key: 'status',
        header: t('purchasing.orders.columns.status'),
        sortable: true,
        render: (row) => <Badge status={row.status}>{t(`purchasing.status.${row.status}`)}</Badge>,
      },
      { key: 'orderDate', header: t('purchasing.orders.columns.orderDate'), sortable: true },
      {
        key: 'progress',
        header: t('purchasing.orders.columns.received'),
        render: (row) => progressText(row.progress, t),
      },
      {
        key: 'total',
        header: t('purchasing.orders.columns.total'),
        sortable: true,
        numeric: true,
        render: (row) => formatMoneyLocalized(row.total, currency, 2),
      },
      {
        key: 'actions',
        header: t('purchasing.orders.columns.actions'),
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'view', label: t('purchasing.orders.view'), onSelect: () => navigate(`/purchasing/${row.id}`) },
            ...(row.status === 'DRAFT'
              ? [
                  { kind: 'item' as const, id: 'edit', label: t('purchasing.orders.edit'), onSelect: () => navigate(`/purchasing/${row.id}/edit`) },
                  { kind: 'item' as const, id: 'confirm', label: t('purchasing.orders.confirm'), onSelect: () => setConfirmTarget({ id: row.id, number: row.number, version: row.version }) },
                ]
              : []),
            ...(row.status === 'CONFIRMED' || row.status === 'PARTIALLY_RECEIVED'
              ? [{ kind: 'item' as const, id: 'receive', label: t('purchasing.orders.receive'), onSelect: () => openReceive(row.id) }]
              : []),
            ...(row.status === 'DRAFT' || row.status === 'CONFIRMED' || row.status === 'PARTIALLY_RECEIVED'
              ? [{ kind: 'item' as const, id: 'cancel', label: t('purchasing.orders.cancel'), onSelect: () => setCancelTarget({ id: row.id, number: row.number, version: row.version }) }]
              : []),
          ];
          return <KebabMenu label={`${t('purchasing.orders.columns.actions')} #${row.number}`} entries={entries} />;
        },
      },
    ],
    [navigate, t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  const hasFilters = search !== '' || status !== '';
  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    number: order.number,
    supplierName: order.supplierName,
    warehouseName: order.warehouseName,
    status: order.status,
    orderDate: order.orderDate,
    progress: order.progress,
    total: order.total,
    version: order.version,
  }));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setPage(1);
  }

  return (
    <div className="orders-tab" aria-label={t('purchasing.orders.sectionAria')}>
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title={t('purchasing.orders.title')}>
          <Skeleton label={t('purchasing.orders.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('purchasing.orders.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('purchasing.orders.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title={t('purchasing.orders.empty.title')}
          description={t('purchasing.orders.empty.description')}
          actionLabel={t('purchasing.orders.empty.actionLabel')}
          onAction={() => navigate('/purchasing/new')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('purchasing.orders.empty.filteredTitle')}
          description={t('purchasing.orders.empty.filteredDescription')}
          actionLabel={t('purchasing.orders.empty.filteredActionLabel')}
          onAction={clearFilters}
        />
      ) : (
        <Card title={t('purchasing.orders.title')}>
          <div className="purchase-orders__toolbar">
            <Input
              id="order-search"
              label={t('purchasing.orders.filters.search')}
              placeholder={t('purchasing.orders.filters.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="order-status"
              label={t('purchasing.orders.filters.status')}
              options={STATUSES.map((value) => ({ value, label: t(`purchasing.status.${value}`) }))}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder={t('purchasing.orders.filters.allStatuses')}
            />
          </div>
          <DataTable<OrderRow>
            columns={columns}
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn={sort}
            sortDirection={direction}
            onSortChange={(column, nextDirection) => {
              // The sortable column keys ARE the service's sort keys.
              setSort(column as PurchaseOrderSortField);
              setDirection(nextDirection);
              setPage(1);
            }}
            onPageChange={setPage}
            emptyMessage={t('purchasing.orders.empty.tableMessage')}
          />
        </Card>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title={t('purchasing.confirm.title')}
        description={t('purchasing.confirm.description')}
        actionLabel={t('purchasing.confirm.actionLabel')}
        loading={confirmMutation.isPending}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirmed}
        title={t('purchasing.cancel.title')}
        description={t('purchasing.cancel.description')}
        actionLabel={t('purchasing.cancel.actionLabel')}
        destructive
        loading={cancelMutation.isPending}
      />

      {receiveOrderId !== null && (
        <ReceiveGoodsDialog
          orderId={receiveOrderId}
          idempotencyKey={receiveKey}
          onClose={() => setReceiveOrderId(null)}
          onPosted={(grNumber) => pushToast('success', t('purchasing.detail.receiptPostedToast', { number: grNumber }))}
        />
      )}
    </div>
  );
}
