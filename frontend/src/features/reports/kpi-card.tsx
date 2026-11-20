import { useTranslation } from 'react-i18next';

import { Card } from '../../components/ui';

export interface KpiCardProps {
  readonly title: string;
  readonly description?: string;
}

/**
 * A KPI card for reports. Without an organization context there is no
 * trustworthy figure to show, so the card renders a labelled empty state
 * rather than a placeholder number — the shape is ready for a real value,
 * nothing else changes when data becomes available.
 */
export function KpiCard({ title, description }: KpiCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="reports-kpi" title={title} description={description}>
      <div className="reports-kpi__empty" role="status" aria-label={`${title} — ${t('reports.page.noData')}`}>
        <svg className="reports-kpi__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14M10 19V10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9M16 19H4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="reports-kpi__label">{t('reports.page.noData')}</p>
        <p className="reports-kpi__hint">{t('reports.page.reportsNote')}</p>
      </div>
    </Card>
  );
}