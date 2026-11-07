import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { formatDecimal } from '../../lib/format';
import { useCreateProduct } from './use-products';
import type { Product } from '../../services/catalog-service';

const CATEGORIES = ['Packaging', 'Storage', 'Equipment', 'PPE', 'Services', 'General'] as const;
const STATUSES = ['DRAFT', 'ACTIVE'] as const;
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

export function ProductNewPage() {
  const navigate = useNavigate();
  const createMutation = useCreateProduct();
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
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      unitOfMeasure: form.unitOfMeasure,
      purchasePrice: formatDecimal(form.purchasePrice, 4),
      sellingPrice: formatDecimal(form.sellingPrice, 4),
      lowStockThreshold: form.lowStockThreshold ? form.lowStockThreshold : null,
      status: form.status,
    };

    createMutation.mutate(input as Omit<Product, 'id'>, {
      onSuccess: () => {
        navigate('/products');
      },
      onError: () => {
        setSubmitting(false);
      },
      onSettled: () => {
        setSubmitting(false);
      },
    });
  }

  if (createMutation.isError) {
    return (
      <section className="product-new-page" aria-label="New product">
        <PageHeader title="New Product" />
        <Card title="New Product">
          <ErrorState
            message={
              createMutation.error instanceof Error
                ? createMutation.error.message
                : 'The product could not be created.'
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section className="product-new-page" aria-label="New product">
      <PageHeader
        title="New Product"
        primaryAction={
          <Button variant="default" onClick={() => navigate('/products')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Product" description="Create a new product in the sample catalogue.">
        <form onSubmit={handleSubmit} className="product-new-page__form">
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
              disabled={submitting || createMutation.isPending}
              loading={submitting || createMutation.isPending}
            >
              Create Product
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
