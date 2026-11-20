import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, Skeleton } from '../../components/ui';

export interface DashboardWidgetProps {
  readonly title: string;
  /** One line stating exactly what the figures mean. */
  readonly definition?: string;
  /** When the figures were computed, when the service says so. */
  readonly asOf?: string;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage?: string;
  readonly requestId?: string;
  readonly status?: number;
  readonly onRetry: () => void;
  readonly isEmpty?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The frame every dashboard widget sits in.
 *
 * A widget loads and fails on its own: its skeleton, its empty state and its
 * error state (with the request identifier, so a failure can be quoted) belong
 * to the widget alone. A widget that failed says so; it never blanks the page
 * and never takes another widget down with it.
 */
export function DashboardWidget({
  title,
  definition,
  asOf,
  isPending,
  isError,
  errorMessage,
  requestId,
  status,
  onRetry,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  children,
  className,
}: DashboardWidgetProps) {
  const { t } = useTranslation();
  return (
    <Card
      className={['dashboard-widget', className].filter(Boolean).join(' ')}
      title={title}
      description={definition}
    >
      {isPending ? (
        <Skeleton label={t('dashboard.widget.loading', { title })} />
      ) : isError ? (
        <ErrorState
          message={errorMessage ?? t('dashboard.widget.loadError')}
          requestId={requestId}
          status={status}
          onRetry={onRetry}
        />
      ) : isEmpty ? (
        <div className="dashboard-widget__empty" role="status">
          <p className="dashboard-widget__empty-title">{emptyTitle ?? t('dashboard.widget.empty')}</p>
          {emptyDescription && <p className="dashboard-widget__empty-description">{emptyDescription}</p>}
        </div>
      ) : (
        children
      )}
      {asOf && !isPending && !isError && (
        <p className="dashboard-widget__as-of">{t('dashboard.widget.asOf', { time: asOf })}</p>
      )}
    </Card>
  );
}

/** The request identifier of a failed query, when the service gave one. */
export function failureOf(error: unknown): { message: string; requestId?: string; status?: number } {
  if (error && typeof error === 'object' && 'requestId' in error) {
    const failure = error as Error & { requestId?: string; status?: number };
    return { message: failure.message, requestId: failure.requestId, status: failure.status };
  }
  return { message: error instanceof Error ? error.message : '' };
}
