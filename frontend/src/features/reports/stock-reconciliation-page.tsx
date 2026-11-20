import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/shell/page-header';
import { Card, ErrorState, Skeleton } from '../../components/ui';
import { getStockReconciliation } from '../../services/reports-client';

export function StockReconciliationPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setData(await getStockReconciliation()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <section aria-label={t('reports.reconciliation.sectionAria')}>
      <PageHeader title={t('reports.reconciliation.title')} />
      <Card title={t('reports.reconciliation.title')}>
        {loading ? <Skeleton label={t('reports.loading')} /> :
          error ? <ErrorState message={error} onRetry={() => void load()} /> :
          !data || data.items.length === 0 ? <p>{t('reports.reconciliation.clean', { time: data?.checkedAt })}</p> :
          <><p>{t('reports.total')}: {data.total}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.items, null, 2)}</pre></>}
      </Card>
    </section>
  );
}