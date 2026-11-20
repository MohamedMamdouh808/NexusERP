import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { Card, ErrorState, Skeleton } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { getSalesByCategory } from '../../services/reports-client';
import type { DateRange } from './date-range-selector';
import { ChartFrame } from './chart-frame';

export function SalesByCategoryCard({ range }: { readonly range: DateRange }) {
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  const query = useQuery({
    queryKey: ['reports', 'sales-by-category', range.start, range.end],
    queryFn: () => getSalesByCategory(range.start, range.end),
  });

  const rows = query.data?.rows ?? [];

  if (query.isPending) {
    return (
      <Card title={t('reports.page.salesByCategory')}>
        <Skeleton label={t('reports.loading')} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card title={t('reports.page.salesByCategory')}>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const isEmpty = rows.length === 0;

  return (
    <ChartFrame
      title={t('reports.page.salesByCategory')}
      definition={t('reports.page.salesByCategoryDefinition')}
      summary={t('reports.page.salesByCategorySummary')}
      table={rows.map((row) => ({
        label: row.category,
        value: formatMoneyLocalized(row.revenue, currency, 2),
      }))}
      isEmpty={isEmpty}
      emptyTitle={t('reports.page.salesByCategoryEmptyTitle')}
      emptyDescription={t('reports.page.salesByCategoryEmptyDescription')}
      focusValues={rows.map((row) => ({ label: row.category, value: formatMoneyLocalized(row.revenue, currency, 2) }))}
      focusValuesLabel={t('reports.page.focusValuesLabel')}
    >
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="revenue"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={80}
          >
            {rows.map((_, index) => (
              <Cell key={index} fill={`var(--color-chart-${(index % 4) + 1})`} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
