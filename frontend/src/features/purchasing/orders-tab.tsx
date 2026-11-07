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
import { addQuantities } from '../../lib/quantity';
import { formatMoneyGrouped } from '../../lib/format';
import { useCancelPurchaseOrder, useConfirmPurchaseOrder, usePurchaseOrders } from './use-purchasing';
import { ReceiveGoodsDialog } from './receive-goods-dialog';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../services/catalog-service';

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
  receivedText: string;
  total: string;
};

/** "40 of 100 units" for the Received column, from the order's own lines. */
function receivedText(order: PurchaseOrder): string {
  if (order.lines.length === 0) return '—';
  const ordered = addQuantities(...order.lines.map((line) => line.quantity));
  const received = addQuantities(...order.lines.map((line) => line.received));
  return `${compactQuantity(received)} of ${compactQuantity(ordered)} units`;
}

export function OrdersTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sort, setSort] = useState('number');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  // Local toasts: the shell has no toast provider, so pages render Toast rows (see the gallery pattern).
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; number: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string } | null>(null);
  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [receiveKey, setReceiveKey] = useState('');

  const { data, isPending, isError, error } = usePurchaseOrders({
    search,
    status: (status as PurchaseOrderStatus) || undefined,
    page,
    pageSize,
    sort,
    direction,
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
    confirmMutation.mutate(confirmTarget.id, {
      onSuccess: (result) => {
        setConfirmTarget(null);
        pushToast('success', `Purchase order ${result.number} confirmed.`);
      },
      onError: (mutationError) => {
        setConfirmTarget(null);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be confirmed.');
      },
    });
  }

  function handleCancelConfirmed() {
    if (cancelTarget === null) return;
    cancelMutation.mutate(cancelTarget.id, {
      onSuccess: (result) => {
        setCancelTarget(null);
        pushToast('success', `Purchase order ${result.number} cancelled.`);
      },
      onError: (mutationError) => {
        setCancelTarget(null);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be cancelled.');
      },
    });
  }

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: 'PO number',
        sortable: true,
        render: (row) => (
          <a href={`/purchasing/${row.id}`} className="inventory-product-link">
            <span className="mono">{row.number}</span>
          </a>
        ),
      },
      { key: 'supplierName', header: 'Supplier', sortable: true },
      { key: 'warehouseName', header: 'Warehouse' },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row) => <Badge status={row.status}>{row.status}</Badge>,
      },
      { key: 'orderDate', header: 'Order date', sortable: true },
      { key: 'receivedText', header: 'Received' },
      {
        key: 'total',
        header: 'Total',
        sortable: true,
        numeric: true,
        render: (row) => row.total,
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'view', label: 'View', onSelect: () => navigate(`/purchasing/${row.id}`) },
            ...(row.status === 'DRAFT'
              ? [
                  { kind: 'item' as const, id: 'edit', label: 'Edit', onSelect: () => navigate(`/purchasing/${row.id}/edit`) },
                  { kind: 'item' as const, id: 'confirm', label: 'Confirm', onSelect: () => setConfirmTarget({ id: row.id, number: row.number }) },
                ]
              : []),
            ...(row.status === 'CONFIRMED' || row.status === 'PARTIALLY_RECEIVED'
              ? [{ kind: 'item' as const, id: 'receive', label: 'Receive goods', onSelect: () => openReceive(row.id) }]
              : []),
            ...(row.status === 'DRAFT' || row.status === 'CONFIRMED' || row.status === 'PARTIALLY_RECEIVED'
              ? [{ kind: 'item' as const, id: 'cancel', label: 'Cancel', onSelect: () => setCancelTarget({ id: row.id, number: row.number }) }]
              : []),
          ];
          return <KebabMenu label={`Actions for purchase order ${row.number}`} entries={entries} />;
        },
      },
    ],
    [navigate],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  const hasFilters = search !== '' || status !== '';
  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    number: order.number,
    supplierName: order.supplierName,
    warehouseName: order.warehouseName,
    status: order.status,
    orderDate: order.orderDate,
    receivedText: receivedText(order),
    total: formatMoneyGrouped(order.total),
  }));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setPage(1);
  }

  return (
    <div className="orders-tab" aria-label="Purchase orders">
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title="Purchase orders">
          <Skeleton label="Loading purchase orders" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Purchase orders">
          <ErrorState
            message={error instanceof Error ? error.message : 'The purchase orders could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title="No purchase orders yet"
          description="Create your first purchase order to buy stock from a supplier."
          actionLabel="New Purchase Order"
          onAction={() => navigate('/purchasing/new')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No purchase orders match your filters"
          description="Try adjusting the search or status filter to see orders."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <Card title="Purchase orders">
          <div className="purchase-orders__toolbar">
            <Input
              id="order-search"
              label="Search"
              placeholder="PO number, supplier or product"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="order-status"
              label="Status"
              options={STATUSES.map((value) => ({ value, label: value }))}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder="All statuses"
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
              setSort(column);
              setDirection(nextDirection);
              setPage(1);
            }}
            onPageChange={setPage}
            emptyMessage="No purchase orders found."
          />
        </Card>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title="Confirm purchase order"
        description="Confirming locks this order. A confirmed order can no longer be edited; to change it, cancel it and create a new one."
        actionLabel="Confirm order"
        loading={confirmMutation.isPending}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirmed}
        title="Cancel purchase order"
        description="A cancelled order is permanent: it can no longer receive goods and cannot be reopened, and it is kept for the audit trail. An order with receipts cannot be cancelled."
        actionLabel="Cancel order"
        destructive
        loading={cancelMutation.isPending}
      />

      {receiveOrderId !== null && (
        <ReceiveGoodsDialog
          orderId={receiveOrderId}
          idempotencyKey={receiveKey}
          onClose={() => setReceiveOrderId(null)}
          onPosted={(grNumber) => pushToast('success', `Goods receipt ${grNumber} posted.`)}
        />
      )}
    </div>
  );
}
