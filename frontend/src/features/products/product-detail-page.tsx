import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PRODUCT_PERMISSIONS } from '@nexuserp/shared';

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
import { hasPermission, useSession } from '../../services/auth-session';
import { useArchiveProduct, useProduct, useRestoreProduct } from './use-products';

/**
 * One product.
 *
 * The prices are shown exactly as they were recorded, with the organization's
 * currency beside them - no conversion, and no arithmetic in the browser.
 *
 * There is no stock figure here: the inventory feature owns the balances, and
 * this feature stores no stock at all. Saying so is better than showing a
 * number that means nothing yet.
 */
export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const session = useSession();
  const canWrite = hasPermission(session, PRODUCT_PERMISSIONS.write);
  const currencyCode = session.status === 'signed-in' ? session.organization.currencyCode : null;

  const { data, isPending, isError, error } = useProduct(productId);
  const archiveProduct = useArchiveProduct();
  const restoreProduct = useRestoreProduct();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

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

  if (isError || data === undefined) {
    return (
      <section className="product-detail-page" aria-label="Product detail">
        <PageHeader title="Product" />
        <Card title="Product">
          <ErrorState
            message={error instanceof Error ? error.message : 'The product could not be loaded.'}
          />
        </Card>
      </section>
    );
  }

  const archived = data.isArchived;

  function handleArchive() {
    setDialogError('');
    archiveProduct.mutate(productId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToast(`${data!.name} archived`);
      },
      onError: (caught) => {
        setDialogError(
          caught instanceof Error ? caught.message : 'The product could not be archived.',
        );
      },
    });
  }

  function handleRestore() {
    setDialogError('');
    restoreProduct.mutate(productId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToast(`${data!.name} restored`);
      },
      onError: (caught) => {
        setDialogError(
          caught instanceof Error ? caught.message : 'The product could not be restored.',
        );
      },
    });
  }

  return (
    <section className="product-detail-page" aria-label="Product detail">
      <PageHeader
        title={data.name}
        secondaryActions={[
          <div className="product-detail-page__header-actions" key="product-actions">
            {canWrite ? (
              <>
                <Button variant="primary" onClick={() => navigate(`/products/${data.id}/edit`)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDialogOpen(true)}
                  disabled={archiveProduct.isPending || restoreProduct.isPending}
                >
                  {archived ? 'Restore' : 'Archive'}
                </Button>
              </>
            ) : null}
            <Button variant="default" onClick={() => navigate('/products')}>
              Back to list
            </Button>
          </div>,
        ]}
      />
      <Card title="Product details">
        <dl className="contact-detail-page__details">
          <dt>SKU</dt>
          <dd>{data.sku}</dd>
          <dt>Status</dt>
          <dd>
            <Badge tone={archived ? 'destructive' : 'success'}>
              {archived ? 'Archived' : 'Active'}
            </Badge>
          </dd>
          <dt>Purchase price</dt>
          <dd>{currencyCode === null ? data.purchasePrice : `${data.purchasePrice} ${currencyCode}`}</dd>
          <dt>Selling price</dt>
          <dd>{currencyCode === null ? data.sellingPrice : `${data.sellingPrice} ${currencyCode}`}</dd>
          <dt>Reorder level</dt>
          <dd>{data.lowStockThreshold ?? '—'}</dd>
          <dt>Version</dt>
          <dd>{data.version}</dd>
          <dt>Stock</dt>
          <dd className="form-help-text">Stock arrives with the Inventory feature.</dd>
        </dl>
      </Card>

      {toast !== null && (
        <Toast
          id={`product-toast-${productId}`}
          tone="success"
          message={toast}
          onDismiss={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        open={dialogOpen}
        onClose={() => {
          if (!archiveProduct.isPending && !restoreProduct.isPending) {
            setDialogOpen(false);
            setDialogError('');
          }
        }}
        onConfirm={archived ? handleRestore : handleArchive}
        title={archived ? 'Restore product' : 'Archive product'}
        description={
          archived
            ? `Are you sure you want to restore “${data.name}”? It becomes selectable again.`
            : `Are you sure you want to archive “${data.name}”? It leaves the catalogue but can be restored, and its SKU stays reserved.`
        }
        actionLabel={archived ? 'Restore' : 'Archive'}
        destructive={!archived}
        loading={archiveProduct.isPending || restoreProduct.isPending}
        error={dialogError}
      />
    </section>
  );
}
