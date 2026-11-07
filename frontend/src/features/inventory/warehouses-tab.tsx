import { useMemo, useState } from 'react';

import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, KebabMenu, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import { addQuantities } from '../../lib/quantity';
import { useCreateWarehouse, useDeactivateWarehouse, useStockBalances, useUpdateWarehouse, useWarehouses } from './use-inventory';

interface WarehouseRow {
  [key: string]: unknown;
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  status: string;
  totalOnHand: string;
}

export function WarehousesTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ code: '', name: '', isDefault: false });
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});

  const { data: warehousesData, isPending: warehousesPending, error: warehousesErrorObj } = useWarehouses();
  const { data: balancesData, isPending: balancesPending } = useStockBalances({
    page: 1,
    pageSize: 1000,
  });
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();
  const deactivateMutation = useDeactivateWarehouse();

  const warehouses = warehousesData ?? [];
  const balances = balancesData?.items ?? [];

  // Compute total on hand per warehouse from balances.
  const totalByWarehouse = useMemo(() => {
    const totals = new Map<string, string>();
    for (const b of balances) {
      const existing = totals.get(b.warehouseId) ?? '0.000';
      totals.set(b.warehouseId, addQuantities(existing, b.onHand));
    }
    return totals;
  }, [balances]);

  const isPending = warehousesPending || balancesPending;

  const columns: Column<WarehouseRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Name' },
      { key: 'code', header: 'Code' },
      { key: 'isDefault', header: 'Default', render: (row) => (row.isDefault ? <span>Yes</span> : <span>-</span>) },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'destructive'}>{row.status}</Badge> },
      { key: 'totalOnHand', header: 'Total on hand', numeric: true, render: (row) => <span className="qty">{row.totalOnHand}</span> },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const entries = [
            { kind: 'item' as const, id: 'edit', label: 'Edit', onSelect: () => openEdit(row) },
            row.status === 'ACTIVE'
              ? ({ kind: 'item' as const, id: 'deactivate', label: 'Deactivate', onSelect: () => openDeactivate(row) })
              : ({ kind: 'item' as const, id: 'activate', label: 'Activate', onSelect: () => {} }),
          ];
          return <KebabMenu label={`Actions for ${row.name}`} entries={entries} />;
        },
      },
    ],
    [],
  );

  function openCreate() {
    setEditMode(false);
    setEditingId('');
    setForm({ code: '', name: '', isDefault: false });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(row: WarehouseRow) {
    setEditMode(true);
    setEditingId(row.id);
    setForm({ code: row.code, name: row.name, isDefault: row.isDefault });
    setErrors({});
    setDialogOpen(true);
  }

  function openDeactivate(row: WarehouseRow) {
    setConfirmTarget({ id: row.id, name: row.name });
    setConfirmOpen(true);
  }

  function validate(): boolean {
    const next: { code?: string; name?: string } = {};
    let valid = true;
    if (!form.code.trim()) { next.code = 'Code is required.'; valid = false; }
    if (!form.name.trim()) { next.name = 'Name is required.'; valid = false; }
    setErrors(next);
    return valid;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (editMode) {
      updateMutation.mutate(
        { id: editingId, code: form.code.trim(), name: form.name.trim(), isDefault: form.isDefault, status: 'ACTIVE' },
        { onSuccess: () => setDialogOpen(false), onError: () => {} },
      );
    } else {
      createMutation.mutate(
        { code: form.code.trim(), name: form.name.trim(), isDefault: form.isDefault },
        { onSuccess: () => setDialogOpen(false), onError: () => {} },
      );
    }
  }

  function handleDeactivate() {
    if (!confirmTarget) return;
    deactivateMutation.mutate(confirmTarget.id, {
      onSuccess: () => { setConfirmOpen(false); setConfirmTarget(null); },
      onError: () => {},
    });
  }

  const apiFailure =
    warehousesErrorObj && typeof warehousesErrorObj === 'object' && 'requestId' in warehousesErrorObj
      ? (warehousesErrorObj as Error & { requestId: string })
      : undefined;

  const warehouseRows: WarehouseRow[] = warehouses.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    isDefault: w.isDefault,
    status: w.status,
    totalOnHand: totalByWarehouse.get(w.id) ?? '0.000',
  }));

  if (isPending) {
    return (
      <section className="warehouses-tab" aria-label="Warehouses">
        <Card title="Warehouses">
          <Skeleton label="Loading warehouses" />
        </Card>
      </section>
    );
  }

  if (warehousesData === undefined) {
    return (
      <section className="warehouses-tab" aria-label="Warehouses">
        <Card title="Warehouses">
          <ErrorState
            message="The warehouses could not be loaded."
            requestId={apiFailure?.requestId}
            onRetry={() => {}}
          />
        </Card>
      </section>
    );
  }

  if (warehouses.length === 0) {
    return (
      <section className="warehouses-tab" aria-label="Warehouses">
        <EmptyState
          title="No warehouses"
          description="Create your first warehouse to track stock across locations."
          actionLabel="New Warehouse"
          onAction={openCreate}
        />
      </section>
    );
  }

  return (
    <section className="warehouses-tab" aria-label="Warehouses">
      <Card title="Warehouses">
        <div className="warehouses__toolbar">
          <Button variant="primary" onClick={openCreate}>
            New Warehouse
          </Button>
        </div>
        <DataTable<WarehouseRow>
          columns={columns}
          data={warehouseRows}
          total={warehouseRows.length}
          page={1}
          pageSize={20}
          emptyMessage="No warehouses found."
        />
      </Card>

      <WarehouseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editMode ? 'Edit Warehouse' : 'New Warehouse'}
        submitLabel={editMode ? 'Save changes' : 'Create Warehouse'}
        onSubmit={handleSubmit}
        submitting={createMutation.isPending || updateMutation.isPending}
        form={form}
        errors={errors}
        onFormChange={(nextForm) => setForm(nextForm)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDeactivate}
        title="Deactivate warehouse"
        description={
          confirmTarget
            ? `Are you sure you want to deactivate “${confirmTarget.name}”? A deactivated warehouse cannot receive or ship stock, and cannot be the default warehouse.`
            : 'Are you sure you want to deactivate this warehouse?'
        }
        actionLabel="Deactivate"
        destructive
        loading={deactivateMutation.isPending}
      />
    </section>
  );
}

interface WarehouseDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
  form: { code: string; name: string; isDefault: boolean };
  errors: { code?: string; name?: string };
  onFormChange: (next: { code: string; name: string; isDefault: boolean }) => void;
}

function WarehouseDialog({
  open,
  onClose,
  title,
  submitLabel,
  onSubmit,
  submitting,
  form,
  errors,
  onFormChange,
}: WarehouseDialogProps) {
  return (
    <form onSubmit={onSubmit} className="warehouse-dialog">
      <div className="dialog-backdrop" style={{ display: open ? 'block' : 'none' }}>
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="warehouse-dialog-title">
          <div className="dialog__header">
            <h2 id="warehouse-dialog-title" className="dialog__title">{title}</h2>
            <button type="button" className="button" aria-label="Close dialog" onClick={onClose} style={{ padding: 'var(--spacing-xs)' }}>
              <span className="sr-only">Close</span>
              <span>×</span>
            </button>
          </div>
          <div className="dialog__body">
            <Input
              id="warehouse-code"
              label="Code *"
              error={errors.code}
              value={form.code}
              onChange={(event) => onFormChange({ ...form, code: event.target.value })}
              required
              helpText="Unique warehouse code, e.g. WH-001."
            />
            <Input
              id="warehouse-name"
              label="Name *"
              error={errors.name}
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              required
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', fontSize: '0.875rem', color: 'var(--color-foreground)' }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => onFormChange({ ...form, isDefault: event.target.checked })}
              />
              Default warehouse
            </label>
          </div>
          <div className="dialog__actions">
            <Button type="button" variant="default" onClick={onClose} disabled={submitting}>
              Cancel
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
