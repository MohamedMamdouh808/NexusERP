import { useTranslation } from 'react-i18next';

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
import { INVENTORY_PERMISSIONS, SALES_PERMISSIONS } from '@nexuserp/shared';
import type { Column, ToastTone } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useSalesOrders,
  useShipSalesOrder,
} from './use-sales';
import type { SalesOrderSortField, SalesOrderStatus } from '../../services/catalog-service';

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
  /** Confirm and cancel refuse a stale version, so the row carries it. */
  version: number;
};

export function OrdersTab() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sort, setSort] = useState<SalesOrderSortField>('number');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  // Local toasts: the shell has no toast provider, so pages render Toast rows (see the gallery pattern).
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; number: string; version: number } | null>(null);
  const [shipTarget, setShipTarget] = useState<{ id: string; number: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; number: string; status: SalesOrderStatus; version: number } | null>(null);
  // Mutations that can be refused with reasons show the banner inside the
  // dialog, which stays open; a retry reuses the key generated at open.
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [shipError, setShipError] = useState<string | undefined>(undefined);
  const [confirmKey, setConfirmKey] = useState('');
  const [shipKey, setShipKey] = useState('');
  const [cancelKey, setCancelKey] = useState('');

  const session = useSession();
  // What the member may do: writes are sales.write, the shipment is a stock
  // movement and declares inventory.ship.
  const canWrite = hasPermission(session, SALES_PERMISSIONS.write);
  const mayShip = hasPermission(session, INVENTORY_PERMISSIONS.ship);

  const { data, isPending, isError, error, refetch } = useSalesOrders({
    search,
    status: (status as SalesOrderStatus) || undefined,
    page,
    pageSize,
    sortBy: sort,
    sortOrder: direction,
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
    setConfirmTarget({ id: row.id, number: row.number, version: row.version });
  }

  function openShipFromRow(row: OrderRow) {
    // Same discipline as confirming: one key per open dialog, reused on retry.
    setShipKey(`shp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setShipError(undefined);
    setShipTarget({ id: row.id, number: row.number });
  }

  function openCancelFromRow(row: OrderRow) {
    // The cancel dialog follows the same rule: one key per open dialog.
    setCancelKey(`cnc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setCancelTarget({ id: row.id, number: row.number, status: row.status, version: row.version });
  }

  function handleConfirm() {
    if (confirmTarget === null) return;
    confirmMutation.mutate(
      { orderId: confirmTarget.id, idempotencyKey: confirmKey, version: confirmTarget.version },
      {
        onSuccess: (result) => {
          setConfirmTarget(null);
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
    if (shipTarget === null) return;
    shipMutation.mutate(
      { orderId: shipTarget.id, idempotencyKey: shipKey },
      {
        onSuccess: (result) => {
          setShipTarget(null);
          setShipError(undefined);
          pushToast('success', t('sales.detail.shippedToast', { number: result.shipment.number }));
        },
        onError: (mutationError) => {
          setShipError(mutationError instanceof Error ? mutationError.message : t('sales.detail.shipFailed'));
        },
      },
    );
  }

  function handleCancelConfirmed() {
    if (cancelTarget === null) return;
    cancelMutation.mutate(
      { orderId: cancelTarget.id, idempotencyKey: cancelKey, version: cancelTarget.version },
      {
        onSuccess: (result) => {
          setCancelTarget(null);
          pushToast('success', t('sales.detail.cancelledToast', { number: result.number }));
        },
        onError: (mutationError) => {
          setCancelTarget(null);
          pushToast('failure', mutationError instanceof Error ? mutationError.message : t('sales.detail.cancelFailed'));
        },
      },
    );
  }

  // The dialog titles the order directly: the kebab passes the row's number.
  const confirmOrderNumber = confirmTarget?.number ?? '';
  const shipOrderNumber = shipTarget?.number ?? '';
  const cancelOrderNumber = cancelTarget?.number ?? '';

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: t('sales.orders.columns.soNumber'),
        sortable: true,
        render: (row) => (
          <a href={`/sales/${row.id}`} className="inventory-product-link">
            <span className="mono">{row.number}</span>
          </a>
        ),
      },
      { key: 'customerName', header: t('sales.orders.columns.customer'), sortable: true },
      { key: 'warehouseName', header: t('sales.orders.columns.warehouse') },
      {
        key: 'status',
        header: t('sales.orders.columns.status'),
        sortable: true,
        render: (row) => <Badge status={row.status}>{t(`sales.status.${row.status}`)}</Badge>,
      },
      { key: 'orderDate', header: t('sales.orders.columns.orderDate'), sortable: true },
      {
        key: 'total',
        header: t('sales.orders.columns.total'),
        sortable: true,
        numeric: true,
        render: (row) => row.total,
      },
      {
        key: 'actions',
        header: t('sales.orders.columns.actions'),
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'view', label: t('sales.orders.view'), onSelect: () => navigate(`/sales/${row.id}`) },
            ...(row.status === 'DRAFT' && canWrite
              ? [{ kind: 'item' as const, id: 'confirm', label: t('sales.orders.confirm'), onSelect: () => openConfirmFromRow(row) }]
              : []),
            ...(row.status === 'DRAFT' && canWrite
              ? [{ kind: 'item' as const, id: 'edit', label: t('sales.orders.edit'), onSelect: () => navigate(`/sales/${row.id}/edit`) }]
              : []),
            ...(row.status === 'CONFIRMED' && mayShip
              ? [{ kind: 'item' as const, id: 'ship', label: t('sales.orders.ship'), onSelect: () => openShipFromRow(row) }]
              : []),
            ...((row.status === 'DRAFT' || row.status === 'CONFIRMED') && canWrite
              ? [{ kind: 'item' as const, id: 'cancel', label: t('sales.orders.cancel'), onSelect: () => openCancelFromRow(row) }]
              : []),
          ];
          return <KebabMenu label={`${t('sales.orders.columns.actions')} #${row.number}`} entries={entries} />;
        },
      },
    ],
    [navigate, t, canWrite, mayShip],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  const hasFilters = search !== '' || status !== '';
  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    warehouseName: order.warehouseName,
    status: order.status,
    orderDate: order.orderDate,
    total: formatMoneyLocalized(order.total, currency, 2),
    version: order.version,
  }));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setPage(1);
  }

  return (
    <div className="orders-tab" aria-label={t('sales.orders.sectionAria')}>
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title={t('sales.orders.title')}>
          <Skeleton label={t('sales.orders.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('sales.orders.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('sales.orders.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title={t('sales.orders.empty.title')}
          description={t('sales.orders.empty.description')}
          actionLabel={t('sales.orders.empty.actionLabel')}
          onAction={() => navigate('/sales/new')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('sales.orders.empty.filteredTitle')}
          description={t('sales.orders.empty.filteredDescription')}
          actionLabel={t('sales.orders.empty.filteredActionLabel')}
          onAction={clearFilters}
        />
      ) : (
        <Card title={t('sales.orders.title')}>
          <div className="purchase-orders__toolbar">
            <Input
              id="sales-order-search"
              label={t('sales.orders.filters.search')}
              placeholder={t('sales.orders.filters.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="sales-order-status"
              label={t('sales.orders.filters.status')}
              options={STATUSES.map((value) => ({ value, label: t(`sales.status.${value}`) }))}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder={t('sales.orders.filters.allStatuses')}
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
              const keys: readonly SalesOrderSortField[] = ['number', 'customer', 'status', 'orderDate', 'total'];
              if (keys.includes(column as SalesOrderSortField)) setSort(column as SalesOrderSortField);
              setDirection(nextDirection);
              setPage(1);
            }}
            onPageChange={setPage}
            emptyMessage={t('sales.orders.empty.tableMessage')}
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
        title={confirmTarget !== null ? t('sales.confirm.titleNumbered', { number: confirmOrderNumber }) : t('sales.confirm.title')}
        description={t('sales.confirm.description')}
        actionLabel={t('sales.confirm.actionLabel')}
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
        title={shipTarget !== null ? t('sales.ship.titleNumbered', { number: shipOrderNumber }) : t('sales.ship.title')}
        description={t('sales.ship.description')}
        actionLabel={t('sales.ship.actionLabel')}
        loading={shipMutation.isPending}
        error={shipError}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirmed}
        title={cancelTarget !== null ? t('sales.cancel.titleNumbered', { number: cancelOrderNumber }) : t('sales.cancel.title')}
        description={
          cancelTarget?.status === 'CONFIRMED'
            ? t('sales.cancel.descriptionReserved')
            : t('sales.cancel.description')
        }
        actionLabel={t('sales.cancel.actionLabel')}
        destructive
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
