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
import { compactQuantity } from '../../lib/quantity';
import { useGoodsReceipts } from './use-purchasing';
import type { GoodsReceiptSortField } from '../../services/catalog-service';

/** One row of the receipts table as the table consumes it. */
type ReceiptRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  supplierName: string;
  warehouseName: string;
  /** ISO timestamp, exactly as the service stamped it. */
  receivedAt: string;
  /** The date part (YYYY-MM-DD) for display. */
  receivedDate: string;
  lineCount: number;
  unitsText: string;
  user: string;
};

export function ReceiptsTab() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortBy, setSortBy] = useState<GoodsReceiptSortField>('receivedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // The end date closes the range, so an end before the start is an error.
  // The list query stays disabled while the range is invalid: the refusal is
  // said inline, before any request is made with a mistake in it.
  const dateError =
    startDate !== '' && endDate !== '' && endDate < startDate
      ? t('purchasing.receipts.filters.endBeforeStart')
      : undefined;

  const { data, isPending, isError, error, refetch } = useGoodsReceipts(
    {
      search,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    },
    { enabled: dateError === undefined },
  );

  const receipts = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<ReceiptRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: t('purchasing.receipts.columns.grNumber'),
        sortable: true,
        render: (row) => <span className="mono">{row.number}</span>,
      },
      {
        key: 'orderNumber',
        header: t('purchasing.receipts.columns.poNumber'),
        sortable: true,
        render: (row) => (
          <a href={`/purchasing/${row.orderId}`} className="inventory-product-link">
            <span className="mono">{row.orderNumber}</span>
          </a>
        ),
      },
      { key: 'supplier', header: t('purchasing.receipts.columns.supplier'), sortable: true, render: (row) => row.supplierName },
      { key: 'warehouseName', header: t('purchasing.receipts.columns.warehouse') },
      { key: 'receivedAt', header: t('purchasing.receipts.columns.receivedAt'), sortable: true, render: (row) => row.receivedDate },
      {
        key: 'lineCount',
        header: t('purchasing.receipts.columns.lines'),
        numeric: true,
        render: (row) => <span className="qty">{row.lineCount}</span>,
      },
      {
        key: 'unitsText',
        header: t('purchasing.receipts.columns.units'),
        numeric: true,
        render: (row) => <span className="qty">{row.unitsText}</span>,
      },
      { key: 'user', header: t('purchasing.receipts.columns.user') },
    ],
    [t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  const rows: ReceiptRow[] = receipts.map((receipt) => ({
    id: receipt.id,
    number: receipt.number,
    orderId: receipt.orderId,
    orderNumber: receipt.orderNumber,
    supplierName: receipt.supplierName,
    warehouseName: receipt.warehouseName,
    receivedAt: receipt.receivedAt,
    receivedDate: receipt.receivedAt.slice(0, 10),
    lineCount: receipt.lineCount,
    // The aggregate exists only when every line shares one unit of measure;
    // a mixed-unit receipt shows no combined figure.
    unitsText:
      receipt.receivedTotal !== undefined && receipt.unitOfMeasure !== undefined
        ? `${compactQuantity(receipt.receivedTotal)} ${receipt.unitOfMeasure}`
        : '—',
    user: receipt.user,
  }));

  function clearFilters() {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasFilters = search !== '' || startDate !== '' || endDate !== '';

  const toolbar = (
    <div className="goods-receipts__toolbar">
      <Input
        id="receipt-search"
        label={t('purchasing.receipts.filters.search')}
        placeholder={t('purchasing.receipts.filters.searchPlaceholder')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <Input
        id="receipt-start"
        label={t('purchasing.receipts.filters.fromDate')}
        type="date"
        value={startDate}
        onChange={(event) => {
          setStartDate(event.target.value);
          setPage(1);
        }}
      />
      <Input
        id="receipt-end"
        label={t('purchasing.receipts.filters.toDate')}
        type="date"
        value={endDate}
        onChange={(event) => {
          setEndDate(event.target.value);
          setPage(1);
        }}
        error={dateError}
      />
    </div>
  );

  return (
    <div className="receipts-tab" aria-label={t('purchasing.receipts.sectionAria')}>
      {dateError !== undefined ? (
        <Card title={t('purchasing.receipts.title')}>
          {toolbar}
        </Card>
      ) : isPending ? (
        <Card title={t('purchasing.receipts.title')}>
          <Skeleton label={t('purchasing.receipts.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('purchasing.receipts.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('purchasing.receipts.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title={t('purchasing.receipts.empty.title')}
          description={t('purchasing.receipts.empty.description')}
          actionLabel={t('purchasing.receipts.empty.actionLabel')}
          onAction={() => navigate('/purchasing')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('purchasing.receipts.empty.filteredTitle')}
          description={t('purchasing.receipts.empty.filteredDescription')}
          actionLabel={t('purchasing.receipts.empty.filteredActionLabel')}
          onAction={clearFilters}
        />
      ) : (
        <Card title={t('purchasing.receipts.title')}>
          {toolbar}
          <p className="movements__note">{t('purchasing.receipts.note')}</p>
          <DataTable<ReceiptRow>
            columns={columns}
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn={sortBy}
            sortDirection={sortOrder}
            onSortChange={(column, direction) => {
              // The sortable column keys ARE the service's sort keys.
              setSortBy(column as GoodsReceiptSortField);
              setSortOrder(direction);
              setPage(1);
            }}
            onPageChange={setPage}
            emptyMessage={t('purchasing.receipts.empty.tableMessage')}
            totalLabel={t('purchasing.receipts.totalLabel', { count: total })}
          />
        </Card>
      )}
    </div>
  );
}
