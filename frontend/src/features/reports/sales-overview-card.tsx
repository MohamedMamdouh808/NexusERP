import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '../../components/ui';
import { ChartEmptyState } from './chart-empty-state';

type Segment = 'sales' | 'orders' | 'invoices';

const SEGMENTS: readonly Segment[] = ['sales', 'orders', 'invoices'];

/**
 * The sales overview container. The chart itself stays empty until a
 * data source exists — the tabs and legend are live so the layout is
 * permanent and the swap is only ever a matter of feeding it points.
 */
export function SalesOverviewCard() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>('sales');

  return (
    <Card
      className="reports-overview"
      title={t('reports.page.salesOverview')}
      actions={
        <div className="reports-segmented" role="tablist" aria-label={t('reports.page.salesOverview')}>
          {SEGMENTS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={segment === value}
              className={['reports-segmented__button', segment === value && 'is-active'].filter(Boolean).join(' ')}
              onClick={() => setSegment(value)}
            >
              {t(`reports.page.segments.${value}`)}
            </button>
          ))}
        </div>
      }
    >
      <div className="reports-overview__legend" aria-hidden="true">
        <span className="reports-legend-chip reports-legend-chip--current" /><span>{t('reports.page.currentPeriod')}</span>
        <span className="reports-legend-chip reports-legend-chip--previous" /><span>{t('reports.page.previousPeriod')}</span>
      </div>
      <div className="reports-overview__canvas" role="region" aria-label={t('reports.page.salesOverview')}>
        <ChartEmptyState
          title={t('reports.page.salesOverviewEmptyTitle')}
          description={t('reports.page.salesOverviewEmptyDescription')}
        />
      </div>
    </Card>
  );
}