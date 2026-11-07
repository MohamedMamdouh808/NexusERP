import { useQuery } from '@tanstack/react-query';
import { Card, Skeleton } from '../../components/ui';
import { sampleCatalogService } from '../../services/sample-catalog-service';

export interface DocumentTrailProps {
  readonly recordType: string;
  readonly recordNumber: string | null;
  readonly emptyMessage?: string;
}

export function DocumentTrail({ recordType, recordNumber, emptyMessage }: DocumentTrailProps) {
  const query = useQuery({
    queryKey: ['document-trail', recordType, recordNumber ?? ''],
    queryFn: () => sampleCatalogService.listAuditEntries({ search: recordNumber ?? '', recordType, page: 1, pageSize: 100 }),
    enabled: recordNumber !== null,
  });

  if (!recordNumber) {
    return <Card title="Document trail"><p className="document-trail__empty">{emptyMessage ?? 'A document number will appear once issuing assigns one.'}</p></Card>;
  }

  const entries = query.data?.items ?? [];

  return (
    <Card title="Document trail" description="Accepted changes and reportable events for this document">
      {query.isPending ? (
        <Skeleton label="Loading document history" />
      ) : entries.length === 0 ? (
        <p className="document-trail__empty">{emptyMessage ?? 'No activity has been recorded for this document yet.'}</p>
      ) : (
        <ol className="document-trail__list">
          {entries.map((entry) => (
            <li className="document-trail__item" key={entry.id}>
              <span className="document-trail__dot" aria-hidden="true" />
              <div className="document-trail__item-body">
                <div className="document-trail__meta">
                  <time dateTime={entry.time}>{new Date(entry.time).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
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
