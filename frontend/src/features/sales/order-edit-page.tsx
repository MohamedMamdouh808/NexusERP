import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Skeleton } from '../../components/ui';
import { OrderForm } from './order-form';
import { useSalesOrder } from './use-sales';

/**
 * Edits a draft sales order. Anything other than a draft redirects to the
 * detail page with an explanation carried in navigation state, because a
 * confirmed order must not be changed silently.
 */
export function OrderEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const orderId = id ?? '';
  const { data: order, isPending, isError, error } = useSalesOrder(orderId);

  // Redirect non-draft orders with the explanation the detail page shows.
  useEffect(() => {
    if (order !== undefined && order.status !== 'DRAFT') {
      navigate(`/sales/${order.id}`, {
        replace: true,
        state: {
          notice:
            'Only draft sales orders can be edited. To change this order, cancel it and create a new one.',
        },
      });
    }
  }, [order, navigate]);

  if (isPending) {
    return (
      <section className="order-edit-page" aria-label="Edit sales order">
        <PageHeader title="Edit Sales Order" />
        <Card title="Edit Sales Order">
          <Skeleton label="Loading sales order" />
        </Card>
      </section>
    );
  }

  if (isError || order === undefined) {
    return (
      <section className="order-edit-page" aria-label="Edit sales order">
        <PageHeader title="Edit Sales Order" />
        <Card title="Edit Sales Order">
          <ErrorState
            message={error instanceof Error ? error.message : 'The sales order could not be loaded.'}
          />
        </Card>
      </section>
    );
  }

  if (order.status !== 'DRAFT') {
    // The redirect effect is already running; render nothing extra meanwhile.
    return null;
  }

  return (
    <section className="order-edit-page" aria-label="Edit sales order">
      <PageHeader
        title="Edit Sales Order"
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/sales/${order.id}`)}>
            Cancel
          </Button>
        }
      />
      <Card
        title="Edit Sales Order"
        description={`Editing draft ${order.number}. Only drafts can be edited; confirm on the detail page.`}
      >
        <OrderForm order={order} submitLabel="Save draft" />
      </Card>
    </section>
  );
}
