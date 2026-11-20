import { useTranslation } from 'react-i18next';

import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { SALES_PERMISSIONS } from '@nexuserp/shared';
import { OrdersTab } from './orders-tab';
import { ShipmentsTab } from './shipments-tab';

export function SalesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const session = useSession();
  const canWrite = hasPermission(session, SALES_PERMISSIONS.write);
  const tabs: readonly TabDefinition[] = [
    { key: 'orders', label: t('sales.page.tabs.orders'), path: '/sales' },
    { key: 'shipments', label: t('sales.page.tabs.shipments'), path: '/sales/shipments' },
  ];
  // The URL is the single source of truth for the active tab. Deriving it on
  // every render keeps deep links such as /sales/shipments from matching the
  // shorter /sales path and falling back to the orders tab.
  const activeTab = tabs.find((tab) => location.pathname === tab.path)?.key ?? 'orders';

  function selectTab(key: string) {
    const tab = tabs.find((item) => item.key === key);
    if (tab !== undefined) {
      navigate(tab.path);
    }
  }

  return (
    <section className="sales-page" aria-label={t('sales.page.sectionAria')}>
      <PageHeader
        title={t('sales.page.title')}
        description={t('sales.page.description')}
        primaryAction={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/sales/new')}>
              {t('sales.create.title')}
            </Button>
          ) : undefined
        }
      />
      <Card className="sales-card">
        <TabStrip tabs={tabs} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'shipments' && <ShipmentsTab />}
      </Card>
    </section>
  );
}
