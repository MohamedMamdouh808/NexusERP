import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../components/shell/page-header';
import { useSession } from '../../services/auth-session';
import { isModuleEnabled } from '../../components/shell/module-availability';
import { REPORT_SECTION_MODULES } from './reports-section-modules';
import { Button } from '../../components/ui';
import { KpiCard } from './kpi-card';
import { DateRangeSelector, type DateRange } from './date-range-selector';
import { SalesOverviewCard } from './sales-overview-card';
import { SalesByCategoryCard } from './sales-by-category-card';
import { RecentReportsTable } from './recent-reports-table';
import { TopProductsTable } from './top-products-table';

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
        {visible('totalSales') && <KpiCard title={t('reports.page.kpis.totalSales')} />}
        {visible('totalOrders') && <KpiCard title={t('reports.page.kpis.totalOrders')} />}
        {visible('totalProducts') && <KpiCard title={t('reports.page.kpis.totalProducts')} />}
        {visible('outstandingInvoices') && <KpiCard title={t('reports.page.kpis.outstandingInvoices')} />}
      </div>

      <div className="reports-charts">
        {visible('salesOverview') && <SalesOverviewCard />}
        {visible('salesByCategory') && <SalesByCategoryCard />}
      </div>

      <div className="reports-tables">
        <RecentReportsTable />
        {visible('topProducts') && <TopProductsTable />}
      </div>
    </section>
  );
}