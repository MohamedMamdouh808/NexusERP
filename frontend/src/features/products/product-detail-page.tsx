import { useTranslation } from 'react-i18next';
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
import { listStockBalances } from '../../services/inventory-client';
import { formatMoneyLocalized } from '../../lib/i18n-format';
import { useQuery } from '@tanstack/react-query';

/**
 * One product.
 *
 * The prices are shown exactly as they were recorded, with the organization's
 * currency beside them - no conversion, and no arithmetic in the browser.
 *
 * There is no stock figure here: the inventory feature owns the balances, and
 * this feature stores no stock at all. Saying so is better than showing a
 * number that means nothing yet. The one exception is an ARCHIVED product that
 * still holds stock: its page offers the "Adjust stock" entry point that
 * deep-links into the Inventory balances with the product preselected, because
 * writing that stock off is the reason an archived product would still be
 * touched at all.
 */
export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = id ?? '';
  const session = useSession();
  const { t } = useTranslation();
  const canWrite = hasPermission(session, PRODUCT_PERMISSIONS.write);
  const currencyCode = session.status === 'signed-in' ? session.organization.currencyCode : null;

  const { data, isPending, isError, error } = useProduct(productId);
  const archiveProduct = useArchiveProduct();
  const restoreProduct = useRestoreProduct();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // An archived product can still hold stock. This page offers the write-off
  // entry point: when the archived-with-stock selection still names this
  // product, an "Adjust stock" button deep-links into the Inventory balances
  // with the product preselected, where the write-off is posted with a reason.
  const archivedStock = useQuery({
    queryKey: ['inventory', 'archivedWithStock', productId],
    queryFn: async () => {
      const result = await listStockBalances({
        status: 'archivedWithStock',
        search: data?.sku,
        page: 1,
        pageSize: 1,
      });
      if (!result.ok) {
        const failure = result.failure;
        const enriched = new Error(failure.message) as Error & { requestId?: string };
        enriched.requestId = failure.requestId;
        throw enriched;
      }
      return result.data;
    },
    // Only an archived product needs the entry point, and only once its sku
    // is known for the search.
    enabled: data?.isArchived === true && data.sku !== '',
  });
  const holdsStock = (archivedStock.data?.total ?? 0) > 0;

  if (isPending) {
    return (
      <section className="product-detail-page" aria-label={t('products.detail.title')}>
        <PageHeader title={t('shell.sidebar.entries.Products')} />
        <Card title={t('shell.sidebar.entries.Products')}>
          <Skeleton label={t('products.detail.loading')} />
        </Card>
      </section>
    );
  }

  if (isError || data === undefined) {
    return (
      <section className="product-detail-page" aria-label={t('products.detail.title')}>
        <PageHeader title={t('shell.sidebar.entries.Products')} />
        <Card title={t('shell.sidebar.entries.Products')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('products.detail.loadError')}
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
        setToast(t('products.detail.archiveToast', { name: data!.name }));
      },
      onError: (caught) => {
        setDialogError(
          caught instanceof Error ? caught.message : t('products.detail.archiveError'),
        );
      },
    });
  }

  function handleRestore() {
    setDialogError('');
    restoreProduct.mutate(productId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToast(t('products.detail.restoreToast', { name: data!.name }));
      },
      onError: (caught) => {
        setDialogError(
          caught instanceof Error ? caught.message : t('products.detail.restoreError'),
        );
      },
    });
  }

  return (
    <section className="product-detail-page" aria-label={t('products.detail.title')}>
      <PageHeader
        title={data.name}
        secondaryActions={[
          <div className="product-detail-page__header-actions" key="product-actions">
            {canWrite ? (
              <>
                <Button variant="primary" onClick={() => navigate(`/products/${data.id}/edit`)}>
                  {t('products.detail.edit')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDialogOpen(true)}
                  disabled={archiveProduct.isPending || restoreProduct.isPending}
                >
                  {archived ? t('products.detail.restore') : t('products.detail.archive')}
                </Button>
              </>
            ) : null}
            {archived && holdsStock ? (
              <Button
                variant="default"
                onClick={() => navigate(`/inventory?adjust=${data.id}`)}
              >
                {t('products.detail.adjustStock')}
              </Button>
            ) : null}
            <Button variant="default" onClick={() => navigate('/products')}>
              {t('products.detail.backToList')}
            </Button>
          </div>,
        ]}
      />
      <Card title={t('products.detail.title')}>
        <dl className="contact-detail-page__details">
          <dt>{t('products.detail.sku')}</dt>
          <dd>{data.sku}</dd>
          <dt>{t('products.detail.status')}</dt>
          <dd>
            <Badge tone={archived ? 'destructive' : 'success'}>
              {archived ? t('common.status.archived') : t('common.status.active')}
            </Badge>
          </dd>
          <dt>{t('products.detail.purchasePrice')}</dt>
          <dd>{currencyCode === null ? data.purchasePrice : formatMoneyLocalized(data.purchasePrice, currencyCode, 4)}</dd>
          <dt>{t('products.detail.sellingPrice')}</dt>
          <dd>{currencyCode === null ? data.sellingPrice : formatMoneyLocalized(data.sellingPrice, currencyCode, 4)}</dd>
          <dt>{t('products.detail.reorderLevel')}</dt>
          <dd>{data.lowStockThreshold ?? '—'}</dd>
          <dt>{t('products.detail.version')}</dt>
          <dd>{data.version}</dd>
          <dt>{t('products.detail.stockLabel')}</dt>
          <dd className="form-help-text">{t('products.detail.stockNote')}</dd>
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
        title={archived ? t('products.detail.restoreTitle') : t('products.detail.archiveTitle')}
        description={
          archived
            ? t('products.detail.restoreDescription', { name: data.name })
            : t('products.detail.archiveDescription', { name: data.name })
        }
        actionLabel={archived ? t('products.detail.restoreLabel') : t('products.detail.archiveLabel')}
        destructive={!archived}
        loading={archiveProduct.isPending || restoreProduct.isPending}
        error={dialogError}
      />
    </section>
  );
}