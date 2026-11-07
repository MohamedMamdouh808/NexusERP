import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui';
import { formatMoneyGrouped } from '../../lib/format';
import { sumMoney } from '../../lib/quantity';
import { sampleCatalogService } from '../../services/sample-catalog-service';

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

export function WeekReview() {
  const cutoff = new Date(Date.now() - 6 * 86_400_000);
  const start = isoDay(cutoff);
  const end = isoDay(new Date());
  const payments = useQuery({
    queryKey: ['week-review', 'payments', start, end],
    queryFn: () => sampleCatalogService.listPayments({ startDate: start, endDate: end, status: 'RECORDED', page: 1, pageSize: 100, sort: 'number', direction: 'desc' }),
  });
  const shipments = useQuery({
    queryKey: ['week-review', 'shipments', start, end],
    queryFn: () => sampleCatalogService.listShipments({ startDate: start, endDate: end, page: 1, pageSize: 100, sort: 'shipmentDate', direction: 'desc' }),
  });
  const reversed = useQuery({
    queryKey: ['week-review', 'reversed-payments', start, end],
    queryFn: () => sampleCatalogService.listPayments({ startDate: start, endDate: end, status: 'REVERSED', page: 1, pageSize: 100, sort: 'number', direction: 'desc' }),
  });

  const amount = payments.data?.items.length ? sumMoney(...payments.data.items.map((payment) => payment.amount)) : '0.00';

  return (
    <Card title="Week in review" description="Six-day pulse of this organization’s cash and fulfilment" className="week-review">
      <div className="week-review__metrics">
        <div className="week-review__metric">
          <span className="week-review__metric-label">Collected</span>
          <strong className="week-review__metric-value">USD {formatMoneyGrouped(amount)}</strong>
          <Link className="week-review__link" to="/invoicing/payments">{payments.data?.total ?? 0} payment{(payments.data?.total ?? 0) === 1 ? '' : 's'}</Link>
        </div>
        <div className="week-review__metric">
          <span className="week-review__metric-label">Orders shipped</span>
          <strong className="week-review__metric-value">{shipments.data?.total ?? 0}</strong>
          <Link className="week-review__link" to="/sales?tab=shipments">Shipments this period</Link>
        </div>
        <div className="week-review__metric">
          <span className="week-review__metric-label">Reversals</span>
          <strong className="week-review__metric-value">{reversed.data?.total ?? 0}</strong>
          <Link className="week-review__link" to="/invoicing/payments">Payment integrity check</Link>
        </div>
      </div>
      {payments.isPending || shipments.isPending || reversed.isPending ? (<p className="action-center__loading" role="status">Loading this week…</p>) : null}
    </Card>
  );
}
