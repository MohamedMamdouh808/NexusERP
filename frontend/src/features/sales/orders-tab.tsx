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
import { formatMoneyGrouped } from '../../lib/format';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useSalesOrders,
  useShipSalesOrder,
} from './use-sales';
import type { SalesOrderStatus } from '../../services/catalog-service';

const STATUSES: readonly SalesOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'SHIPPED',
  'CANCELLED',
];

type OrderRow = {
  id: string;
  number: string;
  customerName: string;
  warehouseName: string;
  status: SalesOrderStatus;
  orderDate: string;
  total: string;
};

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
  const [shipTarget, setShipTarget] = useState<{ id: string; number: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string; status: SalesOrderStatus } | null>(null);
  // Mutations that can be refused with reasons show the banner inside the
  // dialog, which stays open; a retry reuses the key generated at open.
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [shipError, setShipError] = useState<string | undefined>(undefined);
  const [confirmKey, setConfirmKey] = useState('');
  const [shipKey, setShipKey] = useState('');

  const { data, isPending, isError, error } = useSalesOrders({
    search,
    status: (status as SalesOrderStatus) || undefined,
    page,
    pageSize,
    sort,
    direction,
  });
  const confirmMutation = useConfirmSalesOrder();
  const shipMutation = useShipSalesOrder();
  const cancelMutation = useCancelSalesOrder();

  const orders = data?.items ?? [];
  const total = data?.total ?? 0;

  function pushToast(tone: ToastTone, message: string) {
    setToasts((prev) => [...prev, { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`, tone, message }]);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function openConfirmFromRow(row: OrderRow) {
    // The idempotency key is generated when the dialog opens and reused on
    // retry while it stays open, so a double click reserves one set.
    setConfirmKey(`cnf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setConfirmError(undefined);
    setConfirmTarget({ id: row.id, number: row.number });
  }

  function openShipFromRow(row: OrderRow) {
    // Same discipline as confirming: one key per open dialog, reused on retry.
    setShipKey(`shp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setShipError(undefined);
    setShipTarget({ id: row.id, number: row.number });
  }

  function handleConfirm() {
    if (confirmTarget === null) return;
    confirmMutation.mutate(
      { orderId: confirmTarget.id, idempotencyKey: confirmKey },
      {
        onSuccess: (result) => {
          setConfirmTarget(null);
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
    if (shipTarget === null) return;
    shipMutation.mutate(
      { orderId: shipTarget.id, idempotencyKey: shipKey },
      {
        onSuccess: (result) => {
          setShipTarget(null);
          setShipError(undefined);
          pushToast('success', `Shipment ${result.shipmentNumber} shipped. Stock is deducted.`);
        },
        onError: (mutationError) => {
          setShipError(mutationError instanceof Error ? mutationError.message : 'The order could not be shipped.');
        },
      },
    );
  }

  function handleCancelConfirmed() {
    if (cancelTarget === null) return;
    cancelMutation.mutate(cancelTarget.id, {
      onSuccess: (result) => {
        setCancelTarget(null);
        pushToast('success', `Sales order ${result.number} cancelled.`);
      },
      onError: (mutationError) => {
        setCancelTarget(null);
        pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be cancelled.');
      },
    });
  }

  // The dialog titles the order directly: the kebab passes the row's number.
  const confirmOrderNumber = confirmTarget?.number ?? '';
  const shipOrderNumber = shipTarget?.number ?? '';
  const cancelOrderNumber = cancelTarget?.number ?? '';

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: 'SO number',
        sortable: true,
        render: (row) => (
          <a href={`/sales/${row.id}`} className="inventory-product-link">
            <span className="mono">{row.number}</span>
          </a>
        ),
      },
      { key: 'customerName', header: 'Customer', sortable: true },
      { key: 'warehouseName', header: 'Warehouse' },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row) => <Badge status={row.status}>{row.status}</Badge>,
      },
      { key: 'orderDate', header: 'Order date', sortable: true },
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
            { kind: 'item' as const, id: 'view', label: 'View', onSelect: () => navigate(`/sales/${row.id}`) },
            ...(row.status === 'DRAFT'
              ? [
                  { kind: 'item' as const, id: 'edit', label: 'Edit', onSelect: () => navigate(`/sales/${row.id}/edit`) },
                  { kind: 'item' as const, id: 'confirm', label: 'Confirm', onSelect: () => openConfirmFromRow(row) },
                ]
              : []),
            ...(row.status === 'CONFIRMED'
              ? [{ kind: 'item' as const, id: 'ship', label: 'Ship', onSelect: () => openShipFromRow(row) }]
              : []),
            ...(row.status === 'DRAFT' || row.status === 'CONFIRMED'
              ? [{ kind: 'item' as const, id: 'cancel', label: 'Cancel', onSelect: () => setCancelTarget({ id: row.id, number: row.number, status: row.status }) }]
              : []),
          ];
          return <KebabMenu label={`Actions for sales order ${row.number}`} entries={entries} />;
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
    customerName: order.customerName,
    warehouseName: order.warehouseName,
    status: order.status,
    orderDate: order.orderDate,
    total: formatMoneyGrouped(order.total),
  }));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setPage(1);
  }

  return (
    <div className="orders-tab" aria-label="Sales orders">
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title="Sales orders">
          <Skeleton label="Loading sales orders" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Sales orders">
          <ErrorState
            message={error instanceof Error ? error.message : 'The sales orders could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title="No sales orders yet"
          description="Create your first sales order to ship stock to a customer."
          actionLabel="New Sales Order"
          onAction={() => navigate('/sales/new')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No sales orders match your filters"
          description="Try adjusting the search or status filter to see orders."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <Card title="Sales orders">
          <div className="purchase-orders__toolbar">
            <Input
              id="sales-order-search"
              label="Search"
              placeholder="SO number, customer or product"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="sales-order-status"
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
            emptyMessage="No sales orders found."
          />
        </Card>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => {
          setConfirmTarget(null);
          setConfirmError(undefined);
        }}
        onConfirm={handleConfirm}
        title={confirmTarget !== null ? `Confirm sales order ${confirmOrderNumber}` : 'Confirm sales order'}
        description="Confirming reserves stock for every line of this order. A confirmed order can no longer be edited; to change it, cancel it and create a new one."
        actionLabel="Confirm order"
        loading={confirmMutation.isPending}
        error={confirmError}
      />
      <ConfirmDialog
        open={shipTarget !== null}
        onClose={() => {
          setShipTarget(null);
          setShipError(undefined);
        }}
        onConfirm={handleShipConfirmed}
        title={shipTarget !== null ? `Ship sales order ${shipOrderNumber}` : 'Ship sales order'}
        description="Shipping deducts the stock from the warehouse and consumes the reservation, and the shipment becomes permanent: it cannot be edited or deleted."
        actionLabel="Ship order"
        loading={shipMutation.isPending}
        error={shipError}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirmed}
        title={cancelTarget !== null ? `Cancel sales order ${cancelOrderNumber}` : 'Cancel sales order'}
        description={
          cancelTarget?.status === 'CONFIRMED'
            ? 'Cancelling releases the stock this order reserved back to the warehouse, and the cancelled order is permanent: it cannot be reopened. It is kept for the audit trail.'
            : 'A cancelled order is permanent: it cannot be reopened, and it is kept for the audit trail.'
        }
        actionLabel="Cancel order"
        destructive
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
