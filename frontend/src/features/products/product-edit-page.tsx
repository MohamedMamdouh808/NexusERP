import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PRODUCT_PERMISSIONS } from '@nexuserp/shared';

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

export function ProductEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const session = useSession();
  const { t } = useTranslation();
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
    const decimalPattern = (decimals: number) => new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
    const minusPattern = (decimals: number) => new RegExp(`^-\\d+(\\.\\d{1,${decimals}})?$`);
    if (form.name.trim().length === 0) next.name = t('products.form.nameRequired');
    if (form.sku.trim().length === 0) next.sku = t('products.form.skuRequired');
    if (form.categoryId === '') next.categoryId = t('products.form.categoryRequired');
    if (form.unitId === '') next.unitId = t('products.form.unitRequired');

    const purchase = form.purchasePrice.trim();
    if (!decimalPattern(4).test(purchase)) {
      next.purchasePrice = minusPattern(4).test(purchase)
        ? t('products.form.purchasePriceNonNegative')
        : t('products.form.purchasePriceDecimals');
    }
    const selling = form.sellingPrice.trim();
    if (!decimalPattern(4).test(selling)) {
      next.sellingPrice = minusPattern(4).test(selling)
        ? t('products.form.sellingPriceNonNegative')
        : t('products.form.sellingPriceDecimals');
    }
    const reorder = form.lowStockThreshold.trim();
    if (reorder.length > 0 && !decimalPattern(3).test(reorder)) {
      const label = t('products.fields.reorderLevel');
      next.lowStockThreshold = minusPattern(3).test(reorder)
        ? t('products.form.reorderLevelNonNegative', { label })
        : t('products.form.reorderLevelDecimals', { label });
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
      <section className="product-edit-page" aria-label={t('products.form.editTitle')}>
        <PageHeader title={t('products.form.editTitle')} />
        <Card title={t('products.form.editTitle')}>
          <span>{t('products.form.loadingEdit')}</span>
        </Card>
      </section>
    );
  }

  if (isError || data === undefined) {
    return (
      <section className="product-edit-page" aria-label={t('products.form.editTitle')}>
        <PageHeader title={t('products.form.editTitle')} />
        <Card title={t('products.form.editTitle')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('products.form.loadError')}
          />
        </Card>
      </section>
    );
  }

  if (!canWrite) {
    return (
      <section className="product-edit-page" aria-label={t('products.form.editTitle')}>
        <PageHeader title={t('products.form.editTitle')} />
        <Card title={t('products.form.editTitle')}>
          <ErrorState message={t('products.form.forbiddenEdit')} />
          <Button variant="default" onClick={() => navigate(`/products/${productId}`)}>
            {t('common.actions.back')}
          </Button>
        </Card>
      </section>
    );
  }

  if (!form) return null;

  return (
    <section className="product-edit-page" aria-label={t('products.form.editTitle')}>
      <PageHeader
        title={t('products.form.editTitle')}
        description={t('products.form.editDescription', { name: data.name })}
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/products/${productId}`)}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card title={t('products.form.editTitle')}>
        {stale && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{t('products.form.staleBanner')}</p>
            <Button
              variant="default"
              type="button"
              onClick={() => {
                setStale(false);
                setForm(null);
                void refetch();
              }}
            >
              {t('products.form.reloadProduct')}
            </Button>
          </div>
        )}
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              {t('ui.errorState.referenceLabel')}
              <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="product-edit-page__form" noValidate={true}>
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
              disabled={updateProduct.isPending}
              loading={updateProduct.isPending}
            >
              {updateProduct.isPending ? t('products.form.saving') : t('products.form.save')}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate(`/products/${productId}`)}>
              {t('common.actions.cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
