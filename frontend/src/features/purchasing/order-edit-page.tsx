import { useTranslation } from 'react-i18next';

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Skeleton } from '../../components/ui';
import { OrderForm } from './order-form';
import { usePurchaseOrder } from './use-purchasing';

/**
 * Edits a draft purchase order. Anything other than a draft redirects to the
 * detail page with an explanation carried in navigation state, because a
 * confirmed order must not be changed silently.
 */
export function OrderEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const orderId = id ?? '';
  const { t } = useTranslation();
  const { data: order, isPending, isError, error } = usePurchaseOrder(orderId);

  // Redirect non-draft orders with the explanation the detail page shows.
  useEffect(() => {
    if (order !== undefined && order.status !== 'DRAFT') {
      navigate(`/purchasing/${order.id}`, {
        replace: true,
        state: {
          notice: t('purchasing.edit.notDraft'),
        },
      });
    }
  }, [order, navigate, t]);

  if (isPending) {
    return (
      <section className="order-edit-page" aria-label={t('purchasing.edit.sectionAria')}>
        <PageHeader title={t('purchasing.edit.title')} />
        <Card title={t('purchasing.edit.title')}>
          <Skeleton label={t('purchasing.edit.loading')} />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-edit-page" aria-label={t('purchasing.edit.sectionAria')}>
        <PageHeader title={t('purchasing.edit.title')} />
        <Card title={t('purchasing.edit.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('purchasing.edit.loadError')}
          />
        </Card>
      </section>
    );
  }

  if (order.status !== 'DRAFT') {
    // The redirect effect is already running; render nothing extra meanwhile.
    return null;
  }

  return (
    <section className="order-edit-page" aria-label={t('purchasing.edit.sectionAria')}>
      <PageHeader
        title={t('purchasing.edit.title')}
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/purchasing/${order.id}`)}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card
        title={t('purchasing.edit.title')}
        description={t('purchasing.edit.description', { number: order.number })}
      >
        <OrderForm order={order} submitLabel={t('purchasing.form.saveDraft')} />
      </Card>
    </section>
  );
}
