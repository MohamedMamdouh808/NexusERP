import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import { useShipments } from './use-sales';

type ShipmentRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  shippedAt: string;
  lineCount: number;
  user: string;
};

export function ShipmentsTab() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data, isPending, isError, error, refetch } = useShipments({
    search,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
    sortBy: 'number',
    sortOrder: 'asc',
  });

  const shipments = data?.items ?? [];
  const total = data?.total ?? 0;

  // The end date closes the range, so an end before the start is an error.
  const dateError =
    startDate !== '' && endDate !== '' && endDate < startDate
      ? t('sales.shipments.filters.endBeforeStart')
      : undefined;

  const columns: Column<ShipmentRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: t('sales.shipments.columns.shNumber'),
        render: (row) => <span className="mono">{row.number}</span>,
      },
      {
        key: 'orderNumber',
        header: t('sales.shipments.columns.soNumber'),
        render: (row) => (
          <a href={`/sales/${row.orderId}`} className="inventory-product-link">
            <span className="mono">{row.orderNumber}</span>
          </a>
        ),
      },
      { key: 'customerName', header: t('sales.shipments.columns.customer') },
      { key: 'warehouseName', header: t('sales.shipments.columns.warehouse') },
      { key: 'shippedAt', header: t('sales.shipments.columns.date') },
      {
        key: 'lineCount',
        header: t('sales.shipments.columns.lines'),
        numeric: true,
        render: (row) => <span className="qty">{row.lineCount}</span>,
      },
      { key: 'user', header: t('sales.shipments.columns.user') },
    ],
    [t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  const rows: ShipmentRow[] = shipments.map((shipment) => ({
    id: shipment.id,
    number: shipment.number,
    orderId: shipment.orderId,
    orderNumber: shipment.orderNumber,
    customerName: shipment.customerName,
    warehouseName: shipment.warehouseName,
    shippedAt: shipment.shippedAt,
    lineCount: shipment.lineCount,
    user: shipment.user,
  }));

  function clearFilters() {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasFilters = search !== '' || startDate !== '' || endDate !== '';

  return (
    <div className="receipts-tab" aria-label={t('sales.shipments.sectionAria')}>
      {isPending ? (
        <Card title={t('sales.shipments.title')}>
          <Skeleton label={t('sales.shipments.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('sales.shipments.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('sales.shipments.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title={t('sales.shipments.empty.title')}
          description={t('sales.shipments.empty.description')}
          actionLabel={t('sales.shipments.empty.actionLabel')}
          onAction={() => navigate('/sales')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('sales.shipments.empty.filteredTitle')}
          description={t('sales.shipments.empty.filteredDescription')}
          actionLabel={t('sales.shipments.empty.filteredActionLabel')}
          onAction={clearFilters}
        />
      ) : (
        <Card title={t('sales.shipments.title')}>
          <div className="goods-receipts__toolbar">
            <Input
              id="shipment-search"
              label={t('sales.shipments.filters.search')}
              placeholder={t('sales.shipments.filters.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="shipment-start"
              label={t('sales.shipments.filters.fromDate')}
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="shipment-end"
              label={t('sales.shipments.filters.toDate')}
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              error={dateError}
            />
          </div>
          <p className="movements__note">{t('sales.shipments.note')}</p>
          <DataTable<ShipmentRow>
            columns={columns}
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="number"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage={t('sales.shipments.empty.tableMessage')}
          />
        </Card>
      )}
    </div>
  );
}
