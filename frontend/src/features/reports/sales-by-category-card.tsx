import { useTranslation } from 'react-i18next';

import { Card } from '../../components/ui';
import { ChartEmptyState } from './chart-empty-state';

/**
 * The sales-by-category donut card. Adds a dashed ring placeholder with an
 * explicit empty state — no categories, no percentages, no legend entries.
 */
export function SalesByCategoryCard() {
  const { t } = useTranslation();
  return (
    <Card className="reports-category" title={t('reports.page.salesByCategory')}>
      <div className="reports-category__donut" role="img" aria-label={`${t('reports.page.salesByCategory')} — ${t('reports.page.noData')}`}>
        <svg className="reports-category__ring" viewBox="0 0 120 120" role="presentation" focusable="false">
          <circle cx="60" cy="60" r="46" fill="none" stroke="var(--color-muted)" strokeWidth="22" strokeDasharray="5.5 6.5" />
          <text x="60" y="56" textAnchor="middle" className="reports-category__ring-title">{t('reports.page.noData')}</text>
        </svg>
      </div>
      <ChartEmptyState
        className="reports-category__empty"
        title={t('reports.page.salesByCategoryEmptyTitle')}
        description={t('reports.page.salesByCategoryEmptyDescription')}
      />
    </Card>
  );
}