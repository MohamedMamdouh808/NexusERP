import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Card, Skeleton } from '../../components/ui';
import { listAuditEntries } from '../../services/audit-client';
import { formatDateTime } from '../../lib/i18n-format';

export interface DocumentTrailProps {
  readonly recordType: string;
  readonly recordNumber: string | null;
  readonly emptyMessage?: string;
}

export function DocumentTrail({ recordType, recordNumber, emptyMessage }: DocumentTrailProps) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['document-trail', recordType, recordNumber ?? ''],
    queryFn: async () => {
      const result = await listAuditEntries({ recordType, page: 1, pageSize: 100 });
      if (!result.ok) return [];
      const needle = (recordNumber ?? '').toLowerCase();
      return result.data.entries
        .filter((entry) => !needle || (entry.recordId ?? '').toLowerCase().includes(needle))
        .map((entry) => ({
          id: entry.id,
          time: entry.createdAt,
          userName: entry.userId ?? 'Unknown',
          actionLabel: entry.action,
          summary: entry.action,
          changes: Object.entries((entry.after ?? entry.before ?? {}) as Record<string, unknown>).map(
            ([field, value]) => ({
              field,
              before: '',
              after: typeof value === 'object' ? JSON.stringify(value) : String(value),
            }),
          ),
        }));
    },
    enabled: recordNumber !== null,
  });

  if (!recordNumber) {
    return <Card title={t('ui.documentTrail.title')}><p className="document-trail__empty">{emptyMessage ?? t('ui.documentTrail.numberPending')}</p></Card>;
  }

  const entries = query.data ?? [];

  return (
    <Card title={t('ui.documentTrail.title')} description={t('ui.documentTrail.description')}>
      {query.isPending ? (
        <Skeleton label={t('ui.documentTrail.loading')} />
      ) : entries.length === 0 ? (
        <p className="document-trail__empty">{emptyMessage ?? t('ui.documentTrail.empty')}</p>
      ) : (
        <ol className="document-trail__list">
          {entries.map((entry) => (
            <li className="document-trail__item" key={entry.id}>
              <span className="document-trail__dot" aria-hidden="true" />
              <div className="document-trail__item-body">
                <div className="document-trail__meta">
                  <time dateTime={entry.time}>{formatDateTime(entry.time)}</time>
                  <span> · {entry.userName}</span>
                </div>
                <div className="document-trail__title">{entry.actionLabel}</div>
                {entry.summary && <p className="document-trail__summary">{entry.summary}</p>}
                {entry.changes.length > 0 && (
                  <ul className="document-trail__changes">
                    {entry.changes.map((change) => (
                      <li key={`${entry.id}-${change.field}`}><strong>{change.field}:</strong> {change.before} → {change.after}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
