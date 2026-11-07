import { Icon } from './icon';

export type ToastTone = 'success' | 'failure' | 'informational';

export interface ToastProps {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
  readonly onDismiss: (id: string) => void;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function Toast({ id, tone, message, onDismiss, actionLabel, onAction }: ToastProps) {
  const role = tone === 'failure' ? 'alert' : 'status';

  return (
    <div className={`toast toast--${tone}`} role={role}>
      <Icon
        name={tone === 'success' ? 'success' : tone === 'failure' ? 'danger' : 'info'}
      />
      <span>{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
