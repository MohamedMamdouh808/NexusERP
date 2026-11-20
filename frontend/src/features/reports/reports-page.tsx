import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../components/shell/page-header';
import { useSession } from '../../services/auth-session';
import { isModuleEnabled } from '../../components/shell/module-availability';
import { REPORT_SECTION_MODULES } from './reports-section-modules';
import { Button } from '../../components/ui';
import { KpiCard, type KpiCardData } from './kpi-card';
import { DateRangeSelector, type DateRange } from './date-range-selector';
import { SalesOverviewCard } from './sales-overview-card';
import { SalesByCategoryCard } from './sales-by-category-card';
import { RecentReportsTable } from './recent-reports-table';
import { TopProductsTable } from './top-products-table';
import { getKpiSummary, type KpiEntry } from '../../services/reports-client';
import { listProducts } from '../../services/products-client';

export function ReportsPage() {
  const { t } = useTranslation();
  const session = useSession();
  const visible = (section: string) =>
    isModuleEnabled(session, REPORT_SECTION_MODULES[section] ?? 'products');
  const [range, setRange] = useState<DateRange>(() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    return { start: toIso(start), end: toIso(now), preset: 'this-month' };
  });
  const exportId = 'reports-export-note';

  // The KPI summary is the page's figure source: four cards, one round trip
  // to /reports/kpi-summary (Feature 019, report budget: one query).
  const kpiSummary = useQuery({
    queryKey: ['reports', 'kpi-summary', range.start, range.end],
    queryFn: () => getKpiSummary(range.start, range.end),
  });
  // The one product count the summary doesn't carry, from the products catalog
  // (the same count the dashboard's checklist reads).
  const products = useQuery({
    queryKey: ['reports', 'products', 'total'],
    queryFn: () => listProducts({ page: 1, pageSize: 1 }),
  });
  const productsTotal = products.data?.ok === true ? products.data.data.total : null;

  const findKpi = (key: string): KpiEntry | undefined =>
    (kpiSummary.data?.kpis ?? []).find((entry) => entry.key === key);

  const toCardData = (entry: KpiEntry | undefined): KpiCardData | null => {
    if (entry === undefined) return null;
    return {
      value: entry.value,
      previousValue: entry.previousValue,
      change: entry.change,
      unit: entry.unit,
      asOf: entry.asOf,
    };
  };

  const retry = () => {
    void kpiSummary.refetch();
    void products.refetch();
  };

  return (
    <section className="reports-page" aria-label={t('reports.title')}>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.page.description')}
        primaryAction={(
          <Button
            variant="primary"
            disabled
            title={t('reports.page.exportUnavailable')}
            aria-describedby={exportId}
          >
            {t('reports.page.exportReport')}
          </Button>
        )}
      />
      <div className="reports-toolbar">
        <DateRangeSelector value={range} onChange={setRange} />
      </div>
      <p id={exportId} className="reports-export-note">{t('reports.page.exportUnavailable')}</p>

      <div className="reports-kpis" aria-label={t('reports.title')}>
        {visible('totalSales') && (
          <KpiCard
            title={t('reports.page.kpis.totalSales')}
            data={toCardData(findKpi('salesTotal'))}
            loading={kpiSummary.isPending}
            error={kpiSummary.isError ? kpiSummary.error : null}
            onRetry={retry}
          />
        )}
        {visible('totalOrders') && (
          <KpiCard
            title={t('reports.page.kpis.totalOrders')}
            data={toCardData(findKpi('salesOrderCount'))}
            loading={kpiSummary.isPending}
            error={kpiSummary.isError ? kpiSummary.error : null}
            onRetry={retry}
          />
        )}
        {visible('totalProducts') && (
          <KpiCard
            title={t('reports.page.kpis.totalProducts')}
            data={productsTotal !== null ? { value: String(productsTotal), unit: 'count' } : null}
            loading={products.isPending}
            error={products.isError ? products.error : null}
            onRetry={() => void products.refetch()}
          />
        )}
        {visible('outstandingInvoices') && (
          <KpiCard
            title={t('reports.page.kpis.outstandingInvoices')}
            data={toCardData(findKpi('outstandingInvoiceCount'))}
            loading={kpiSummary.isPending}
            error={kpiSummary.isError ? kpiSummary.error : null}
            onRetry={retry}
          />
        )}
      </div>

      <div className="reports-charts">
        {visible('salesOverview') && <SalesOverviewCard range={range} />}
        {visible('salesByCategory') && <SalesByCategoryCard range={range} />}
      </div>

      <div className="reports-tables">
        <RecentReportsTable range={range} />
        {visible('topProducts') && <TopProductsTable range={range} />}
      </div>
    </section>
  );
}
