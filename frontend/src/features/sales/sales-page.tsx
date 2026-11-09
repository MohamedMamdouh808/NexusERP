import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { SampleDataBanner } from '../../components/ui/sample-data-banner';
import { Button, Card, TabStrip } from '../../components/ui';
import type { TabDefinition } from '../../components/ui';
import { OrdersTab } from './orders-tab';
import { ShipmentsTab } from './shipments-tab';

const TABS: readonly TabDefinition[] = [
  { key: 'orders', label: 'Sales orders', path: '/sales' },
  { key: 'shipments', label: 'Shipments', path: '/sales/shipments' },
];

export function SalesPage() {
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
    <section className="purchasing-page" aria-label="Sales">
      <PageHeader
        title="Sales"
        description="Sales orders and shipments across both sample warehouses."
        primaryAction={
          <Button variant="primary" onClick={() => navigate('/sales/new')}>
            New Sales Order
          </Button>
        }
      />
      <SampleDataBanner moduleKey="sales" />
      <Card title="Sales" className="purchasing-card">
        <TabStrip tabs={TABS} activeKey={activeTab} onSelect={selectTab} />
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'shipments' && <ShipmentsTab />}
      </Card>
    </section>
  );
}
