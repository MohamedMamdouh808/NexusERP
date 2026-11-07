import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { formatDecimal } from '../../lib/format';
import { useProduct, useUpdateProduct } from './use-products';
import type { Product } from '../../services/catalog-service';

const CATEGORIES = ['Packaging', 'Storage', 'Equipment', 'PPE', 'Services', 'General'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const UNITS = ['each', 'roll', 'pair', 'week', 'visit'] as const;

interface FormErrors {
  sku?: string;
  name?: string;
  category?: string;
  unitOfMeasure?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  lowStockThreshold?: string;
}

export function ProductEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const { data, isPending, isError, error } = useProduct(productId);
  const updateMutation = useUpdateProduct();
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    unitOfMeasure: '',
    purchasePrice: '',
    sellingPrice: '',
    lowStockThreshold: '',
    status: 'DRAFT',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const product = data;

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

  if (isError || product === undefined) {
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

  // Initialise form from the loaded product.
  setForm((prev) => {
    if (prev.sku === '' && product) {
      return {
        sku: product.sku,
        name: product.name,
        category: product.category,
        unitOfMeasure: product.unitOfMeasure,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        lowStockThreshold: product.lowStockThreshold ?? '',
        status: product.status,
      };
    }
    return prev;
  });

  function validate(): boolean {
    const next: FormErrors = {};
    let valid = true;

    if (!form.sku.trim()) {
      next.sku = 'SKU is required.';
      valid = false;
    }

    if (!form.name.trim()) {
      next.name = 'Name is required.';
      valid = false;
    }

    if (!form.category) {
      next.category = 'Category is required.';
      valid = false;
    }

    if (!form.unitOfMeasure) {
      next.unitOfMeasure = 'Unit of measure is required.';
      valid = false;
    }

    if (!form.purchasePrice) {
      next.purchasePrice = 'Purchase price is required.';
      valid = false;
    } else if (!/^\d+(\.\d{1,4})?$/.test(form.purchasePrice)) {
      next.purchasePrice = 'Enter a valid price (up to 4 decimal places).';
      valid = false;
    }

    if (!form.sellingPrice) {
      next.sellingPrice = 'Selling price is required.';
      valid = false;
    } else if (!/^\d+(\.\d{1,4})?$/.test(form.sellingPrice)) {
      next.sellingPrice = 'Enter a valid price (up to 4 decimal places).';
      valid = false;
    }

    if (form.lowStockThreshold && !/^\d+$/.test(form.lowStockThreshold)) {
      next.lowStockThreshold = 'Enter a whole number.';
      valid = false;
    }

    setErrors(next);
    return valid;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    if (!validate()) {
      setSubmitting(false);
      return;
    }

    const input = {
      id: productId,
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      unitOfMeasure: form.unitOfMeasure,
      purchasePrice: formatDecimal(form.purchasePrice, 4),
      sellingPrice: formatDecimal(form.sellingPrice, 4),
      lowStockThreshold: form.lowStockThreshold ? form.lowStockThreshold : null,
      status: form.status,
    };

    updateMutation.mutate(input as Product, {
      onSuccess: () => {
        navigate(`/products/${productId}`);
      },
      onError: () => {
        setSubmitting(false);
      },
      onSettled: () => {
        setSubmitting(false);
      },
    });
  }

  return (
    <section className="product-edit-page" aria-label="Edit product">
      <PageHeader
        title="Edit Product"
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/products/${productId}`)}>
            Cancel
          </Button>
        }
      />
      <Card title="Edit Product" description={`Editing “${product.name}”.`}>
        <form onSubmit={handleSubmit} className="product-edit-page__form">
          <Input
            id="sku"
            label="SKU *"
            error={errors.sku}
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
            required
          />
          <Input
            id="name"
            label="Name *"
            error={errors.name}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <Select
            id="category"
            label="Category *"
            options={CATEGORIES.map((value) => ({ value, label: value }))}
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            required
            placeholder="Select a category"
          />
          <Select
            id="unitOfMeasure"
            label="Unit of measure *"
            options={UNITS.map((value) => ({ value, label: value }))}
            value={form.unitOfMeasure}
            onChange={(event) => setForm({ ...form, unitOfMeasure: event.target.value })}
            required
            placeholder="Select a unit"
          />
          <Input
            id="purchasePrice"
            label="Purchase price *"
            type="text"
            error={errors.purchasePrice}
            value={form.purchasePrice}
            onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })}
            required
            helpText="Decimal string, up to 4 fractional digits."
          />
          <Input
            id="sellingPrice"
            label="Selling price *"
            type="text"
            error={errors.sellingPrice}
            value={form.sellingPrice}
            onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })}
            required
            helpText="Decimal string, up to 4 fractional digits."
          />
          <Input
            id="lowStockThreshold"
            label="Low stock threshold"
            type="text"
            error={errors.lowStockThreshold}
            value={form.lowStockThreshold}
            onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })}
            helpText="Optional whole number. Leave blank for no threshold."
          />
          <Select
            id="status"
            label="Status *"
            options={STATUSES.map((value) => ({ value, label: value }))}
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
            required
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-lg)' }}>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || updateMutation.isPending}
              loading={submitting || updateMutation.isPending}
            >
              Save changes
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
