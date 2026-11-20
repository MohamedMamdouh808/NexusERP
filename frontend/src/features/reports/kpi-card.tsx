import { useTranslation } from 'react-i18next';

import { Card, ErrorState, Skeleton } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';

/** What one reports KPI card shows: the server's own figure and change. */
export interface KpiCardData {
  /** The figure, as a decimal string the member reads. */
  readonly value: string;
  /** The same figure for the previous period; absent when there is none. */
  readonly previousValue?: string;
  /** The server's own change against the previous period; null when there is none. */
  readonly change?: string | null;
  readonly unit: 'money' | 'count';
  /** Set on the figures that are not bound to the range. */
  readonly asOf?: 'today';
}

export interface KpiCardProps {
  readonly title: string;
  readonly description?: string;
  /** The server's figure, or null when none exists yet. */
  readonly data: KpiCardData | null;
  readonly loading: boolean;
  readonly error?: Error | null;
  readonly onRetry?: () => void;
}

/**
 * One reports KPI card. The figure is the server's own, shown as-is; the
 * change is the server's own and stated in words, never a fabricated
 * percentage. When there is no figure the card keeps its honest empty
 * state, so nothing is invented while the data is still landing.
 */
export function KpiCard({ title, description, data, loading, error, onRetry }: KpiCardProps) {
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  if (loading) {
    return (
      <Card className="reports-kpi" title={title} description={description}>
        <Skeleton label={t('reports.loading')} />
      </Card>
    );
  }
  if (error !== null && error !== undefined) {
    return (
      <Card className="reports-kpi" title={title} description={description}>
        <ErrorState
          message={error.message}
          onRetry={onRetry ?? (() => {})}
        />
      </Card>
    );
  }
  if (data === null) {
    return (
      <Card className="reports-kpi" title={title} description={description}>
        <p className="reports-kpi__empty" role="status" aria-label={`${title} — ${t('reports.page.noData')}`}>
          <svg className="reports-kpi__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 19V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14M10 19V10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9M16 19H4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="reports-kpi__label">{t('reports.page.noData')}</span>
          <span className="reports-kpi__hint">{t('reports.page.reportsNote')}</span>
        </p>
      </Card>
    );
  }

  const formatted = data.unit === 'money' ? formatMoneyLocalized(data.value, currency, 2) : data.value;
  const code = formatted.match(/[A-Z]{3}/u)?.[0] ?? '';
  const text = code === '' ? formatted : formatted.replace(code, '').trim();
  const hasChange = data.change !== null && data.change !== undefined;

  return (
    <Card className="reports-kpi" title={title} description={description}>
      <p className="reports-kpi__value" role="status">
        {text}
        {code !== '' && <span className="reports-kpi__currency"> {code}</span>}
      </p>
      {hasChange && (
        <p className="reports-kpi__change">
          {t('reports.page.kpis.change', { change: String(data.change) })}
        </p>
      )}
      {data.asOf && (
        <p className="reports-kpi__change">
          {t('reports.page.kpis.asOf')}
        </p>
      )}
    </Card>
  );
}
