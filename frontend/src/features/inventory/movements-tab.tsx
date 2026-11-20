import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';

import { Badge, Card, DataTable, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import { formatQuantity } from '../../lib/quantity';
import { useMovements, useWarehouses } from './use-inventory';
import type { MovementType, StockMovementRow } from './use-inventory';

/**
 * The movement ledger.
 *
 * Every movement of the organization, oldest page last by default. A movement
 * is a permanent record: it is never edited or deleted, so it is the audit of
 * how every quantity got where it is. The movements of an archived product stay
 * in the ledger and carry an Archived label.
 */

const MOVEMENT_TYPE_TONES: Record<MovementType, 'success' | 'warning' | 'info' | 'neutral' | 'destructive'> = {
  RECEIPT: 'success',
  SHIPMENT: 'destructive',
  ADJUSTMENT: 'info',
};

interface MovementRow extends StockMovementRow {
  [key: string]: unknown;
  id: string;
  createdAt: string;
  type: MovementType;
  quantityDelta: string;
  reason: string | null;
  note: string | null;
  sourceNumber: string | null;
  productId: string;
  sku: string;
  productName: string;
  archived: boolean;
  warehouseName: string;
}

export function MovementsTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  const { data: warehousesData } = useWarehouses();
  const { data, isPending, isError, error, refetch } = useMovements({
    search: search === '' ? undefined : search,
    warehouseId: warehouseId || undefined,
    type: type === '' ? undefined : (type as MovementType),
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const movements = (data?.items ?? []) as MovementRow[];
  const total = data?.total ?? 0;

  const warehouseOptions = (warehousesData?.items ?? []).map((w) => ({ value: w.id, label: w.name }));
  const typeOptions = [
    { value: '', label: t('inventory.movements.toolbar.allTypes') },
    { value: 'RECEIPT', label: t('inventory.movements.type.RECEIPT') },
    { value: 'SHIPMENT', label: t('inventory.movements.type.SHIPMENT') },
    { value: 'ADJUSTMENT', label: t('inventory.movements.type.ADJUSTMENT') },
  ];

  // The service refuses the range anyway; saying it here keeps the request
  // from being made with a mistake in it.
  const dateError =
    startDate !== '' && endDate !== '' && endDate < startDate
      ? t('inventory.movements.toolbar.endBeforeStart')
      : undefined;

  const columns: Column<MovementRow>[] = useMemo(
    () => [
      { key: 'createdAt', header: t('inventory.movements.columns.dateTime'), render: (row) => <span>{new Date(row.createdAt).toLocaleString()}</span> },
      {
        key: 'type',
        header: t('inventory.movements.columns.type'),
        render: (row) => <Badge tone={MOVEMENT_TYPE_TONES[row.type]}>{t(`inventory.movements.type.${row.type}`)}</Badge>,
      },
      {
        key: 'productName',
        header: t('inventory.movements.columns.product'),
        render: (row) => (
          <span className="inventory-product-cell">
            <span className="mono">{row.sku}</span>
            <span>{row.productName}</span>
            {row.archived ? <Badge tone="neutral">{t('inventory.movements.archivedBadge')}</Badge> : null}
          </span>
        ),
      },
      { key: 'warehouseName', header: t('inventory.movements.columns.warehouse') },
      {
        key: 'quantityDelta',
        header: t('inventory.movements.columns.quantityChange'),
        numeric: true,
        render: (row) => {
          const sign = row.quantityDelta.startsWith('-') ? '-' : '+';
          const tone = row.quantityDelta.startsWith('-') ? 'destructive' : 'success';
          return (
            <span className="qty">
              <span className={`qty-sign qty-sign--${tone}`}>{sign}</span>
              {formatQuantity(row.quantityDelta.replace(/^[+-]/, ''))}
            </span>
          );
        },
      },
      { key: 'sourceNumber', header: t('inventory.movements.columns.source'), render: (row) => <span>{row.sourceNumber ?? '—'}</span> },
      { key: 'reason', header: t('inventory.movements.columns.reason'), render: (row) => <span>{row.reason ?? '—'}</span> },
      {
        key: 'note',
        header: t('inventory.movements.columns.note'),
        render: (row) => <span className="movements__note-text">{row.note ?? ''}</span>,
      },
    ],
    [t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  return (
    <section className="movements-tab" aria-label={t('inventory.movements.sectionAria')}>
      {isPending ? (
        <Card title={t('inventory.movements.title')}>
          <Skeleton label={t('inventory.movements.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('inventory.movements.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('inventory.movements.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : movements.length === 0 && total === 0 ? (
        <EmptyState
          title={t('inventory.movements.empty.title')}
          description={t('inventory.movements.empty.description')}
          actionLabel={t('inventory.movements.empty.actionLabel')}
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
        <Card title={t('inventory.movements.title')}>
          <div className="movements__toolbar">
            <Input
              id="movement-search"
              label={t('inventory.movements.toolbar.productSearch')}
              placeholder={t('inventory.movements.toolbar.productSearchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="movement-warehouse"
              label={t('inventory.movements.toolbar.warehouse')}
              options={[{ value: '', label: t('inventory.movements.toolbar.allWarehouses') }, ...warehouseOptions]}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setPage(1);
              }}
              placeholder={t('inventory.movements.toolbar.allWarehouses')}
            />
            <Select
              id="movement-type"
              label={t('inventory.movements.toolbar.type')}
              options={typeOptions}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              placeholder={t('inventory.movements.toolbar.allTypes')}
            />
            <Input
              id="movement-start"
              label={t('inventory.movements.toolbar.fromDate')}
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              id="movement-end"
              label={t('inventory.movements.toolbar.toDate')}
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
          <p className="movements__total" data-testid="movements-total">
            {t('inventory.movements.total.rows', { count: total })}
          </p>
          <p className="movements__note">{t('inventory.movements.note')}</p>
          <DataTable<MovementRow>
            columns={columns}
            data={movements}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="createdAt"
            sortDirection="desc"
            onPageChange={setPage}
            emptyMessage={t('inventory.movements.empty.tableMessage')}
          />
        </Card>
      )}
    </section>
  );
}
