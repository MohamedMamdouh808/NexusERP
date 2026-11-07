import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Input, LineItemsEditor, Select, Textarea, Toast } from '../../components/ui';
import type { LineField, LineEditorLine, ToastTone } from '../../components/ui';
import { addQuantities, compareQuantities, multiplyQuantities } from '../../lib/quantity';
import { compactQuantity } from '../../lib/quantity';
import { useCreateSalesOrder, useUpdateSalesOrder } from './use-sales';
import { useStockBalances, useWarehouses } from '../inventory/use-inventory';
import { useProducts } from '../products/use-products';
import { useContacts } from '../contacts/use-contacts';
import type { CreateSalesOrderInput, SalesOrder } from '../../services/catalog-service';

/**
 * The create-and-edit sales order form, shared by /sales/new and
 * /sales/:id/edit. Plain local state with inline validation on blur and
 * on submit — the same pattern as the purchase order form, so every form in
 * the product behaves the same way. (The plan item named React Hook Form with
 * Zod; plain state was chosen deliberately, see the report.)
 *
 * A line total is quantity (3 decimals) times unit price (4 decimals) rounded
 * half-up to 2 decimals; it is always derived here, never typed. The shared
 * LineItemsEditor renders the grid, and the sales form adds one read-only
 * note column per line: the live availability in the shipping warehouse. The
 * note is advisory only — a draft saves even when the quantity exceeds it,
 * because the check that blocks happens at confirmation time.
 */
export interface OrderFormProps {
  /** Set when editing a draft; undefined when creating a new order. */
  readonly order?: SalesOrder;
  /** Label of the primary button: "Save draft" for both create and edit. */
  readonly submitLabel: string;
}

const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const PRICE_PATTERN = /^\d+(\.\d{1,4})?$/;

interface LineForm {
  readonly productId: string;
  readonly quantity: string;
  readonly unitPrice: string;
}

interface FormState {
  readonly customerId: string;
  readonly warehouseId: string;
  readonly orderDate: string;
  readonly notes: string;
  readonly lines: readonly LineForm[];
}

/** The internal line state, in the neutral shape the shared editor consumes. */
function asLineEditorLine(line: LineForm): LineEditorLine {
  return { productId: line.productId, quantity: line.quantity, price: line.unitPrice };
}

export function OrderForm({ order, submitLabel }: OrderFormProps) {
  const navigate = useNavigate();
  const isEdit = order !== undefined;

  const [form, setForm] = useState<FormState>(() =>
    order === undefined
      ? { customerId: '', warehouseId: '', orderDate: '', notes: '', lines: [] }
      : {
          customerId: order.customerId,
          warehouseId: order.warehouseId,
          orderDate: order.orderDate,
          notes: order.notes,
          lines: order.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        },
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  const createMutation = useCreateSalesOrder();
  const updateMutation = useUpdateSalesOrder();

  // Customers: non-archived contacts with the CUSTOMER role.
  const { data: contactsData } = useContacts({ role: 'CUSTOMER', status: 'ACTIVE', page: 1, pageSize: 100 });
  const customers = contactsData?.items ?? [];

  // Shipping warehouses: active warehouses only.
  const { data: warehousesData } = useWarehouses();
  const warehouses = (warehousesData ?? []).filter((warehouse) => warehouse.status === 'ACTIVE');

  // Line products: non-archived products (drafts and active).
  const { data: productsData } = useProducts({ page: 1, pageSize: 100 });
  const products = (productsData?.items ?? []).filter((product) => product.status !== 'ARCHIVED');

  // Live availability in the chosen warehouse, from the sample the Inventory
  // screens read. Unfiltered while no warehouse is chosen; the lookup below
  // only becomes meaningful once one is picked.
  const { data: balancesData } = useStockBalances({
    warehouseId: form.warehouseId === '' ? undefined : form.warehouseId,
    page: 1,
    pageSize: 200,
  });
  const availableByProduct = useMemo(
    () =>
      new Map(
        (balancesData?.items ?? [])
          .filter((balance) => form.warehouseId === '' || balance.warehouseId === form.warehouseId)
          .map((balance) => [balance.productId, balance.available]),
      ),
    [balancesData, form.warehouseId],
  );

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

  /** Picking a product defaults the unit price to the product's selling price, still editable. */
  function pickProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    changeLine(index, { productId, unitPrice: product?.sellingPrice ?? '' });
  }

  function addLine() {
    changeForm({ lines: [...form.lines, { productId: '', quantity: '', unitPrice: '' }] });
  }

  function removeLine(index: number) {
    changeForm({ lines: form.lines.filter((_, i) => i !== index) });
  }

  function touch(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function validateField(field: string, state: FormState): string | undefined {
    if (field === 'customerId') {
      return state.customerId === '' ? 'Customer is required.' : undefined;
    }
    if (field === 'warehouseId') {
      return state.warehouseId === '' ? 'Shipping warehouse is required.' : undefined;
    }
    if (field === 'orderDate') {
      return state.orderDate === '' ? 'Order date is required.' : undefined;
    }

    const match = /^lines\.(\d+)\.(productId|quantity|unitPrice)$/.exec(field);
    if (match === null) return undefined;

    const index = Number.parseInt(match[1], 10);
    const line = state.lines[index];
    if (line === undefined) return undefined;

    if (match[2] === 'productId') {
      return line.productId === '' ? 'Select a product.' : undefined;
    }
    if (match[2] === 'quantity') {
      if (line.quantity === '') return 'Quantity is required.';
      if (!QUANTITY_PATTERN.test(line.quantity)) return 'Enter a quantity of up to 3 decimal places.';
      if (compareQuantities(line.quantity, '0.000') <= 0) return 'Quantity must be greater than 0.';
      return undefined;
    }
    // unitPrice
    if (!PRICE_PATTERN.test(line.unitPrice)) return 'Enter a unit price of up to 4 decimal places.';
    if (compareQuantities(line.unitPrice, '0.0000') < 0) return 'Unit price must not be negative.';
    return undefined;
  }

  const duplicateProductIndex = useMemo(
    () =>
      form.lines.findIndex(
        (line, index) => line.productId !== '' && form.lines.some((other, i) => i !== index && other.productId === line.productId),
      ),
    [form.lines],
  );

  const linesEmptyError = form.lines.length === 0 ? 'Add at least one line before saving.' : undefined;

  function errorFor(field: string): string | undefined {
    if (touched[field] !== true) return undefined;
    const message = validateField(field, form);
    if (message !== undefined) return message;
    if (field.endsWith('.productId')) {
      const index = Number.parseInt(/^lines\.(\d+)\./.exec(field)?.[1] ?? '-1', 10);
      const line = form.lines[index];
      if (line !== undefined && line.productId !== '' && form.lines.some((other, i) => i !== index && other.productId === line.productId)) {
        return 'This product is already on another line.';
      }
    }
    return undefined;
  }

  const lineTotalText = (quantity: string, unitPrice: string): string | undefined => {
    if (quantity === '' || unitPrice === '') return undefined;
    if (!QUANTITY_PATTERN.test(quantity) || !PRICE_PATTERN.test(unitPrice)) return undefined;
    return multiplyQuantities(quantity, unitPrice);
  };

  const totalsText = useMemo(() => {
    const amounts: string[] = [];
    for (const line of form.lines) {
      const total = lineTotalText(line.quantity, line.unitPrice);
      if (total !== undefined) {
        amounts.push(total);
      }
    }
    return addQuantities(...amounts);
    // Depends only on the lines, which change on every edit keystroke.
  }, [form.lines]);

  /** The per-line note cell content: live availability, or the over-order warning. */
  function availabilityNote(index: number) {
    const line = form.lines[index];
    if (line === undefined) return null;

    if (form.warehouseId === '') {
      // No warehouse chosen yet: nothing to show a quantity against.
      return <span className="line-items-editor__note">—</span>;
    }

    const quantity = line.quantity;
    const over = QUANTITY_PATTERN.test(quantity) && compareQuantities(quantity, '0.000') > 0;
    if (!over) {
      return (
        <span className="line-items-editor__note">
          {`Available: ${compactQuantity(availableByProduct.get(line.productId) ?? '0.000')}`}
        </span>
      );
    }

    const available = availableByProduct.get(line.productId) ?? '0.000';
    if (compareQuantities(quantity, available) > 0) {
      return <span className="line-items-editor__note line-items-editor__note--warning">{`Only ${compactQuantity(available)} available`}</span>;
    }
    return <span className="line-items-editor__note">{`Available: ${compactQuantity(available)}`}</span>;
  }

  function validateAll(): string[] {
    const fields = ['customerId', 'warehouseId', 'orderDate'];
    form.lines.forEach((_line, index) => {
      fields.push(`lines.${index}.productId`, `lines.${index}.quantity`, `lines.${index}.unitPrice`);
    });

    const errors: string[] = [];
    for (const field of fields) {
      const message = validateField(field, form);
      if (message !== undefined) {
        errors.push(message);
      }
    }
    if (duplicateProductIndex !== -1) {
      errors.push('This product is already on another line.');
    }
    if (linesEmptyError !== undefined) {
      errors.push(linesEmptyError);
    }
    return errors;
  }

  function markAllTouched() {
    const state = { ...touched };
    state.customerId = true;
    state.warehouseId = true;
    state.orderDate = true;
    form.lines.forEach((_line, index) => {
      state[`lines.${index}.productId`] = true;
      state[`lines.${index}.quantity`] = true;
      state[`lines.${index}.unitPrice`] = true;
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

    const input: CreateSalesOrderInput = {
      customerId: form.customerId,
      warehouseId: form.warehouseId,
      orderDate: form.orderDate,
      notes: form.notes,
      lines: form.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    };

    setSaving(true);
    if (isEdit) {
      updateMutation.mutate(
        { ...input, id: order.id },
        {
          onSuccess: (result) => {
            // The detail page shows the named success notice from navigation state.
            navigate(`/sales/${order.id}`, {
              state: { notice: `Sales order ${result.number} saved.` },
            });
          },
          onError: (mutationError) => {
            pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be saved.');
            setSaving(false);
          },
        },
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: (result) => {
          navigate(`/sales/${result.id}`, {
            state: { notice: `Sales order ${result.number} created.` },
          });
        },
        onError: (mutationError) => {
          pushToast('failure', mutationError instanceof Error ? mutationError.message : 'The order could not be created.');
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
          id="so-customer"
          label="Customer *"
          options={customers.map((customer) => ({ value: customer.id, label: `${customer.code} — ${customer.name}` }))}
          value={form.customerId}
          onChange={(event) => changeForm({ customerId: event.target.value })}
          onBlur={() => touch('customerId')}
          error={errorFor('customerId')}
          required
          placeholder="Select a customer"
          helpText="Only active contacts with the customer role are listed."
        />
        <Select
          id="so-warehouse"
          label="Shipping warehouse *"
          options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
          value={form.warehouseId}
          onChange={(event) => changeForm({ warehouseId: event.target.value })}
          onBlur={() => touch('warehouseId')}
          error={errorFor('warehouseId')}
          required
          placeholder="Select a warehouse"
          helpText="Active warehouses only. Availability is checked here."
        />
        <Input
          id="so-order-date"
          label="Order date *"
          type="date"
          error={errorFor('orderDate')}
          value={form.orderDate}
          onChange={(event) => changeForm({ orderDate: event.target.value })}
          onBlur={() => touch('orderDate')}
          required
        />
        <Textarea
          id="so-notes"
          label="Notes"
          value={form.notes}
          onChange={(event) => changeForm({ notes: event.target.value })}
          rows={2}
          placeholder="Optional"
        />
      </div>

      <LineItemsEditor
        lines={form.lines.map(asLineEditorLine)}
        productOptions={products.map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` }))}
        priceLabel="Unit price"
        quantityHelpText="Greater than 0, up to 3 decimals."
        priceHelpText="Not negative, up to 4 decimals. Defaults to the selling price."
        idPrefix="so-line"
        disabled={busy}
        fieldError={(index, field: LineField) => errorFor(`lines.${index}.${field === 'price' ? 'unitPrice' : field}`)}
        onPickProduct={pickProduct}
        onChange={(index, field, value) => changeLine(index, { [field === 'price' ? 'unitPrice' : field]: value })}
        onBlur={(index, field) => touch(`lines.${index}.${field === 'price' ? 'unitPrice' : field}`)}
        onAdd={addLine}
        onRemove={removeLine}
        lineTotal={(line) => lineTotalText(line.quantity, line.price)}
        total={totalsText}
        renderNote={availabilityNote}
      />

      {linesEmptyError && (
        <p className="form-error" role="alert">
          {linesEmptyError}
        </p>
      )}

      <div className="order-form__actions">
        <Button type="submit" variant="primary" disabled={busy} loading={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="default" onClick={() => navigate(isEdit ? `/sales/${order.id}` : '/sales')} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
