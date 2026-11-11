import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRODUCT_PERMISSIONS, PRODUCT_REORDER_LEVEL_LABEL } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useCreateUnit,
  useProducts,
  useUnits,
} from './use-products';

/**
 * The new product form.
 *
 * The amounts are typed as decimal strings and are sent exactly as typed: the
 * interface performs no arithmetic on money, and the service is the authority on
 * what a price may be. A refusal is shown against the field that caused it,
 * with the identifier of the failed request so it can be quoted.
 *
 * A product whose NAME already exists is not refused - two products may share
 * a name - but the form says so, naming the other product's SKU, so the
 * accidental duplicate is visible before it is saved.
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

const EMPTY: FormState = {
  name: '',
  sku: '',
  categoryId: '',
  unitId: '',
  purchasePrice: '',
  sellingPrice: '',
  lowStockThreshold: '',
};

/**
 * A price the interface accepts locally: digits with at most four decimals.
 * A leading minus is accepted by the pattern so the refusal says what is wrong
 * ("must not be negative") rather than "not a decimal".
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

export function ProductNewPage() {
  const navigate = useNavigate();
  const session = useSession();
  const canWrite = hasPermission(session, PRODUCT_PERMISSIONS.write);

  const categories = useCategories();
  const units = useUnits();
  const createProduct = useCreateProduct();
  const createCategory = useCreateCategory();
  const createUnit = useCreateUnit();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<{ message: string; requestId: string } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '' });

  // The advisory notice: another product with the same name. It is advice, not
  // a refusal, so it is looked up rather than learned from a failure.
  const sameNamed = useProducts({ search: form.name.trim() || undefined, page: 1, pageSize: 5 });
  const duplicateName = useMemo(() => {
    const name = form.name.trim().toLowerCase();
    if (name.length === 0) return undefined;
    return sameNamed.data?.items.find(
      (product) => product.name.toLowerCase() === name && product.sku !== form.sku.trim(),
    );
  }, [form.name, form.sku, sameNamed.data]);

  function update(patch: Partial<FormState>) {
    setForm((previous) => ({ ...previous, ...patch }));
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
    if (!validate()) return;

    createProduct.mutate(
      {
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
      {
        onSuccess: (product) => {
          navigate(`/products/${product.id}`);
        },
        onError: (caught) => {
          const error = caught as Error & {
            requestId?: string;
            details?: { field?: string | null; message?: string | null }[];
          };
          setServerError({
            message: error.message,
            requestId: error.requestId ?? 'unknown',
          });
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

  if (!canWrite) {
    return (
      <section className="product-new-page" aria-label="New product">
        <PageHeader title="New Product" />
        <Card title="New Product">
          <ErrorState message="You do not have permission to create products." />
          <Button variant="default" onClick={() => navigate('/products')}>
            Back to products
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="product-new-page" aria-label="New product">
      <PageHeader
        title="New Product"
        description="The code is assigned by the service; the SKU identifies the product in your documents."
        primaryAction={
          <Button variant="default" onClick={() => navigate('/products')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Product">
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              Reference ID: <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="product-new-page__form" noValidate={true}>
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
            {duplicateName && (
              <p className="form-help-text" role="status">
                Another product is named “{duplicateName.name}” (SKU {duplicateName.sku}).{' '}
                <Link to={`/products/${duplicateName.id}`}>Open it</Link> if that is the same item.
              </p>
            )}
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
            <div className="product-new-page__inline-create">
              <Input
                id="new-category"
                label="Or add a category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              />
              <Button
                type="button"
                disabled={newCategory.trim().length === 0 || createCategory.isPending}
                onClick={() =>
                  createCategory.mutate(newCategory.trim(), {
                    onSuccess: (category) => {
                      update({ categoryId: category.id });
                      setNewCategory('');
                    },
                  })
                }
              >
                Add category
              </Button>
            </div>
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
            <div className="product-new-page__inline-create">
              <Input
                id="new-unit-name"
                label="Or add a unit"
                value={newUnit.name}
                onChange={(event) => setNewUnit({ ...newUnit, name: event.target.value })}
              />
              <Input
                id="new-unit-abbreviation"
                label="Abbreviation"
                value={newUnit.abbreviation}
                onChange={(event) => setNewUnit({ ...newUnit, abbreviation: event.target.value })}
              />
              <Button
                type="button"
                disabled={
                  newUnit.name.trim().length === 0 ||
                  newUnit.abbreviation.trim().length === 0 ||
                  createUnit.isPending
                }
                onClick={() =>
                  createUnit.mutate(
                    { name: newUnit.name.trim(), abbreviation: newUnit.abbreviation.trim() },
                    {
                      onSuccess: (unit) => {
                        update({ unitId: unit.id });
                        setNewUnit({ name: '', abbreviation: '' });
                      },
                    },
                  )
                }
              >
                Add unit
              </Button>
            </div>
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
              disabled={createProduct.isPending}
              loading={createProduct.isPending}
            >
              {createProduct.isPending ? 'Creating…' : 'Create Product'}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate('/products')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
