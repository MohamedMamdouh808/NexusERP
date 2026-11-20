import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';

import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, KebabMenu, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import { addQuantities } from '../../lib/quantity';
import {
  useCreateWarehouse,
  useDeactivateWarehouse,
  useReactivateWarehouse,
  useStockBalances,
  useUpdateWarehouse,
  useWarehouses,
} from './use-inventory';
import type { InventoryWarehouse } from './use-inventory';

/**
 * The warehouses screen.
 *
 * A warehouse is named, not coded: there is no code column and no code field.
 * Every change carries the version the caller read - the screen always sends
 * the version it is looking at, and when the service refuses with a stale
 * version the screen asks to be reloaded rather than overwriting someone else's
 * work.
 */

interface WarehouseRow {
  [key: string]: unknown;
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  version: number;
  totalOnHand: string;
}

export function WarehousesTab() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<InventoryWarehouse | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'deactivate' | 'reactivate'; warehouse: InventoryWarehouse } | null>(null);
  const [form, setForm] = useState({ name: '', isDefault: false });
  const [dialogError, setDialogError] = useState<{ message: string; requestId: string | null; stale: boolean } | null>(null);
  const [confirmError, setConfirmError] = useState<{ message: string; requestId: string | null; stale: boolean } | null>(null);

  const { data: warehousesData, isPending, error: errorObj, refetch } = useWarehouses();
  const { data: balancesData, isPending: balancesPending } = useStockBalances({ page: 1, pageSize: 100 });
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();
  const deactivateMutation = useDeactivateWarehouse();
  const reactivateMutation = useReactivateWarehouse();

  const warehouses = warehousesData?.items ?? [];
  const balances = balancesData?.items ?? [];

  // Total on hand per warehouse, summed from the recorded balances.
  const totalByWarehouse = useMemo(() => {
    const totals = new Map<string, string>();
    for (const balance of balances) {
      if (balance.warehouseId === null) continue;
      const existing = totals.get(balance.warehouseId) ?? '0.000';
      totals.set(balance.warehouseId, addQuantities(existing, balance.onHand));
    }
    return totals;
  }, [balances]);

  const isPendingBoth = isPending || balancesPending;

  function openCreate() {
    setEditMode(false);
    setEditing(null);
    setForm({ name: '', isDefault: false });
    setDialogError(null);
    setDialogOpen(true);
  }

  function openEdit(row: InventoryWarehouse) {
    setEditMode(true);
    setEditing(row);
    setForm({ name: row.name, isDefault: row.isDefault });
    setDialogError(null);
    setDialogOpen(true);
  }

  function openConfirm(kind: 'deactivate' | 'reactivate', row: InventoryWarehouse) {
    setConfirmAction({ kind, warehouse: row });
    setConfirmError(null);
  }

  function handleError(
    caught: unknown,
    setError: (value: { message: string; requestId: string | null; stale: boolean }) => void,
  ): void {
    const failure = caught as Error & { requestId?: string; code?: string };
    setError({
      message: failure.message || t('inventory.warehouses.genericError'),
      requestId: failure.requestId ?? null,
      stale: failure.code === 'STALE_VERSION',
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setDialogError(null);
    if (!form.name.trim()) {
      setDialogError({ message: t('inventory.warehouses.validation.nameRequired'), requestId: null, stale: false });
      return;
    }
    if (editMode && editing !== null) {
      updateMutation.mutate(
        { id: editing.id, name: form.name.trim(), isDefault: form.isDefault, version: editing.version },
        { onSuccess: () => setDialogOpen(false), onError: (caught) => handleError(caught, setDialogError) },
      );
    } else {
      createMutation.mutate(
        { name: form.name.trim(), isDefault: form.isDefault },
        { onSuccess: () => setDialogOpen(false), onError: (caught) => handleError(caught, setDialogError) },
      );
    }
  }

  function handleConfirm() {
    if (confirmAction === null) return;
    const { kind, warehouse } = confirmAction;
    const mutation = kind === 'deactivate' ? deactivateMutation : reactivateMutation;
    mutation.mutate(
      { id: warehouse.id, version: warehouse.version },
      {
        onSuccess: () => {
          setConfirmAction(null);
          setConfirmError(null);
        },
        onError: (caught) => handleError(caught, setConfirmError),
      },
    );
  }

  const apiFailure =
    errorObj && typeof errorObj === 'object' && 'requestId' in errorObj
      ? (errorObj as Error & { requestId: string; status?: number })
      : undefined;

  const warehouseRows: WarehouseRow[] = warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    isDefault: warehouse.isDefault,
    isActive: warehouse.isActive,
    version: warehouse.version,
    totalOnHand: totalByWarehouse.get(warehouse.id) ?? '0.000',
  }));

  const columns: Column<WarehouseRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: t('inventory.warehouses.columns.name'),
        render: (row) => (
          <span className="inventory-product-cell">
            <span>{row.name}</span>
            {row.isDefault ? <Badge tone="info">{t('inventory.warehouses.defaultBadge')}</Badge> : null}
          </span>
        ),
      },
      { key: 'status', header: t('inventory.warehouses.columns.status'), render: (row) => <Badge tone={row.isActive ? 'success' : 'destructive'}>{row.isActive ? t('inventory.warehouses.statusLabels.active') : t('inventory.warehouses.statusLabels.inactive')}</Badge> },
      { key: 'totalOnHand', header: t('inventory.warehouses.columns.totalOnHand'), numeric: true, render: (row) => <span className="qty">{row.totalOnHand}</span> },
      {
        key: 'actions',
        header: t('inventory.warehouses.columns.actions'),
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'edit', label: t('inventory.warehouses.edit'), onSelect: () => openEdit(warehouses.find((w) => w.id === row.id)!) },
            row.isActive
              ? { kind: 'item' as const, id: 'deactivate', label: t('inventory.warehouses.deactivate'), onSelect: () => openConfirm('deactivate', warehouses.find((w) => w.id === row.id)!) }
              : { kind: 'item' as const, id: 'reactivate', label: t('inventory.warehouses.activate'), onSelect: () => openConfirm('reactivate', warehouses.find((w) => w.id === row.id)!) },
          ];
          return <KebabMenu label={t('inventory.warehouses.actionsFor', { name: row.name })} entries={entries} />;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, warehouses],
  );

  if (isPendingBoth) {
    return (
      <section className="warehouses-tab" aria-label={t('inventory.warehouses.sectionAria')}>
        <Card title={t('inventory.warehouses.title')}>
          <Skeleton label={t('inventory.warehouses.loading')} />
        </Card>
      </section>
    );
  }

  if (warehousesData === undefined) {
    return (
      <section className="warehouses-tab" aria-label={t('inventory.warehouses.sectionAria')}>
        <Card title={t('inventory.warehouses.title')}>
          <ErrorState
            message={errorObj instanceof Error ? errorObj.message : t('inventory.warehouses.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </section>
    );
  }

  if (warehouses.length === 0) {
    return (
      <section className="warehouses-tab" aria-label={t('inventory.warehouses.sectionAria')}>
        <EmptyState
          title={t('inventory.warehouses.empty.title')}
          description={t('inventory.warehouses.empty.description')}
          actionLabel={t('inventory.warehouses.empty.actionLabel')}
          onAction={openCreate}
        />
      </section>
    );
  }

  return (
    <section className="warehouses-tab" aria-label={t('inventory.warehouses.sectionAria')}>
      <Card title={t('inventory.warehouses.title')}>
        <div className="warehouses__toolbar">
          <Button variant="primary" onClick={openCreate}>
            {t('inventory.warehouses.newWarehouse')}
          </Button>
        </div>
        <DataTable<WarehouseRow>
          columns={columns}
          data={warehouseRows}
          total={warehouseRows.length}
          page={1}
          pageSize={20}
          emptyMessage={t('inventory.warehouses.empty.tableMessage')}
        />
      </Card>

      {dialogOpen && (
        <WarehouseDialog
        onClose={() => setDialogOpen(false)}
        title={editMode ? t('inventory.warehouses.dialog.editTitle') : t('inventory.warehouses.dialog.newTitle')}
        submitLabel={editMode ? t('inventory.warehouses.dialog.submitSave') : t('inventory.warehouses.dialog.submitCreate')}
        onSubmit={handleSubmit}
        submitting={createMutation.isPending || updateMutation.isPending}
        form={form}
        onFormChange={(nextForm) => setForm(nextForm)}
        error={dialogError}
        />
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={confirmAction?.kind === 'deactivate'
          ? t('inventory.warehouses.confirmDeactivate.title')
          : t('inventory.warehouses.confirmReactivate.title')}
        description={
          confirmAction !== null
            ? confirmAction.kind === 'deactivate'
              ? t('inventory.warehouses.confirmDeactivate.description', { name: confirmAction.warehouse.name })
              : t('inventory.warehouses.confirmReactivate.description', { name: confirmAction.warehouse.name })
            : t('inventory.warehouses.confirmDeactivate.descriptionFallback')
        }
        actionLabel={confirmAction?.kind === 'deactivate'
          ? t('inventory.warehouses.confirmDeactivate.actionLabel')
          : t('inventory.warehouses.confirmReactivate.actionLabel')}
        destructive={confirmAction?.kind === 'deactivate'}
        loading={deactivateMutation.isPending || reactivateMutation.isPending}
      />

      {confirmError !== null && (
        <div className="form-error warehouses__confirm-error" role="alert" data-testid="warehouse-confirm-error">
          <span>{confirmError.message}</span>
          <span className="form-error__request">{t('inventory.warehouses.requestId', { id: confirmError.requestId ?? '' })}</span>
          {confirmError.stale && (
            <Button variant="default" onClick={() => { void refetch(); setConfirmAction(null); setConfirmError(null); }}>
              {t('inventory.warehouses.reload')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

interface WarehouseDialogProps {
  onClose: () => void;
  title: string;
  submitLabel: string;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
  form: { name: string; isDefault: boolean };
  onFormChange: (next: { name: string; isDefault: boolean }) => void;
  error: { message: string; requestId: string | null; stale: boolean } | null;
}

function WarehouseDialog({
  onClose,
  title,
  submitLabel,
  onSubmit,
  submitting,
  form,
  onFormChange,
  error,
}: WarehouseDialogProps) {
  const { t } = useTranslation();
  return (
    <form onSubmit={onSubmit} className="warehouse-dialog">
      <div className="dialog-backdrop">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="warehouse-dialog-title">
          <div className="dialog__header">
            <h2 id="warehouse-dialog-title" className="dialog__title">{title}</h2>
            <button type="button" className="button" aria-label={t('ui.dialog.closeDialog')} onClick={onClose} style={{ padding: 'var(--spacing-xs)' }}>
              <span className="sr-only">{t('common.actions.close')}</span>
              <span>×</span>
            </button>
          </div>
          <div className="dialog__body">
            <Input
              id="warehouse-name"
              label={t('inventory.warehouses.dialog.name')}
              error={error?.message}
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              required
              maxLength={100}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', fontSize: '0.875rem', color: 'var(--color-foreground)' }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => onFormChange({ ...form, isDefault: event.target.checked })}
              />
              {t('inventory.warehouses.dialog.isDefault')}
            </label>
            {error !== null && (
              <div className="form-error" role="alert" data-testid="warehouse-dialog-error">
                <span>{error.message}</span>
                {error.requestId !== null && (
                  <span className="form-error__request">{t('inventory.warehouses.requestId', { id: error.requestId })}</span>
                )}
                {error.stale && (
                  <Button type="button" variant="default" onClick={onClose}>
                    {t('inventory.warehouses.reload')}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="dialog__actions">
            <Button type="button" variant="default" onClick={onClose} disabled={submitting}>
              {t('inventory.warehouses.dialog.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} loading={submitting}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
