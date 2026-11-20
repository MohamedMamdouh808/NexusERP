import { useTranslation } from 'react-i18next';

import { Card } from '../../components/ui';

/**
 * The recent reports table. The columns are real and labelled; the body is
 * a professional empty state rather than synthetic rows, because no report
 * run has ever executed for this organization yet.
 */
export function RecentReportsTable() {
  const { t } = useTranslation();
  const columns = [
    t('reports.page.columns.name'),
    t('reports.page.columns.type'),
    t('reports.page.columns.generatedOn'),
    t('reports.page.columns.status'),
    t('reports.page.columns.actions'),
  ];

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
          </tbody>
        </table>
      </div>
    </Card>
  );
}