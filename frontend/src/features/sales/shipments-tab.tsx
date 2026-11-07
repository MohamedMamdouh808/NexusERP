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
import { useShipments } from './use-sales';

type ShipmentRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  shipmentDate: string;
  unitsText: string;
  user: string;
};

export function ShipmentsTab() {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data, isPending, isError, error } = useShipments({
    search,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
    sort: 'number',
    direction: 'asc',
  });

  const shipments = data?.items ?? [];
  const total = data?.total ?? 0;

  // The end date closes the range, so an end before the start is an error.
  const dateError =
    startDate !== '' && endDate !== '' && endDate < startDate
      ? 'The end date must not be before the start date.'
      : undefined;

  const columns: Column<ShipmentRow>[] = useMemo(
    () => [
      {
        key: 'number',
        header: 'SH number',
        render: (row) => <span className="mono">{row.number}</span>,
      },
      {
        key: 'orderNumber',
        header: 'SO number',
        render: (row) => (
          <a href={`/sales/${row.orderId}`} className="inventory-product-link">
            <span className="mono">{row.orderNumber}</span>
          </a>
        ),
      },
      { key: 'customerName', header: 'Customer' },
      { key: 'warehouseName', header: 'Warehouse' },
      { key: 'shipmentDate', header: 'Date' },
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

  const rows: ShipmentRow[] = shipments.map((shipment) => ({
    id: shipment.id,
    number: shipment.number,
    orderId: shipment.orderId,
    orderNumber: shipment.orderNumber,
    customerName: shipment.customerName,
    warehouseName: shipment.warehouseName,
    shipmentDate: shipment.shipmentDate,
    unitsText: compactQuantity(addQuantities(...shipment.lines.map((line) => line.quantity))),
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
    <div className="receipts-tab" aria-label="Shipments">
      {isPending ? (
        <Card title="Shipments">
          <Skeleton label="Loading shipments" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Shipments">
          <ErrorState
            message={error instanceof Error ? error.message : 'The shipments could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : rows.length === 0 && !hasFilters ? (
        <EmptyState
          title="No shipments yet"
          description="Ship a confirmed sales order and the shipment appears here."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No shipments match your filters"
          description="Try adjusting the search or the date range to see shipments."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <Card title="Shipments">
          <div className="goods-receipts__toolbar">
            <Input
              id="shipment-search"
              label="Search"
              placeholder="SH number, SO number, customer or product"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="shipment-start"
              label="From date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="shipment-end"
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
          <p className="movements__note">Shipments are permanent records.</p>
          <DataTable<ShipmentRow>
            columns={columns}
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="number"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage="No shipments found."
          />
        </Card>
      )}
    </div>
  );
}
