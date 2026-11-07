import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { OrdersTab } from './orders-tab';
import { ReceiptsTab } from './receipts-tab';

const TABS: readonly TabDefinition[] = [
  { key: 'orders', label: 'Purchase orders', path: '/purchasing' },
  { key: 'receipts', label: 'Goods receipts', path: '/purchasing/receipts' },
];

export function PurchasingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    // Deep link: derive the initial tab from the pathname the user landed on.
    const tab = TABS.find((t) => location.pathname === t.path || location.pathname.startsWith(t.path + '/'));
    return tab?.key ?? 'orders';
  });

  function selectTab(key: string) {
    setActiveTab(key);
    const tab = TABS.find((t) => t.key === key);
    if (tab !== undefined) {
      navigate(tab.path);
    }
  }

  return (
    <section className="purchasing-page" aria-label="Purchasing">
      <PageHeader
        title="Purchasing"
        description="Purchase orders and goods receipts across both sample warehouses."
        primaryAction={
          <Button variant="primary" onClick={() => navigate('/purchasing/new')}>
            New Purchase Order
          </Button>
        }
      />
      <Card className="purchasing-card">
        <TabStrip tabs={TABS} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
      </Card>
    </section>
  );
}
