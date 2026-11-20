import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Input, LineItemsEditor, Select, Textarea, Toast } from '../../components/ui';
import type { LineField, LineEditorLine } from '../../components/ui';
import type { ToastTone } from '../../components/ui';
import { addQuantities, compareQuantities, multiplyQuantities } from '../../lib/quantity';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from './use-purchasing';
import { useContacts } from '../contacts/use-contacts';
import { useProducts } from '../products/use-products';
import { useWarehouses } from '../inventory/use-inventory';
import type { CreatePurchaseOrderInput, PurchaseOrder } from '../../services/catalog-service';

/**
 * The create-and-edit purchase order form, shared by /purchasing/new and
 * /purchasing/:id/edit. Plain local state with inline validation on blur and
 * on submit — the same pattern as the Products and Contacts forms, so every
 * form in the product behaves the same way.
 *
 * A line total is quantity (3 decimals) times unit cost (4 decimals) rounded
 * half-up to 2 decimals; it is always derived here, never typed. The line
 * items grid itself is the shared LineItemsEditor, so the sales order form
 * renders the same one (Purchasing supplies no extra note cell).
 */
export interface OrderFormProps {
  /** Set when editing a draft; undefined when creating a new order. */
  readonly order?: PurchaseOrder;
  /** Label of the primary button: "Save draft" for both create and edit. */
  readonly submitLabel: string;
}

const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const COST_PATTERN = /^\d+(\.\d{1,4})?$/;

interface LineForm {
  readonly productId: string;
  readonly quantity: string;
  readonly unitCost: string;
}

interface FormState {
  readonly supplierId: string;
  readonly warehouseId: string;
  readonly orderDate: string;
  readonly expectedDate: string;
  readonly notes: string;
  readonly lines: readonly LineForm[];
}

/** The internal line state, in the neutral shape the shared editor consumes. */
function asLineEditorLine(line: LineForm): LineEditorLine {
  return { productId: line.productId, quantity: line.quantity, price: line.unitCost };
}

export function OrderForm({ order, submitLabel }: OrderFormProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isEdit = order !== undefined;

  const [form, setForm] = useState<FormState>(() =>
    order === undefined
      ? { supplierId: '', warehouseId: '', orderDate: '', expectedDate: '', notes: '', lines: [] }
      : {
          supplierId: order.supplierId,
          warehouseId: order.warehouseId,
          orderDate: order.orderDate,
          expectedDate: order.expectedDate ?? '',
          notes: order.notes,
          lines: order.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        },
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();

  // Suppliers: non-archived contacts with the SUPPLIER role.
  const { data: contactsData } = useContacts({ role: 'supplier', status: 'active', page: 1, pageSize: 100 });
  const suppliers = contactsData?.items ?? [];

  // Destination warehouses: the real list, active warehouses only.
  const { data: warehousesData } = useWarehouses();
  const warehouses = (warehousesData?.items ?? []).filter((warehouse) => warehouse.isActive);

  // Line products: the real catalogue, active products only - the service
  // refuses archived products outright.
  const { data: productsData } = useProducts({ status: 'active', page: 1, pageSize: 100 });
  const products = productsData?.items ?? [];

  function pushToast(tone: ToastTone, message: string) {
    setToasts((prev) => [
      ...prev,
      { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`, tone, message },
    ]);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function changeForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function changeLine(index: number, patch: Partial<LineForm>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  /** Picking a product defaults the unit cost to the product's purchase price, still editable. */
  function pickProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    changeLine(index, { productId, unitCost: product?.purchasePrice ?? '' });
  }

  function addLine() {
    changeForm({ lines: [...form.lines, { productId: '', quantity: '', unitCost: '' }] });
  }

  function removeLine(index: number) {
    changeForm({ lines: form.lines.filter((_, i) => i !== index) });
  }

  function touch(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function validateField(field: string, state: FormState): string | undefined {
    if (field === 'supplierId') {
      return state.supplierId === '' ? t('purchasing.form.supplierRequired') : undefined;
    }
    if (field === 'warehouseId') {
      return state.warehouseId === '' ? t('purchasing.form.destinationWarehouseRequired') : undefined;
    }
    if (field === 'orderDate') {
      return state.orderDate === '' ? t('purchasing.form.orderDateRequired') : undefined;
    }
    if (field === 'expectedDate') {
      if (state.expectedDate !== '' && state.orderDate !== '' && state.expectedDate < state.orderDate) {
        return t('purchasing.form.expectedBeforeOrder');
      }
      return undefined;
    }

    const match = /^lines\.(\d+)\.(productId|quantity|unitCost)$/.exec(field);
    if (match === null) return undefined;

    const index = Number.parseInt(match[1], 10);
    const line = state.lines[index];
    if (line === undefined) return undefined;

    if (match[2] === 'productId') {
      return line.productId === '' ? t('purchasing.form.selectProduct') : undefined;
    }
    if (match[2] === 'quantity') {
      if (line.quantity === '') return t('purchasing.form.quantityRequired');
      if (!QUANTITY_PATTERN.test(line.quantity)) return t('purchasing.form.quantityDecimals');
      if (compareQuantities(line.quantity, '0.000') <= 0) return t('purchasing.form.quantityPositive');
      return undefined;
    }
    // unitCost
    if (!COST_PATTERN.test(line.unitCost)) return t('purchasing.form.unitCostDecimals');
    if (compareQuantities(line.unitCost, '0.0000') < 0) return t('purchasing.form.unitCostNonNegative');
    return undefined;
  }

  const duplicateProductIndex = useMemo(
    () =>
      form.lines.findIndex(
        (line, index) => line.productId !== '' && form.lines.some((other, i) => i !== index && other.productId === line.productId),
      ),
    [form.lines],
  );

  function errorFor(field: string): string | undefined {
    if (touched[field] !== true) return undefined;
    const message = validateField(field, form);
    if (message !== undefined) return message;
    if (field.endsWith('.productId')) {
      const index = Number.parseInt(/^lines\.(\d+)\./.exec(field)?.[1] ?? '-1', 10);
      const line = form.lines[index];
      if (line !== undefined && line.productId !== '' && form.lines.some((other, i) => i !== index && other.productId === line.productId)) {
        return t('purchasing.form.duplicateLine');
      }
    }
    return undefined;
  }

  const lineTotalText = (quantity: string, unitCost: string): string | undefined => {
    if (quantity === '' || unitCost === '') return undefined;
    if (!QUANTITY_PATTERN.test(quantity) || !COST_PATTERN.test(unitCost)) return undefined;
    return multiplyQuantities(quantity, unitCost);
  };

  const totalsText = useMemo(() => {
    const amounts: string[] = [];
    for (const line of form.lines) {
      const total = lineTotalText(line.quantity, line.unitCost);
      if (total !== undefined) {
        amounts.push(total);
      }
    }
    return addQuantities(...amounts);
    // Depends only on the lines, which change on every edit keystroke.
  }, [form.lines]);

  function validateAll(): string[] {
    const fields = ['supplierId', 'warehouseId', 'orderDate', 'expectedDate'];
    form.lines.forEach((_line, index) => {
      fields.push(`lines.${index}.productId`, `lines.${index}.quantity`, `lines.${index}.unitCost`);
    });

    const errors: string[] = [];
    for (const field of fields) {
      const message = validateField(field, form);
      if (message !== undefined) {
        errors.push(message);
      }
    }
    if (duplicateProductIndex !== -1) {
      errors.push(t('purchasing.form.duplicateLine'));
    }
    // An order with no lines is a valid draft: the service accepts it and the
    // caller comes back to fill the lines in.
    return errors;
  }

  function markAllTouched() {
    const state = { ...touched };
    state.supplierId = true;
    state.warehouseId = true;
    state.orderDate = true;
    state.expectedDate = true;
    form.lines.forEach((_line, index) => {
      state[`lines.${index}.productId`] = true;
      state[`lines.${index}.quantity`] = true;
      state[`lines.${index}.unitCost`] = true;
    });
    setTouched(state);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    markAllTouched();

    const errors = validateAll();
    if (errors.length > 0) {
      pushToast('failure', errors[0]);
      return;
    }

    const input: CreatePurchaseOrderInput = {
      supplierId: form.supplierId,
      warehouseId: form.warehouseId,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate === '' ? null : form.expectedDate,
      notes: form.notes,
      lines: form.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
    };

    setSaving(true);
    if (isEdit) {
      updateMutation.mutate(
        { ...input, id: order.id, version: order.version },
        {
          onSuccess: (result) => {
            // The detail page shows the named success notice from navigation state.
            navigate(`/purchasing/${order.id}`, {
              state: { notice: t('purchasing.form.savedToast', { number: result.number }) },
            });
          },
          onError: (mutationError) => {
            pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.form.saveError'));
            setSaving(false);
          },
        },
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: (result) => {
          navigate(`/purchasing/${result.id}`, {
            state: { notice: t('purchasing.form.createdToast', { number: result.number }) },
          });
        },
        onError: (mutationError) => {
          pushToast('failure', mutationError instanceof Error ? mutationError.message : t('purchasing.form.createError'));
          setSaving(false);
        },
      });
    }
  }

  const busy = saving || createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="order-form" noValidate>
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
      ))}

      <div className="order-form__header-fields">
        <Select
          id="po-supplier"
          label={t('purchasing.form.supplier')}
          options={suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.code} — ${supplier.name}` }))}
          value={form.supplierId}
          onChange={(event) => changeForm({ supplierId: event.target.value })}
          onBlur={() => touch('supplierId')}
          error={errorFor('supplierId')}
          required
          placeholder={t('purchasing.form.supplierPlaceholder')}
          helpText={t('purchasing.form.supplierHelp')}
        />
        <Select
          id="po-warehouse"
          label={t('purchasing.form.destinationWarehouse')}
          options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
          value={form.warehouseId}
          onChange={(event) => changeForm({ warehouseId: event.target.value })}
          onBlur={() => touch('warehouseId')}
          error={errorFor('warehouseId')}
          required
          placeholder={t('purchasing.form.destinationPlaceholder')}
          helpText={t('purchasing.form.destinationHelp')}
        />
        <Input
          id="po-order-date"
          label={t('purchasing.form.orderDate')}
          type="date"
          error={errorFor('orderDate')}
          value={form.orderDate}
          onChange={(event) => changeForm({ orderDate: event.target.value })}
          onBlur={() => touch('orderDate')}
          required
        />
        <Input
          id="po-expected-date"
          label={t('purchasing.form.expectedDate')}
          type="date"
          error={errorFor('expectedDate')}
          value={form.expectedDate}
          onChange={(event) => changeForm({ expectedDate: event.target.value })}
          onBlur={() => touch('expectedDate')}
          helpText={t('purchasing.form.expectedBeforeOrderHelp')}
        />
        <Textarea
          id="po-notes"
          label={t('purchasing.form.notes')}
          value={form.notes}
          onChange={(event) => changeForm({ notes: event.target.value })}
          rows={2}
          placeholder={t('purchasing.form.optional')}
        />
      </div>

      <LineItemsEditor
        lines={form.lines.map(asLineEditorLine)}
        productOptions={products.map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` }))}
        priceLabel={t('purchasing.form.unitCostLabel')}
        quantityHelpText={t('purchasing.form.quantityHelp')}
        priceHelpText={t('purchasing.form.unitCostHelp')}
        idPrefix="po-line"
        disabled={busy}
        fieldError={(index, field: LineField) => errorFor(`lines.${index}.${field === 'price' ? 'unitCost' : field}`)}
        onPickProduct={pickProduct}
        onChange={(index, field, value) => changeLine(index, { [field === 'price' ? 'unitCost' : field]: value })}
        onBlur={(index, field) => touch(`lines.${index}.${field === 'price' ? 'unitCost' : field}`)}
        onAdd={addLine}
        onRemove={removeLine}
        lineTotal={(line) => lineTotalText(line.quantity, line.price)}
        total={totalsText}
      />

      <div className="order-form__actions">
        <Button type="submit" variant="primary" disabled={busy} loading={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="default" onClick={() => navigate(isEdit ? `/purchasing/${order.id}` : '/purchasing')} disabled={busy}>
          {t('common.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
