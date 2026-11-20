import { useTranslation } from 'react-i18next';

import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { StockBalancesTab } from './balances-tab';
import { MovementsTab } from './movements-tab';
import { WarehousesTab } from './warehouses-tab';

export function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const tabs: readonly TabDefinition[] = [
    { key: 'balances', label: t('inventory.tabs.balances'), path: '/inventory' },
    { key: 'movements', label: t('inventory.tabs.movements'), path: '/inventory/movements' },
    { key: 'warehouses', label: t('inventory.tabs.warehouses'), path: '/inventory/warehouses' },
  ];
  // The URL is the single source of truth for the active tab. Deriving it on
  // every render (rather than seeding state once) keeps deep links and the
  // route change from a tab click in sync: /inventory/movements and
  // /inventory/warehouses must not fall back to the /inventory tab.
  const activeTab = tabs.find((tab) => location.pathname === tab.path)?.key ?? 'balances';

  function selectTab(key: string) {
    const tab = tabs.find((item) => item.key === key);
    if (tab !== undefined) {
      navigate(tab.path);
    }
  }

  return (
    <section className="inventory-page" aria-label={t('inventory.page.sectionAria')}>
      <PageHeader
        title={t('inventory.page.title')}
        description={t('inventory.page.description')}
        primaryAction={
          <Button variant="default" onClick={() => navigate('/products')}>
            {t('inventory.page.backToProducts')}
          </Button>
        }
      />
      <Card className="inventory-card">
        <TabStrip tabs={tabs} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'balances' && <StockBalancesTab />}
        {activeTab === 'movements' && <MovementsTab />}
        {activeTab === 'warehouses' && <WarehousesTab />}
      </Card>
    </section>
  );
}
