import { useMemo, useState } from 'react';

import { Badge, Card, DataTable, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import type { MovementType } from '../../services/catalog-service';
import { formatQuantity } from '../../lib/quantity';
import { useMovements, useWarehouses } from './use-inventory';

const MOVEMENT_TYPE_TONES: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'destructive'> = {
  RECEIPT: 'success',
  SHIPMENT: 'destructive',
  ADJUSTMENT: 'info',
};

interface MovementRow {
  [key: string]: unknown;
  id: string;
  createdAt: string;
  type: string;
  productSku: string;
  productName: string;
  warehouseName: string;
  quantity: string;
  source: string;
  reason: string;
  user: string;
}

export function MovementsTab() {
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  const { data: warehousesData } = useWarehouses();
  const { data, isPending, isError, error } = useMovements({
    search,
    warehouseId: warehouseId || undefined,
    type: type === '' ? undefined : (type as MovementType),
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
    sort: 'createdAt',
    direction: 'desc',
  });

  const movements = data?.items ?? [];
  const total = data?.total ?? 0;

  const warehouseOptions = (warehousesData ?? []).map((w) => ({ value: w.id, label: w.name }));
  const typeOptions = [
    { value: 'RECEIPT', label: 'Receipt' },
    { value: 'SHIPMENT', label: 'Shipment' },
    { value: 'ADJUSTMENT', label: 'Adjustment' },
  ];

  const dateError =
    startDate && endDate && endDate < startDate
      ? 'The end date must not be before the start date.'
      : undefined;

  const columns: Column<MovementRow>[] = useMemo(
    () => [
      { key: 'createdAt', header: 'Date and time', render: (row) => <span>{row.createdAt}</span> },
      {
        key: 'type',
        header: 'Type',
        render: (row) => <Badge tone={MOVEMENT_TYPE_TONES[row.type]}>{row.type}</Badge>,
      },
      { key: 'productSku', header: 'Product', render: (row) => <span className="mono">{row.productSku}</span> },
      { key: 'warehouseName', header: 'Warehouse' },
      {
        key: 'quantity',
        header: 'Quantity change',
        numeric: true,
        render: (row) => {
          const sign = row.quantity.startsWith('-') ? '-' : '+';
          const tone = row.quantity.startsWith('-') ? 'destructive' : 'success';
          return (
            <span className="qty">
              <span className={`qty-sign qty-sign--${tone}`}>{sign}</span>
              {formatQuantity(row.quantity.replace(/^[+-]/, ''))}
            </span>
          );
        },
      },
      { key: 'source', header: 'Source' },
      { key: 'reason', header: 'Reason' },
      { key: 'user', header: 'User' },
    ],
    [],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  return (
    <section className="movements-tab" aria-label="Movements">
      {isPending ? (
        <Card title="Movements">
          <Skeleton label="Loading movements" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Movements">
          <ErrorState
            message={error instanceof Error ? error.message : 'The movements could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : movements.length === 0 ? (
        <EmptyState
          title="No movements match your filters"
          description="Try adjusting the product, warehouse, type or date range filter to see movements."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('');
            setWarehouseId('');
            setType('');
            setStartDate('');
            setEndDate('');
            setPage(1);
          }}
        />
      ) : (
        <Card title="Movements">
          <div className="movements__toolbar">
            <Input
              id="movement-search"
              label="Product search"
              placeholder="SKU or product name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="movement-warehouse"
              label="Warehouse"
              options={[{ value: '', label: 'All warehouses' }, ...warehouseOptions]}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setPage(1);
              }}
              placeholder="All warehouses"
            />
            <Select
              id="movement-type"
              label="Type"
              options={typeOptions}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              placeholder="All types"
            />
            <Input
              id="movement-start"
              label="From date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="movement-end"
              label="To date"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
            />
            {dateError && (
              <span className="form-error" role="alert">
                {dateError}
              </span>
            )}
          </div>
          <p className="movements__note">Movements are permanent records.</p>
          <DataTable<MovementRow>
            columns={columns}
            data={movements}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="createdAt"
            sortDirection="desc"
            onPageChange={setPage}
            emptyMessage="No movements found."
          />
        </Card>
      )}
    </section>
  );
}
