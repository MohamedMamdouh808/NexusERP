import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, Skeleton } from '../../components/ui';
import { getDocumentsByStatus } from '../../services/reports-client';
import type { DateRange } from './date-range-selector';

export function RecentReportsTable({ range }: { readonly range: DateRange }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['reports', 'recent-reports', range.start, range.end],
    queryFn: () => getDocumentsByStatus(range.start, range.end),
  });

  const data = query.data;
  const endDate = data?.dateRange?.end ?? '';

  const rows = [
    ...Object.entries(data?.salesOrders ?? {}).map(([status, group]) => ({
      name: t('reports.page.recentDocs.salesOrders'),
      type: status,
      generatedOn: endDate,
      status: group.count > 0 ? String(group.count) : '—',
    })),
    ...Object.entries(data?.invoices ?? {}).map(([status, group]) => ({
      name: t('reports.page.recentDocs.invoices'),
      type: status,
      generatedOn: endDate,
      status: group.count > 0 ? String(group.count) : '—',
    })),
    ...Object.entries(data?.purchaseOrders ?? {}).map(([status, group]) => ({
      name: t('reports.page.recentDocs.purchaseOrders'),
      type: status,
      generatedOn: endDate,
      status: group.count > 0 ? String(group.count) : '—',
    })),
  ];

  const columns = [
    t('reports.page.columns.name'),
    t('reports.page.columns.type'),
    t('reports.page.columns.generatedOn'),
    t('reports.page.columns.status'),
    t('reports.page.columns.actions'),
  ];

  if (query.isPending) {
    return (
      <Card title={t('reports.page.recentReports')}>
        <Skeleton label={t('reports.loading')} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card title={t('reports.page.recentReports')}>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  return (
    <Card className="reports-recent" title={t('reports.page.recentReports')}>
      <div className="reports-table-scroll">
        <table className="reports-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} scope="col">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="reports-table-empty" role="status">
                    <svg className="reports-table-empty__glyph" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
                      <path d="M8 32h48M8 32V8a2 2 0 0 1 2-2h18l6 6h24a2 2 0 0 1 2 2v18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="reports-table-empty__title">{t('reports.page.recentReportsEmptyTitle')}</p>
                    <p className="reports-table-empty__description">{t('reports.page.recentReportsEmptyDescription')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.name}-${row.type}-${index}`}>
                  <td>{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.generatedOn}</td>
                  <td>{row.status}</td>
                  <td aria-label={t('reports.page.columns.actions')}>—</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
