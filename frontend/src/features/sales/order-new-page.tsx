import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card } from '../../components/ui';
import { OrderForm } from './order-form';

export function OrderNewPage() {
  const navigate = useNavigate();

  return (
    <section className="order-new-page" aria-label="New sales order">
      <PageHeader
        title="New Sales Order"
        primaryAction={
          <Button variant="default" onClick={() => navigate('/sales')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Sales Order" description="Orders are saved as drafts; confirm one on its detail page to reserve stock.">
        <OrderForm submitLabel="Save draft" />
      </Card>
    </section>
  );
}
