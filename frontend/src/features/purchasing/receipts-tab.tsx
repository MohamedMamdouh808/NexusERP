import { useMemo, useState } from 'react';

import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import { addQuantities, compactQuantity } from '../../lib/quantity';
import { useGoodsReceipts } from './use-purchasing';

type ReceiptRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  supplierName: string;
  warehouseName: string;
  receiptDate: string;
  unitsText: string;
  user: string;
};

export function ReceiptsTab() {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data, isPending, isError, error } = useGoodsReceipts({
    search,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
    sort: 'number',
    direction: 'asc',
  });

  const receipts = data?.items ?? [];
  const total = data?.total ?? 0;

  // The end date closes the range, so an end before the start is an error.
  const dateError =
    startDate !== '' && endDate !== '' && endDate < startDate
      ? 'The end date must not be before the start date.'
      : undefined;

  const columns: Column<ReceiptRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: 'GR number',
        render: (row) => <span className="mono">{row.number}</span>,
      },
      {
        key: 'orderNumber',
        header: 'PO number',
        render: (row) => (
          <a href={`/purchasing/${row.orderId}`} className="inventory-product-link">
            <span className="mono">{row.orderNumber}</span>
          </a>
        ),
      },
      { key: 'supplierName', header: 'Supplier' },
      { key: 'warehouseName', header: 'Warehouse' },
      { key: 'receiptDate', header: 'Date' },
      {
        key: 'unitsText',
        header: 'Units',
        numeric: true,
        render: (row) => <span className="qty">{row.unitsText}</span>,
      },
      { key: 'user', header: 'User' },
    ],
    [],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  const rows: ReceiptRow[] = receipts.map((receipt) => ({
    id: receipt.id,
    number: receipt.number,
    orderId: receipt.orderId,
    orderNumber: receipt.orderNumber,
    supplierName: receipt.supplierName,
    warehouseName: receipt.warehouseName,
    receiptDate: receipt.receiptDate,
    unitsText: compactQuantity(addQuantities(...receipt.lines.map((line) => line.quantity))),
    user: receipt.user,
  }));

  function clearFilters() {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasFilters = search !== '' || startDate !== '' || endDate !== '';

  return (
    <div className="receipts-tab" aria-label="Goods receipts">
      {isPending ? (
        <Card title="Goods receipts">
          <Skeleton label="Loading goods receipts" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Goods receipts">
          <ErrorState
            message={error instanceof Error ? error.message : 'The goods receipts could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title="No goods receipts yet"
          description="Receive goods against a confirmed purchase order and the receipt appears here."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No goods receipts match your filters"
          description="Try adjusting the search or the date range to see receipts."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <Card title="Goods receipts">
          <div className="goods-receipts__toolbar">
            <Input
              id="receipt-search"
              label="Search"
              placeholder="GR number, PO number, supplier or product"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="receipt-start"
              label="From date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="receipt-end"
              label="To date"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              error={dateError}
            />
          </div>
          <p className="movements__note">Receipts are permanent records.</p>
          <DataTable<ReceiptRow>
            columns={columns}
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="number"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage="No goods receipts found."
          />
        </Card>
      )}
    </div>
  );
}
