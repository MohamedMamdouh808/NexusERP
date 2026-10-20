import { Button } from './button';

export interface ErrorStateProps {
  readonly message: string;
  readonly requestId?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function ErrorState({ message, requestId, onRetry, className }: ErrorStateProps) {
  return (
    <div className={['error-state', className].filter(Boolean).join(' ')}>
      <p className="error-state__message">{message}</p>
      {requestId && (
        <p className="error-state__request-id">
          Reference ID: <code>{requestId}</code>
        </p>
      )}
      {onRetry && (
        <div style={{ marginTop: 'var(--spacing-xs)' }}>
          <Button variant="danger" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
