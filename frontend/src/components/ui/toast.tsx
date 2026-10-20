import { Icon } from './icon';

export type ToastTone = 'success' | 'failure' | 'informational';

export interface ToastProps {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
  readonly onDismiss: (id: string) => void;
}

export function Toast({ id, tone, message, onDismiss }: ToastProps) {
  const role = tone === 'failure' ? 'alert' : 'status';

  return (
    <div className={`toast toast--${tone}`} role={role}>
      <Icon
        name={tone === 'success' ? 'success' : tone === 'failure' ? 'danger' : 'info'}
      />
      <span>{message}</span>
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
