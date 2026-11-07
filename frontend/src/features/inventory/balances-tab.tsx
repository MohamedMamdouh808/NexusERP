import { useMemo, useState } from 'react';

import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, KebabMenu, Select, Skeleton, Toast } from '../../components/ui';
import type { Column } from '../../components/ui';
import { compareQuantities, addQuantities, formatQuantity } from '../../lib/quantity';
import { usePostAdjustment, useStockBalances, useWarehouses } from './use-inventory';
import type { AdjustmentReason, PostAdjustmentInput } from '../../services/catalog-service';

const LOW_STOCK_TONES: Record<string, 'success' | 'warning' | 'destructive'> = {
  'In stock': 'success',
  'Low stock': 'warning',
  'Out of stock': 'destructive',
};

function stockPill(available: string, reorderLevel: string | null): string {
  if (reorderLevel === null) return 'In stock';
  if (compareQuantities(available, '0.000') <= 0) return 'Out of stock';
  if (compareQuantities(available, reorderLevel) <= 0) return 'Low stock';
  return 'In stock';
}

interface BalanceRow {
  [key: string]: unknown;
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  onHand: string;
  reserved: string;
  available: string;
  reorderLevel: string | null;
}

const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = [
  'Damage',
  'Loss',
  'Found',
  'Count correction',
  'Other',
];

export function StockBalancesTab() {
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string>('');
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string>('');
  const [toasts, setToasts] = useState<{ id: string; tone: 'success' | 'failure' | 'informational'; message: string }[]>([]);

  const { data: warehousesData } = useWarehouses();
  const { data, isPending, isError, error } = useStockBalances({
    search,
    warehouseId: warehouseId || undefined,
    lowStockOnly,
    page,
    pageSize,
    sort: 'productSku',
    direction: 'asc',
  });
  const postAdjustment = usePostAdjustment();

  const balances = data?.items ?? [];
  const total = data?.total ?? 0;

  const warehouseOptions = (warehousesData ?? []).map((w) => ({ value: w.id, label: w.name }));

  const columns: Column<BalanceRow>[] = useMemo(
    () => [
      { key: 'productSku', header: 'SKU', render: (row) => <span className="mono">{row.productSku}</span> },
      {
        key: 'productName',
        header: 'Product',
        render: (row) => (
          <a href={`/products/${row.productId}`} className="inventory-product-link">
            {row.productName}
          </a>
        ),
      },
      { key: 'warehouseName', header: 'Warehouse' },
      { key: 'onHand', header: 'On hand', numeric: true, render: (row) => <span className="qty">{formatQuantity(row.onHand)}</span> },
      { key: 'reserved', header: 'Reserved', numeric: true, render: (row) => <span className="qty">{formatQuantity(row.reserved)}</span> },
      { key: 'available', header: 'Available', numeric: true, render: (row) => <span className="qty available">{formatQuantity(row.available)}</span> },
      {
        key: 'reorderLevel',
        header: 'Reorder level',
        numeric: true,
        render: (row) => (row.reorderLevel === null ? <span>-</span> : <span className="qty">{formatQuantity(row.reorderLevel)}</span>),
      },
      {
        key: 'stockStatus',
        header: 'Stock',
        render: (row) => {
          const status = stockPill(row.available, row.reorderLevel);
          return <Badge tone={LOW_STOCK_TONES[status]}>{status}</Badge>;
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'adjust', label: 'Adjust stock', onSelect: () => {
              setAdjustProductId(row.productId);
              setAdjustWarehouseId(row.warehouseId);
              setAdjustOpen(true);
            } },
          ];
          return <KebabMenu label={`Actions for ${row.productName}`} entries={entries} />;
        },
      },
    ],
    [],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  const [adjustForm, setAdjustForm] = useState({
    quantity: '',
    reason: 'Damage' as AdjustmentReason,
    note: '',
  });
  const [adjustError, setAdjustError] = useState<string>('');
  const [adjustPreview, setAdjustPreview] = useState<{ onHand: string; newOnHand: string; reserved: string; available: string } | null>(null);

  // Find the current balance for the selected product/warehouse.
  const currentBalance = balances.find(
    (b) => b.productId === adjustProductId && b.warehouseId === adjustWarehouseId,
  );

  function handleAdjustQuantity(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setAdjustForm({ ...adjustForm, quantity: value });
    computePreview(value);
  }

  function handleAdjustReason(event: React.ChangeEvent<HTMLSelectElement>) {
    const reason = event.target.value as AdjustmentReason;
    setAdjustForm({ ...adjustForm, reason });
  }

  function handleAdjustNote(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const value = event.target.value;
    setAdjustForm({ ...adjustForm, note: value });
    // Clear the "note required for Other" error when user types
    if (adjustForm.reason === 'Other' && adjustError?.includes('note')) {
      setAdjustError('');
    }
  }

  function computePreview(quantity: string) {
    if (!currentBalance) {
      setAdjustPreview(null);
      return;
    }
    const q = quantity.trim();
    if (!q || !/^-?\d+(\.\d{1,3})?$/.test(q)) {
      setAdjustPreview(null);
      return;
    }
    const newOnHand = addQuantities(currentBalance.onHand, q);
    const available = addQuantities(newOnHand, `-${currentBalance.reserved}`);
    setAdjustPreview({
      onHand: formatQuantity(currentBalance.onHand),
      newOnHand: formatQuantity(newOnHand),
      reserved: formatQuantity(currentBalance.reserved),
      available: formatQuantity(available),
    });
  }

  function handleAdjustSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAdjustError('');

    if (!currentBalance) {
      setAdjustError('No stock balance found.');
      return;
    }

    if (!adjustForm.quantity.trim()) {
      setAdjustError('Quantity is required.');
      return;
    }
    if (!/^-?\d+(\.\d{1,3})?$/.test(adjustForm.quantity)) {
      setAdjustError('Enter a valid quantity (up to 3 decimal places).');
      return;
    }

    if (adjustForm.reason === 'Other' && !adjustForm.note.trim()) {
      setAdjustError('A note is required when the reason is Other.');
      return;
    }

    const idempotencyKey = `adj-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const input: PostAdjustmentInput = {
      idempotencyKey,
      productId: adjustProductId,
      warehouseId: adjustWarehouseId,
      quantity: adjustForm.quantity,
      reason: adjustForm.reason,
      note: adjustForm.note,
    };

    postAdjustment.mutate(input, {
      onSuccess: (result) => {
        setAdjustOpen(false);
        setAdjustForm({ quantity: '', reason: 'Damage', note: '' });
        setAdjustError('');
        setAdjustPreview(null);
        setToasts((prev) => [
          ...prev,
          {
            id: `toast-${Date.now()}`,
            tone: 'success',
            message: `Stock adjusted for ${currentBalance.productName}: ${result.source}`,
          },
        ]);
      },
      onError: (err) => {
        setAdjustError(err instanceof Error ? err.message : 'The adjustment could not be posted.');
      },
    });
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <section className="stock-balances-tab" aria-label="Stock balances">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} tone={t.tone} message={t.message} onDismiss={dismissToast} />
      ))}
      {isPending ? (
        <Card title="Stock balances">
          <Skeleton label="Loading stock balances" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Stock balances">
          <ErrorState
            message={error instanceof Error ? error.message : 'The stock balances could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : balances.length === 0 ? (
        <EmptyState
          title="No stock balances match your filters"
          description="Try adjusting the search, warehouse or low stock filter to see balances."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('');
            setWarehouseId('');
            setLowStockOnly(false);
            setPage(1);
          }}
        />
      ) : (
        <Card title="Stock balances">
          <div className="stock-balances__toolbar">
            <Input
              id="balance-search"
              label="Search"
              placeholder="SKU or product name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="balance-warehouse"
              label="Warehouse"
              options={[{ value: '', label: 'All warehouses' }, ...warehouseOptions]}
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setPage(1);
              }}
              placeholder="All warehouses"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', fontSize: '0.875rem', color: 'var(--color-foreground)' }}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(event) => {
                  setLowStockOnly(event.target.checked);
                  setPage(1);
                }}
              />
              Low stock only
            </label>
          </div>
          <DataTable<BalanceRow>
            columns={columns}
            data={balances}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="productSku"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage="No stock balances found."
          />
        </Card>
      )}

      {adjustOpen && (
        <AdjustStockDialog
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          currentBalance={currentBalance}
          form={adjustForm}
          onQuantityChange={handleAdjustQuantity}
          onReasonChange={handleAdjustReason}
          onNoteChange={handleAdjustNote}
          preview={adjustPreview}
          error={adjustError}
          onSubmit={handleAdjustSubmit}
          submitting={postAdjustment.isPending}
        />
      )}
    </section>
  );
}

interface AdjustStockDialogProps {
  open: boolean;
  onClose: () => void;
  currentBalance: BalanceRow | undefined;
  form: { quantity: string; reason: AdjustmentReason; note: string };
  onQuantityChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReasonChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onNoteChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  preview: { onHand: string; newOnHand: string; reserved: string; available: string } | null;
  error: string;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
}

function AdjustStockDialog({
  open,
  onClose,
  currentBalance,
  form,
  onQuantityChange,
  onReasonChange,
  onNoteChange,
  preview,
  error,
  onSubmit,
  submitting,
}: AdjustStockDialogProps) {
  const product = currentBalance;
  const warehouseName = product?.warehouseName ?? '';
  const productName = product?.productName ?? '';

  return (
    <form onSubmit={onSubmit} className="adjust-stock-dialog">
      <div className="dialog-backdrop" style={{ display: open ? 'block' : 'none' }}>
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="adjust-dialog-title">
          <div className="dialog__header">
            <h2 id="adjust-dialog-title" className="dialog__title">Adjust stock</h2>
            <button type="button" className="button" aria-label="Close dialog" onClick={onClose} style={{ padding: 'var(--spacing-xs)' }}>
              <span className="sr-only">Close</span>
              <span>×</span>
            </button>
          </div>
          <div className="dialog__body">
            <p>
              Product: <strong>{productName}</strong> &nbsp;|&nbsp; Warehouse: <strong>{warehouseName}</strong>
            </p>
            <Input
              id="adjust-quantity"
              label="Signed quantity *"
              error={error}
              value={form.quantity}
              onChange={onQuantityChange}
              required
              helpText="Positive adds stock, negative removes stock. Up to 3 decimal places."
            />
            <Select
              id="adjust-reason"
              label="Reason *"
              options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))}
              value={form.reason}
              onChange={onReasonChange}
              required
            />
            <div className="form-control">
              <label htmlFor="adjust-note" className="form-label">Note</label>
              <textarea
                id="adjust-note"
                className={['input', error ? 'input--error' : ''].filter(Boolean).join(' ')}
                value={form.note}
                onChange={onNoteChange}
                rows={3}
              />
              {form.reason === 'Other' && (
                <span id="adjust-note-help" className="form-help-text">Required when the reason is Other.</span>
              )}
            </div>
            {form.reason === 'Other' && !form.note.trim() && (
              <span className="form-error" role="alert">A note is required when the reason is Other.</span>
            )}
            {error && <span className="form-error" role="alert">{error}</span>}
            {preview && (
              <div className="adjust-preview">
                <p>Live preview:</p>
                <p>On hand {preview.onHand} to {preview.newOnHand}, Reserved {preview.reserved}, Available {preview.available}</p>
              </div>
            )}
            <p className="adjust-consequence">
              A posted adjustment cannot be edited or deleted. It is corrected only by a compensating adjustment.
            </p>
          </div>
          <div className="dialog__actions">
            <Button type="button" variant="default" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} loading={submitting}>
              Post adjustment
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
