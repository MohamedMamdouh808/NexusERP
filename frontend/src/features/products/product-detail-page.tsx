import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  Toast,
} from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { useProduct, useArchiveProduct, useUpdateProduct } from './use-products';

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isPending, isError, error } = useProduct(productId);
  const archiveMutation = useArchiveProduct();
  const updateMutation = useUpdateProduct();
  const [toasts, setToasts] = useState<{ id: string; message: string; tone?: 'success' | 'failure' }[]>([]);

  const product = data;
  const archived = product?.status === 'ARCHIVED';

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  const handleArchive = () => {
    archiveMutation.mutate(productId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToasts((items) => [...items, { id: `archive-product-${Date.now()}`, message: `${product?.name ?? 'Product'} archived` }]);
      },
      onError: (caught) => {
        setDialogOpen(false);
        setToasts((items) => [...items, { id: `archive-product-error-${Date.now()}`, message: caught instanceof Error ? caught.message : 'The product could not be archived.', tone: 'failure' }]);
      },
    });
  };

  const restore = () => {
    if (!product) return;
    updateMutation.mutate({ ...product, status: 'ACTIVE' }, {
      onSuccess: () => setToasts((items) => [...items, { id: `restore-product-${Date.now()}`, message: `${product.name} restored` }]),
      onError: (caught) => setToasts((items) => [...items, { id: `restore-product-error-${Date.now()}`, message: caught instanceof Error ? caught.message : 'The product could not be restored.', tone: 'failure' as const }]),
    });
  };

  if (isPending) {
    return (
      <section className="product-detail-page" aria-label="Product detail">
        <PageHeader title="Product" />
        <Card title="Product">
          <Skeleton label="Loading product" />
        </Card>
      </section>
    );
  }

  if (isError || product === undefined) {
    return (
      <section className="product-detail-page" aria-label="Product detail">
        <PageHeader title="Product" />
        <Card title="Product">
          <ErrorState
            message={error instanceof Error ? error.message : 'The product could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => {
              // no-op: query will refetch on remount
            }}
          />
        </Card>
      </section>
    );
  }

  return (
    <section className="product-detail-page" aria-label="Product detail">
      <PageHeader
        title={product.name}
        secondaryActions={[
          <div className="product-detail-page__header-actions" key="product-actions">
            <Button variant="primary" onClick={() => navigate(`/products/${product.id}/edit`)}>
              Edit
            </Button>
            {archived ? (
              <Button variant="default" onClick={restore} loading={updateMutation.isPending}>
                Restore
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => setDialogOpen(true)}
                reason="Archived products can be restored later"
              >
                Archive
              </Button>
            )}
            <Button variant="default" onClick={() => navigate('/products')}>
              Back to list
            </Button>
          </div>,
        ]}
      />
      <Card title="Product details">
        <dl className="product-detail-page__details">
          <dt>SKU</dt>
          <dd>{product.sku}</dd>
          <dt>Category</dt>
          <dd>{product.category}</dd>
          <dt>Unit of measure</dt>
          <dd>{product.unitOfMeasure}</dd>
          <dt>Purchase price</dt>
          <dd>{formatMoney(product.purchasePrice)}</dd>
          <dt>Selling price</dt>
          <dd>{formatMoney(product.sellingPrice)}</dd>
          {product.lowStockThreshold !== null && (
            <>
              <dt>Low stock threshold</dt>
              <dd>{product.lowStockThreshold}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd>
            <Badge tone={statusTone(product.status)}>{product.status}</Badge>
          </dd>
        </dl>
      </Card>

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          tone={toast.tone ?? 'success'}
          message={toast.message}
          actionLabel={toast.id.startsWith('archive-product-') ? 'Undo' : undefined}
          onAction={toast.id.startsWith('archive-product-') ? restore : undefined}
          onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))}
        />
      ))}
      <ConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleArchive}
        title="Archive product"
        description={`Are you sure you want to archive “${product.name}”? Archived products are hidden from the catalogue but can be restored later.`}
        actionLabel="Archive"
        destructive
        loading={archiveMutation.isPending}
      />
    </section>
  );
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' | 'destructive' {
  if (status === 'ARCHIVED' || status === 'CANCELLED') return 'destructive';
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'neutral';
  return 'warning';
}
