import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card } from '../../components/ui';
import { OrderForm } from './order-form';

export function OrderNewPage() {
  const navigate = useNavigate();

  return (
    <section className="order-new-page" aria-label="New purchase order">
      <PageHeader
        title="New Purchase Order"
        primaryAction={
          <Button variant="default" onClick={() => navigate('/purchasing')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Purchase Order" description="Orders are saved as drafts; confirm one on its detail page.">
        <OrderForm submitLabel="Save draft" />
      </Card>
    </section>
  );
}
