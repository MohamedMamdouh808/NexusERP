import { useTranslation } from 'react-i18next';

import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { OrdersTab } from './orders-tab';
import { ReceiptsTab } from './receipts-tab';

export function PurchasingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const tabs: readonly TabDefinition[] = [
    { key: 'orders', label: t('purchasing.page.tabs.orders'), path: '/purchasing' },
    { key: 'receipts', label: t('purchasing.page.tabs.receipts'), path: '/purchasing/receipts' },
  ];
  // The URL is the single source of truth for the active tab. Deriving it on
  // every render keeps deep links such as /purchasing/receipts from matching the
  // shorter /purchasing path and falling back to the orders tab.
  const activeTab = tabs.find((tab) => location.pathname === tab.path)?.key ?? 'orders';

  function selectTab(key: string) {
    const tab = tabs.find((item) => item.key === key);
    if (tab !== undefined) {
      navigate(tab.path);
    }
  }

  return (
    <section className="purchasing-page" aria-label={t('purchasing.page.sectionAria')}>
      <PageHeader
        title={t('purchasing.page.title')}
        description={t('purchasing.page.description')}
        primaryAction={
          <Button variant="primary" onClick={() => navigate('/purchasing/new')}>
            {t('purchasing.create.title')}
          </Button>
        }
      />
      <Card className="purchasing-card">
        <TabStrip tabs={tabs} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
      </Card>
    </section>
  );
}
