import { Button } from './button';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')} role="status">
      <svg className="empty-state__illustration" viewBox="0 0 64 64" role="img" aria-label="Empty tray" focusable="false">
        <path d="M10 18h44v24a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V18Z" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M22 27h20M22 36h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__description">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
