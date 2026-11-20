import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/shell/page-header';
import { Card, ErrorState, Skeleton } from '../../components/ui';
import { getDocumentStatuses } from '../../services/reports-client';

export function DocumentStatusesPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setData(await getDocumentStatuses(today, today)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <section aria-label={t('reports.documentStatuses.sectionAria')}>
      <PageHeader title={t('reports.documentStatuses.title')} />
      <Card title={t('reports.documentStatuses.title')}>
        {loading ? <Skeleton label={t('reports.loading')} /> :
          error ? <ErrorState message={error} onRetry={() => void load()} /> :
          !data ? <p>{t('reports.empty')}</p> :
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>}
      </Card>
    </section>
  );
}