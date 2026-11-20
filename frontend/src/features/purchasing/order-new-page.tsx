import { useTranslation } from 'react-i18next';

import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card } from '../../components/ui';
import { OrderForm } from './order-form';

export function OrderNewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="order-new-page" aria-label={t('purchasing.create.sectionAria')}>
      <PageHeader
        title={t('purchasing.create.title')}
        primaryAction={
          <Button variant="default" onClick={() => navigate('/purchasing')}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card title={t('purchasing.create.title')} description={t('purchasing.create.description')}>
        <OrderForm submitLabel={t('purchasing.form.saveDraft')} />
      </Card>
    </section>
  );
}
