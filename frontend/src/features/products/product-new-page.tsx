import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRODUCT_PERMISSIONS } from '@nexuserp/shared';

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

export function ProductNewPage() {
  const navigate = useNavigate();
  const session = useSession();
  const { t } = useTranslation();
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
    const decimalPattern = (decimals: number) => new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
    const minusPattern = (decimals: number) => new RegExp(`^-\\d+(\\.\\d{1,${decimals}})?$`);
    const priceMessage = (value: string, decimals: number, decimalsKey: string, nonNegKey: string) =>
      !decimalPattern(decimals).test(value)
        ? minusPattern(decimals).test(value)
          ? t(nonNegKey)
          : t(decimalsKey)
        : undefined;
    if (form.name.trim().length === 0) next.name = t('products.form.nameRequired');
    if (form.sku.trim().length === 0) next.sku = t('products.form.skuRequired');
    if (form.categoryId === '') next.categoryId = t('products.form.categoryRequired');
    if (form.unitId === '') next.unitId = t('products.form.unitRequired');

    const purchaseMessage = priceMessage(
      form.purchasePrice.trim(),
      4,
      'products.form.purchasePriceDecimals',
      'products.form.purchasePriceNonNegative',
    );
    if (purchaseMessage !== undefined) next.purchasePrice = purchaseMessage;

    const sellingMessage = priceMessage(
      form.sellingPrice.trim(),
      4,
      'products.form.sellingPriceDecimals',
      'products.form.sellingPriceNonNegative',
    );
    if (sellingMessage !== undefined) next.sellingPrice = sellingMessage;

    const reorder = form.lowStockThreshold.trim();
    if (reorder.length > 0) {
      const label = t('products.fields.reorderLevel');
      if (!decimalPattern(3).test(reorder)) {
        next.lowStockThreshold = minusPattern(3).test(reorder)
          ? t('products.form.reorderLevelNonNegative', { label })
          : t('products.form.reorderLevelDecimals', { label });
      }
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
      <section className="product-new-page" aria-label={t('products.form.newTitle')}>
        <PageHeader title={t('products.form.newTitle')} />
        <Card title={t('products.form.newTitle')}>
          <ErrorState message={t('products.form.forbiddenCreate')} />
          <Button variant="default" onClick={() => navigate('/products')}>
            {t('products.form.backToList')}
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="product-new-page" aria-label={t('products.form.newTitle')}>
      <PageHeader
        title={t('products.form.newTitle')}
        description={t('products.form.newDescription')}
        primaryAction={
          <Button variant="default" onClick={() => navigate('/products')}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card title={t('products.form.newTitle')}>
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              {t('ui.errorState.referenceLabel')}
              <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="product-new-page__form" noValidate={true}>
          <fieldset className="contact-form__section">
            <legend>{t('products.form.details')}</legend>
            <Input
              id="name"
              label={t('products.fields.name')}
              value={form.name}
              error={errors.name}
              onChange={(event) => update({ name: event.target.value })}
              required
            />
            {duplicateName && (
              <p className="form-help-text" role="status">
                {t('products.form.duplicateNameNotice', { name: duplicateName.name, sku: duplicateName.sku })}
                <Link to={`/products/${duplicateName.id}`}>{t('products.form.duplicateNameLink')}</Link>
                {t('products.form.duplicateNameSuffix')}
              </p>
            )}
            <Input
              id="sku"
              label={t('products.fields.sku')}
              value={form.sku}
              error={errors.sku}
              onChange={(event) => update({ sku: event.target.value })}
              required
            />
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>{t('products.form.classification')}</legend>
            <Select
              id="categoryId"
              label={t('products.fields.category')}
              value={form.categoryId}
              error={errors.categoryId}
              options={(categories.data ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              onChange={(event) => update({ categoryId: event.target.value })}
              placeholder={t('products.form.categoryPlaceholder')}
            />
            <div className="product-new-page__inline-create">
              <Input
                id="new-category"
                label={t('products.form.orAddCategory')}
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
                {t('products.form.addCategory')}
              </Button>
            </div>
            <Select
              id="unitId"
              label={t('products.fields.unit')}
              value={form.unitId}
              error={errors.unitId}
              options={(units.data ?? []).map((unit) => ({
                value: unit.id,
                label: `${unit.name} (${unit.abbreviation})`,
              }))}
              onChange={(event) => update({ unitId: event.target.value })}
              placeholder={t('products.form.unitPlaceholder')}
            />
            <div className="product-new-page__inline-create">
              <Input
                id="new-unit-name"
                label={t('products.form.orAddUnit')}
                value={newUnit.name}
                onChange={(event) => setNewUnit({ ...newUnit, name: event.target.value })}
              />
              <Input
                id="new-unit-abbreviation"
                label={t('products.form.abbreviation')}
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
                {t('products.form.addUnit')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>{t('products.form.prices')}</legend>
            <div className="contact-form__row">
              <Input
                id="purchasePrice"
                label={t('products.fields.purchasePrice')}
                value={form.purchasePrice}
                error={errors.purchasePrice}
                onChange={(event) => update({ purchasePrice: event.target.value })}
              />
              <Input
                id="sellingPrice"
                label={t('products.fields.sellingPrice')}
                value={form.sellingPrice}
                error={errors.sellingPrice}
                onChange={(event) => update({ sellingPrice: event.target.value })}
              />
            </div>
            <Input
              id="lowStockThreshold"
              label={t('products.fields.reorderLevel')}
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
              {createProduct.isPending ? t('products.form.creating') : t('products.form.create')}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate('/products')}>
              {t('common.actions.cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
