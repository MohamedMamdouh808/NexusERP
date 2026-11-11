import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PRODUCT_PERMISSIONS, PRODUCT_REORDER_LEVEL_LABEL } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { useCategories, useProduct, useUnits, useUpdateProduct } from './use-products';

/**
 * The edit form.
 *
 * The version the page was opened with travels with the change: if someone else
 * changed the product in the meantime, the service refuses the save and the
 * screen offers to reload the current version rather than overwriting it.
 */
interface FormState {
  name: string;
  sku: string;
  categoryId: string;
  unitId: string;
  purchasePrice: string;
  sellingPrice: string;
  lowStockThreshold: string;
}

interface FormErrors {
  name?: string;
  sku?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  lowStockThreshold?: string;
  categoryId?: string;
  unitId?: string;
}

/**
 * A price the interface accepts locally: digits with at most the column's
 * decimals. A leading minus is accepted by the pattern so the refusal says
 * what is wrong ("must not be negative") rather than "not a decimal".
 */
function priceError(value: string, decimals: number, label: string): string | undefined {
  const trimmed = value.trim();
  if (!new RegExp(`^-?\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) {
    return `${label} must be a decimal with at most ${decimals} decimal places.`;
  }
  if (trimmed.startsWith('-')) {
    return `${label} must not be negative.`;
  }
  return undefined;
}

export function ProductEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const session = useSession();
  const canWrite = hasPermission(session, PRODUCT_PERMISSIONS.write);

  const categories = useCategories();
  const units = useUnits();
  const { data, isPending, isError, error, refetch } = useProduct(productId);
  const updateProduct = useUpdateProduct();

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<{ message: string; requestId: string } | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (data && !form) {
      setForm({
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        unitId: data.unitId,
        purchasePrice: data.purchasePrice,
        sellingPrice: data.sellingPrice,
        lowStockThreshold: data.lowStockThreshold ?? '',
      });
    }
  }, [data, form]);

  function update(patch: Partial<FormState>) {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
    // A validation error describes the old value: editing the field clears it.
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch)) {
        delete next[key as keyof FormErrors];
      }
      return next;
    });
  }

  function validate(): boolean {
    if (!form) return false;
    const next: FormErrors = {};
    if (form.name.trim().length === 0) next.name = 'Name is required.';
    if (form.sku.trim().length === 0) next.sku = 'SKU is required.';
    if (form.categoryId === '') next.categoryId = 'Choose a category.';
    if (form.unitId === '') next.unitId = 'Choose a unit of measure.';
    const purchasePriceError = priceError(form.purchasePrice, 4, 'Purchase price');
    if (purchasePriceError !== undefined) next.purchasePrice = purchasePriceError;
    const sellingPriceError = priceError(form.sellingPrice, 4, 'Selling price');
    if (sellingPriceError !== undefined) next.sellingPrice = sellingPriceError;
    if (form.lowStockThreshold.trim().length > 0) {
      const reorderError = priceError(form.lowStockThreshold, 3, PRODUCT_REORDER_LEVEL_LABEL);
      if (reorderError !== undefined) next.lowStockThreshold = reorderError;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    setStale(false);
    if (!form || !data || !validate()) return;

    updateProduct.mutate(
      {
        id: productId,
        input: {
          // The version the page was opened with: the service refuses a change
          // prepared against a version that has moved on.
          version: data.version,
          name: form.name.trim(),
          sku: form.sku.trim(),
          categoryId: form.categoryId,
          unitId: form.unitId,
          purchasePrice: form.purchasePrice.trim(),
          sellingPrice: form.sellingPrice.trim(),
          ...(form.lowStockThreshold.trim().length > 0
            ? { lowStockThreshold: form.lowStockThreshold.trim() }
            : {}),
        },
      },
      {
        onSuccess: () => {
          navigate(`/products/${productId}`);
        },
        onError: (caught) => {
          const error = caught as Error & {
            code?: string;
            requestId?: string;
            details?: { field?: string | null; message?: string | null }[];
          };
          if (error.code === 'STALE_VERSION') {
            setStale(true);
            return;
          }
          setServerError({ message: error.message, requestId: error.requestId ?? 'unknown' });
          const next: FormErrors = { ...errors };
          for (const detail of error.details ?? []) {
            if (detail.field) {
              next[detail.field as keyof FormErrors] = detail.message ?? error.message;
            }
          }
          setErrors(next);
        },
      },
    );
  }

  if (isPending) {
    return (
      <section className="product-edit-page" aria-label="Edit product">
        <PageHeader title="Edit Product" />
        <Card title="Edit Product">
          <span>Loading product…</span>
        </Card>
      </section>
    );
  }

  if (isError || data === undefined) {
    return (
      <section className="product-edit-page" aria-label="Edit product">
        <PageHeader title="Edit Product" />
        <Card title="Edit Product">
          <ErrorState
            message={error instanceof Error ? error.message : 'The product could not be loaded.'}
          />
        </Card>
      </section>
    );
  }

  if (!canWrite) {
    return (
      <section className="product-edit-page" aria-label="Edit product">
        <PageHeader title="Edit Product" />
        <Card title="Edit Product">
          <ErrorState message="You do not have permission to change products." />
          <Button variant="default" onClick={() => navigate(`/products/${productId}`)}>
            Back to product
          </Button>
        </Card>
      </section>
    );
  }

  if (!form) return null;

  return (
    <section className="product-edit-page" aria-label="Edit product">
      <PageHeader
        title="Edit Product"
        description={`Editing “${data.name}”.`}
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/products/${productId}`)}>
            Cancel
          </Button>
        }
      />
      <Card title="Edit Product">
        {stale && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>
              This product was changed by someone else. Reload the current version before saving
              yours.
            </p>
            <Button
              variant="default"
              type="button"
              onClick={() => {
                setStale(false);
                setForm(null);
                void refetch();
              }}
            >
              Reload the product
            </Button>
          </div>
        )}
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              Reference ID: <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="product-edit-page__form" noValidate={true}>
          <fieldset className="contact-form__section">
            <legend>Details</legend>
            <Input
              id="name"
              label="Name"
              value={form.name}
              error={errors.name}
              onChange={(event) => update({ name: event.target.value })}
              required
            />
            <Input
              id="sku"
              label="SKU"
              value={form.sku}
              error={errors.sku}
              onChange={(event) => update({ sku: event.target.value })}
              required
            />
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>Classification</legend>
            <Select
              id="categoryId"
              label="Category"
              value={form.categoryId}
              error={errors.categoryId}
              options={(categories.data ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              onChange={(event) => update({ categoryId: event.target.value })}
              placeholder="Choose a category"
            />
            <Select
              id="unitId"
              label="Unit of measure"
              value={form.unitId}
              error={errors.unitId}
              options={(units.data ?? []).map((unit) => ({
                value: unit.id,
                label: `${unit.name} (${unit.abbreviation})`,
              }))}
              onChange={(event) => update({ unitId: event.target.value })}
              placeholder="Choose a unit of measure"
            />
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>Prices</legend>
            <div className="contact-form__row">
              <Input
                id="purchasePrice"
                label="Purchase price"
                value={form.purchasePrice}
                error={errors.purchasePrice}
                onChange={(event) => update({ purchasePrice: event.target.value })}
              />
              <Input
                id="sellingPrice"
                label="Selling price"
                value={form.sellingPrice}
                error={errors.sellingPrice}
                onChange={(event) => update({ sellingPrice: event.target.value })}
              />
            </div>
            <Input
              id="lowStockThreshold"
              label={PRODUCT_REORDER_LEVEL_LABEL}
              value={form.lowStockThreshold}
              error={errors.lowStockThreshold}
              onChange={(event) => update({ lowStockThreshold: event.target.value })}
            />
          </fieldset>

          <div className="contact-form__actions">
            <Button
              variant="primary"
              type="submit"
              disabled={updateProduct.isPending}
              loading={updateProduct.isPending}
            >
              {updateProduct.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate(`/products/${productId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
