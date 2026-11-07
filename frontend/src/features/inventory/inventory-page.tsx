import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { StockBalancesTab } from './balances-tab';
import { MovementsTab } from './movements-tab';
import { WarehousesTab } from './warehouses-tab';

const TABS: readonly TabDefinition[] = [
  { key: 'balances', label: 'Stock balances', path: '/inventory' },
  { key: 'movements', label: 'Movements', path: '/inventory/movements' },
  { key: 'warehouses', label: 'Warehouses', path: '/inventory/warehouses' },
];

export function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    // Deep link: derive the initial tab from the pathname the user landed on.
    const tab = TABS.find((t) => location.pathname === t.path || location.pathname.startsWith(t.path + '/'));
    return tab?.key ?? 'balances';
  });

  function selectTab(key: string) {
    setActiveTab(key);
    const tab = TABS.find((t) => t.key === key);
    if (tab !== undefined) {
      navigate(tab.path);
    }
  }

  return (
    <section className="inventory-page" aria-label="Inventory">
      <PageHeader
        title="Inventory"
        description="Stock balances and ledger movements across both sample warehouses."
        primaryAction={
          <Button variant="default" onClick={() => navigate('/products')}>
            Back to products
          </Button>
        }
      />
      <Card className="inventory-card">
        <TabStrip tabs={TABS} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'balances' && <StockBalancesTab />}
        {activeTab === 'movements' && <MovementsTab />}
        {activeTab === 'warehouses' && <WarehousesTab />}
      </Card>
    </section>
  );
}
