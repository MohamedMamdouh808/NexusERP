import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from './button';
import { Icon } from './icon';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly destructive?: boolean;
  readonly loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  actionLabel = 'Confirm',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !loading) {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" onKeyDown={handleKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="dialog"
      >
        <div className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          {!loading && (
            <button
              type="button"
              className="button"
              aria-label="Close dialog"
              onClick={onClose}
              style={{ padding: 'var(--spacing-xs)' }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <p id={descId} style={{ color: 'var(--color-muted-foreground)', margin: 0 }}>
          {description}
        </p>
        <div className="dialog__actions">
          <Button disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
