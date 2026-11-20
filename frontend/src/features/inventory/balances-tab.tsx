import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, KebabMenu, Select, Skeleton, Toast } from '../../components/ui';
import type { Column } from '../../components/ui';
import { addQuantities, formatQuantity, subtractQuantities } from '../../lib/quantity';
import { useArchivedWithStockCount, usePostAdjustment, useStockBalances, useWarehouses } from './use-inventory';
import type { AdjustmentReason, StockBalanceRow } from './use-inventory';
import { newIdempotencyKey } from './idempotency-key';

/**
 * The stock balances screen.
 *
 * One endpoint answers three selections with one row shape: the balance rows
 * themselves (one per warehouse and product that holds stock), the products the
 * low-stock rule selects (a product that holds nothing anywhere yet is IN that
 * selection, shown with the default warehouse and zero quantities), and the
 * archived products that still hold stock.
 *
 * The total is labelled: the default selection counts ROWS, the other two count
 * PRODUCTS. Two hints keep what is not on this page visible: products that need
 * attention but have no stock rows yet, and archived products that still hold
 * stock.
 */

const STATUS_TONES: Record<NonNullable<StockBalanceRow['status']>, 'success' | 'warning' | 'destructive'> = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'destructive',
};

interface BalanceRow {
  [key: string]: unknown;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  onHand: string;
  reserved: string;
  available: string;
  archived: boolean;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' | null;
  hasStockRow: boolean;
}

const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = [
  'DAMAGE',
  'LOSS',
  'FOUND',
  'COUNT_CORRECTION',
  'OTHER',
];

type StatusFilter = '' | 'archivedWithStock';

export function StockBalancesTab() {
  const { t } = useTranslation();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string>('');
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string>('');
  const [toasts, setToasts] = useState<{ id: string; tone: 'success' | 'failure' | 'informational'; message: string }[]>([]);

  const { data: warehousesData } = useWarehouses();
  const { data, isPending, isError, error, refetch } = useStockBalances({
    search: search === '' ? undefined : search,
    warehouseId: warehouseId || undefined,
    lowStockOnly: lowStockOnly || undefined,
    status: statusFilter === '' ? undefined : statusFilter,
    page,
    pageSize,
    sortBy: 'sku',
    sortOrder: 'asc',
  });

  // The hint counts what is NOT on this page: it is wanted only while the
  // archived filter is off.
  const archivedHint = useArchivedWithStockCount(!lowStockOnly && statusFilter === '');
  const postAdjustment = usePostAdjustment();

  const balances = (data?.items ?? []) as BalanceRow[];
  const total = data?.total ?? 0;
  const totalKind = data?.totalKind ?? 'rows';
  const lowStockCount = data?.lowStockCount ?? 0;

  // The rows on THIS page that already carry the low-stock status. When the
  // rule selects more products than are visible here, the hint names the
  // difference - some of them have no stock rows yet.
  const visibleLowStock = balances.filter(
    (row) => row.status === 'LOW_STOCK' || row.status === 'OUT_OF_STOCK',
  ).length;
  const showLowStockHint = !lowStockOnly && statusFilter === '' && lowStockCount > visibleLowStock;

  const warehouseOptions = (warehousesData?.items ?? []).map((w) => ({ value: w.id, label: w.name }));

  // A deep link from an archived product's page (?adjust=<productId>) opens the
  // dialog preselected once the balances are in: the product's row (from the
  // archived-with-stock selection if it is archived) names its warehouse.
  const deepLinkProductId = new URLSearchParams(location.search).get('adjust') ?? '';
  const deepLinkHandled = useMemo(
    () => ({ done: false as boolean }),
    // The key re-arms only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deepLinkProductId],
  );
  if (deepLinkProductId !== '' && !deepLinkHandled.done && !isPending && data !== undefined) {
    deepLinkHandled.done = true;
    const row = balances.find((item) => item.productId === deepLinkProductId);
    if (row !== undefined) {
      setAdjustProductId(row.productId);
      setAdjustWarehouseId(row.warehouseId ?? warehousesData?.items.find((w) => w.isDefault)?.id ?? '');
      if (row.archived && statusFilter === '') {
        setStatusFilter('archivedWithStock');
      }
      setAdjustOpen(true);
    }
  }

  const columns: Column<BalanceRow>[] = useMemo(
    () => [
      { key: 'sku', header: t('inventory.balances.columns.sku'), render: (row) => <span className="mono">{row.sku}</span> },
      {
        key: 'productName',
        header: t('inventory.balances.columns.product'),
        render: (row) => (
          <span className="inventory-product-cell">
            <a href={`/products/${row.productId}`} className="inventory-product-link">
              {row.productName}
            </a>
            {row.archived ? <Badge tone="neutral">{t('inventory.balances.archivedBadge')}</Badge> : null}
            {!row.hasStockRow ? <Badge tone="info">{t('inventory.balances.noStockRowBadge')}</Badge> : null}
          </span>
        ),
      },
      { key: 'warehouseName', header: t('inventory.balances.columns.warehouse'), render: (row) => <span>{row.warehouseName ?? '—'}</span> },
      { key: 'onHand', header: t('inventory.balances.columns.onHand'), numeric: true, render: (row) => <span className="qty">{formatQuantity(row.onHand)}</span> },
      { key: 'reserved', header: t('inventory.balances.columns.reserved'), numeric: true, render: (row) => <span className="qty">{formatQuantity(row.reserved)}</span> },
      { key: 'available', header: t('inventory.balances.columns.available'), numeric: true, render: (row) => <span className="qty available">{formatQuantity(row.available)}</span> },
      {
        key: 'stockStatus',
        header: t('inventory.balances.columns.stock'),
        render: (row) =>
          row.status === null ? (
            <span>—</span>
          ) : (
            <Badge tone={STATUS_TONES[row.status]}>
              {row.status === 'IN_STOCK'
                ? t('inventory.balances.stock.inStock')
                : row.status === 'LOW_STOCK'
                  ? t('inventory.balances.stock.lowStock')
                  : t('inventory.balances.stock.outOfStock')}
            </Badge>
          ),
      },
      {
        key: 'actions',
        header: t('inventory.balances.columns.actions'),
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'adjust', label: t('inventory.balances.adjust.action'), onSelect: () => {
              setAdjustProductId(row.productId);
              setAdjustWarehouseId(row.warehouseId ?? '');
              setAdjustOpen(true);
            } },
          ];
          return <KebabMenu label={t('inventory.balances.adjust.actionsFor', { name: row.productName })} entries={entries} />;
        },
      },
    ],
    [t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function clearFilters() {
    setSearch('');
    setWarehouseId('');
    setLowStockOnly(false);
    setStatusFilter('');
    setPage(1);
  }

  return (
    <section className="stock-balances-tab" aria-label={t('inventory.balances.sectionAria')}>
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title={t('inventory.balances.title')}>
          <Skeleton label={t('inventory.balances.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('inventory.balances.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('inventory.balances.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : balances.length === 0 && total === 0 ? (
        <EmptyState
          title={t('inventory.balances.empty.title')}
          description={t('inventory.balances.empty.description')}
          actionLabel={t('inventory.balances.empty.actionLabel')}
          onAction={clearFilters}
        />
      ) : (
        <Card title={t('inventory.balances.title')}>
          <div className="stock-balances__toolbar">
            <Input
              id="balance-search"
              label={t('inventory.balances.toolbar.search')}
              placeholder={t('inventory.balances.toolbar.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="balance-warehouse"
              label={t('inventory.balances.toolbar.warehouse')}
              options={[{ value: '', label: t('inventory.balances.toolbar.allWarehouses') }, ...warehouseOptions]}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setPage(1);
              }}
              placeholder={t('inventory.balances.toolbar.allWarehouses')}
            />
            <Select
              id="balance-status"
              label={t('inventory.balances.toolbar.status')}
              options={[
                { value: '', label: t('inventory.balances.toolbar.statusAll') },
                { value: 'archivedWithStock', label: t('inventory.balances.toolbar.statusArchivedWithStock') },
              ]}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
              placeholder={t('inventory.balances.toolbar.statusAll')}
            />
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(event) => {
                  setLowStockOnly(event.target.checked);
                  setPage(1);
                }}
              />
              {t('inventory.balances.toolbar.lowStockOnly')}
            </label>
          </div>

          {/* The total says what it counts: rows in the default selection,
              products in the low-stock and archived selections. */}
          <p className="stock-balances__total" data-testid="balances-total">
            {totalKind === 'products'
              ? t('inventory.balances.total.products', { count: total })
              : t('inventory.balances.total.rows', { count: total })}
          </p>

          {showLowStockHint && (
            <button type="button" className="hint-action" data-testid="low-stock-hint" onClick={() => { setLowStockOnly(true); setPage(1); }}>
              {t('inventory.balances.hints.lowStock', { count: lowStockCount })}
            </button>
          )}
          {statusFilter === '' && !lowStockOnly && (archivedHint.data ?? 0) > 0 && (
            <button type="button" className="hint-action" data-testid="archived-hint" onClick={() => { setStatusFilter('archivedWithStock'); setPage(1); }}>
              {t('inventory.balances.hints.archived', { count: archivedHint.data ?? 0 })}
            </button>
          )}

          <DataTable<BalanceRow>
            columns={columns}
            data={balances}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="sku"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage={t('inventory.balances.empty.tableMessage')}
          />
        </Card>
      )}

      {adjustOpen && (
        <AdjustStockDialog
          onClose={() => setAdjustOpen(false)}
          productId={adjustProductId}
          warehouseId={adjustWarehouseId}
          rows={balances}
          onPosted={(message) => {
            setToasts((prev) => [
              ...prev,
              { id: `toast-${Date.now()}`, tone: 'success', message },
            ]);
          }}
          onProductPicked={(productId) => {
            setAdjustProductId(productId);
            setAdjustWarehouseId('');
          }}
          postAdjustment={postAdjustment}
        />
      )}
    </section>
  );
}

interface AdjustStockDialogProps {
  onClose: () => void;
  productId: string;
  warehouseId: string;
  rows: BalanceRow[];
  onPosted: (message: string) => void;
  onProductPicked: (productId: string) => void;
  postAdjustment: ReturnType<typeof usePostAdjustment>;
}

/**
 * The adjust-stock dialog.
 *
 * The idempotency key is generated when the dialog OPENS and stays for the
 * dialog's lifetime: a retry after a refused or lost attempt sends the same
 * key, so the service can replay or refuse safely, and only a fresh dialog
 * posts under a fresh key.
 */
function AdjustStockDialog({
  onClose,
  productId,
  warehouseId,
  rows,
  onPosted,
  onProductPicked,
  postAdjustment,
}: AdjustStockDialogProps) {
  const { t } = useTranslation();
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [form, setForm] = useState({ quantity: '', reason: 'FOUND' as AdjustmentReason, note: '' });
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [previewQuantity, setPreviewQuantity] = useState('');

  const row = rows.find((item) => item.productId === productId && item.warehouseId === warehouseId)
    ?? rows.find((item) => item.productId === productId);
  const product = row !== undefined
    ? { productId: row.productId, sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName: row.warehouseName, onHand: row.onHand, reserved: row.reserved, archived: row.archived, hasStockRow: row.hasStockRow }
    : null;

  // The preview is exact string arithmetic on the quantities as recorded.
  const preview = useMemo(() => {
    if (product === null) return null;
    const trimmed = previewQuantity.trim();
    if (trimmed === '' || !/^-?\d+(\.\d{1,3})?$/.test(trimmed)) return null;
    const newOnHand = addQuantities(product.onHand, trimmed);
    const available = subtractQuantities(newOnHand, product.reserved);
    return {
      onHand: formatQuantity(product.onHand),
      newOnHand: formatQuantity(newOnHand),
      reserved: formatQuantity(product.reserved),
      available: formatQuantity(available),
    };
  }, [product, previewQuantity]);

  function changeQuantity(value: string) {
    setForm((prev) => ({ ...prev, quantity: value }));
    setPreviewQuantity(value);
  }

  function changeReason(reason: AdjustmentReason) {
    setForm((prev) => ({ ...prev, reason }));
  }

  function changeNote(note: string) {
    setForm((prev) => ({ ...prev, note }));
    // Typing clears the note error that was standing.
    if (error !== null && error.message === t('inventory.balances.adjust.errors.noteRequired')) {
      setError(null);
    }
  }

  function pickProduct(nextProductId: string) {
    onProductPicked(nextProductId);
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (product === null || product.warehouseId === null) {
      setError({ message: t('inventory.balances.adjust.errors.noBalance'), requestId: null });
      return;
    }
    if (!form.quantity.trim()) {
      setError({ message: t('inventory.balances.adjust.errors.quantityRequired'), requestId: null });
      return;
    }
    if (!/^-?\d+(\.\d{1,3})?$/.test(form.quantity)) {
      setError({ message: t('inventory.balances.adjust.errors.invalidQuantity'), requestId: null });
      return;
    }
    if (form.reason === 'OTHER' && !form.note.trim()) {
      setError({ message: t('inventory.balances.adjust.errors.noteRequired'), requestId: null });
      return;
    }

    postAdjustment.mutate(
      {
        idempotencyKey,
        productId: product.productId,
        warehouseId: product.warehouseId,
        quantity: form.quantity,
        reason: form.reason,
        note: form.note.trim() === '' ? undefined : form.note.trim(),
      },
      {
        onSuccess: (result) => {
          onPosted(
            t('inventory.balances.adjust.postedToast', {
              name: product.productName,
              source: result.movement.sourceNumber,
            }),
          );
          onClose();
        },
        onError: (caught) => {
          const failure = caught as Error & { requestId?: string };
          setError({
            message: failure.message || t('inventory.balances.adjust.postError'),
            requestId: failure.requestId ?? null,
          });
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="adjust-stock-dialog">
      <div className="dialog-backdrop">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="adjust-dialog-title">
          <div className="dialog__header">
            <h2 id="adjust-dialog-title" className="dialog__title">{t('inventory.balances.adjust.dialogTitle')}</h2>
            <button type="button" className="button" aria-label={t('ui.dialog.closeDialog')} onClick={onClose} style={{ padding: 'var(--spacing-xs)' }}>
              <span className="sr-only">{t('common.actions.close')}</span>
              <span>×</span>
            </button>
          </div>
          <div className="dialog__body">
            {product !== null ? (
              <p>
                {t('inventory.balances.adjust.product')} <strong>{product.productName}</strong> &nbsp;|&nbsp; {t('inventory.balances.adjust.warehouse')} <strong>{product.warehouseName ?? '—'}</strong>
              </p>
            ) : (
              <p>{t('inventory.balances.adjust.pickProduct')}</p>
            )}
            {product === null && (
              <Select
                id="adjust-product"
                label={t('inventory.balances.adjust.productLabel')}
                options={rows.map((item) => ({ value: item.productId, label: `${item.sku} — ${item.productName}` }))}
                value={productId}
                onChange={(event) => pickProduct(event.target.value)}
              />
            )}
            {product !== null && product.archived && (
              <p className="adjust-archived-warning" role="note">
                {t('inventory.balances.adjust.archivedWarning')}
              </p>
            )}
            <Input
              id="adjust-quantity"
              label={t('inventory.balances.adjust.signedQuantity')}
              error={error !== null && error.requestId === null ? error.message : undefined}
              value={form.quantity}
              onChange={(event) => changeQuantity(event.target.value)}
              required
              helpText={product?.archived
                ? t('inventory.balances.adjust.signedQuantityArchivedHelp')
                : t('inventory.balances.adjust.signedQuantityHelp')}
            />
            <Select
              id="adjust-reason"
              label={t('inventory.balances.adjust.reason')}
              options={ADJUSTMENT_REASONS.map((reason) => ({ value: reason, label: t(`inventory.balances.adjust.reasons.${reason}`) }))}
              value={form.reason}
              onChange={(event) => changeReason(event.target.value as AdjustmentReason)}
              required
            />
            <div className="form-control">
              <label htmlFor="adjust-note" className="form-label">{t('inventory.balances.adjust.note')}</label>
              <textarea
                id="adjust-note"
                className={['input', error !== null ? 'input--error' : ''].filter(Boolean).join(' ')}
                value={form.note}
                onChange={(event) => changeNote(event.target.value)}
                rows={3}
              />
              {form.reason === 'OTHER' && (
                <span id="adjust-note-help" className="form-help-text">{t('inventory.balances.adjust.reasonOtherHelp')}</span>
              )}
            </div>
            {form.reason === 'OTHER' && !form.note.trim() && (
              <span className="form-error" role="alert">{t('inventory.balances.adjust.errors.noteRequired')}</span>
            )}
            {error !== null && error.requestId !== null && (
              <div className="form-error" role="alert" data-testid="adjust-error">
                <span>{error.message}</span>
                {error.requestId !== null && (
                  <span className="form-error__request">{t('inventory.balances.adjust.requestId', { id: error.requestId })}</span>
                )}
              </div>
            )}
            {preview !== null && (
              <div className="adjust-preview">
                <p>{t('inventory.balances.adjust.livePreview')}</p>
                <p>{t('inventory.balances.adjust.previewOnHand', { onHand: preview.onHand, newOnHand: preview.newOnHand, reserved: preview.reserved, available: preview.available })}</p>
              </div>
            )}
            <p className="adjust-consequence">
              {t('inventory.balances.adjust.consequence')}
            </p>
          </div>
          <div className="dialog__actions">
            <Button type="button" variant="default" onClick={onClose} disabled={postAdjustment.isPending}>
              {t('inventory.balances.adjust.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={postAdjustment.isPending} loading={postAdjustment.isPending}>
              {t('inventory.balances.adjust.post')}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
