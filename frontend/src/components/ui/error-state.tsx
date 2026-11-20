import { useTranslation } from 'react-i18next';

import { Button } from './button';

export interface ErrorStateProps {
  readonly message: string;
  readonly requestId?: string;
  /**
   * The HTTP status behind the failure, when one exists. Shown beside the
   * reference id so an unreadable envelope (a proxy error page, an empty
   * 500) at least tells the operator WHICH side answered - it never invents
   * a cause, only reports the code.
   */
  readonly status?: number;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function ErrorState({ message, requestId, status, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div className={['error-state', className].filter(Boolean).join(' ')}>
      <p className="error-state__message">{message}</p>
      {(requestId || status !== undefined) && (
        <p className="error-state__request-id">
          {requestId && (
            <>
              {t('ui.errorState.referenceLabel')}
              <code>{requestId}</code>
              {status !== undefined && ' · '}
            </>
          )}
          {status !== undefined && <span className="mono">HTTP {status}</span>}
        </p>
      )}
      {onRetry && (
        <div style={{ marginTop: 'var(--spacing-xs)' }}>
          <Button variant="danger" onClick={onRetry}>
            {t('ui.errorState.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
