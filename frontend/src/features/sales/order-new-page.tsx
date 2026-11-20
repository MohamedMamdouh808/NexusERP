import { useTranslation } from 'react-i18next';

import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card } from '../../components/ui';
import { OrderForm } from './order-form';

export function OrderNewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="order-new-page" aria-label={t('sales.create.sectionAria')}>
      <PageHeader
        title={t('sales.create.title')}
        primaryAction={
          <Button variant="default" onClick={() => navigate('/sales')}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card title={t('sales.create.title')} description={t('sales.create.description')}>
        <OrderForm submitLabel={t('sales.form.saveDraft')} />
      </Card>
    </section>
  );
}
